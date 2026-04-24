#!/usr/bin/env python3
"""
Generate site/data/embedded.js — the offline data bundle.

Why this exists
---------------
The site normally fetches JSON files over HTTP. When the page is opened as a
local file:// URL or deployed to a CDN that does not support CORS-free fetches
from the same origin, those requests fail. This script merges all JSON data
files into a single JS assignment that runs before app.js, so the application
never needs to make a network request.

Usage
-----
Run from the project root after editing any JSON file:

    python3 embed_data.py

The output file is consumed in index.html via:

    <script src="data/embedded.js"></script>

app.js checks for window.__KESTRIA_DATA__ at startup and skips fetch() if
the global is already populated (see loadData() in app.js).

Missing files are silently skipped so the script succeeds even when seating.json
has not yet been generated for a new conference.
"""
import json
from pathlib import Path

DATA_DIR = Path(__file__).parent / "site" / "data"
OUT = DATA_DIR / "embedded.js"

# Files to bundle. The dict key (filename stem) becomes the property name on
# window.__KESTRIA_DATA__, which must match the property names expected in
# app.js loadData() (conference, agenda, participants, seating).
FILES = ["conference.json", "agenda.json", "participants.json", "seating.json"]

data = {}
for f in FILES:
    p = DATA_DIR / f
    if p.exists():
        with open(p, encoding="utf-8") as fp:
            data[f.replace(".json", "")] = json.load(fp)

# indent=None produces compact JSON (no whitespace), keeping the output file
# small. ensure_ascii=False preserves UTF-8 characters (accented names, etc.)
# so the browser does not need to decode Unicode escape sequences.
with open(OUT, "w", encoding="utf-8") as fp:
    fp.write("window.__KESTRIA_DATA__ = ")
    json.dump(data, fp, ensure_ascii=False, indent=None)

print(f"Wrote {OUT}")
