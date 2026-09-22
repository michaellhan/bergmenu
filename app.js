(() => {
  const TZ = "America/New_York";
  const $ = (s) => document.querySelector(s);
  const grid = $("#grid"), tabs = $("#daytabs"), range = $("#range");
  const prev = $("#prev"), next = $("#next"), allBox = $("#all");
  const state = { data: null, week: 0, day: 0, meal: "Lunch", open: new Set() };

  // Collapse HUDS's many stations into a few groups. Mains (unlabelled, at the
  // top) and soup show by default; the rest sits behind a "more" link.
  const GROUPS = [
    ["Mains", ["entrees", "veg,vegan", "halal", "plant protein", "brunch", "chili bar/stew",
               "breakfast entrees", "breakfast meats", "breakfast bakery"]],
    ["Soup", ["today's soup"]],
    ["Sides", ["starch and potatoes", "vegetables", "sides", "whole grain pasta bar", "bread choices"]],
    ["Sweets", ["desserts", "delish", "miscellaneous"]],
  ];
  const DEFAULT_OPEN = new Set(["Soup", "Mains"]);
  const groupOf = (cat) => {
    const c = cat.toLowerCase();
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

  function renderDay(d, today) {
    const card = el("article", "day");
    if (d.date === today) card.classList.add("today");
    else if (d.date < today) card.classList.add("past");
    const head = el("div", "dayhead");
    head.append(el("span", "wd", d.weekday.slice(0, 3)));
    head.append(d.date === today ? el("span", "pill", "Today") : el("span", "dt", fmt(d.date, { month: "short", day: "numeric" })));
    card.append(head);

    const meal = d.meals.find((m) => m.name === state.meal);
    if (!meal) { card.append(el("p", "none", d.meals.length ? "Not served" : "No menu posted")); return card; }

    // bucket items into groups, dropping staples unless "show everything"
    const buckets = new Map(GROUPS.map(([g]) => [g, []]));
    const staples = [];
    for (const c of meal.categories) {
      // HUDS lists a fixed weekly Brain Break template, not the real nightly spread; skip it.
      if (c.name.toLowerCase() === "brain break") continue;
      for (const it of c.items) {
        if (c.staple || it.staple) { staples.push(it); continue; }
        buckets.get(groupOf(c.name)).push(it);
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

  function render() {
    const w = state.data.weeks[state.week];
    const today = todayISO();
    range.textContent = `${fmt(w.start, { month: "short", day: "numeric" })} – ${fmt(w.end, { month: "short", day: "numeric" })}`;
    prev.disabled = state.week === 0;
    next.disabled = state.week === state.data.weeks.length - 1;
    for (const chip of document.querySelectorAll(".chip")) chip.classList.toggle("on", chip.dataset.meal === state.meal);

    grid.replaceChildren(...w.days.map((d, i) => {
      const c = renderDay(d, today);
      if (i === state.day) c.classList.add("active");
      return c;
    }));

    tabs.replaceChildren(...w.days.map((d, i) => {
      const b = el("button", "daytab" + (i === state.day ? " on" : "") + (d.date === today ? " today" : ""));
      b.setAttribute("role", "tab");
      b.append(el("span", null, d.weekday.slice(0, 3)), el("b", null, String(parse(d.date).getDate())));
      b.onclick = () => { state.day = i; render(); };
      return b;
    }));
    const on = tabs.querySelector(".on");
    if (on) on.scrollIntoView({ block: "nearest", inline: "center" });
  }

  prev.onclick = () => { if (state.week > 0) { state.week--; state.day = 0; render(); } };
  next.onclick = () => { if (state.week < state.data.weeks.length - 1) { state.week++; state.day = 0; render(); } };
  allBox.onchange = () => {
    document.body.classList.toggle("showall", allBox.checked);
    try { localStorage.setItem("berg.all", allBox.checked ? "1" : "0"); } catch (_) {}
    render();
  };
  for (const chip of document.querySelectorAll(".chip")) {
    chip.onclick = () => { state.meal = chip.dataset.meal; render(); };
  }

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
        const warn = el("p", "stale", "This menu hasn't refreshed in " + Math.floor(ageDays) + " days and may be out of date.");
        grid.before(warn);
      }
      if (data.source) $("#source").href = data.source;
    })
    .catch((e) => { grid.replaceChildren(el("p", "empty", "Couldn't load the menu (" + e.message + ")")); });
})();
