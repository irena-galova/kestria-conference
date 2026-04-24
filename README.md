# Kestria Global Conference – Event Website

A single-page conference website built for the **Kestria Global Conference 2026** in Singapore (May 13–15). The site is self-contained, dependency-free, and can be served from any static hosting provider or opened directly as a local file.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  index.html          Static shell – layout, navigation, section │
│                      containers. All content slots are empty    │
│                      divs populated at runtime by app.js.       │
├─────────────────────────────────────────────────────────────────┤
│  styles.css          All visual design. CSS custom properties   │
│                      (variables) for colour, typography, radius.│
├─────────────────────────────────────────────────────────────────┤
│  app.js              Single IIFE. Loads data, renders every     │
│                      section. No external frameworks.           │
├─────────────────────────────────────────────────────────────────┤
│  data/               Content authored as JSON.                  │
│    conference.json   Theme, speakers, travel tips, sightseeing. │
│    agenda.json       Day-by-day schedule with sessions.         │
│    participants.json All 53 confirmed participants.             │
│    embedded.js       Auto-generated bundle of all JSON files.   │
│                      Lets the site work without a web server.   │
└─────────────────────────────────────────────────────────────────┘
```

### Data Loading – Two Modes

`app.js` checks for `window.__KESTRIA_DATA__` at startup:

- **Embedded mode** (default): `embedded.js` is included before `app.js` and injects all JSON into that global. The page works when opened directly as `file://` or deployed to any CDN without server-side logic.
- **Fetch mode** (fallback): If the global is absent, the app fetches the individual JSON files over HTTP. Useful during development when you want to edit JSON and reload without regenerating `embedded.js`.

---

## Directory Layout

```
Agenda website/
│
├── site/                       ← Web root (serve this directory)
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   ├── favicon.ico
│   ├── data/
│   │   ├── conference.json
│   │   ├── agenda.json
│   │   ├── participants.json
│   │   ├── seating.json        (table assignments, not yet in use)
│   │   └── embedded.js         (generated — do not edit by hand)
│   └── img/
│       ├── gallery/            Budapest conference photos
│       ├── photos/             Participant headshots (400×400 JPG)
│       ├── speakers/           Keynote + partner headshots
│       ├── sightseeing/        Sightseeing spot photos
│       ├── tour/               Saturday tour photos
│       ├── agenda/             Agenda section images
│       ├── partners/           Conference partner logos
│       ├── logo-blue.png
│       └── logo-white.png
│
├── embed_data.py               Regenerates data/embedded.js
├── parse_participants.py       Parses XLSX → participants.json (Budapest-era)
├── match_photos.py             Matches portrait files → participants (Budapest-era)
├── parse_agenda.py             Parses DOCX → agenda.json skeleton
├── parse_seating.py            Parses seating XLSX → seating.json
│
├── Singapore data/             Source documents for the 2026 conference
│   ├── 2026_Singapore_MASTER FILE.xlsx
│   ├── Kestria members - contact details.xlsx
│   ├── Kestria-GC2026-Singapore-Agenda.docx
│   └── speakers/               Raw speaker headshots + logos
│
├── Portraits/                  Raw participant portrait photos
│   └── Country-Firstname-Lastname.jpg/.png
│
├── photos from Budapest/       Replacement gallery photos
├── tools/
│   └── recrop_ayesha.py        One-off image reposition script
└── tests/
    └── index.html              Automated integration & feature tests
```

---

## Data Schemas

### `conference.json`

Top-level conference metadata consumed by `renderHero()`, `renderSpeakers()`, `renderTravelTips()`, `renderSightseeing()`, and `renderInfo()`.

```jsonc
{
  "name": "Kestria Global Conference 2026",
  "city": "Singapore",
  "dates": "May 13–15, 2026",
  "venue": "Andaz Singapore",
  "meetingRoom": "Garden Studio (Level 3)",
  "theme": "Beyond Growth",
  "tagline": "Leading with Authenticity. Building with Trust.",

  "keynotes": [ /* Speaker objects (see below) */ ],
  "partners": [ /* Speaker objects (see below) */ ],

  "globalOffice": [
    { "name": "Irena Galova", "role": "Global Director", "phone": "+420 ..." }
  ],

  "travelTips": [ /* TravelTip objects (see below) */ ],
  "sightseeing": [ /* Sightseeing objects (see below) */ ]
}
```

**Speaker object** (keynotes and partners):

| Field               | Type    | Required | Notes                                           |
|---------------------|---------|----------|-------------------------------------------------|
| `name`              | string  | ✓        | Full name, used as the anchor ID (`speaker-<slug>`) |
| `photo`             | string  |          | Relative path, e.g. `img/speakers/norman.jpg`  |
| `title`             | string  | ✓        | Job title                                        |
| `org`               | string  | ✓        | Organisation name                               |
| `website`           | string  |          | URL; makes `org` a clickable link               |
| `linkedin`          | string  |          | URL; renders a LinkedIn button                  |
| `bio`               | string  |          | Plain text; paragraphs separated by `\n\n`      |
| `companyDescription`| string  |          | Italic blurb shown below the bio                |

**TravelTip object:**

| Field      | Type    | Notes                                                         |
|------------|---------|---------------------------------------------------------------|
| `title`    | string  | Card heading                                                  |
| `icon`     | string  | Key into `TRAVEL_TIP_ICONS` map in `app.js` (e.g. `"car"`)  |
| `items`    | array   | `[{name, url, desc}]` — renders as linked list                |
| `body`     | string  | Plain text fallback; newlines become `<br>`                   |
| `bodyHtml` | string  | Raw HTML override — use for rich content like Grab/Gojek links |

**Sightseeing object:**

```jsonc
{ "name": "Gardens by the Bay", "image": "img/sightseeing/gardens-by-the-bay.jpg", "desc": "..." }
```

---

### `agenda.json`

Controls the entire Agenda section.

```jsonc
{
  "days": [
    {
      "label": "Wednesday",
      "dateLabel": "May 13",
      "location": "Garden Studio, Level 3 – Andaz Singapore",
      "dressCode": "Business attire",
      "headline": null,       // Optional. Replaces location+dressCode in dayMeta.
      "optional": false,      // true → renders the "optional" badge on the day tab
      "sessions": [ /* Session objects */ ]
    }
  ]
}
```

**Session object:**

| Field         | Type    | Notes                                                                              |
|---------------|---------|------------------------------------------------------------------------------------|
| `time`        | string  | Display time, e.g. `"9:00 – 10:30 am"`                                           |
| `title`       | string  | Session name                                                                       |
| `subtitle`    | string  | Secondary line below title                                                         |
| `type`        | string  | Controls dot colour and text styling: `session`, `break`, `lunch`, `social`, `client` |
| `speakers`    | string[]| Names matching keynote/partner names — rendered as clickable links to speaker cards |
| `description` | string  | Collapsible body text. Auto-expanded if `alwaysOpen` is true                       |
| `url`         | string  | Makes title a link; auto-expands the session                                       |
| `image`       | string  | Path to an image displayed inside the session card                                 |
| `imageLayout` | string  | `"left"` or `"right"` — activates side-by-side image+text layout                 |
| `bullets`     | string[]| Rendered as a styled bullet list inside the session card                           |
| `alwaysOpen`  | boolean | Skips the expand/collapse toggle; description is always visible                    |
| `program`     | array   | **Client event only.** Sub-items rendered as separate timeline entries (see below) |

**Program item** (inside a `type: "client"` session):

| Field     | Type   | Notes                                                                 |
|-----------|--------|-----------------------------------------------------------------------|
| `time`    | string | Time slot, e.g. `"3:10 – 3:50 pm"`                                  |
| `title`   | string | Sub-session title                                                     |
| `type`    | string | `"keynote"` / `"break"` / `"welcome"` — controls visual prominence  |
| `speaker` | string | If matches a keynote/partner name, rendered as a clickable link       |

---

### `participants.json`

Array of participant objects. Only participants with a `photo` field are shown in the directory grid.

```jsonc
{
  "name": "Irena Galova",
  "member": "Kestria Global",
  "country": "Global",
  "email": "irena.galova@kestria.com",
  "mobile": "+420 733 783 307",
  "role": "participant",
  "dietary": "",
  "photo": "img/photos/irena-galova.jpg"
}
```

Photos must be square JPGs at `site/img/photos/<slug>.jpg`. The slug is derived from the participant's name using the same `slugify()` function used in `app.js`.

---

## Local Development

### Prerequisites

- Python 3 (any recent version) — for the local file server and data tools
- A modern browser

### Running the site locally

```bash
cd "Agenda website"
python3 -m http.server 8000 --directory site
# → open http://localhost:8000
```

### Editing content and seeing changes

1. Edit a JSON file in `site/data/`.
2. Reload the browser — the site uses fetch mode in development (fetches the JSON files).
3. When done, regenerate `embedded.js` so the live site works:

```bash
python3 embed_data.py
```

---

## Updating Content for a New Conference

To adapt the site for a future conference:

1. **Update `conference.json`**: change `name`, `city`, `dates`, `venue`, `theme`, `tagline`, keynote speakers, travel tips, and sightseeing spots.
2. **Update `agenda.json`**: replace the `days` array with the new schedule.
3. **Update `participants.json`**: replace the participants list. Ensure photos are in `site/img/photos/`.
4. **Replace images**: update `site/img/speakers/`, `site/img/sightseeing/`, `site/img/tour/`, `site/img/agenda/` as needed.
5. **Regenerate**: run `python3 embed_data.py`.
6. **Archive the old site**: copy the current `site/` directory to `site-<city>-archive/`.

---

## Managing Participants

Participants are stored directly in `participants.json`. To add, remove, or update a participant:

1. Edit `site/data/participants.json`.
2. For a new participant, add a portrait: process the source photo to a **400×400 square JPEG**, place it at `site/img/photos/<firstname-lastname>.jpg`, and set the `photo` field to `"img/photos/<firstname-lastname>.jpg"`.
3. Run `python3 embed_data.py` to update `embedded.js`.

**Confirming the full participant list against the Excel master file:**

```bash
python3 - <<'EOF'
import openpyxl, json

wb = openpyxl.load_workbook("Singapore data/2026_Singapore_MASTER FILE.xlsx")
ws = wb["Participants"]
headers = [c for c in ws.iter_rows(min_row=1, max_row=1, values_only=True)][0]
col = {h: i for i, h in enumerate(headers) if h}

skip = {'ezekia', 'hogan assessments', 'optimal consulting', 'external speaker', 'photographer'}
confirmed = [(row[col['member']], row[col['participant']])
             for row in ws.iter_rows(min_row=2, values_only=True)
             if row[col['participant']] and row[col['Conf']]
             and not any(s in str(row[col['member']] or '').lower() for s in skip)]
print(f"Excel confirmed: {len(confirmed)}")

with open("site/data/participants.json") as f:
    pdata = json.load(f)
print(f"JSON total: {len(pdata)}")
EOF
```

---

## Deployment

The site is a static bundle — deploy the entire `site/` directory to any web host:

- **Netlify / Vercel**: connect the repository; set `site/` as the publish directory.
- **GitHub Pages**: push `site/` contents to the `gh-pages` branch.
- **FTP / cPanel**: upload the `site/` folder contents to `public_html/`.

No build step, no bundler, no server-side processing required.

---

## Python Tools Reference

| Script                   | Purpose                                                                                                |
|--------------------------|--------------------------------------------------------------------------------------------------------|
| `embed_data.py`          | Bundles all JSON files into `site/data/embedded.js`. **Run this after any JSON edit.**                |
| `parse_participants.py`  | Parses the Budapest-era XLSX (green-row filter) into `participants.json`. Legacy tool.                 |
| `match_photos.py`        | Matches portrait files to participants via Jaccard name similarity. Copies to `site/img/photos/`.     |
| `parse_agenda.py`        | Extracts session structure from a `.docx` agenda file into a JSON skeleton for manual editing.        |
| `parse_seating.py`       | Parses seating-plan XLSX into `seating.json`.                                                         |
| `tools/recrop_ayesha.py` | One-off script to re-crop Dr. Ayesha Khanna's headshot with an upward face offset.                   |

### `embed_data.py` — typical usage

```bash
python3 embed_data.py
# Output: Wrote site/data/embedded.js
```

### `match_photos.py` — how the matching algorithm works

The script uses a **Jaccard-similarity** score between the word-sets of the normalised portrait filename (after stripping the country prefix) and the participant name. It prefers JPG over PNG when both exist, resolves one-to-one assignments by processing the highest-scoring pairs first, and skips any file or participant already matched.

---

## Tests

The test suite lives at `tests/index.html`. Open it in a browser while the local server is running:

```
http://localhost:8000/../tests/index.html
```

Or serve the project root:

```bash
python3 -m http.server 9000
# → open http://localhost:9000/tests/index.html
```

Tests cover:

- **Data integrity**: participant count, required JSON fields, photo paths format
- **Algorithm correctness**: `slugify()`, `parseDayDate()`, speaker link index, text truncation
- **Feature behaviour**: participant filter logic, gallery wrap, speaker card "read more"
- **Integration smoke tests**: data loads, hero renders, agenda tabs are created

See `tests/index.html` for a full list with per-test documentation of what each test detects.

---

## Visual Design Notes

All design tokens are defined as CSS custom properties on `:root` in `styles.css`:

| Variable          | Value                  | Used for                            |
|-------------------|------------------------|-------------------------------------|
| `--primary`       | `#c17a4d` (amber)      | Dots, links, accents                |
| `--secondary`     | `#8b6a3e` (dark amber) | Social session dots, hover states   |
| `--heading-emphasis` | `#2d2d2d`           | Bold text, titles                   |
| `--grey`          | `#6b7280`              | Muted text, break session content   |
| `--font-heading`  | Montserrat             | Section titles, times, tab labels   |
| `--font-body`     | Noto Sans              | Body copy, participant cards        |

The session timeline uses a single vertical `::before` line on the `.timeline` container. Each `.session::before` is a 12×12 dot positioned at the same horizontal rail. The client event program items are rendered as true timeline siblings (not nested), so their dots sit on the same line as all other sessions.
