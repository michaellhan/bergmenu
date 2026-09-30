#!/usr/bin/env bash
# Manually publish the site to https://bergmenu.com by triggering the GitHub
# Action, which re-scrapes and deploys to GitHub Pages. It also runs every
# morning and on every push to main.
set -euo pipefail
gh workflow run update.yml -R michaellhan/bergmenu
echo "Triggered. https://bergmenu.com will update in about a minute."
