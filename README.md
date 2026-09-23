# Annenberg menu

A one-page site showing only what changes day to day on the Annenberg (HUDS)
menu. Staples that appear every day (salad bar, grill, deli, yogurt bar, etc.)
are hidden unless you tick **Show everything**.

- `scrape.py` pulls this week and next from the HUDS FoodPro site into `data/menu.json` (stdlib only).
- `index.html`, `style.css`, `app.js` render it. No build step. Search covers every
  meal (staples included) across both weeks.
- `manifest.webmanifest` and the icons make it installable from a phone's
  "Add to Home Screen".
- `.github/workflows/update.yml` re-scrapes every morning at 5 AM Eastern and publishes to GitHub Pages.

## Run locally

```bash
python3 scrape.py
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Deploy

The site lives at https://www.michael-han.com/berg/, served from the `berg/`
folder of the `michaellhan/michaellhan.github.io` repo. The GitHub Action
re-scrapes every morning and pushes the result there using a deploy key
(`SITE_DEPLOY_KEY` secret). To publish by hand:

```bash
scripts/deploy.sh
```

## How "staples" are decided

An item is hidden by default if either:

- its station is in `STAPLE_CATEGORIES` in `scrape.py` (always-there stations), or
- it appears in the same meal on every day that meal is served that week, or all but one
  (breakfast and lunch run 6 days since Sunday is brunch; dinner runs 7).

Tweak the list or the threshold in `scrape.py` if something is being hidden that shouldn't be.

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
