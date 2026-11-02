// Set (or change) the password for editing the menu on the site.
//
// Saving an edit files a "Menu fix" issue on this repo, so the site needs a
// GitHub token that can do that. This encrypts the token with the password
// (PBKDF2 + AES-GCM, the same Web Crypto the browser unlocks it with) into
// editor.json, which is fine to commit: without the password it's noise.
// Commit and push it, and the next deploy picks up the new password.
//
// Make the token at https://github.com/settings/personal-access-tokens/new:
// Repository access "Only select repositories" (this one), Permissions >
// Issues: Read and write, nothing else. That way a guessed password can only
// file menu fixes, which scripts/apply_fixes.py checks before applying.
//
//   node scripts/editor-password.mjs
//
// It asks for the token and the password (Enter keeps the default, sixseven).
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

const DEFAULT_PASSWORD = "sixseven";
const ITER = 600000;

const ask = (q, hidden) => new Promise((done) => {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (hidden) rl._writeToOutput = (s) => { if (s.startsWith(q)) rl.output.write(q); };
  rl.question(q, (a) => { rl.close(); if (hidden) process.stdout.write("\n"); done(a.trim()); });
});

const remote = execSync("git remote get-url origin", { encoding: "utf8" });
const repo = remote.trim().replace(/\.git$/, "").split(/[:/]/).slice(-2).join("/");

const token = process.env.BERG_TOKEN || await ask("GitHub token: ", true);
const password = process.env.BERG_PASSWORD || await ask(`Password [${DEFAULT_PASSWORD}]: `, true) || DEFAULT_PASSWORD;
if (!token) throw new Error("no token");

if (!process.env.BERG_SKIP_CHECK) {
  const r = await fetch(`https://api.github.com/repos/${repo}/issues?per_page=1`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
  });
  if (!r.ok) throw new Error(`that token can't read ${repo}'s issues (${r.status})`);
}

const { subtle } = globalThis.crypto;
const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
const base = await subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
const key = await subtle.deriveKey({ name: "PBKDF2", salt, iterations: ITER, hash: "SHA-256" },
  base, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
const data = await subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify({ token, repo })));
const b64 = (b) => Buffer.from(b).toString("base64");
writeFileSync(new URL("../editor.json", import.meta.url),
  JSON.stringify({ iter: ITER, salt: b64(salt), iv: b64(iv), data: b64(data) }) + "\n");
console.log(`Wrote editor.json for ${repo}. Commit and push it to turn on the new password.`);
