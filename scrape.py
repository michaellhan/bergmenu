#!/usr/bin/env python3
"""Scrape the HUDS menus for this week and next: Annenberg into data/menu.json,
every other kitchen in KITCHENS into data/<id>.json.

Stdlib only. Run:  python3 scrape.py
"""
import collections
import datetime as dt
import html
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from zoneinfo import ZoneInfo

BASE = "https://www.foodpro.huds.harvard.edu/foodpro/shtmenu.aspx"
PARAMS = {
    "sName": "HARVARD UNIVERSITY DINING SERVICES",
    "locationName": "Dining Hall",
    "naFlag": "1",
    "WeeksMenus": "This Week's Menus",
    "myaction": "read",
}
# FoodPro calls nearly every kitchen "Dining Hall"; which number feeds which
# House comes from the "Menu Offerings" links on HUDS's Dining Houses page
# (https://www.dining.harvard.edu/undergraduate-dining/dining-houses).
# Houses sharing a kitchen share a file; app.js maps each House to its file.
KITCHENS = [
    # (file id, FoodPro locationNum, name)
    ("menu", "30", "Annenberg"),
    ("adams", "09", "Adams"),
    ("cabot-pfoho", "05", "Cabot & Pforzheimer"),
    ("currier", "38", "Currier"),
    ("dunster-mather", "07", "Dunster & Mather"),
    ("eliot", "80", "Eliot"),
    ("kirkland", "14", "Kirkland"),
    ("leverett", "16", "Leverett"),
    ("lowell-quincy-winthrop", "17", "Lowell, Quincy & Winthrop"),
    # grad school cafés: weekdays, one all-day menu (GSAS: lunch and dinner)
    ("hls", "70", "HLS Café"),
    ("hks", "56", "HKS"),
    ("gsd", "41", "GSD"),
    ("gsas", "04", "GSAS Commons"),
    ("sec", "57", "SEC"),
]
TZ = ZoneInfo("America/New_York")
DATA = Path(__file__).parent / "data"
WEEKS_AHEAD = 1  # this week + N more

# Stations whose contents are essentially the same every day. Items in these
# categories are flagged as staples (hidden by default on the site).
STAPLE_CATEGORIES = {
    "salad bar", "sand/ deli", "from the grill", "gut health station",
    "brown rice station", "fresh fruit", "bagel", "build your own",
    "featured special bar", "bread choices",
}
# An item is also a staple if it shows up in the same meal on every day that
# meal is served, or all but this many (when the week has enough data to judge).
# Sunday brunch replaces breakfast and lunch, so those run 6 days, dinner 7.
STAPLE_MISSING_DAYS = 1
# The grad cafés open weekdays only, often for fewer than 5 days of a posted
# week, so they're judged over both weeks at once: an item is a staple if it's
# there on at least this share of the days its meal is served. Their build-
# your-own and grab-and-go stations are always the same.
CAFES = {"70", "56", "41", "04", "57"}
CAFE_STAPLE_SHARE = 0.6
CAFE_STAPLE_CATEGORIES = {"craft bowls", "special bar", "misc", "miscellaneous"}
MEAL_ORDER = ["Breakfast", "Brunch", "Lunch", "Dinner", "Brain Break", "All Day"]
ACRONYMS = {"BBQ", "BLT", "HKS", "HLS", "GSD", "SEC", "GSAS", "AS", "V", "VG"}
NAME_LIMIT = 60  # FoodPro's recipe-name field width
# HUDS sometimes lists the same dish under different names in one meal; map
# each variant to one name so it shows once.
ALIASES = {
    "Hard Cooked Eggs - Cage Free": "Cage Free Hard Boiled Eggs",
    "Hard Cooked Eggs": "Cage Free Hard Boiled Eggs",
}


def menu_url(loc: str, d: dt.date) -> str:
    q = dict(PARAMS, locationNum=loc, dtdate=f"{d.month}/{d.day}/{d.year}")
    return BASE + "?" + urllib.parse.urlencode(q)


def fetch(url: str, tries: int = 4) -> str:
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "bergmenu/1.0"})
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read().decode("latin-1")
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(2 * (i + 1))
    raise RuntimeError(f"failed to fetch {url}: {last}")


def clean(s: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(s).replace("\xa0", " ")).strip()


def parse_day(page: str) -> list[dict]:
    """Return [{name, categories: [{name, items: [{name, tags}]}]}] for one day."""
    meals = []
    parts = re.split(r'mealName=([A-Za-z+]+)"', page)
    # the grad cafés post one all-day menu with no meal links
    if len(parts) == 1 and "shortmenucats" in page:
        parts = ["", "All Day", page]
    for i in range(1, len(parts), 2):
        meal = clean(parts[i].replace("+", " ")).replace(" Menu", "").title()
        meal = {"Dinnner": "Dinner", "Fly By": "Fly-By"}.get(meal, meal)
        body = parts[i + 1]
        cats: "collections.OrderedDict[str, list]" = collections.OrderedDict()
        cur = None
        pat = re.compile(
            r"shortmenucats\"><span[^>]*>--\s*(.*?)\s*--</span>"
            r"|shortmenurecipes'><span[^>]*>(.*?)</span>(.*?)</table>",
            re.S,
        )
        for m in pat.finditer(body):
            if m.group(1) is not None:
                cur = clean(m.group(1))
                cats.setdefault(cur, [])
                continue
            name, tail = clean(m.group(2)), m.group(3)
            tags = []
            if "vgn.gif" in tail:
                tags.append("vegan")
            elif "veg.gif" in tail:
                tags.append("vegetarian")
            if re.search(r"\(\s*H\s*\)\s*$", name):
                name = re.sub(r"\s*\(\s*H\s*\)\s*$", "", name)
                tags.append("halal")
            # FoodPro silently cuts recipe names at 60 chars; mark the cut.
            if len(name) >= NAME_LIMIT:
                name = name.rstrip(" &,/-") + "…"
            # some kitchens type parts of names in capitals ("STIR FRY LO MEIN")
            name = re.sub(r"\b[A-Z]{2,}\b", lambda w: w[0] if w[0] in ACRONYMS else w[0].capitalize(), name)
            name = ALIASES.get(name, name)
            if cur is None:
                cur = "Other"
                cats.setdefault(cur, [])
            if name and name not in {x["name"] for x in cats[cur]}:
                cats[cur].append({"name": name, "tags": tags})
        meals.append({
            "name": meal,
            "categories": [{"name": c, "items": v} for c, v in cats.items() if v],
        })
    meals.sort(key=lambda m: MEAL_ORDER.index(m["name"]) if m["name"] in MEAL_ORDER else 99)
    return meals


def unhalal(name: str) -> str:
    """'Halal Meatballs in Marinara Sauce' -> 'meatballs in marinara sauce'."""
    return re.sub(r"\s+", " ", re.sub(r"\bhalal\b", "", name, flags=re.I)).strip().lower()


def mark_halal_dupes(meals: list[dict]) -> None:
    """The 'Halal' station repeats entrees listed elsewhere, sometimes as
    'Halal <dish>'; fold them into the regular dish and tag it halal."""
    for meal in meals:
        halal = next((c for c in meal["categories"] if c["name"].lower() == "halal"), None)
        if not halal:
            continue
        others = {unhalal(it["name"]): it for c in meal["categories"] if c is not halal for it in c["items"]}
        keep = []
        for it in halal["items"]:
            if unhalal(it["name"]) in others:
                o = others[unhalal(it["name"])]
                if "halal" not in o["tags"]:
                    o["tags"].append("halal")
            else:
                if "halal" not in it["tags"]:
                    it["tags"].append("halal")
                keep.append(it)
        halal["items"] = keep
        if not keep:
            meal["categories"].remove(halal)


def split_brain_break(meals: list[dict]) -> None:
    """FoodPro lists the late-night Brain Break as a station inside dinner;
    give it its own meal."""
    items = []
    for meal in meals:
        for c in [c for c in meal["categories"] if c["name"].lower() == "brain break"]:
            meal["categories"].remove(c)
            items += [it for it in c["items"] if it["name"] not in {x["name"] for x in items}]
    if items:
        meals.append({"name": "Brain Break", "categories": [{"name": "Brain Break", "items": items}]})


def merge_brunch(meals: list[dict]) -> list[dict]:
    """Sunday's continental breakfast and lunch are one brunch menu: fold them
    together, the Brunch station first."""
    by = {m["name"]: m for m in meals}
    if "Breakfast" not in by or "Lunch" not in by:
        return meals
    cats: "collections.OrderedDict[str, list]" = collections.OrderedDict()
    for c in by["Lunch"]["categories"] + by["Breakfast"]["categories"]:
        have = cats.setdefault(c["name"], [])
        have += [it for it in c["items"] if it["name"] not in {x["name"] for x in have}]
    order = sorted(cats, key=lambda n: n.lower() != "brunch")
    brunch = {"name": "Brunch", "categories": [{"name": n, "items": cats[n]} for n in order]}
    rest = [m for m in meals if m["name"] not in ("Breakfast", "Lunch")]
    return sorted([brunch] + rest, key=lambda m: MEAL_ORDER.index(m["name"]) if m["name"] in MEAL_ORDER else 99)


def flag_staples(days: list[dict], cafe: bool = False) -> None:
    """Flag items that are the same every day so the site can hide them."""
    staple_cats = STAPLE_CATEGORIES | (CAFE_STAPLE_CATEGORIES if cafe else set())
    counts: dict[tuple[str, str], int] = collections.Counter()
    meal_days: dict[str, int] = collections.Counter()
    for d in days:
        for meal in d["meals"]:
            meal_days[meal["name"]] += 1
            seen = set()
            for c in meal["categories"]:
                for it in c["items"]:
                    seen.add((meal["name"], it["name"]))
            for k in seen:
                counts[k] += 1
    # Anything that is a staple somewhere (e.g. a breakfast staple that shows
    # up under weekend brunch) is treated as a staple everywhere.
    staple_names = set()
    for (meal_name, item_name), c in counts.items():
        n = meal_days[meal_name]
        if cafe and n >= 3 and c >= n * CAFE_STAPLE_SHARE:
            staple_names.add(item_name)
        elif n >= 5 and c >= n - STAPLE_MISSING_DAYS:
            staple_names.add(item_name)
    for d in days:
        for meal in d["meals"]:
            for c in meal["categories"]:
                if c["name"].lower() in staple_cats:
                    staple_names.update(it["name"] for it in c["items"])
    for d in days:
        for meal in d["meals"]:
            for c in meal["categories"]:
                c["staple"] = c["name"].lower() in staple_cats
                for it in c["items"]:
                    # Brain Break is one small spread; never hide any of it.
                    it["staple"] = meal["name"] != "Brain Break" and (c["staple"] or it["name"] in staple_names)


def build(loc: str, name: str, dates: list[dt.date], pages: list[str], today: dt.date) -> "dict | None":
    weeks = []
    for w in range(WEEKS_AHEAD + 1):
        days = []
        for d, page in zip(dates[w * 7:(w + 1) * 7], pages[w * 7:(w + 1) * 7]):
            meals = parse_day(page)
            mark_halal_dupes(meals)
            split_brain_break(meals)
            if d.weekday() == 6:
                meals = merge_brunch(meals)
            days.append({
                "date": d.isoformat(),
                "weekday": d.strftime("%A"),
                "meals": meals,
                "url": menu_url(loc, d),
            })
        if loc not in CAFES:
            flag_staples(days)
        if any(d["meals"] for d in days):
            weeks.append({"start": days[0]["date"], "end": days[-1]["date"], "days": days})
    if loc in CAFES:
        flag_staples([d for w in weeks for d in w["days"]], cafe=True)
    if not weeks or not any(d["meals"] for d in weeks[0]["days"]):
        return None
    return {
        "location": name,
        "generated": dt.datetime.now(TZ).isoformat(timespec="seconds"),
        "source": menu_url(loc, today),
        "weeks": weeks,
    }


def main() -> int:
    today = dt.datetime.now(TZ).date()
    monday = today - dt.timedelta(days=today.weekday())
    dates = [monday + dt.timedelta(days=i) for i in range(7 * (WEEKS_AHEAD + 1))]

    jobs = [(loc, d) for _, loc, _ in KITCHENS for d in dates]
    with ThreadPoolExecutor(max_workers=8) as ex:
        pages = list(ex.map(lambda j: fetch(menu_url(*j)), jobs))

    DATA.mkdir(parents=True, exist_ok=True)
    ok = True
    for k, (fid, loc, name) in enumerate(KITCHENS):
        out = build(loc, name, dates, pages[k * len(dates):(k + 1) * len(dates)], today)
        path = DATA / f"{fid}.json"
        if not out:
            # Annenberg is the site's main menu, so a missing one fails the run;
            # the others just keep their last good file (or none, between terms).
            print(f"{name}: no menu data found; leaving {path.name} untouched", file=sys.stderr)
            ok = ok and fid != "menu"
            continue
        path.write_text(json.dumps(out, separators=(",", ":"), ensure_ascii=False) + "\n")
        n_items = sum(len(c["items"]) for w in out["weeks"] for d in w["days"] for m in d["meals"] for c in m["categories"])
        print(f"wrote {path} ({len(out['weeks'])} weeks, {n_items} items)")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
