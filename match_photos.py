"""
Match round portrait photos to participants and update participants.json.
Copies matched JPGs into site/img/photos/ and adds a "photo" field to each participant.
"""
import json, os, re, shutil, sys, io, unicodedata

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

PHOTOS_DIR = os.path.join(os.path.dirname(__file__), "kulaté fotky")
PARTICIPANTS_JSON = os.path.join(os.path.dirname(__file__), "site", "data", "participants.json")
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "site", "img", "photos")


def normalize(s):
    """Lower-case, strip accents, remove punctuation, collapse whitespace."""
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = s.lower()
    s = re.sub(r"[''′.\-]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def name_parts(name):
    return set(normalize(name).split())


def extract_name_from_filename(fname):
    """Strip country prefix, extension, and trailing numeric suffixes."""
    stem = os.path.splitext(fname)[0]
    # Remove trailing " 2", "-01", "-02", "-2022", "-2023", etc.
    stem = re.sub(r"[\s\-]+(0?\d|20\d{2})$", "", stem)
    # Remove "-linkedinframe", "-PREVIEW" suffixes
    stem = re.sub(r"-(linkedinframe|PREVIEW|rounded)", "", stem, flags=re.IGNORECASE)
    # Strip trailing whitespace after removals
    stem = stem.strip().rstrip("-").strip()
    # Split on first hyphen that separates country from name
    # Countries can be multi-word: "South-Africa", "Czech-Republic", "New-Zealand", "South-Korea", "China-Singapore", "UAE-Egypt"
    multi_word_countries = [
        "South-Africa", "South-Korea", "Czech-Republic", "New-Zealand",
        "China-Singapore", "UAE-Egypt", "Canada", "Australia", "Austria",
        "Belgium", "Brazil", "Denmark", "Finland", "France", "Germany",
        "Greece", "Hungary", "India", "Ireland", "Israel", "Italy", "Japan",
        "Latvia", "Luxembourg", "Malaysia", "Netherlands", "Nigeria",
        "Norway", "Peru", "Philippines", "Poland", "Romania", "Spain",
        "Sweden", "Switzerland", "UK", "Ukraine", "Vietnam", "Zambia", "Global"
    ]
    for prefix in sorted(multi_word_countries, key=len, reverse=True):
        if stem.startswith(prefix + "-"):
            return stem[len(prefix) + 1:].replace("-", " ")
    # Fallback: strip first segment
    parts = stem.split("-", 1)
    return parts[1].replace("-", " ") if len(parts) > 1 else stem.replace("-", " ")


def best_match(photo_name_parts, participants):
    """Find participant whose name shares the most words with the photo name.

    Uses a Jaccard-like score (overlap / union of word sets) to prefer tighter
    matches. A score of 1.0 means the word sets are identical.

    The min_required guard requires at least 2 overlapping words (or all words
    for single-word names), preventing spurious matches on common first names
    alone (e.g. "John" in "John Smith" should not match "John Doe" purely on
    first name without a surname match).
    """
    best = None
    best_score = 0
    for p in participants:
        p_parts = name_parts(p["name"])
        overlap = len(photo_name_parts & p_parts)
        union = len(photo_name_parts | p_parts)
        score = overlap / union if union else 0
        min_required = min(2, len(p_parts))
        if overlap >= min_required and score > best_score:
            best_score = score
            best = p
    return best


def main():
    with open(PARTICIPANTS_JSON, "r", encoding="utf-8") as f:
        participants = json.load(f)

    for p in participants:
        p["photo"] = ""

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # Collect all JPG files (prefer .jpg over .png for smaller size)
    all_files = os.listdir(PHOTOS_DIR)
    jpg_files = [f for f in all_files if f.lower().endswith(".jpg")]
    png_only = {}
    for f in all_files:
        if f.lower().endswith(".png"):
            stem = os.path.splitext(f)[0]
            has_jpg = any(os.path.splitext(j)[0] == stem for j in jpg_files)
            if not has_jpg:
                png_only[stem] = f

    candidates = jpg_files + list(png_only.values())

    # Greedy one-to-one assignment: compute all (score, file, participant) triples,
    # sort by score descending, then iterate and commit each pair only if neither
    # the file nor the participant has already been matched. This ensures the
    # globally best matches are resolved first, preventing a lower-quality partial
    # match from "stealing" a participant from a better-matching file.
    all_scores = []
    for fname in sorted(candidates):
        photo_name = extract_name_from_filename(fname)
        pp = name_parts(photo_name)
        for p in participants:
            p_parts = name_parts(p["name"])
            overlap = len(pp & p_parts)
            union = len(pp | p_parts)
            score = overlap / union if union else 0
            min_required = min(2, len(p_parts))
            if overlap >= min_required:
                all_scores.append((score, fname, p))

    all_scores.sort(key=lambda x: -x[0])
    matched_participants = set()
    matched_files = set()
    matches = []

    for score, fname, p in all_scores:
        if p["name"] in matched_participants or fname in matched_files:
            continue
        matched_participants.add(p["name"])
        matched_files.add(fname)
        clean = re.sub(r"[^a-z0-9]+", "-", normalize(p["name"])).strip("-")
        ext = os.path.splitext(fname)[1].lower()
        out_name = clean + ext
        matches.append((fname, p, out_name))

    for fname, participant, out_name in matches:
        src = os.path.join(PHOTOS_DIR, fname)
        dst = os.path.join(OUTPUT_DIR, out_name)
        shutil.copy2(src, dst)
        participant["photo"] = "img/photos/" + out_name
        print(f"  {participant['name']:35s} <- {fname}")

    with open(PARTICIPANTS_JSON, "w", encoding="utf-8") as f:
        json.dump(participants, f, indent=2, ensure_ascii=False)

    total = len(participants)
    matched = sum(1 for p in participants if p["photo"])
    print(f"\nMatched {matched}/{total} participants with photos.")
    unmatched = [p["name"] for p in participants if not p["photo"]]
    for name in unmatched:
        print(f"  (no photo) {name}")


if __name__ == "__main__":
    main()
