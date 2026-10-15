(() => {
  const TZ = "America/New_York";
  const $ = (s) => document.querySelector(s);
  const grid = $("#grid"), tabs = $("#daytabs"), range = $("#range");
  const prev = $("#prev"), next = $("#next"), allBox = $("#all"), q = $("#q");
  const state = { data: null, hall: null, week: 0, day: 0, meal: "Lunch", open: new Set(), q: "" };

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

  // Hours in minutes after midnight, Eastern: the one place they're written
  // down (the hours popover is built from this), from HUDS's Dining Houses
  // page. Rows: [meal, start, end, weekdays (0 = Sun), note, no posted end].
  // At Annenberg Sunday lunch is brunch; Brain Break runs Sunday through
  // Thursday nights. The Houses list Brain Break with a start time only.
  const hm = (h, m = 0) => h * 60 + m;
  const BERG_HOURS = [
    ["Breakfast", hm(7, 30), hm(10, 30)],
    ["Lunch", hm(11, 30), hm(14)],
    ["Dinner", hm(16, 30), hm(19, 30)],
    ["Brain Break", hm(21), hm(23), [0, 1, 2, 3, 4], "Sun–Thu"],
  ];
  const houseHours = (dinner) => [
    ["Breakfast", hm(7, 30), hm(10, 30)],
    ["Lunch", hm(11, 30), hm(14), [1, 2, 3, 4, 5], "Mon–Fri"],
    ["Brunch", hm(11, 30), hm(14), [0, 6], "Sat & Sun"],
    ...dinner,
    ["Brain Break", hm(21), hm(23), [0, 1, 2, 3, 4], "Sun–Thu", true],
  ];
  const HOUSE_HOURS = houseHours([["Dinner", hm(17), hm(19, 30)]]);
  const CURRIER_HOURS = houseHours([
    ["Dinner", hm(17), hm(20), [0, 1, 2, 3, 4], "Sun–Thu"],
    ["Dinner", hm(17), hm(19, 30), [5, 6], "Fri & Sat"],
  ]);
  const BERG_NOTE = "Sundays are brunch: a continental breakfast, then the full brunch at 11:30. Brain Break is a late-night self-serve snack spread. Holidays and breaks differ; a meal with no menu posted shows as closed.";
  const HOUSE_NOTE = "Breakfast is continental, and weekend lunch is brunch. Brain Break is a late-night self-serve snack spread. Holidays and breaks differ; a meal with no menu posted shows as closed.";
  const HOUSE_MEALS = ["Breakfast", "Lunch", "Dinner", "Brain Break"];

  // Every hall the picker offers. `file` is data/<file>.json from scrape.py;
  // Houses that share a kitchen share a file. The grad cafés have no hours
  // here (so no open/closed line), and most post one all-day menu.
  const house = (id, name, file, hours = HOUSE_HOURS) => ({ id, name, file, group: "Houses", hours, note: HOUSE_NOTE, meals: HOUSE_MEALS });
  const grad = (id, name, file, meals = ["All Day"]) => ({ id, name, file, group: "Grad schools", hours: [], meals, cafe: true });
  const HALLS = [
    { id: "annenberg", name: "Annenberg", file: "menu", group: "First-years", hours: BERG_HOURS, note: BERG_NOTE, meals: HOUSE_MEALS },
    house("adams", "Adams", "adams"),
    house("cabot", "Cabot", "cabot-pfoho"),
    house("currier", "Currier", "currier", CURRIER_HOURS),
    house("dunster", "Dunster", "dunster-mather"),
    house("eliot", "Eliot", "eliot"),
    house("kirkland", "Kirkland", "kirkland"),
    house("leverett", "Leverett", "leverett"),
    house("lowell", "Lowell", "lowell-quincy-winthrop"),
    house("mather", "Mather", "dunster-mather"),
    house("pfoho", "Pforzheimer", "cabot-pfoho"),
    house("quincy", "Quincy", "lowell-quincy-winthrop"),
    house("winthrop", "Winthrop", "lowell-quincy-winthrop"),
    grad("hls", "Law School", "hls"),
    grad("hks", "Kennedy School", "hks"),
    grad("gsd", "Design School", "gsd"),
    grad("gsas", "GSAS Commons", "gsas", ["Lunch", "Dinner"]),
    grad("sec", "SEC", "sec"),
  ];
  const DEFAULT_HALL = HALLS[0];
  const hallById = (id) => HALLS.find((h) => h.id === (id || "").toLowerCase());
  let HOURS = BERG_HOURS, MEALS = HOUSE_MEALS;
  const dayData = (iso) => {
    for (const w of state.data ? state.data.weeks : []) for (const d of w.days) if (d.date === iso) return d;
  };
  // Holidays and breaks: a day inside the scraped range with no posted meal
  // counts as closed for that meal. Outside the range, trust the schedule.
  // (the Houses' Saturday brunch is posted as lunch)
  const served = (d, slot) => d.meals.some((m) => m.name === slot
    || (m.name === "Brunch" && (slot === "Breakfast" || slot === "Lunch"))
    || (m.name === "Lunch" && slot === "Brunch"));
  const slotsFor = (iso) => {
    const wd = parse(iso).getDay(), d = dayData(iso);
    return HOURS.filter(([, , , days]) => !days || days.includes(wd))
      .map(([n, a, b, , , open]) => [wd === 0 && n === "Lunch" ? "Brunch" : n, a, b, open])
      .filter(([n]) => !d || served(d, n));
  };
  const clock = (m, ampm = true) => {
    const h = Math.floor(m / 60) % 24, mm = m % 60;
    return `${h % 12 || 12}${mm ? ":" + String(mm).padStart(2, "0") : ""}${ampm ? (h < 12 ? " AM" : " PM") : ""}`;
  };
  // "7:30 – 10:30 AM", "11:30 AM – 2 PM", "from 9 PM"
  const span = (a, b, open) => open ? `from ${clock(a)}` : `${clock(a, (a < 720) !== (b < 720))} – ${clock(b)}`;

  function buildHours() {
    const table = $("#hoursTable");
    table.replaceChildren();
    for (const [n, a, b, , note, open] of HOURS) {
      const tr = el("tr");
      const td = el("td", null, span(a, b, open));
      if (note) td.append(" ", el("small", null, note));
      tr.append(el("th", null, n), td);
      table.append(tr);
    }
    $("#hoursNote").textContent = state.hall.note || "";
  }

  function updateStatus() {
    const { iso, mins } = nowParts();
    const box = $("#status"), text = $("#statusText");
    box.hidden = !HOURS.length;
    if (!HOURS.length) return;
    const cur = slotsFor(iso).find(([, a, b]) => mins >= a && mins < b);
    let msg;
    if (cur) {
      const left = cur[2] - mins;
      msg = cur[3] ? `Open · ${cur[0]}` : `Open · ${cur[0]} ${left <= 30 ? `ends in ${left} min` : `until ${clock(cur[2])}`}`;
    } else {
      const next = slotsFor(iso).find(([, a]) => a > mins);
      if (next) {
        const wait = next[1] - mins;
        msg = `Closed · ${next[0]} ${wait <= 60 ? `in ${wait} min` : `at ${clock(next[1])}`}`;
      } else {
        // the next day that's open at all (skips holidays and breaks)
        msg = "Closed";
        for (let i = 1; i <= 21; i++) {
          const s = slotsFor(addDays(iso, i))[0];
          if (!s) continue;
          const when = i === 1 ? "tomorrow" : i < 7 ? fmt(addDays(iso, i), { weekday: "short" }) : fmt(addDays(iso, i), { month: "short", day: "numeric" });
          msg = `Closed · ${s[0]} ${when} at ${clock(s[1])}`;
          break;
        }
      }
    }
    text.textContent = msg;
    box.classList.toggle("open", !!cur);
  }

  // The view to open on: the next meal still to come (Brain Break included);
  // after the last one, the first meal of the next day that's open.
  function defaultView() {
    const { iso: t, mins } = nowParts();
    // no hours (the grad cafés): the first day from today with a menu
    if (!HOURS.length) {
      for (let i = 0; i <= 21; i++) {
        const d = dayData(addDays(t, i));
        if (d && d.meals.length) return { iso: d.date, meal: (MEALS.find((m) => d.meals.some((x) => x.name === m)) || MEALS[0]) };
      }
      return { iso: t, meal: MEALS[0] };
    }
    const chip = (slot) => slot === "Brunch" ? "Lunch" : slot;
    const next = slotsFor(t).find(([, , end]) => mins < end);
    if (next) return { iso: t, meal: chip(next[0]) };
    for (let i = 1; i <= 21; i++) {
      const s = slotsFor(addDays(t, i))[0];
      if (s) return { iso: addDays(t, i), meal: chip(s[0]) };
    }
    return { iso: addDays(t, 1), meal: "Breakfast" };
  }
  const locate = (iso) => {
    const wi = state.data.weeks.findIndex((w) => iso >= w.start && iso <= w.end);
    if (wi < 0) return false;
    const di = state.data.weeks[wi].days.findIndex((d) => d.date === iso);
    if (di < 0) return false;
    state.week = wi; state.day = di;
    return true;
  };
  // `auto` remembers the default view we last applied, so we can tell whether
  // the user is still on it or has navigated away.
  let auto = "";
  const viewKey = () => state.data.weeks[state.week].days[state.day].date + "|" + state.meal;
  function pickDefaults() {
    const v = defaultView(), t = todayISO();
    state.meal = v.meal;
    if (!locate(v.iso) && !locate(t)) {
      state.week = t < state.data.weeks[0].start ? 0 : state.data.weeks.length - 1;
      state.day = 0;
    }
    auto = viewKey();
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

  // a link straight to one day's meal: ?h=mather&d=2026-10-02&m=Dinner
  // (no h for Annenberg)
  const hallParam = () => state.hall === DEFAULT_HALL ? {} : { h: state.hall.id };
  const viewURL = (iso, meal) => {
    const p = new URLSearchParams({ ...hallParam(), d: iso, m: meal });
    return location.origin + location.pathname + "?" + p;
  };
  const SHARE_SVG = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M6 11H5v10h14V11h-1"/></svg>';
  // Share sheet where there is one (phones, Safari), else copy the link.
  // Two buttons: an icon in the card header (desktop) and a labelled one under
  // the list (phones, where the header is hidden).
  function shareButtons(d, meal, dishes) {
    const title = `${meal.name === "All Day" ? "Menu" : meal.name} at ${state.hall.name}, ${fmt(d.date, { weekday: "long", month: "short", day: "numeric" })}`;
    const url = viewURL(d.date, meal.name === "Brunch" ? state.meal : meal.name);
    const onclick = async (e) => {
      const b = e.currentTarget;
      if (navigator.share) {
        try { await navigator.share({ title, text: dishes.length ? `${title}: ${dishes.join(", ")}` : title, url }); } catch (_) {}
        return;
      }
      try { await navigator.clipboard.writeText(url); } catch (_) { return; }
      b.classList.add("copied");
      const label = b.querySelector("span");
      if (label) label.textContent = "Link copied";
      b.title = "Link copied";
      setTimeout(() => { b.classList.remove("copied"); if (label) label.textContent = "Share"; b.title = "Share this meal"; }, 1600);
    };
    const icon = el("button", "share icon");
    icon.innerHTML = SHARE_SVG;
    const bar = el("button", "share bar");
    bar.innerHTML = SHARE_SVG;
    bar.append(el("span", null, "Share"));
    for (const b of [icon, bar]) { b.title = "Share this meal"; b.setAttribute("aria-label", "Share " + title); b.onclick = onclick; }
    return [icon, bar];
  }
  // put the icon in the header, and the labelled button on the same line as
  // "+ N more" (or at the end of the card when there's nothing more)
  const addShare = (card, d, meal, dishes) => {
    const [icon, bar] = shareButtons(d, meal, dishes);
    card.querySelector(".dayhead").append(icon);
    const row = el("div", "cardfoot");
    const more = card.querySelector(":scope > .more");
    if (more) more.replaceWith(row), row.append(more);
    else card.append(row);
    row.append(bar);
  };
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
    if (state.hall.cafe) return renderStations(card, d, meal);

    // Brain Break is one small nightly spread: list all of it, plus the
    // self-serve basics that are out every night.
    if (meal.name === "Brain Break") {
      const bb = HOURS.find(([n]) => n === "Brain Break");
      if (bb) card.append(el("p", "mealnote", span(bb[1], bb[2], bb[5])));
      const sec = el("div", "grp");
      const ul = el("ul");
      meal.categories.flatMap((c) => c.items).forEach((it) => ul.append(itemLi({ ...it, staple: false })));
      sec.append(ul);
      card.append(sec, el("p", "basics", "Plus cereal, bagels and bread, fruit, and drinks"));
      addShare(card, d, meal, meal.categories.flatMap((c) => c.items).map((it) => it.name).slice(0, 6));
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
    addShare(card, d, meal, buckets.get("Mains").map((it) => it.name).slice(0, 6));
    return card;
  }

  // The grad cafés' stations don't match the dining halls', so list each
  // station under its own name, dropping staples unless "show everything".
  const stationName = (n) => n.toLowerCase() === "station" ? "Today's station" : n;
  function renderStations(card, d, meal) {
    const byStation = new Map(), staples = [], seen = new Set();
    for (const c of meal.categories) {
      for (const it of c.items) {
        if (seen.has(it.name)) continue;
        seen.add(it.name);
        if (c.staple || it.staple) { staples.push(it); continue; }
        const k = stationName(c.name);
        if (!byStation.has(k)) byStation.set(k, []);
        byStation.get(k).push(it);
      }
    }
    for (const [name, items] of byStation) {
      const sec = el("div", "grp");
      sec.append(el("h4", null, name));
      const ul = el("ul");
      items.forEach((it) => ul.append(itemLi(it)));
      sec.append(ul);
      card.append(sec);
    }
    if (!byStation.size) card.append(el("p", "none", "Nothing new"));
    if (allBox.checked && staples.length) {
      const sec = el("div", "grp staples");
      sec.append(el("h4", null, "Every day"));
      const ul = el("ul");
      staples.sort((a, b) => a.name.localeCompare(b.name)).forEach((it) => ul.append(itemLi(it)));
      sec.append(ul);
      card.append(sec);
    }
    addShare(card, d, meal, [...byStation.values()].flat().map((it) => it.name).slice(0, 6));
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
    // keep the address bar on the current view (a plain URL on Annenberg's default one)
    const params = state.q ? { ...hallParam(), q: q.value.trim() }
      : viewKey() === auto ? hallParam() : { ...hallParam(), d: w.days[state.day].date, m: state.meal };
    const search = Object.keys(params).length ? "?" + new URLSearchParams(params) : "";
    if (search !== location.search) history.replaceState(null, "", location.pathname + search);

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
  // the meal chips for this hall (none for a café with one all-day menu)
  function buildChips() {
    const box = $("#meals");
    box.hidden = MEALS.length < 2;
    box.replaceChildren(...MEALS.map((m) => {
      const chip = el("button", "chip", m);
      chip.dataset.meal = m;
      chip.onclick = () => { state.meal = m; state.q = ""; q.value = ""; render(); };
      return chip;
    }));
  }

  // The hall picker is the page title: a button that opens a popover of
  // halls, grouped, in the same style as the hours popover.
  const hallBtn = $("#hallBtn"), hallMenu = $("#hallMenu");
  (() => {
    const groups = new Map();
    for (const h of HALLS) {
      if (!groups.has(h.group)) {
        const sec = el("div", "hallgrp");
        sec.append(el("h4", null, h.group), el("div", "hallopts"));
        groups.set(h.group, sec);
      }
      const opt = el("button", "hallopt", h.name);
      opt.setAttribute("role", "option");
      opt.dataset.id = h.id;
      opt.tabIndex = -1;
      opt.onclick = () => { closeHalls(true); pickHall(h); };
      groups.get(h.group).lastChild.append(opt);
    }
    hallMenu.replaceChildren(...groups.values());
  })();
  const hallOpts = () => [...hallMenu.querySelectorAll(".hallopt")];
  function openHalls() {
    hallMenu.hidden = false;
    hallBtn.setAttribute("aria-expanded", "true");
    $("#status").open = false;
    (hallMenu.querySelector('[aria-selected="true"]') || hallOpts()[0]).focus();
  }
  function closeHalls(refocus) {
    if (hallMenu.hidden) return;
    hallMenu.hidden = true;
    hallBtn.setAttribute("aria-expanded", "false");
    if (refocus) hallBtn.focus();
  }
  hallBtn.onclick = () => (hallMenu.hidden ? openHalls() : closeHalls());
  hallBtn.onkeydown = (e) => { if (e.key === "ArrowDown") { e.preventDefault(); openHalls(); } };
  // arrows move through the halls in reading order (the Houses sit in two columns)
  hallMenu.onkeydown = (e) => {
    const opts = hallOpts(), i = opts.indexOf(document.activeElement);
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (step) { e.preventDefault(); opts[(i + step + opts.length) % opts.length].focus(); }
    else if (e.key === "Home" || e.key === "End") { e.preventDefault(); opts[e.key === "Home" ? 0 : opts.length - 1].focus(); }
    else if (e.key === "Escape" || e.key === "Tab") { if (e.key === "Escape") e.preventDefault(); closeHalls(e.key === "Escape"); }
  };
  document.addEventListener("click", (e) => { if (!e.target.closest(".hallpick")) closeHalls(); });

  function setHall(h) {
    state.hall = h;
    HOURS = h.hours;
    MEALS = h.meals;
    $("#hallName").textContent = h.name;
    for (const o of hallOpts()) o.setAttribute("aria-selected", String(o.dataset.id === h.id));
    const shared = HALLS.filter((o) => o.file === h.file && o !== h).map((o) => o.name);
    $(".brand .sub").textContent = shared.length ? `Same menu as ${shared.join(" & ")}` : "What's new each day";
    document.title = `${h.name} Menu`;
    buildHours();
    buildChips();
    updateStatus();
  }
  function pickHall(h) {
    if (h === state.hall) return;
    try { localStorage.setItem("berg.hall", h.id); } catch (_) {}
    const sameFile = h.file === state.hall.file;
    setHall(h);
    state.open.clear();
    if (sameFile && state.data) { pickDefaults(); render(); return; }
    state.data = null;
    grid.replaceChildren(el("p", "loading", "Loading menu…"));
    load();
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
    if (e.target.closest("input, .top, .daytabs, dialog")) return;
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

  // Keyboard: ←/→ change day on phones and week on desktop (where the whole
  // week is on screen), / jumps to search, 1–4 pick a meal.
  document.addEventListener("keydown", (e) => {
    if (!state.data || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
    if (e.target.closest("input, textarea, select, [contenteditable]") || document.querySelector("dialog[open]")) return;
    if (e.key === "/") { e.preventDefault(); q.focus(); return; }
    if (/^[1-4]$/.test(e.key)) { const c = document.querySelectorAll(".chip")[Number(e.key) - 1]; if (c) c.click(); return; }
    if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && !state.q) {
      e.preventDefault();
      const dir = e.key === "ArrowLeft" ? -1 : 1;
      if (!phone.matches) return goWeek(state.week + dir);
      const to = step(dir);
      if (to) goTo(to.week, to.day);
    }
  });

  // ?h= wins, then the hall picked last time on this device, then Annenberg
  let saved = null;
  try { saved = localStorage.getItem("berg.hall"); } catch (_) {}
  setHall(hallById(new URLSearchParams(location.search).get("h")) || hallById(saved) || DEFAULT_HALL);
  setInterval(updateStatus, 30e3);
  // Coming back to the page (often the installed app, left open overnight):
  // re-fetch if the data is old, move on to the new default view if the user
  // was still on the old one, and redraw so "Today" is right.
  let loadedAt = 0;
  const resume = () => {
    updateStatus();
    if (!state.data) return;
    if (Date.now() - loadedAt > 30 * 60e3) return load();
    if (viewKey() === auto) pickDefaults();
    render();
  };
  document.addEventListener("visibilitychange", () => { if (!document.hidden) resume(); });
  addEventListener("pageshow", (e) => { if (e.persisted) resume(); });
  addEventListener("online", () => { if (state.data) load(); });
  document.addEventListener("click", (e) => { if (!e.target.closest("#status")) $("#status").open = false; });

  const ua = navigator.userAgent;
  const os = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? "ios"
    : /Android/.test(ua) ? "android" : null;

  // add-to-home-screen: a corner button, hidden once running as an installed app
  const homeBtn = $("#homeBtn"), homeDlg = $("#homeDlg"), installBtn = $("#installBtn");
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  if (!standalone && homeDlg.showModal) {
    homeBtn.hidden = false;
    // show only this device's steps; desktops see both
    if (os) homeDlg.querySelectorAll("section").forEach((s) => { s.hidden = s.dataset.os !== os; });
    homeBtn.onclick = () => homeDlg.showModal();
    homeDlg.onclick = (e) => { // tap the backdrop to close
      const r = homeDlg.getBoundingClientRect();
      if (e.target === homeDlg && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) homeDlg.close();
    };
    // Chrome/Android can install directly
    let deferred;
    addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e; installBtn.hidden = false; });
    installBtn.onclick = async () => {
      if (!deferred) return;
      deferred.prompt();
      await deferred.userChoice;
      deferred = null; installBtn.hidden = true; homeDlg.close();
    };
    addEventListener("appinstalled", () => { homeBtn.hidden = true; homeDlg.close(); });
  }

  // The old michael-han.com/berg/ address redirects here with ?moved=1: ask
  // those visitors to bookmark the new address (every time, until they do).
  // render() rewrites the URL, which drops the flag.
  const movedDlg = $("#movedDlg");
  if (new URLSearchParams(location.search).has("moved") && movedDlg.showModal) {
    movedDlg.querySelectorAll(".step").forEach((p) => { p.hidden = p.dataset.os !== (os || "desktop"); });
    if (/Mac/.test(navigator.platform || ua)) $("#modKey").textContent = "⌘";
    $("#movedHome").onclick = () => { movedDlg.close(); homeDlg.showModal(); };
    movedDlg.onclick = (e) => { // tap the backdrop to close
      const r = movedDlg.getBoundingClientRect();
      if (e.target === movedDlg && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) movedDlg.close();
    };
    movedDlg.showModal();
  }

  // First load: a ?d=&m=&q= link wins over the default view.
  function initialView() {
    pickDefaults();
    const p = new URLSearchParams(location.search);
    const m = MEALS.find((x) => x.toLowerCase() === (p.get("m") || "").toLowerCase());
    if (p.get("d") && dayData(p.get("d"))) locate(p.get("d"));
    if (m) state.meal = m;
    if (p.get("q")) { q.value = p.get("q"); state.q = q.value.trim().toLowerCase(); }
  }

  let firstLoad = true;
  function load() {
    const hall = state.hall;
    return fetch(`data/${hall.file}.json`, { cache: "no-cache" })
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then((data) => {
        if (hall.file !== state.hall.file) return; // switched hall meanwhile
        const old = state.data;
        const wasDefault = old && viewKey() === auto;
        const viewing = old && old.weeks[state.week].days[state.day].date;
        state.data = data;
        loadedAt = Date.now();
        if (!old && firstLoad) initialView();
        else if (!old) pickDefaults();
        else if (wasDefault || !locate(viewing)) pickDefaults();
        firstLoad = false;
        render();
        updateStatus();
        const t = new Date(data.generated);
        const ageDays = (Date.now() - t.getTime()) / 864e5;
        $("#updated").textContent = "Updated " + t.toLocaleString("en-US", { timeZone: TZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
        const notes = [];
        if (!navigator.onLine) notes.push("You're offline, so this is the menu saved on this device.");
        if (ageDays > 2) notes.push("This menu hasn't refreshed in " + Math.floor(ageDays) + " days and may be out of date.");
        document.querySelectorAll(".stale").forEach((n) => n.remove());
        if (notes.length) grid.before(el("p", "stale", notes.join(" ")));
        if (data.source) $("#source").href = data.source;
      })
      .catch((e) => { if (!state.data && hall.file === state.hall.file) grid.replaceChildren(el("p", "empty", "Couldn't load the menu (" + e.message + ")")); });
  }
  load();

  // offline support (sw.js); failing to register just means no offline
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
