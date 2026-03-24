#!/usr/bin/env python3
"""Generate embedded data JS for offline use (no HTTP server needed)."""
import json
from pathlib import Path

DATA_DIR = Path(__file__).parent / "site" / "data"
OUT = DATA_DIR / "embedded.js"

FILES = ["conference.json", "agenda.json", "participants.json", "seating.json"]

data = {}
for f in FILES:
    p = DATA_DIR / f
    if p.exists():
        with open(p, encoding="utf-8") as fp:
            data[f.replace(".json", "")] = json.load(fp)

with open(OUT, "w", encoding="utf-8") as fp:
    fp.write("window.__KESTRIA_DATA__ = ")
    json.dump(data, fp, ensure_ascii=False, indent=None)

print(f"Wrote {OUT}")
