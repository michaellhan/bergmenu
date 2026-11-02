// The menu fixes API behind bergmenu.com's "Edit menu" (a Cloudflare Worker).
//
//   GET  /fixes   every fix: {updated, fixes: {"<file>|<date>|<meal>": fix}}
//   POST /unlock  {password}: 204 if it's right
//   POST /fixes   {password, fixes}: saves them (a null fix clears that meal's)
//
// A fix is {remove: [names], add: [{name, group}]} and replaces the
// meal's previous one. They're kept in KV (FIXES) under one key; the password
// is the PASSWORD secret. Wrong guesses are limited per IP.
const ORIGIN = /^(https:\/\/bergmenu\.com|http:\/\/localhost(:\d+)?)$/;
const FILES = new Set(["menu", "adams", "cabot-pfoho", "currier", "dunster-mather", "eliot", "kirkland",
  "leverett", "lowell-quincy-winthrop", "hls", "hks", "gsd", "gsas", "sec"]);
const GROUPS = new Set(["Mains", "Soup", "Pizza & sandwiches", "Dessert", "Sides", "Breakfast"]);
const KEY = /^([a-z-]+)\|(\d{4}-\d{2}-\d{2})\|([A-Za-z ]{1,20})$/;
const KEEP_DAYS = 21; // past meals' fixes are dropped after this
const MAX_FAILS = 10; // wrong passwords per IP per 15 minutes

const text = (s, limit) => {
  if (typeof s !== "string" || !s.trim() || s.length > limit) throw new Error(`bad text ${JSON.stringify(s)}`);
  return s.trim().replace(/\s+/g, " ");
};
export function clean(key, fix) {
  const m = KEY.exec(key);
  if (!m || !FILES.has(m[1]) || isNaN(Date.parse(m[2]))) throw new Error(`unknown meal ${key}`);
  if (fix === null) return null;
  if (typeof fix !== "object" || Array.isArray(fix)) throw new Error(`bad fix for ${key}`);
  const remove = fix.remove || [], add = fix.add || [];
  if (!Array.isArray(remove) || !Array.isArray(add) || remove.length + add.length > 200) throw new Error(`bad fix for ${key}`);
  const out = {};
  if (remove.length) out.remove = [...new Set(remove.map((s) => text(s, 120)))].sort();
  for (const a of add) {
    if (!a || !GROUPS.has(a.group)) throw new Error(`bad dish ${JSON.stringify(a)}`);
    (out.add ||= []).push({ name: text(a.name, 120), group: a.group });
  }
  return Object.keys(out).length ? out : null;
}

const equal = async (a, b) => {
  const h = async (s) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(s))));
  const [x, y] = [await h(a), await h(b)];
  return x.every((v, i) => v === y[i]);
};

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "";
    const cors = {
      "Access-Control-Allow-Origin": ORIGIN.test(origin) ? origin : "https://bergmenu.com",
      "Access-Control-Allow-Methods": "GET, POST",
      "Access-Control-Allow-Headers": "Content-Type",
      Vary: "Origin",
    };
    const reply = (body, status = 200) => new Response(body == null ? null : JSON.stringify(body), {
      status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
    const { pathname } = new URL(req.url);
    if (req.method === "OPTIONS") return reply(null, 204);
    const load = async () => (await env.FIXES.get("fixes", "json")) || { updated: "", fixes: {} };
    if (req.method === "GET" && pathname === "/fixes") return reply(await load());
    if (req.method !== "POST" || (pathname !== "/fixes" && pathname !== "/unlock")) return reply({ error: "not found" }, 404);

    let body;
    try { body = await req.json(); } catch (_) { return reply({ error: "bad request" }, 400); }
    const failKey = "fail:" + (req.headers.get("CF-Connecting-IP") || "?");
    const fails = Number(await env.FIXES.get(failKey)) || 0;
    if (fails >= MAX_FAILS) return reply({ error: "too many tries, wait a few minutes" }, 429);
    if (!(await equal(body.password, env.PASSWORD))) {
      await env.FIXES.put(failKey, String(fails + 1), { expirationTtl: 900 });
      return reply({ error: "wrong password" }, 401);
    }
    if (pathname === "/unlock") return reply(null, 204);

    let done;
    try {
      if (!body.fixes || typeof body.fixes !== "object" || !Object.keys(body.fixes).length) throw new Error("no fixes");
      done = Object.entries(body.fixes).map(([k, v]) => [k, clean(k, v)]);
    } catch (e) {
      return reply({ error: e.message }, 400);
    }
    const saved = await load();
    for (const [k, v] of done) v ? (saved.fixes[k] = v) : delete saved.fixes[k];
    const cutoff = new Date(Date.now() - KEEP_DAYS * 864e5).toISOString().slice(0, 10);
    for (const k of Object.keys(saved.fixes)) if (k.split("|")[1] < cutoff) delete saved.fixes[k];
    saved.updated = new Date().toISOString();
    await env.FIXES.put("fixes", JSON.stringify(saved));
    return reply(saved);
  },
};
