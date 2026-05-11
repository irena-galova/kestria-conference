#!/usr/bin/env python3
"""
Generate site/data/seating.json from the Singapore seating workbook.

Reads sheet "ALL" (participant roster): Member, Participant, Boats!, Practice Group,
Thursday, Friday morning, Friday afternoon.

Usage (from Agenda Website/):
    python3 parse_seating_from_xlsx.py

Requires: pip install openpyxl
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

try:
    import openpyxl
except ImportError:
    print("Install openpyxl: pip install openpyxl", file=sys.stderr)
    sys.exit(1)

SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_XLSX = SCRIPT_DIR / "Singapore data" / "Table setting new.xlsx"
OUT_PATH = SCRIPT_DIR / "site" / "data" / "seating.json"


def normalize_ws(s: str) -> str:
    return " ".join(s.split()).strip()


def parse_table_cell(val) -> int | None:
    if val is None:
        return None
    if isinstance(val, (int, float)):
        if isinstance(val, float) and val != int(val):
            return int(val) if val == int(val) else None
        return int(val)
    s = normalize_ws(str(val)).lower()
    if not s or s in ("n/a", "na", "-", "—"):
        return None
    # stray newline-only cells
    if not re.search(r"\d", s):
        return None
    m = re.search(r"-?\d+", s)
    if m:
        return int(m.group(0))
    return None


def boats_slug_for_color(boats: str) -> str:
    return normalize_ws(boats).lower()


def row_to_record(row) -> dict | None:
    member = row[0]
    name = row[1]
    if name is None or (isinstance(name, str) and not normalize_ws(name)):
        return None
    if isinstance(name, str) and name.strip().lower() == "participant":
        return None

    name_clean = normalize_ws(str(name))
    # Keep known worksheet typo aligned with participant directory/search.
    if name_clean == "Elsa Camiro":
        name_clean = "Elsa Casimiro"

    boats_raw = row[2] if len(row) > 2 else None
    pg_raw = row[3] if len(row) > 3 else None
    boats = normalize_ws(str(boats_raw)) if boats_raw is not None else ""
    practice_group = normalize_ws(str(pg_raw)) if pg_raw is not None else ""

    thu = parse_table_cell(row[4]) if len(row) > 4 else None
    fri_am = parse_table_cell(row[5]) if len(row) > 5 else None
    fri_pm = parse_table_cell(row[6]) if len(row) > 6 else None

    return {
        "name": name_clean,
        "member": normalize_ws(str(member)) if member is not None else "",
        "boats": boats,
        "boatsSlug": boats_slug_for_color(boats) if boats else "",
        "practiceGroup": practice_group,
        "thursday": thu,
        "fridayAm": fri_am,
        "fridayPm": fri_pm,
    }


def main() -> None:
    xlsx = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_XLSX
    if not xlsx.is_file():
        print(f"Missing workbook: {xlsx}", file=sys.stderr)
        sys.exit(1)

    wb = openpyxl.load_workbook(xlsx, read_only=True, data_only=True)
    if "ALL" not in wb.sheetnames:
        print(f"No sheet 'ALL' in {xlsx}. Sheets: {wb.sheetnames}", file=sys.stderr)
        sys.exit(1)
    ws = wb["ALL"]

    rows_iter = ws.iter_rows(min_row=2, values_only=True)
    seating: list[dict] = []
    for row in rows_iter:
        if not row or all(c is None or str(c).strip() == "" for c in row[:2]):
            continue
        rec = row_to_record(row)
        if rec:
            seating.append(rec)

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as fp:
        json.dump(seating, fp, ensure_ascii=False, indent=2)
        fp.write("\n")

    print(f"Wrote {len(seating)} records to {OUT_PATH}")


if __name__ == "__main__":
    main()
