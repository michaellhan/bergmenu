# Working in this repo

- After finishing a change (code, scraper rules, or a re-scrape of `data/menu.json`),
  commit and push to `main` without asking. Pushing to `main` triggers
  `.github/workflows/update.yml`, which re-scrapes and deploys to
  https://bergmenu.com (GitHub Pages), so no separate deploy step is needed.
- Before pushing, `git pull --rebase`: the menu-bot commits `data/menu.json` daily.
  If `data/menu.json` conflicts, don't hand-merge it; re-run `python3 scrape.py`
  and `git add` the result.
