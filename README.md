# Annenberg menu

A one-page site showing only what changes day to day on the Annenberg (HUDS)
menu. Staples that appear every day (salad bar, grill, deli, yogurt bar, etc.)
are hidden unless you tick **Show everything**.

- `scrape.py` pulls this week and next from the HUDS FoodPro site: Annenberg into `data/menu.json`,
  every House kitchen and grad café in `KITCHENS` into `data/<id>.json` (stdlib only).
- `index.html`, `style.css`, `app.js` render it. No build step. Search covers every
  meal (staples included) across both weeks.
- `manifest.webmanifest` and the icons make it installable from a phone's
  "Add to Home Screen". `sw.js` keeps it working offline with the last saved menu.
- `.github/workflows/update.yml` re-scrapes every morning at 5 AM Eastern and publishes to GitHub Pages.
  If a run fails it opens a "Menu update failing" issue (closed by the next good run).

## Other dining halls

The title is a picker: Annenberg (the default), each of the 12 Houses, and the
grad cafés (Law School, Kennedy School, Design School, GSAS Commons, SEC). FoodPro
calls most kitchens just "Dining Hall"; `KITCHENS` in `scrape.py` records which
number feeds which House, from the "Menu Offerings" links on HUDS's
[Dining Houses](https://www.dining.harvard.edu/undergraduate-dining/dining-houses)
page. Houses sharing a kitchen (Cabot & Pfoho, Dunster & Mather, Lowell, Quincy &
Winthrop) share a file. `HALLS` in `app.js` lists the picker, each hall's file and its
hours. The picked hall is remembered on the device; `?h=mather` links to one.

The grad cafés use the same layout as the halls. Their stations mix the day's
dishes with plain sides and condiments, so `groupOf` in `app.js` sorts those by
name (`DISH`, `SIDE`, `CONDIMENT`). They open weekdays only, so `scrape.py` judges
their staples over both weeks at once (`CAFE_STAPLE_SHARE`).

Links: `?d=2026-10-02&m=Dinner` opens a day and meal, `?q=tacos` a search. The
address bar follows along as you browse, and each day has a share button.
Keys: ←/→ change day (week on desktop), `/` searches, 1–4 pick a meal.

## Fixing the menu

When HUDS's menu is wrong, **Edit menu** in the footer unlocks an editor (the
password, once per device): remove a dish (×) or add one.
**Save** is live for everyone straight away.

Fixes are kept by a small Cloudflare Worker (`worker/`), which checks the password
and validates each fix, and are laid over the scraped menu in `app.js`, so the
daily re-scrape doesn't undo them. Each is keyed by kitchen, day and meal, and
drops off three weeks after. If the Worker is down the menu shows without fixes.

To deploy the Worker or change the password (from `worker/`):

```bash
npx wrangler deploy
npx wrangler secret put PASSWORD
```

## Hours

Meal times live in `HOURS` in `app.js`, which also builds the hours popover.
Holidays and breaks come from the data: a meal with no menu posted counts as
closed in the open/closed status.

## Run locally

```bash
python3 scrape.py
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Deploy

The site lives at https://bergmenu.com, served by GitHub Pages from this repo.
The GitHub Action re-scrapes every morning (and on every push to `main`) and
deploys the result. The build step swaps `?v=dev` on `style.css`/`app.js` for a
hash of each file, and versions the service worker's cache the same way, so
there's nothing to bump by hand. The old https://www.michael-han.com/berg/ URL redirects
here. To publish by hand:

```bash
scripts/deploy.sh
```

## Duplicate names

`ALIASES` in `scrape.py` maps HUDS's alternate names for one dish to a single
name. Items at the Halal station that match a regular dish once "Halal" is
dropped from the name (e.g. "Halal Meatballs in Marinara Sauce") are folded
into that dish and tagged halal.

## How "staples" are decided

An item is hidden by default if either:

- its station is in `STAPLE_CATEGORIES` in `scrape.py` (always-there stations), or
- it appears in the same meal on every day that meal is served that week, or all but one
  (breakfast and lunch run 6 days since Sunday is brunch; dinner runs 7).

Tweak the list or the threshold in `scrape.py` if something is being hidden that shouldn't be.

**Show everything** lists them under "Every day", split by kind (Eggs & protein,
Waffles & oatmeal, Fruit, Grill, Salad bar and so on). Stations that are one kind of
thing name the group; the rest go by item name, since a station can mean anything:
at breakfast the Salad Bar is citrus and hummus. The rules live in
`EVERYDAY_STATIONS`, `BREAKFAST_KINDS`, `SALAD_KINDS` and `everydayGroup` in `app.js`.
Anything unmatched lands in "Sides" (or "Salad bar", if that's its station).

## What shows by default

Grouping is by HUDS station. Entrées, soup and dessert always show. Vegetables,
starches, plant protein, smoothies and the pasta bar (shown as one dish) sit behind
"+ N more", which counts dishes only. Condiments, dessert toppings and breads (the
"Sides" station, sundae toppings, cornbread at the chili bar) are listed on one
"With …" line when it's opened. The rules live in `GROUPS`/`groupOf` in `app.js`.

## Brunch and Brain Break

FoodPro only has Breakfast, Lunch and Dinner. The scraper reshapes two things:

- **Sunday brunch**: Sunday's continental breakfast and lunch are merged into one
  `Brunch` meal, which the site shows under both the Breakfast and Lunch tabs.
- **Brain Break** (Sun–Thu, 9–11 PM): FoodPro lists the nightly snack as a station
  inside dinner; it's split out into its own `Brain Break` meal and tab.
