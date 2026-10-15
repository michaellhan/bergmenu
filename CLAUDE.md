# Working in this repo

- After finishing a change (code, scraper rules, or a re-scrape of `data/*.json`),
  commit and push to `main` without asking. Pushing to `main` triggers
  `.github/workflows/update.yml`, which re-scrapes and deploys to
  https://bergmenu.com (GitHub Pages), so no separate deploy step is needed.
- Before pushing, `git pull --rebase`: the menu-bot commits `data/*.json` daily.
  If a `data/*.json` file conflicts, don't hand-merge it; re-run `python3 scrape.py`
  and `git add` the result.
