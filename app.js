(() => {
  const TZ = "America/New_York";
  const $ = (s) => document.querySelector(s);
  const grid = $("#grid"), tabs = $("#daytabs"), range = $("#range");
  const prev = $("#prev"), next = $("#next"), allBox = $("#all"), q = $("#q");
  const state = { data: null, week: 0, day: 0, meal: "Lunch", open: new Set(), q: "" };

  // Collapse HUDS's many stations into a few groups. Mains (unlabelled, at the
  // top), soup and dessert show by default; sides and extras sit behind "more".
  const GROUPS = [
    ["Mains", ["entrees", "veg,vegan", "halal", "brunch", "chili bar/stew",
               "breakfast entrees", "breakfast meats", "breakfast bakery"]],
    ["Soup", ["today's soup"]],
    ["Dessert", ["desserts", "miscellaneous"]],
    ["Sides", ["plant protein", "starch and potatoes", "vegetables", "sides",
               "whole grain pasta bar", "bread choices"]],
    ["Extras", ["delish"]],
  ];
  const DEFAULT_OPEN = new Set(["Mains", "Soup", "Dessert"]);
  // HUDS lists a fixed weekly Brain Break template, not the real nightly spread; skip it.
  const SKIP = new Set(["brain break"]);
  const BREAD = /cornbread|bread|roll|hawaiian|cracker|tortilla/i;
  const TOPPING = /topping|sauce|sprinkles|cherry|cherries|fudge|whipped|cinnamon sugar|^banana$/i;
  const groupOf = (cat, name) => {
    const c = cat.toLowerCase();
    if (c === "chili bar/stew" && BREAD.test(name)) return "Sides";
    if (c === "desserts" && TOPPING.test(name)) return "Extras";
    for (const [g, names] of GROUPS) if (names.includes(c)) return g;
    return "Sides";
  };

  const nowParts = () => {
    const p = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false }).formatToParts(new Date());
    const g = (t) => p.find((x) => x.type === t).value;
    return { iso: `${g("year")}-${g("month")}-${g("day")}`, hour: Number(g("hour")) % 24 };
  };
  const todayISO = () => nowParts().iso;
  const parse = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };
  const fmt = (iso, o) => parse(iso).toLocaleDateString("en-US", o);

  try { allBox.checked = localStorage.getItem("berg.all") === "1"; } catch (_) {}
  document.body.classList.toggle("showall", allBox.checked);

  function pickDefaults() {
    const { iso: t, hour } = nowParts();
    state.meal = hour < 10 ? "Breakfast" : hour < 15 ? "Lunch" : "Dinner";
    const i = state.data.weeks.findIndex((w) => t >= w.start && t <= w.end);
    state.week = i >= 0 ? i : (t < state.data.weeks[0].start ? 0 : state.data.weeks.length - 1);
    const days = state.data.weeks[state.week].days;
    const di = days.findIndex((d) => d.date === t);
    state.day = di >= 0 ? di : 0;
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function itemLi(it) {
    const li = el("li", it.staple ? "staple" : "");
    li.append(el("span", null, it.name));
    if (it.tags.length) {
      const t = el("span", "tags");
      for (const tag of it.tags) { const i = el("i", "tag " + tag); i.title = tag; t.append(i); }
      li.append(t);
    }
    return li;
  }

  function dayHead(d, today) {
    const head = el("div", "dayhead");
    head.append(el("span", "wd", d.weekday.slice(0, 3)));
    head.append(d.date === today ? el("span", "pill", "Today") : el("span", "dt", fmt(d.date, { month: "short", day: "numeric" })));
    return head;
  }
  function dayCard(d, today) {
    const card = el("article", "day");
    if (d.date === today) card.classList.add("today");
    else if (d.date < today) card.classList.add("past");
    card.append(dayHead(d, today));
    return card;
  }

  const matches = (name) => name.toLowerCase().includes(state.q);

  // Search mode: every meal, staples included, one card per day with hits.
  function renderSearchDay(d, today) {
    const card = dayCard(d, today);
    let any = false;
    for (const m of d.meals) {
      const seen = new Set(), hits = [];
      for (const c of m.categories) {
        if (SKIP.has(c.name.toLowerCase())) continue;
        for (const it of c.items) if (matches(it.name) && !seen.has(it.name)) { seen.add(it.name); hits.push(it); }
      }
      if (!hits.length) continue;
      const sec = el("div", "grp");
      sec.append(el("h4", null, m.name));
      const ul = el("ul");
      hits.forEach((it) => ul.append(itemLi({ ...it, staple: false })));
      sec.append(ul);
      card.append(sec);
      any = true;
    }
    return any ? card : null;
  }

  function renderDay(d, today) {
    if (state.q) return renderSearchDay(d, today);
    const card = dayCard(d, today);
    const meal = d.meals.find((m) => m.name === state.meal);
    if (!meal) { card.append(el("p", "none", d.meals.length ? "Not served" : "No menu posted")); return card; }

    // bucket items into groups, dropping staples unless "show everything"
    const buckets = new Map(GROUPS.map(([g]) => [g, []]));
    const staples = [], seen = new Set();
    for (const c of meal.categories) {
      if (SKIP.has(c.name.toLowerCase())) continue;
      for (const it of c.items) {
        if (seen.has(it.name)) continue;
        seen.add(it.name);
        if (c.staple || it.staple) { staples.push(it); continue; }
        buckets.get(groupOf(c.name, it.name)).push(it);
      }
    }
    const key = d.date + "|" + meal.name;
    const open = state.open.has(key);
    const hidden = [...buckets].filter(([g, v]) => !DEFAULT_OPEN.has(g) && v.length);
    const extraCount = hidden.reduce((n, [, v]) => n + v.length, 0);

    let any = false;
    for (const [g, items] of buckets) {
      if (!items.length) continue;
      if (!DEFAULT_OPEN.has(g) && !open) continue;
      const sec = el("div", "grp");
      if (g !== "Mains") sec.append(el("h4", null, g));
      const ul = el("ul");
      items.forEach((it) => ul.append(itemLi(it)));
      sec.append(ul);
      card.append(sec);
      any = true;
    }
    if (!any && !extraCount) card.append(el("p", "none", "Nothing new"));
    if (extraCount) {
      const b = el("button", "more", open ? "Less" : `+ ${extraCount} more`);
      b.onclick = () => { open ? state.open.delete(key) : state.open.add(key); render(); };
      card.append(b);
    }
    if (allBox.checked && staples.length) {
      const sec = el("div", "grp staples");
      sec.append(el("h4", null, "Every day"));
      const ul = el("ul");
      staples.sort((a, b) => a.name.localeCompare(b.name)).forEach((it) => ul.append(itemLi(it)));
      sec.append(ul);
      card.append(sec);
    }
    return card;
  }

  const countHits = (w) => {
    let n = 0;
    for (const d of w.days) for (const m of d.meals) for (const c of m.categories) {
      if (SKIP.has(c.name.toLowerCase())) continue;
      for (const it of c.items) if (matches(it.name)) n++;
    }
    return n;
  };

  const goWeek = (i) => { if (i >= 0 && i < state.data.weeks.length) { state.week = i; state.day = 0; render(); } };

  function render() {
    const w = state.data.weeks[state.week];
    const today = todayISO();
    const first = state.week === 0, last = state.week === state.data.weeks.length - 1;
    range.textContent = `${fmt(w.start, { month: "short", day: "numeric" })} – ${fmt(w.end, { month: "short", day: "numeric" })}`;
    prev.disabled = first;
    next.disabled = last;
    document.body.classList.toggle("searching", !!state.q);
    for (const chip of document.querySelectorAll(".chip")) chip.classList.toggle("on", !state.q && chip.dataset.meal === state.meal);

    const cards = w.days.map((d, i) => {
      const c = renderDay(d, today);
      if (c && i === state.day) c.classList.add("active");
      return c;
    }).filter(Boolean);
    grid.replaceChildren(...cards);

    if (state.q) {
      if (!cards.length) grid.append(el("p", "empty", "No matches this week"));
      state.data.weeks.forEach((ow, i) => {
        if (i === state.week) return;
        const n = countHits(ow);
        if (!n) return;
        const p = el("p", "hint");
        const b = el("button", null, `${n} ${n === 1 ? "match" : "matches"} ${i > state.week ? "next" : "last"} week →`);
        b.onclick = () => goWeek(i);
        p.append(b);
        grid.append(p);
      });
    }

    // phone day strip, with the week arrows at either end
    const pa = el("button", "icon", "‹"); pa.disabled = first; pa.setAttribute("aria-label", "Previous week"); pa.onclick = () => goWeek(state.week - 1);
    const na = el("button", "icon", "›"); na.disabled = last; na.setAttribute("aria-label", "Next week"); na.onclick = () => goWeek(state.week + 1);
    tabs.replaceChildren(pa, ...w.days.map((d, i) => {
      const b = el("button", "daytab" + (i === state.day ? " on" : "") + (d.date === today ? " today" : ""));
      b.setAttribute("role", "tab");
      b.append(el("span", null, d.weekday.slice(0, 3)), el("b", null, String(parse(d.date).getDate())));
      b.onclick = () => { state.day = i; render(); };
      return b;
    }), na);
  }

  prev.onclick = () => goWeek(state.week - 1);
  next.onclick = () => goWeek(state.week + 1);
  allBox.onchange = () => {
    document.body.classList.toggle("showall", allBox.checked);
    try { localStorage.setItem("berg.all", allBox.checked ? "1" : "0"); } catch (_) {}
    render();
  };
  for (const chip of document.querySelectorAll(".chip")) {
    chip.onclick = () => { state.meal = chip.dataset.meal; state.q = ""; q.value = ""; render(); };
  }
  let timer;
  q.oninput = () => { clearTimeout(timer); timer = setTimeout(() => { state.q = q.value.trim().toLowerCase(); render(); }, 120); };
  q.onkeydown = (e) => { if (e.key === "Escape") { q.value = ""; state.q = ""; render(); q.blur(); } };

  fetch("data/menu.json", { cache: "no-cache" })
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((data) => {
      state.data = data;
      pickDefaults();
      render();
      const t = new Date(data.generated);
      const ageDays = (Date.now() - t.getTime()) / 864e5;
      $("#updated").textContent = "Updated " + t.toLocaleString("en-US", { timeZone: TZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
      if (ageDays > 2) {
        grid.before(el("p", "stale", "This menu hasn't refreshed in " + Math.floor(ageDays) + " days and may be out of date."));
      }
      if (data.source) $("#source").href = data.source;
    })
    .catch((e) => { grid.replaceChildren(el("p", "empty", "Couldn't load the menu (" + e.message + ")")); });
})();
