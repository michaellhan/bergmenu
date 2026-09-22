#!/usr/bin/env bash
# Manually publish the site to https://www.michael-han.com/berg/ by copying it into
# the michaellhan/michaellhan.github.io repo (folder: berg/) and pushing.
# The GitHub Action does the same thing automatically every morning.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
gh repo clone michaellhan/michaellhan.github.io "$WORK/site" -- -q --depth 1
rm -rf "$WORK/site/berg"
mkdir -p "$WORK/site/berg/data"
cp "$HERE"/index.html "$HERE"/style.css "$HERE"/app.js "$HERE"/manifest.webmanifest "$HERE"/icon.svg "$HERE"/icon-*.png "$HERE"/apple-touch-icon.png "$WORK/site/berg/"
cp "$HERE/data/menu.json" "$WORK/site/berg/data/"
cd "$WORK/site"
git add -A berg
if git diff --cached --quiet; then echo "Site already up to date."; exit 0; fi
git commit -q -m "berg: deploy $(cd "$HERE" && git rev-parse --short HEAD)"
git push -q origin main
echo "Deployed. GitHub Pages will update https://www.michael-han.com/berg/ in about a minute."
