"""
Parse Kestria conference agenda from .docx into agenda.json + conference.json.
Re-run with a new .docx to regenerate for a different conference.
"""

import json
import os
import re
import subprocess
import sys
from docx import Document

DOCX_PATH = os.path.join(os.path.dirname(__file__),
                         "Kestria-GC2025Budapest-Electronic-Agenda.docx")
DATA_DIR = os.path.join(os.path.dirname(__file__), "site", "data")


def strip_special(text: str) -> str:
    """Normalize whitespace and replace non-breaking / special chars."""
    text = text.replace("\u00a0", " ").replace("\u2013", "\u2013")
    return re.sub(r"[ \t]+", " ", text).strip()


def parse_time_title(line: str):
    """
    Split '08:45 am \u2013 09:00 am\tGathering of delegates' into (time, title).
    Returns (time_str, title_str) or None if no match.
    """
    m = re.match(
        r"(\d{1,2}:\d{2}\s*[ap]m\s*[\u2013\-]+\s*\d{1,2}:\d{2}\s*[ap]m)\s+(.+)",
        line, re.IGNORECASE,
    )
    if m:
        return strip_special(m.group(1)), strip_special(m.group(2))
    m2 = re.match(
        r"(\d{1,2}:\d{2}\s*[ap]m)\s+(.+)", line, re.IGNORECASE
    )
    if m2:
        return strip_special(m2.group(1)), strip_special(m2.group(2))
    return None


def extract_speakers(text: str) -> list[str]:
    """Pull speaker names from '(Name1, Name2)' or '(Name1 & Name2)' lines."""
    m = re.match(r"^\((.+)\)$", text.strip())
    if m:
        inner = m.group(1)
        names = re.split(r"[,&]", inner)
        return [strip_special(n) for n in names if strip_special(n)]
    return []


def classify_session(title: str) -> str:
    """Return 'break', 'social', 'lunch', or 'session'."""
    t = title.lower()
    if "coffee break" in t:
        return "break"
    if "lunch" in t:
        return "lunch"
    if any(kw in t for kw in ["dinner", "drinks", "party", "teambuilding",
                               "cook beyond", "mix beyond", "photoshoot"]):
        return "social"
    return "session"


def parse_docx(path: str):
    doc = Document(path)
    paragraphs = [(p.text, p.style.name, [r.bold for r in p.runs]) for p in doc.paragraphs]

    days = []
    conference_meta = {}
    keynote_bio_parts = []
    partner_bio_parts = []
    global_office = []

    current_day = None
    current_session = None
    mode = "preamble"  # preamble | day | keynote_bio | partner_bio

    for idx, (text, style, bold_runs) in enumerate(paragraphs):
        clean = strip_special(text)
        if not clean:
            continue

        # --- Detect H2 section headers ---
        if style == "H2":
            day_match = re.match(r"Day\s+(\d+)\s*[\u2013\-]\s*(.+)", clean)
            if day_match:
                if current_session and current_day:
                    current_day["sessions"].append(current_session)
                    current_session = None
                current_day = {
                    "dayNumber": int(day_match.group(1)),
                    "label": f"Day {day_match.group(1)}",
                    "dateLabel": strip_special(day_match.group(2)),
                    "location": "",
                    "dressCode": "",
                    "sessions": [],
                }
                days.append(current_day)
                mode = "day"
                continue
            if "keynote speaker" in clean.lower():
                if current_session and current_day:
                    current_day["sessions"].append(current_session)
                    current_session = None
                mode = "keynote_bio"
                continue
            if "conference partner" in clean.lower():
                mode = "partner_bio"
                continue

        # --- Preamble: extract global office, dress code, etc. ---
        if mode == "preamble":
            if style == "Title" and "kestria global office" in clean.lower():
                raw_next = paragraphs[idx + 1][0] if idx + 1 < len(paragraphs) else ""
                for line in raw_next.split("\n"):
                    line = line.strip()
                    if not line:
                        continue
                    parts = re.split(r"\t+", line)
                    parts = [p.strip() for p in parts if p.strip()]
                    if len(parts) >= 3:
                        global_office.append({
                            "name": parts[0],
                            "role": parts[1],
                            "phone": parts[2].replace("\u2011", "-"),
                        })
                    elif len(parts) == 2:
                        global_office.append({
                            "name": parts[0],
                            "role": parts[1],
                            "phone": "",
                        })
            continue

        # --- Keynote bio section ---
        if mode == "keynote_bio":
            if style == "Normal":
                keynote_bio_parts.append(clean)
            continue

        # --- Partner bio section ---
        if mode == "partner_bio":
            if style in ("Normal", "Title"):
                partner_bio_parts.append(clean)
            continue

        # --- Day content ---
        if mode == "day" and current_day is not None:
            if "meeting room" in clean.lower():
                current_day["location"] = clean.split(":", 1)[-1].strip() if ":" in clean else clean
                continue
            if clean.lower().startswith("dress code"):
                current_day["dressCode"] = clean.split(":", 1)[-1].strip() if ":" in clean else clean
                continue

            parsed = parse_time_title(clean)
            if parsed:
                if current_session:
                    current_day["sessions"].append(current_session)
                time_str, title_str = parsed
                session_type = classify_session(title_str)
                current_session = {
                    "time": time_str,
                    "title": title_str,
                    "subtitle": "",
                    "speakers": [],
                    "type": session_type,
                    "description": "",
                }
                continue

            if current_session:
                # Handle multi-line paragraphs with embedded speaker names
                sub_lines = clean.split("\n")
                for sline in sub_lines:
                    sline = strip_special(sline)
                    if not sline:
                        continue
                    speakers = extract_speakers(sline)
                    if speakers:
                        current_session["speakers"].extend(speakers)
                    elif not current_session["subtitle"]:
                        current_session["subtitle"] = sline
                    else:
                        if current_session["description"]:
                            current_session["description"] += " " + sline
                        else:
                            current_session["description"] = sline
            else:
                # Standalone text after day header (social event descriptions, etc.)
                if current_day["sessions"]:
                    last = current_day["sessions"][-1]
                    if last["description"]:
                        last["description"] += " " + clean
                    else:
                        last["description"] = clean

    if current_session and current_day:
        current_day["sessions"].append(current_session)

    # --- Build keynote / partner objects ---
    keynote = {"name": "", "title": "", "org": "", "bio": ""}
    if keynote_bio_parts:
        header = keynote_bio_parts[0].split("\n")
        keynote["name"] = header[0] if len(header) > 0 else ""
        keynote["title"] = header[1] if len(header) > 1 else ""
        keynote["org"] = header[2] if len(header) > 2 else ""
        keynote["bio"] = " ".join(keynote_bio_parts[1:])

    partner = {"name": "", "title": "", "org": "", "bio": "", "companyDescription": ""}
    if partner_bio_parts:
        # First part is org name (Title style), then "Name\nTitle", then bio paragraphs
        org_name = ""
        name_line = ""
        title_line = ""
        bio_texts = []
        company_desc = []
        for i, part in enumerate(partner_bio_parts):
            if i == 0:
                org_name = part
            elif i == 1:
                lines = part.split("\n")
                name_line = lines[0] if len(lines) > 0 else ""
                title_line = lines[1] if len(lines) > 1 else ""
            elif part.startswith(org_name) or "full-stack" in part.lower() or "platform" in part.lower():
                company_desc.append(part)
            else:
                bio_texts.append(part)
        partner["name"] = name_line
        partner["title"] = title_line
        partner["org"] = org_name
        partner["bio"] = " ".join(bio_texts)
        partner["companyDescription"] = " ".join(company_desc)

    conference_meta = {
        "name": "Kestria Global Conference 2025",
        "city": "Budapest",
        "dates": "May 14\u201316, 2025",
        "venue": "Pullman Hotel",
        "tagline": "Go Beyond: Connecting Minds, Shaping Success",
        "keynote": keynote,
        "partner": partner,
        "globalOffice": global_office,
    }

    agenda = {"days": days}
    return agenda, conference_meta


def main():
    docx_path = sys.argv[1] if len(sys.argv) > 1 else DOCX_PATH
    os.makedirs(DATA_DIR, exist_ok=True)

    print(f"Parsing: {docx_path}")
    agenda, conference = parse_docx(docx_path)

    agenda_path = os.path.join(DATA_DIR, "agenda.json")
    conf_path = os.path.join(DATA_DIR, "conference.json")

    with open(agenda_path, "w", encoding="utf-8") as f:
        json.dump(agenda, f, indent=2, ensure_ascii=False)
    print(f"  -> {agenda_path}  ({sum(len(d['sessions']) for d in agenda['days'])} sessions across {len(agenda['days'])} days)")

    with open(conf_path, "w", encoding="utf-8") as f:
        json.dump(conference, f, indent=2, ensure_ascii=False)
    print(f"  -> {conf_path}")

    # Regenerate embedded.js for offline use
    embed = os.path.join(os.path.dirname(__file__), "embed_data.py")
    if os.path.exists(embed):
        subprocess.run([sys.executable, embed], check=False)


if __name__ == "__main__":
    main()
