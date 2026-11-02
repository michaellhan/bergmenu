"""Apply the menu fixes editors save from the site to data/fixes.json.

Saving on the site files a "Menu fix" issue whose body ends in a ```json block:
{"<file>|<date>|<meal>": {"remove": [...], "add": [{"name", "group"}], "note"}}
(null clears that meal's fix). Each fix replaces the meal's previous one.

Reads the repo's open issues (the REST list, as JSON) on stdin and prints one
"<number>\t<comment>" line per fix issue, for the workflow to close it with.
An issue that doesn't check out is closed with the reason and changes nothing.
"""
import datetime as dt
import json
import re
import sys
from pathlib import Path
from zoneinfo import ZoneInfo

DATA = Path(__file__).resolve().parent.parent / "data"
FIXES = DATA / "fixes.json"
TZ = ZoneInfo("America/New_York")
GROUPS = {"Mains", "Soup", "Pizza & sandwiches", "Dessert", "Sides", "Breakfast"}
KEY = re.compile(r"([a-z0-9-]+)\|(\d{4}-\d{2}-\d{2})\|([A-Za-z ]{1,20})")
BLOCK = re.compile(r"```json\s*\n(.*?)\n```", re.S)
KEEP_DAYS = 21  # past meals' fixes are dropped after this


def text(s, limit):
    if not isinstance(s, str) or not s.strip() or len(s) > limit:
        raise ValueError(f"bad text {s!r}")
    return " ".join(s.split())


def clean(key, fix):
    m = KEY.fullmatch(key)
    if not m or m[1] == "fixes" or not (DATA / f"{m[1]}.json").exists():
        raise ValueError(f"unknown meal {key!r}")
    dt.date.fromisoformat(m[2])
    if fix is None:
        return None
    if not isinstance(fix, dict):
        raise ValueError(f"bad fix for {key}")
    remove, add = fix.get("remove") or [], fix.get("add") or []
    if not isinstance(remove, list) or not isinstance(add, list) or len(remove) + len(add) > 200:
        raise ValueError(f"bad fix for {key}")
    out = {}
    if remove:
        out["remove"] = sorted({text(s, 120) for s in remove})
    for a in add:
        if not isinstance(a, dict) or a.get("group") not in GROUPS:
            raise ValueError(f"bad dish {a!r}")
        out.setdefault("add", []).append({"name": text(a.get("name"), 120), "group": a["group"]})
    if fix.get("note"):
        out["note"] = text(fix["note"], 200)
    return out or None


def main() -> int:
    issues = [i for i in json.load(sys.stdin)
              if "pull_request" not in i and (i.get("title") or "").startswith("Menu fix")]
    saved = json.loads(FIXES.read_text()) if FIXES.exists() else {"updated": "", "fixes": {}}
    fixes = dict(saved["fixes"])
    for issue in sorted(issues, key=lambda i: i["number"]):
        try:
            block = BLOCK.findall(issue.get("body") or "")
            if not block:
                raise ValueError("no fix in the issue")
            sent = json.loads(block[-1])
            if not isinstance(sent, dict) or not sent:
                raise ValueError("no fix in the issue")
            done = {k: clean(k, v) for k, v in sent.items()}
        except ValueError as e:  # json.JSONDecodeError is one too
            print(f"{issue['number']}\tNot applied: {e}")
            continue
        for k, v in done.items():
            if v:
                fixes[k] = v
            else:
                fixes.pop(k, None)
        print(f"{issue['number']}\tApplied: live on https://bergmenu.com in a minute or two.")

    cutoff = (dt.datetime.now(TZ).date() - dt.timedelta(days=KEEP_DAYS)).isoformat()
    fixes = {k: v for k, v in sorted(fixes.items()) if k.split("|")[1] >= cutoff}
    if fixes != saved["fixes"]:
        out = {"updated": dt.datetime.now(TZ).isoformat(timespec="seconds"), "fixes": fixes}
        FIXES.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
