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
- it appears in the same meal on at least 6 of the 7 days that week.

Tweak the list or the threshold in `scrape.py` if something is being hidden that shouldn't be.
