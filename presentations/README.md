# Kestria Presentations

Create and edit presentation decks in Markdown using Marp. No PowerPoint required. Content uses the Kestria corporate identity (colors, fonts) defined in the theme.

## Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- npm (comes with Node.js)

## Setup

```bash
cd "Agenda website/presentations"
npm install
```

## Build

| Command | Output |
|---------|--------|
| `npm run build` | HTML files in `dist/` |
| `npm run build:html` | Same as `build` |
| `npm run build:pdf` | PDF files in `dist/` |
| `npm run build:all` | Both HTML and PDF |

Generated files go to `dist/` (e.g. `dist/2025-Budapest-Webtemplates.html`).

## Edit a Presentation

1. Open the `.md` file in Cursor (e.g. `2025-Budapest-Webtemplates.md`).
2. Edit text only: titles, bullet points, slide content.
3. Add a new slide with `---` on its own line between slides.
4. Rebuild with `npm run build`.

**Format:**
- `#` for slide title (h1)
- `-` for bullet lists
- `**text**` for bold
- No need to change fonts, colors, or layout; the theme handles that.

## Present

**Recommended: use the built-in server** (avoids file:// issues in browsers):

1. Run: `npm run serve`
2. Open the URL shown (e.g. `http://localhost:8080`) in your browser
3. Click the deck name (e.g. `2025-Budapest-Webtemplates.md`)
4. Press `F` for fullscreen; use arrow keys or click to advance

**Alternative (after building):** Open `dist/2025-Budapest-Webtemplates.html` directly. If it shows a blank page or errors, use `npm run serve` instead.

## Create a New Deck

1. Copy an existing `.md` file (e.g. `2025-Budapest-Webtemplates.md`).
2. Rename it (e.g. `2026-Conference-Intro.md`).
3. Change the `title:` in the frontmatter and the slide content.
4. Run `npm run build` — a new HTML file will appear in `dist/`.

## Theme

The Kestria theme (`themes/kestria.css`) uses:
- Primary: #0057B0
- Secondary: #C0865E
- Tertiary/dark: #0C2340
- Fonts: Montserrat (headings), Noto Sans (body)

These match the Agenda website branding.

## Optional: Marp for VS Code / Cursor

Install the [Marp for VS Code](https://marketplace.visualstudio.com/items?itemName=marp-team.marp-vscode) extension for live preview while editing. Add to your settings if needed:

```json
"markdown.marp.themes": [
  "./themes/kestria.css"
]
```
