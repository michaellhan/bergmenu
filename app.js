(() => {
  const TZ = "America/New_York";
  const $ = (s) => document.querySelector(s);
  const grid = $("#grid"), tabs = $("#daytabs"), range = $("#range");
  const prev = $("#prev"), next = $("#next"), allBox = $("#all");
  const state = { data: null, week: 0, day: 0, meals: new Set(["Breakfast", "Lunch", "Dinner"]) };

  const todayISO = () => {
    const p = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const g = (t) => p.find((x) => x.type === t).value;
    return `${g("year")}-${g("month")}-${g("day")}`;
  };
  const parse = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };
  const fmt = (iso, o) => parse(iso).toLocaleDateString("en-US", o);

  try { allBox.checked = localStorage.getItem("berg.all") === "1"; } catch (_) {}
  document.body.classList.toggle("showall", allBox.checked);

  function pickWeek() {
    const t = todayISO();
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

  function renderDay(d, today) {
    const card = el("article", "day");
    if (d.date === today) card.classList.add("today");
    else if (d.date < today) card.classList.add("past");
    const head = el("div", "dayhead");
    head.append(el("span", "wd", d.weekday.slice(0, 3)));
    head.append(d.date === today ? el("span", "pill", "Today") : el("span", "dt", fmt(d.date, { month: "short", day: "numeric" })));
    card.append(head);

    let shown = 0;
    for (const m of d.meals) {
      if (!state.meals.has(m.name)) continue;
      const sec = el("section", "meal");
      sec.append(el("h3", null, m.name));
      let any = false;
      for (const c of m.categories) {
        const cat = el("div", "cat" + (c.staple ? " staple" : ""));
        cat.append(el("h4", null, c.name));
        const ul = el("ul");
        for (const it of c.items) {
          const li = el("li", it.staple ? "staple" : "");
          li.append(el("span", null, it.name));
          if (it.tags.length) {
            const t = el("span", "tags");
            for (const tag of it.tags) { const i = el("i", "tag " + tag); i.title = tag; t.append(i); }
            li.append(t);
          }
          ul.append(li);
          if (!it.staple && !c.staple) any = true;
        }
        if (!c.items.some((it) => !it.staple)) cat.classList.add("staple");
        if (c.items.length) { cat.append(ul); sec.append(cat); }
      }
      if (!any) sec.append(el("p", "none", "Nothing new"));
      card.append(sec);
      shown++;
    }
    if (!d.meals.length) card.append(el("p", "none", "No menu posted"));
    return card;
  }

  function render() {
    const w = state.data.weeks[state.week];
    const today = todayISO();
    range.textContent = `${fmt(w.start, { month: "short", day: "numeric" })} – ${fmt(w.end, { month: "short", day: "numeric" })}`;
    prev.disabled = state.week === 0;
    next.disabled = state.week === state.data.weeks.length - 1;

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
  };
  for (const chip of document.querySelectorAll(".chip")) {
    chip.onclick = () => {
      const m = chip.dataset.meal;
      if (state.meals.has(m) && state.meals.size > 1) state.meals.delete(m); else state.meals.add(m);
      chip.classList.toggle("on", state.meals.has(m));
      render();
    };
  }

  fetch("data/menu.json", { cache: "no-cache" })
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((data) => {
      state.data = data;
      pickWeek();
      render();
      const t = new Date(data.generated);
      $("#updated").textContent = "Updated " + t.toLocaleString("en-US", { timeZone: TZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
      if (data.source) $("#source").href = data.source;
    })
    .catch((e) => { grid.replaceChildren(el("p", "empty", "Couldn't load the menu (" + e.message + ")")); });
})();
