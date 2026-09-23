(() => {
  const TZ = "America/New_York";
  const $ = (s) => document.querySelector(s);
  const grid = $("#grid"), tabs = $("#daytabs"), range = $("#range");
  const prev = $("#prev"), next = $("#next"), allBox = $("#all"), q = $("#q");
  const state = { data: null, week: 0, day: 0, meal: "Lunch", open: new Set(), q: "" };

  // Collapse HUDS's many stations into a few groups, by station. Mains
  // (unlabelled, at the top), soup and dessert always show; sides sit behind
  // "more". Condiments, toppings and breads aren't dishes: they never count
  // toward "more" and show as a single "With" line once it's opened.
  const GROUPS = [
    ["Mains", ["entrees", "veg,vegan", "halal", "brunch", "chili bar/stew",
               "breakfast entrees", "breakfast meats", "breakfast bakery"]],
    ["Soup", ["today's soup"]],
    ["Dessert", ["desserts", "miscellaneous"]],
    ["Sides", ["plant protein", "starch and potatoes", "vegetables", "delish"]],
  ];
  const DEFAULT_OPEN = new Set(["Mains", "Soup", "Dessert"]);
  const PASTA = "whole grain pasta bar";
  const BREAD = /cornbread|bread|roll|hawaiian|biscuit|cracker|tortilla/i;
  const TOPPING = /topping|sauce|sprinkles|cherry|cherries|fudge|whipped|sugar|^banana$/i;
  // null = an add-on (the "Sides" station is all sauces, garnishes and bread)
  const groupOf = (cat, name) => {
    const c = cat.toLowerCase();
    if (c === "sides" || c === "bread choices") return null;
    if (c === "chili bar/stew" && BREAD.test(name)) return null;
    if (c === "desserts" && TOPPING.test(name)) return null;
    for (const [g, names] of GROUPS) if (names.includes(c)) return g;
    return "Sides";
  };

  const nowParts = () => {
    const p = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
    const g = (t) => p.find((x) => x.type === t).value;
    return { iso: `${g("year")}-${g("month")}-${g("day")}`, mins: (Number(g("hour")) % 24) * 60 + Number(g("minute")) };
  };
  const todayISO = () => nowParts().iso;
  const parse = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };
  const fmt = (iso, o) => parse(iso).toLocaleDateString("en-US", o);

  try { allBox.checked = localStorage.getItem("berg.all") === "1"; } catch (_) {}
  document.body.classList.toggle("showall", allBox.checked);

  const addDays = (iso, n) => { const d = parse(iso); d.setDate(d.getDate() + n); return d.toLocaleDateString("en-CA"); };

  // Annenberg hours in minutes after midnight, Eastern. Sunday lunch is
  // brunch; Brain Break runs Sunday through Thursday nights.
  const hm = (h, m = 0) => h * 60 + m;
  const HOURS = [
    ["Breakfast", hm(7, 30), hm(10, 30)],
    ["Lunch", hm(11, 30), hm(14)],
    ["Dinner", hm(16, 30), hm(19, 30)],
  ];
  const slotsFor = (iso) => {
    const wd = parse(iso).getDay();
    const s = HOURS.map(([n, a, b]) => [wd === 0 && n === "Lunch" ? "Brunch" : n, a, b]);
    if (wd <= 4) s.push(["Brain Break", hm(21), hm(23)]);
    return s;
  };
  const clock = (m) => {
    const h = Math.floor(m / 60) % 24, mm = m % 60;
    return `${h % 12 || 12}${mm ? ":" + String(mm).padStart(2, "0") : ""} ${h < 12 ? "AM" : "PM"}`;
  };

  function updateStatus() {
    const { iso, mins } = nowParts();
    const box = $("#status"), text = $("#statusText");
    const cur = slotsFor(iso).find(([, a, b]) => mins >= a && mins < b);
    let msg, open = !!cur;
    if (cur) {
      const left = cur[2] - mins;
      msg = `Open · ${cur[0]} ${left <= 30 ? `ends in ${left} min` : `until ${clock(cur[2])}`}`;
    } else {
      const next = slotsFor(iso).find(([, a]) => a > mins);
      if (next) {
        const wait = next[1] - mins;
        msg = `Closed · ${next[0]} ${wait <= 60 ? `in ${wait} min` : `at ${clock(next[1])}`}`;
      } else {
        const [n, a] = slotsFor(addDays(iso, 1))[0];
        msg = `Closed · ${n} tomorrow at ${clock(a)}`;
      }
    }
    text.textContent = msg;
    box.classList.toggle("open", open);
  }

  // Open on the next meal still to come (Brain Break included); after the
  // last one, jump ahead to tomorrow's breakfast.
  function pickDefaults() {
    const { iso: t, mins } = nowParts();
    let target = t;
    const next = slotsFor(t).find(([, , end]) => mins < end);
    if (next) state.meal = next[0] === "Brunch" ? "Lunch" : next[0];
    else { state.meal = "Breakfast"; target = addDays(t, 1); }
    const locate = (iso) => {
      const wi = state.data.weeks.findIndex((w) => iso >= w.start && iso <= w.end);
      if (wi < 0) return false;
      const di = state.data.weeks[wi].days.findIndex((d) => d.date === iso);
      if (di < 0) return false;
      state.week = wi; state.day = di;
      return true;
    };
    if (!locate(target) && !locate(t)) {
      state.week = t < state.data.weeks[0].start ? 0 : state.data.weeks.length - 1;
      state.day = 0;
    }
  }

  // Sunday breakfast and lunch are one brunch menu; either chip shows it.
  const mealFor = (d) => d.meals.find((m) => m.name === state.meal)
    || (state.meal === "Breakfast" || state.meal === "Lunch" ? d.meals.find((m) => m.name === "Brunch") : undefined);

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function itemLi(it) {
    const li = el("li", it.staple ? "staple" : "");
    li.append(el("span", null, it.name));
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
    const meal = mealFor(d);
    if (!meal) {
      const none = !d.meals.length ? "No menu posted" : state.meal === "Brain Break" ? "No Brain Break tonight" : "Not served";
      card.append(el("p", "none", none));
      return card;
    }
    if (meal.name === "Brunch") card.append(el("p", "mealnote", "Brunch"));

    // Brain Break is one small nightly spread: list all of it, plus the
    // self-serve basics that are out every night.
    if (meal.name === "Brain Break") {
      card.append(el("p", "mealnote", "9 – 11 PM"));
      const sec = el("div", "grp");
      const ul = el("ul");
      meal.categories.flatMap((c) => c.items).forEach((it) => ul.append(itemLi({ ...it, staple: false })));
      sec.append(ul);
      card.append(sec, el("p", "basics", "Plus cereal, bagels and bread, fruit, and drinks"));
      return card;
    }

    // bucket items into groups, dropping staples unless "show everything"
    const buckets = new Map(GROUPS.map(([g]) => [g, []]));
    const staples = [], addons = [], pasta = [], seen = new Set();
    for (const c of meal.categories) {
      for (const it of c.items) {
        if (seen.has(it.name)) continue;
        seen.add(it.name);
        if (c.staple || it.staple) { staples.push(it); continue; }
        // the pasta bar's shape and sauce make one dish
        if (c.name.toLowerCase() === PASTA) { pasta.push(it.name); continue; }
        const g = groupOf(c.name, it.name);
        (g ? buckets.get(g) : addons).push(it);
      }
    }
    if (pasta.length) buckets.get("Sides").push({ name: "Pasta bar: " + pasta.join(", "), tags: [] });
    const key = d.date + "|" + meal.name;
    const open = state.open.has(key);
    const hidden = [...buckets].filter(([g, v]) => !DEFAULT_OPEN.has(g) && v.length);
    const dishCount = hidden.reduce((n, [, v]) => n + v.length, 0);
    const extraCount = dishCount + addons.length;

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
    if (open && addons.length) {
      card.append(el("p", "with", "With " + addons.map((it) => it.name).join(", ")));
    }
    if (!any && !extraCount) card.append(el("p", "none", "Nothing new"));
    if (extraCount) {
      const b = el("button", "more", open ? "Less" : dishCount ? `+ ${dishCount} more` : "+ extras");
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
      for (const it of c.items) if (matches(it.name)) n++;
    }
    return n;
  };

  const goWeek = (i) => { if (i >= 0 && i < state.data.weeks.length) goTo(i, 0); };
  // the day `delta` steps away, crossing into the next or previous week at the ends
  const step = (delta) => {
    const n = state.data.weeks[state.week].days.length;
    const d = state.day + delta;
    if (d >= 0 && d < n) return { week: state.week, day: d };
    if (d >= n && state.week < state.data.weeks.length - 1) return { week: state.week + 1, day: 0 };
    if (d < 0 && state.week > 0) return { week: state.week - 1, day: state.data.weeks[state.week - 1].days.length - 1 };
    return null;
  };

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
      b.onclick = () => goTo(state.week, i);
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
  // Swipe between days on phones. The list follows the finger with the next or
  // previous day peeking in from the side. Touch events rather than pointer
  // events so we can cancel touchmove: iOS Safari ignores `pan-y pinch-zoom`,
  // so without it a slightly diagonal swipe would also scroll the page.
  const phone = matchMedia("(max-width: 860px)");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const GAP = 16;
  let sw = null, settling = false, swipedAt = 0;

  const setX = (x, ms) => {
    grid.style.transition = ms ? `transform ${ms}ms cubic-bezier(0.2, 0.8, 0.3, 1)` : "";
    grid.style.transform = x ? `translate3d(${x}px, 0, 0)` : "";
  };
  // animate the list to x, then run fn and drop the transform in the same frame
  const settle = (x, fn) => {
    const ms = reduced.matches ? 0 : 240;
    settling = true;
    let done = false;
    const end = () => {
      if (done) return;
      done = true;
      grid.removeEventListener("transitionend", end);
      fn();
      setX(0);
      settling = false;
    };
    if (!ms) return end();
    grid.addEventListener("transitionend", end);
    setTimeout(end, ms + 80);
    setX(x, ms);
  };
  // render the neighbouring day beside the current one (dir 1 = next, -1 = previous)
  const peekAt = (dir) => {
    if (sw.dir === dir) return;
    if (sw.peek) sw.peek.remove();
    sw.dir = dir;
    sw.peek = null;
    sw.to = step(dir);
    if (!sw.to) return;
    const c = renderDay(state.data.weeks[sw.to.week].days[sw.to.day], todayISO());
    c.classList.add("active", "peek");
    c.style.left = `${dir * (sw.w + GAP)}px`;
    c.style.top = `${sw.off}px`;
    grid.append(c);
    sw.peek = c;
  };
  const release = (cancelled) => {
    const s = sw;
    sw = null;
    if (!s || s.axis !== "x") return;
    swipedAt = Date.now();
    const flick = Math.abs(s.vx) > 0.4 && Math.sign(s.vx) === -s.dir;
    if (!cancelled && s.to && (Math.abs(s.dx) > s.w * 0.25 || flick)) {
      settle(-s.dir * (s.w + GAP), () => {
        state.week = s.to.week;
        state.day = s.to.day;
        render();
        // keep the new day's top where the peek showed it
        if (s.off) window.scrollBy(0, -s.off);
      });
    } else {
      settle(0, () => { if (s.peek) s.peek.remove(); });
    }
  };

  document.addEventListener("touchstart", (e) => {
    if (sw) { release(true); return; } // a second finger: hand over to pinch zoom
    if (settling || e.touches.length > 1 || !phone.matches || state.q || !state.data) return;
    if (e.target.closest("input, .top, .daytabs")) return;
    const t = e.touches[0];
    sw = {
      x: t.clientX, y: t.clientY, lx: t.clientX, lt: e.timeStamp, vx: 0, dx: 0,
      axis: null, dir: 0, to: null, peek: null,
      w: grid.clientWidth, off: Math.max(0, -grid.getBoundingClientRect().top),
    };
  }, { passive: true });

  document.addEventListener("touchmove", (e) => {
    if (!sw) return;
    const t = e.touches[0];
    const dx = t.clientX - sw.x, dy = t.clientY - sw.y;
    if (!sw.axis) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      // Mostly vertical, or the browser has already started scrolling
      // (touchmove no longer cancelable): let the page scroll, drop the swipe.
      if (Math.abs(dx) <= Math.abs(dy) || !e.cancelable) { sw = null; return; }
      sw.axis = "x";
    }
    if (e.cancelable) e.preventDefault(); // no vertical scroll mid-swipe
    peekAt(dx < 0 ? 1 : -1);
    const dt = e.timeStamp - sw.lt;
    if (dt > 0) sw.vx = 0.7 * ((t.clientX - sw.lx) / dt) + 0.3 * sw.vx;
    sw.lx = t.clientX;
    sw.lt = e.timeStamp;
    sw.dx = dx;
    // at the first or last day, resist instead of following
    setX(sw.to ? Math.max(-(sw.w + GAP), Math.min(sw.w + GAP, dx)) : dx / 4);
  }, { passive: false });

  document.addEventListener("touchend", (e) => { if (!e.touches.length) release(false); }, { passive: true });
  document.addEventListener("touchcancel", () => release(true), { passive: true });
  // don't let a swipe that ended on "+ more" also toggle it
  document.addEventListener("click", (e) => {
    if (Date.now() - swipedAt < 400) { e.stopPropagation(); e.preventDefault(); }
  }, true);

  // tapping a day or week arrow slides the new day in from that side
  const goTo = (week, day) => {
    const dir = week !== state.week ? Math.sign(week - state.week) : Math.sign(day - state.day);
    state.week = week;
    state.day = day;
    render();
    if (dir && phone.matches && !reduced.matches && !state.q && grid.animate) {
      grid.animate([{ transform: `translateX(${dir * 28}px)`, opacity: 0 }, { transform: "none", opacity: 1 }],
        { duration: 200, easing: "cubic-bezier(0.2, 0.8, 0.3, 1)" });
    }
  };

  let timer;
  q.oninput = () => { clearTimeout(timer); timer = setTimeout(() => { state.q = q.value.trim().toLowerCase(); render(); }, 120); };
  q.onkeydown = (e) => { if (e.key === "Escape") { q.value = ""; state.q = ""; render(); q.blur(); } };

  updateStatus();
  setInterval(updateStatus, 30e3);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) updateStatus(); });
  document.addEventListener("click", (e) => { if (!e.target.closest("#status")) $("#status").open = false; });

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
