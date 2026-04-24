/* ============================================
   Kestria Conference – Application Layer
   ============================================
   All content rendering happens here. The module
   reads data (either from the embedded bundle or
   via fetch) and populates the static HTML shell
   defined in index.html. There are no external
   dependencies.
   ============================================ */

(function () {
  "use strict";

  const DATA_BASE = "data/";
  let conferenceData = null;
  let agendaData = null;
  let participantsData = null;
  let seatingData = null;
  let selectedPerson = null;
  let activeDay = 0;

  const STORAGE_KEY = "kestria_selected_name";

  // ── Helpers ──

  // Safe HTML escaping via the browser's own text-node serialiser.
  // This avoids any regex-based escaping bugs for edge-case characters.
  function esc(str) {
    const el = document.createElement("span");
    el.textContent = str;
    return el.innerHTML;
  }

  function initials(name) {
    return name
      .split(/\s+/)
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase();
  }

  // Converts an arbitrary string into a URL-safe lowercase slug.
  // Steps: (1) decompose Unicode into base characters + combining marks via NFD,
  // (2) strip the combining marks (U+0300–U+036F), producing plain ASCII letters
  // from accented ones (é→e, ñ→n, etc.), (3) replace any run of non-alphanumeric
  // characters with a single hyphen, (4) trim leading/trailing hyphens.
  // This produces the same slug in both JS (for DOM IDs) and Python (for filenames).
  function slugify(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function buddyUrl(member, name) {
    const memberSlug = slugify(member);
    const nameSlug = slugify(name);
    if (!memberSlug || !nameSlug) return "";
    return `https://buddy.kestria.com/members/${memberSlug}/consultants/${nameSlug}/`;
  }

  function mapsUrl(query) {
    return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(query);
  }

  // Parses a short date label like "May 13" into a JS Date object.
  // The year is inferred in priority order: explicit argument → year embedded in
  // conferenceData.dates (extracted with a regex) → current year as last resort.
  // Returns null if the label is malformed, so callers can skip safely.
  function parseDayDate(dateLabel, year) {
    const months = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
    const parts = String(dateLabel || "").trim().split(/\s+/);
    if (parts.length < 2) return null;
    const month = months[parts[0]];
    const day = parseInt(parts[1], 10);
    if (month == null || isNaN(day)) return null;
    const y = year || (conferenceData && conferenceData.dates ? parseInt(conferenceData.dates.match(/\d{4}/), 10) : null) || new Date().getFullYear();
    return new Date(y, month, day);
  }

  // Determines which day tab to show first. During the conference itself, the
  // current day's tab is pre-selected so attendees don't need to navigate.
  // Outside conference dates, falls back to Day 1 (index 0).
  // Both dates are normalised to midnight to avoid timezone-of-day mismatches.
  function getInitialDayIndex() {
    if (!agendaData || !agendaData.days || !agendaData.days.length) return 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i < agendaData.days.length; i++) {
      const d = parseDayDate(agendaData.days[i].dateLabel);
      if (!d) continue;
      d.setHours(0, 0, 0, 0);
      if (d.getTime() === today.getTime()) return i;
    }
    return 0;
  }

  // ── Data Loading ──

  async function loadJSON(file) {
    const resp = await fetch(DATA_BASE + file);
    if (!resp.ok) throw new Error(`Failed to load ${file}`);
    return resp.json();
  }

  // Dual-mode data loading:
  //   1. Embedded mode: embed_data.py pre-bundles all JSON into embedded.js,
  //      which sets window.__KESTRIA_DATA__ before this script runs. This makes
  //      the site work when opened as a file:// URL or from any static CDN.
  //   2. Fetch mode: falls back to individual HTTP requests. Used automatically
  //      during local development when embedded.js has not been regenerated yet.
  // seating.json is optional — its absence is handled gracefully downstream.
  function loadData() {
    const embedded = window.__KESTRIA_DATA__;
    if (embedded && embedded.conference && embedded.agenda) {
      conferenceData = embedded.conference;
      agendaData = embedded.agenda;
      participantsData = embedded.participants || [];
      seatingData = embedded.seating || [];
      return Promise.resolve();
    }
    return Promise.all([
      loadJSON("conference.json"),
      loadJSON("agenda.json"),
      loadJSON("participants.json"),
      loadJSON("seating.json"),
    ]).then(([c, a, p, s]) => {
      conferenceData = c;
      agendaData = a;
      participantsData = p;
      seatingData = s;
    });
  }

  async function init() {
    try {
      await loadData();
      renderHero();
      activeDay = getInitialDayIndex();
      renderDayTabs();
      renderDay(activeDay);
      renderSpeakers();
      renderDirectory();
      initGallery();
      renderInfo();
      renderTravelTips();
      initNav();
      document.getElementById("footerYear").textContent =
        new Date().getFullYear();
    } catch (err) {
      console.error("Failed to load conference data:", err);
      const theme = document.getElementById("heroTheme");
      if (theme) theme.textContent = "Error loading conference data";
    }
  }

  // ── Hero ──

  function renderHero() {
    const d = conferenceData;
    document.getElementById("heroTheme").textContent = d.theme || "Beyond Growth";
    document.getElementById("heroTaglineMain").textContent =
      d.tagline || "Leading with Authenticity. Building with Trust.";
    document.getElementById("heroMeta").textContent =
      `${d.name} · ${d.city} · ${d.dates}`;
    document.title = `${d.name} – ${d.city}`;
  }

  // ── My Seat ──

  const TEAM_COLORS = {
    black: "#333", red: "#C0392B", green: "#27AE60", blue: "#2980B9",
    brown: "#8B5E3C", orange: "#E67E22", pink: "#E91E90",
    "violet/yellow": "#8E44AD",
  };

  function initMySeat() {
    const input = document.getElementById("myseatSearch");
    const sugList = document.getElementById("myseatSuggestions");

    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const person = seatingData.find(
        (s) => s.name.toLowerCase() === saved.toLowerCase()
      );
      if (person) {
        selectPerson(person);
        input.value = person.name;
      }
    }

    input.addEventListener("input", () => {
      const q = input.value.toLowerCase().trim();
      sugList.innerHTML = "";
      if (q.length < 1) {
        sugList.hidden = true;
        return;
      }
      const matches = seatingData.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.member.toLowerCase().includes(q)
      ).slice(0, 8);
      if (!matches.length) {
        sugList.hidden = true;
        return;
      }
      matches.forEach((m) => {
        const li = document.createElement("li");
        li.className = "myseat__suggestion";
        li.innerHTML = `<strong>${esc(m.name)}</strong> <span>${esc(m.member)}</span>`;
        li.addEventListener("click", () => {
          input.value = m.name;
          sugList.hidden = true;
          selectPerson(m);
        });
        sugList.appendChild(li);
      });
      sugList.hidden = false;
    });

    // Keyboard navigation for the suggestion dropdown.
    // ArrowDown/Up use the same modular wrap as the gallery navigator so navigation
    // wraps seamlessly at both ends of the list. When no item is currently active
    // (idx === -1), (−1 + 1) % n = 0 naturally selects the first item on the
    // first ArrowDown press.
    input.addEventListener("keydown", (e) => {
      const items = sugList.querySelectorAll(".myseat__suggestion");
      const active = sugList.querySelector(".myseat__suggestion--active");
      let idx = [...items].indexOf(active);
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (active) active.classList.remove("myseat__suggestion--active");
        idx = (idx + 1) % items.length;
        items[idx].classList.add("myseat__suggestion--active");
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (active) active.classList.remove("myseat__suggestion--active");
        idx = (idx - 1 + items.length) % items.length;
        items[idx].classList.add("myseat__suggestion--active");
      } else if (e.key === "Enter" && active) {
        e.preventDefault();
        active.click();
      }
    });

    document.addEventListener("click", (e) => {
      if (!e.target.closest(".myseat__picker")) sugList.hidden = true;
    });
  }

  function selectPerson(person) {
    selectedPerson = person;
    localStorage.setItem(STORAGE_KEY, person.name);

    const card = document.getElementById("myseatCard");
    const intro = document.getElementById("myseatIntro");
    intro.innerHTML = `Welcome, <strong>${esc(person.name)}</strong>! <a href="#" class="myseat__change" id="myseatChange">Change</a>`;

    document.getElementById("myseatChange").addEventListener("click", (e) => {
      e.preventDefault();
      clearPerson();
    });

    const teamColor = TEAM_COLORS[person.teambuilding] || "var(--grey)";
    const teamLabel = person.teambuilding
      ? person.teambuilding.charAt(0).toUpperCase() + person.teambuilding.slice(1)
      : "N/A";

    card.hidden = false;
    card.innerHTML = `
      <div class="myseat__row">
        <div class="myseat__label">
          <svg class="myseat__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          Wed Teambuilding
        </div>
        <div class="myseat__value">
          <span class="myseat__team-dot" style="background:${teamColor}"></span>
          Team ${esc(teamLabel)}
        </div>
      </div>
      <div class="myseat__row">
        <div class="myseat__label">
          <svg class="myseat__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          Thu Morning
        </div>
        <div class="myseat__value myseat__value--big">${person.thuAm != null ? "Table " + person.thuAm : "—"}</div>
      </div>
      <div class="myseat__row">
        <div class="myseat__label">
          <svg class="myseat__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          Thu Afternoon
        </div>
        <div class="myseat__value myseat__value--big">${person.thuPm != null ? "Table " + person.thuPm : "—"}</div>
      </div>
      <div class="myseat__row">
        <div class="myseat__label">
          <svg class="myseat__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          Friday
        </div>
        <div class="myseat__value myseat__value--big">${person.friday != null ? "Table " + person.friday : "—"}</div>
      </div>
      ${person.fridayPG ? `
      <div class="myseat__row myseat__row--highlight">
        <div class="myseat__label">
          <svg class="myseat__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
          Fri Practice Group
        </div>
        <div class="myseat__value">${esc(person.fridayPG)}</div>
      </div>` : ""}`;

    if (activeDay >= 0) renderDay(activeDay);
  }

  function clearPerson() {
    selectedPerson = null;
    localStorage.removeItem(STORAGE_KEY);
    document.getElementById("myseatCard").hidden = true;
    document.getElementById("myseatCard").innerHTML = "";
    document.getElementById("myseatSearch").value = "";
    document.getElementById("myseatIntro").textContent =
      "Select your name to see your table assignments for each session.";
    if (activeDay >= 0) renderDay(activeDay);
  }

  function getSeatBadge(dayIndex, session) {
    if (!selectedPerson) return "";
    if (session.type === "break" || session.type === "lunch") return "";

    const title = (session.title || "").toLowerCase();
    if (title.includes("mix beyond") || title.includes("dinner")) return "";

    const timeStr = session.time || "";
    const hour = parseInt(timeStr.replace(/^0/, ""), 10);
    const isPM = /pm/i.test(timeStr);
    const hour24 = isPM && hour !== 12 ? hour + 12 : hour;

    if (dayIndex === 0 && (session.type === "social" && hour24 >= 14)) {
      const color = TEAM_COLORS[selectedPerson.teambuilding] || "var(--grey)";
      const label = selectedPerson.teambuilding || "N/A";
      return `<span class="seat-badge" style="--badge-color:${color}">Team ${esc(label)}</span>`;
    }
    if (dayIndex === 1) {
      if (hour24 < 13 && selectedPerson.thuAm != null) {
        return `<span class="seat-badge">Table ${selectedPerson.thuAm}</span>`;
      }
      if (hour24 >= 13 && selectedPerson.thuPm != null) {
        return `<span class="seat-badge">Table ${selectedPerson.thuPm}</span>`;
      }
    }
    if (dayIndex === 2 && session.type === "session") {
      if (selectedPerson.friday != null) {
        const pg = selectedPerson.fridayPG ? ` \u00B7 ${esc(selectedPerson.fridayPG)}` : "";
        return `<span class="seat-badge">Table ${selectedPerson.friday}${pg}</span>`;
      }
    }
    return "";
  }

  // ── Agenda ──

  function renderDayTabs() {
    const container = document.getElementById("dayTabs");
    container.innerHTML = "";
    agendaData.days.forEach((day, i) => {
      const btn = document.createElement("button");
      btn.className = "day-tab" + (i === activeDay ? " active" : "") + (day.optional ? " day-tab--optional" : "");
      btn.setAttribute("role", "tab");
      btn.textContent = `${day.label} · ${day.dateLabel}`;
      if (day.optional) {
        const badge = document.createElement("span");
        badge.className = "day-tab__badge";
        badge.textContent = "optional";
        btn.appendChild(badge);
      }
      btn.addEventListener("click", () => {
        container.querySelectorAll(".day-tab").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        renderDay(i);
      });
      container.appendChild(btn);
    });
  }

  // Builds a reverse-lookup map from lowercase speaker name → DOM anchor ID.
  // This is computed once per day render and passed down to both the session
  // speaker name renderer and the client-event program item renderer.
  // Using a pre-built index means we do a single O(n) pass over all speakers
  // rather than an O(n×m) search inside every session's inner loop.
  function buildSpeakerLinkIndex() {
    const idx = {};
    const all = [].concat(
      conferenceData.keynotes || [],
      conferenceData.partners || []
    );
    all.forEach((sp) => {
      if (!sp || !sp.name) return;
      idx[sp.name.toLowerCase()] = "speaker-" + slugify(sp.name);
    });
    return idx;
  }

  // Renders an array of speaker name strings, turning each into a smooth-scroll
  // anchor if the name exists in the pre-built speaker link index.
  function renderSpeakerNames(names, linkIndex) {
    return names
      .map((n) => {
        const anchor = linkIndex[String(n).toLowerCase()];
        return anchor
          ? `<a href="#${anchor}" class="session__speaker-link" data-speaker-link>${esc(n)}</a>`
          : esc(n);
      })
      .join(", ");
  }

  function renderDay(index) {
    activeDay = index;
    const day = agendaData.days[index];
    const meta = document.getElementById("dayMeta");
    if (day.headline) {
      const introHtml = day.headlineIntroHtml
        ? `<p class="day__meta-intro">${day.headlineIntroHtml}</p>`
        : "";
      meta.innerHTML = `<span class="day__meta-headline">${esc(day.headline)}</span>${introHtml}`;
    } else {
      meta.innerHTML = `<strong>${day.location}</strong> · Dress code: ${esc(day.dressCode)}`;
    }

    const timeline = document.getElementById("timeline");
    timeline.innerHTML = "";

    const speakerIndex = buildSpeakerLinkIndex();

    day.sessions.forEach((s, si) => {
      // ── Client event: special two-pass rendering ──
      // A "client" session with a program array is rendered as a group of sibling
      // DOM elements rather than a single card with nested content. This places
      // each sub-item's dot on the same vertical timeline rail as all other sessions,
      // satisfying the design requirement for visual continuity. The header card
      // (title + subtitle) is appended first, followed by one element per program
      // item, each receiving a type-specific CSS modifier for the three-tier
      // visual hierarchy (keynote > welcome > break).
      if (s.type === "client" && s.program && s.program.length) {
        const headerEl = document.createElement("div");
        headerEl.className = "session session--client fade-in";
        headerEl.style.animationDelay = `${si * 0.04}s`;
        headerEl.innerHTML = `
          <div class="session__title">${esc(s.title)}</div>
          ${s.subtitle ? `<div class="session__subtitle">${esc(s.subtitle)}</div>` : ""}
        `;
        timeline.appendChild(headerEl);

        s.program.forEach((p, pi) => {
          const typeClass = p.type === "keynote" ? " session--client-item--keynote"
                          : p.type === "break"   ? " session--client-item--break"
                          : p.type === "welcome" ? " session--client-item--welcome" : "";
          const isLast = pi === s.program.length - 1;
          const itemEl = document.createElement("div");
          itemEl.className = `session session--client-item${typeClass}${isLast ? " session--client-item--last" : ""} fade-in`;
          itemEl.style.animationDelay = `${(si * 0.04) + ((pi + 1) * 0.03)}s`;

          const anchor = p.speaker && speakerIndex[p.speaker.toLowerCase()];
          const speakerHtml = p.speaker
            ? (anchor
                ? `<a href="#${anchor}" class="session__client-speaker-link" data-speaker-link>${esc(p.speaker)}</a>`
                : `<span>${esc(p.speaker)}</span>`)
            : "";

          itemEl.innerHTML = `
            <div class="session__time">${esc(p.time)}</div>
            <div class="session__title">${esc(p.title)}</div>
            ${speakerHtml ? `<div class="session__subtitle">${speakerHtml}</div>` : ""}
          `;

          itemEl.querySelectorAll("[data-speaker-link]").forEach((a) => {
            a.addEventListener("click", (e) => {
              e.stopPropagation();
              const id = a.getAttribute("href").replace(/^#/, "");
              const target = document.getElementById(id);
              if (target) {
                e.preventDefault();
                target.scrollIntoView({ behavior: "smooth", block: "start" });
                target.classList.add("speaker-card--highlight");
                setTimeout(() => target.classList.remove("speaker-card--highlight"), 2200);
              }
            });
          });

          timeline.appendChild(itemEl);
        });

        return; // skip normal session rendering for client sessions
      }

      const el = document.createElement("div");
      el.className = `session session--${s.type} fade-in`;
      el.style.animationDelay = `${si * 0.04}s`;

      // Expandability rules:
      //   alwaysOpen: session has a URL, an explicit alwaysOpen flag, or an image
      //     → description is always visible; no toggle. The "expanded" class is added
      //     immediately so CSS can show the content without a click.
      //   expandable: session has body content but is NOT alwaysOpen
      //     → a click listener toggles the "expanded" class.
      // Subtitle length > 80 chars is treated as body content because very long
      // subtitles (e.g. dinner practical info) are meant to be revealed on demand.
      const hasUrl = !!s.url;
      const alwaysOpen = hasUrl || s.alwaysOpen || !!s.image;
      const hasDesc = s.description || (s.subtitle && s.subtitle.length > 80);
      const expandable = hasDesc && !alwaysOpen;
      if (expandable) el.setAttribute("data-expandable", "");
      if (alwaysOpen && (s.description || s.image)) el.classList.add("expanded");

      let html = `<div class="session__time">${esc(s.time)}</div>`;
      const titleInner = hasUrl
        ? `<a href="${esc(s.url)}" target="_blank" rel="noopener" class="session__title-link" data-session-link>${esc(s.title)} <svg class="session__title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg></a>`
        : esc(s.title);
      html += `<div class="session__title">${titleInner}</div>`;
      if (s.subtitle) {
        html += `<div class="session__subtitle">${esc(s.subtitle)}</div>`;
      }
      if (s.speakers && s.speakers.length) {
        html += `<div class="session__speakers">${renderSpeakerNames(s.speakers, speakerIndex)}</div>`;
      }
      const bulletsHtml = s.bullets && s.bullets.length
        ? `<ul class="session__bullets">${s.bullets.map(b => `<li>${esc(b)}</li>`).join("")}</ul>`
        : "";

      if (s.image && s.imageLayout) {
        const imgTag = `<img src="${esc(s.image)}" alt="${esc(s.title)}" class="session__image session__image--side${s.type === 'client' ? ' session__image--portrait' : ''}" loading="lazy">`;
        const descTag = s.description ? `<div class="session__description">${esc(s.description)}</div>` : "";
        const reverse = s.imageLayout === "right" ? " session__img-row--reverse" : "";
        html += `<div class="session__img-row${reverse}">${imgTag}<div class="session__img-text">${descTag}${bulletsHtml}</div></div>`;
      } else {
        if (s.image) {
          html += `<img src="${esc(s.image)}" alt="${esc(s.title)}" class="session__image" loading="lazy">`;
        }
        if (s.description) {
          html += `<div class="session__description">${esc(s.description)}</div>`;
        }
        html += bulletsHtml;
      }
      el.innerHTML = html;

      el.querySelectorAll("[data-speaker-link]").forEach((a) => {
        a.addEventListener("click", (e) => {
          e.stopPropagation();
          const id = a.getAttribute("href").replace(/^#/, "");
          const target = document.getElementById(id);
          if (target) {
            e.preventDefault();
            target.scrollIntoView({ behavior: "smooth", block: "start" });
            target.classList.add("speaker-card--highlight");
            setTimeout(() => target.classList.remove("speaker-card--highlight"), 2200);
          }
        });
      });
      el.querySelectorAll("[data-session-link]").forEach((a) => {
        a.addEventListener("click", (e) => e.stopPropagation());
      });

      if (expandable) {
        el.addEventListener("click", () => el.classList.toggle("expanded"));
      }
      timeline.appendChild(el);
    });
  }

  // ── Speakers ──

  function renderSpeakers() {
    const d = conferenceData;
    const keynoteGrid = document.getElementById("keynoteGrid");
    const partnerGrid = document.getElementById("partnerGrid");
    if (keynoteGrid) {
      keynoteGrid.innerHTML = "";
      (d.keynotes || []).forEach((s) =>
        keynoteGrid.appendChild(buildSpeakerCard(s, "keynote", "Keynote Speaker"))
      );
    }
    if (partnerGrid) {
      partnerGrid.innerHTML = "";
      (d.partners || []).forEach((s) =>
        partnerGrid.appendChild(buildSpeakerCard(s, "partner", "Conference Partner"))
      );
    }
  }

  const BIO_PREVIEW_LEN = 280;
  const COMPANY_PREVIEW_LEN = 200;

  // Builds a speaker/partner card DOM element.
  // The "read more / show less" toggle works by storing both the full text and the
  // preview text as data-* attributes on the <p> element at render time. Toggling
  // swaps p.textContent between the two values, avoiding a second trip to the data.
  // The card's DOM id ("speaker-<slug>") is the anchor target used by timeline
  // speaker links to smooth-scroll to the corresponding card.
  function buildSpeakerCard(speaker, type, label) {
    const card = document.createElement("div");
    card.className = "speaker-card fade-in";
    card.id = "speaker-" + slugify(speaker.name);

    const bio = speaker.bio || "";
    const companyDesc = speaker.companyDescription || "";
    // If a company description exists, always treat the bio as "long" so the
    // Read-more toggle is rendered - clicking it also reveals the company blurb,
    // keeping the initial card height consistent across all partner cards.
    const bioLong = bio.length > BIO_PREVIEW_LEN || !!companyDesc;
    const shortBio = bio.length > BIO_PREVIEW_LEN ? bio.substring(0, BIO_PREVIEW_LEN) + "…" : bio;

    const avatarContent = speaker.photo
      ? `<img src="${esc(speaker.photo)}" alt="${esc(speaker.name)}" loading="lazy">`
      : initials(speaker.name);

    const orgHtml = speaker.website
      ? `<a href="${esc(speaker.website)}" target="_blank" rel="noopener" class="speaker-card__org-link">${esc(speaker.org)}</a>`
      : esc(speaker.org);

    const linkedinIcon = `<svg class="speaker-card__link-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19 0H5C2.2 0 0 2.2 0 5v14c0 2.8 2.2 5 5 5h14c2.8 0 5-2.2 5-5V5c0-2.8-2.2-5-5-5zM8 19H5V8h3v11zM6.5 6.7C5.6 6.7 4.8 6 4.8 5s.8-1.7 1.7-1.7S8.2 4 8.2 5s-.8 1.7-1.7 1.7zM20 19h-3v-5.6c0-3.4-4-3.1-4 0V19h-3V8h3v1.8c1.4-2.6 7-2.8 7 2.5V19z"/></svg>`;
    const webIcon = `<svg class="speaker-card__link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`;

    const linksHtml = (speaker.website || speaker.linkedin) ? `<div class="speaker-card__links">${
      speaker.website ? `<a href="${esc(speaker.website)}" target="_blank" rel="noopener" class="speaker-card__link-btn">${webIcon} Website</a>` : ""
    }${
      speaker.linkedin ? `<a href="${esc(speaker.linkedin)}" target="_blank" rel="noopener" class="speaker-card__link-btn speaker-card__link-btn--linkedin">${linkedinIcon} LinkedIn</a>` : ""
    }</div>` : "";

    card.innerHTML = `
      <div class="speaker-card__label speaker-card__label--${type}">${esc(label)}</div>
      <div class="speaker-card__header">
        <div class="speaker-card__avatar${speaker.photo ? " speaker-card__avatar--photo" : ""}">${avatarContent}</div>
        <div class="speaker-card__info">
          <div class="speaker-card__name">${esc(speaker.name)}</div>
          <div class="speaker-card__role">${esc(speaker.title)}</div>
          <div class="speaker-card__org">${orgHtml}</div>
          ${linksHtml}
        </div>
      </div>
      <div class="speaker-card__body">
        <div class="speaker-card__bio">
          <p data-full="${esc(bio)}" data-preview="${esc(shortBio)}">${esc(bioLong ? shortBio : bio)}</p>
          ${bioLong ? `<button type="button" class="speaker-card__expand" data-target="bio">Read more</button>` : ""}
        </div>
        ${companyDesc ? `
        <div class="speaker-card__company" hidden>
          <p style="font-style:italic">${esc(companyDesc)}</p>
        </div>` : ""}
      </div>`;

    card.querySelectorAll(".speaker-card__expand").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const wrap = btn.closest(".speaker-card__bio, .speaker-card__company");
        const p = wrap.querySelector("p");
        const isExpanded = btn.dataset.expanded === "1";
        const companyBlock = card.querySelector(".speaker-card__company");
        if (isExpanded) {
          p.textContent = p.dataset.preview || "";
          btn.textContent = "Read more";
          delete btn.dataset.expanded;
          if (companyBlock) companyBlock.hidden = true;
        } else {
          p.textContent = p.dataset.full || "";
          btn.textContent = "Show less";
          btn.dataset.expanded = "1";
          if (companyBlock) companyBlock.hidden = false;
        }
      });
    });
    return card;
  }

  // ── Directory ──

  function renderDirectory() {
    const withPhoto = participantsData.filter((p) => p.photo && String(p.photo).trim());
    const countries = [
      ...new Set(withPhoto.map((p) => p.country).filter(Boolean)),
    ].sort();

    const select = document.getElementById("countryFilter");
    select.innerHTML = '<option value="">All countries</option>';
    countries.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      select.appendChild(opt);
    });

    const search = document.getElementById("searchInput");
    const filter = () => filterParticipants(search.value, select.value, withPhoto);
    search.addEventListener("input", filter);
    select.addEventListener("change", filter);

    filterParticipants("", "", withPhoto);
  }

  // Multi-field participant search. An empty query or empty country string is treated
  // as "match all" for that dimension, so the two filters are independently optional.
  // The text search matches against name, Kestria member firm, and country — covering
  // both "find a colleague by name" and "find all attendees from a given firm" use cases.
  function filterParticipants(query, country, list) {
    const participants = list || participantsData.filter((p) => p.photo && String(p.photo).trim());
    const q = query.toLowerCase().trim();
    const filtered = participants.filter((p) => {
      const matchQuery =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.member.toLowerCase().includes(q) ||
        p.country.toLowerCase().includes(q);
      const matchCountry = !country || p.country === country;
      return matchQuery && matchCountry;
    });

    const grid = document.getElementById("participantGrid");
    const count = document.getElementById("directoryCount");
    count.textContent = `${filtered.length} participant${filtered.length !== 1 ? "s" : ""}`;

    if (!filtered.length) {
      grid.innerHTML = '<div class="no-results">No participants found.</div>';
      return;
    }

    grid.innerHTML = "";
    filtered.forEach((p, i) => {
      const card = document.createElement("div");
      card.className = "participant-card fade-in";
      card.style.animationDelay = `${Math.min(i * 0.03, 0.4)}s`;

      const emailLink = p.email
        ? `<a href="mailto:${esc(p.email)}">${esc(p.email)}</a>`
        : "—";
      const phoneLink = p.mobile
        ? `<a href="tel:${esc(p.mobile)}">${esc(p.mobile)}</a>`
        : "—";

      const avatarContent = p.photo
        ? `<img src="${esc(p.photo)}" alt="${esc(p.name)}" loading="lazy">`
        : initials(p.name);

      const buddy = buddyUrl(p.member, p.name);

      card.innerHTML = `
        <div class="participant-card__top">
          <div class="participant-card__avatar${p.photo ? ' participant-card__avatar--photo' : ''}">${avatarContent}</div>
          <div>
            <div class="participant-card__name">${esc(p.name)}</div>
            <div class="participant-card__member">${esc(p.member)}</div>
          </div>
        </div>
        <div class="participant-card__details">
          <div class="participant-card__detail">
            <svg class="participant-card__detail-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
            ${emailLink}
          </div>
          <div class="participant-card__detail">
            <svg class="participant-card__detail-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
            ${phoneLink}
          </div>
          ${buddy ? `
          <div class="participant-card__buddy" onclick="event.stopPropagation()">
            <a href="${esc(buddy)}" target="_blank" rel="noopener" class="btn btn--buddy">Learn More on Buddy</a>
          </div>` : ""}
        </div>`;

      card.addEventListener("click", () => {
        card.classList.toggle("expanded");
      });
      grid.appendChild(card);
    });
  }

  // ── Gallery ──

  const GALLERY_IMAGES = [
    "Kestria-Budapest-Global Conference.jpg",
    "EVK_0005.jpg", "EVK_0028.jpg", "EVK_0105.jpg", "EVK_0666.jpg",
    "EVK_1320.jpg", "EVK_1341.jpg", "EVK_2053.jpg", "EVK_2179.jpg",
    "EVK_3590.jpg", "EVK_3954.jpg", "EVK_4338.jpg", "EVK_4404.jpg",
    "EVK_4430.jpg", "EVK_4438.jpg", "EVK_4456.jpg", "EVK_4468.jpg",
    "EVK_4515.jpg", "EVK_4546.jpg", "EVK_4570.jpg", "EVK_6991.jpg",
    "EVK_7471.jpg", "EVK_7814 copy.jpg", "EVK_8865.JPG", "EVK_9457.JPG",
    "EVK_9724.JPG", "Modernizace_letiste075.jpg", "Modernizace_letiste146.jpg"
  ];

  let galleryIndex = 0;

  function renderGallery() {
    const grid = document.getElementById("galleryGrid");
    grid.innerHTML = "";

    GALLERY_IMAGES.forEach((src, i) => {
      const item = document.createElement("div");
      item.className = "gallery-item fade-in";
      item.style.animationDelay = `${i * 0.06}s`;
      item.innerHTML = `<img src="img/gallery/${src}" alt="Budapest conference photo ${i + 1}" loading="lazy">`;
      item.addEventListener("click", () => openLightbox(i));
      grid.appendChild(item);
    });
  }

  function openLightbox(index) {
    galleryIndex = index;
    const lb = document.getElementById("lightbox");
    lb.hidden = false;
    document.body.style.overflow = "hidden";
    updateLightbox();
  }

  function closeLightbox() {
    document.getElementById("lightbox").hidden = true;
    document.body.style.overflow = "";
  }

  function updateLightbox() {
    const img = document.getElementById("lightboxImg");
    img.src = "img/gallery/" + GALLERY_IMAGES[galleryIndex];
    document.getElementById("lightboxCounter").textContent =
      `${galleryIndex + 1} / ${GALLERY_IMAGES.length}`;
  }

  // Initialises the gallery grid and lightbox.
  // Navigation uses modular arithmetic to wrap at both ends:
  //   prev: (index - 1 + length) % length  → wraps 0 back to last
  //   next: (index + 1) % length           → wraps last back to 0
  // The same wrap logic applies to keyboard arrow keys.
  // Clicking the lightbox backdrop (the element whose id === "lightbox",
  // not a child) closes the overlay without needing a separate close button hit.
  function initGallery() {
    renderGallery();
    document.getElementById("lightboxClose").addEventListener("click", closeLightbox);
    document.getElementById("lightboxPrev").addEventListener("click", () => {
      galleryIndex = (galleryIndex - 1 + GALLERY_IMAGES.length) % GALLERY_IMAGES.length;
      updateLightbox();
    });
    document.getElementById("lightboxNext").addEventListener("click", () => {
      galleryIndex = (galleryIndex + 1) % GALLERY_IMAGES.length;
      updateLightbox();
    });
    document.getElementById("lightbox").addEventListener("click", (e) => {
      if (e.target.id === "lightbox") closeLightbox();
    });
    document.addEventListener("keydown", (e) => {
      if (document.getElementById("lightbox").hidden) return;
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowLeft") {
        galleryIndex = (galleryIndex - 1 + GALLERY_IMAGES.length) % GALLERY_IMAGES.length;
        updateLightbox();
      }
      if (e.key === "ArrowRight") {
        galleryIndex = (galleryIndex + 1) % GALLERY_IMAGES.length;
        updateLightbox();
      }
    });
  }

  // ── Travel Tips ──

  // Each value is raw SVG inner content (paths, circles, lines)
  const TRAVEL_TIP_ICONS = {
    car:      `<path d="M5 12l2-6h10l2 6"/><path d="M3 12h18v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6z"/><circle cx="7.5" cy="18" r="1.5"/><circle cx="16.5" cy="18" r="1.5"/><path d="M3 15h2M19 15h2"/>`,
    money:    `<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>`,
    wallet:   `<path d="M4 5a2 2 0 00-2 2v11a2 2 0 002 2h16a2 2 0 002-2V7a2 2 0 00-2-2H4z"/><path d="M2 10h20"/><path d="M20 5V4a2 2 0 00-2-2H6a2 2 0 00-2 2v1"/><circle cx="16" cy="14" r="1" fill="currentColor" stroke="none"/>`,
    plug:     `<path d="M9 3v5M15 3v5"/><rect x="6" y="8" width="12" height="7" rx="2"/><path d="M12 15v4"/><path d="M10 19h4"/>`,
    map:      `<path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/>`,
    cloud:    `<path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z"/>`,
    utensils: `<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2"/><line x1="7" y1="11" x2="7" y2="22"/><path d="M21 15V2a5 5 0 00-5 5v6c0 1.1.9 2 2 2h3v5"/><line x1="19" y1="15" x2="19" y2="22"/>`,
    glass:    `<path d="M4 2h16L13 14H11L4 2z"/><line x1="12" y1="14" x2="12" y2="21"/><line x1="9" y1="21" x2="15" y2="21"/>`,
    camera:   `<path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/>`,
    cloud2:   `<path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z"/>`,
  };

  // Renders travel tip cards. Three content formats are supported, checked in order:
  //   1. items[]  – a list of {name, url, desc} objects rendered as linked entries.
  //      Used for restaurant/bar lists where each item needs its own hyperlink.
  //   2. bodyHtml – raw HTML string injected directly. Used when the content needs
  //      inline links that cannot be expressed as a simple items array (e.g. the
  //      Grab/Gojek "Getting around" tip with mixed text and app links).
  //   3. body     – plain text, newlines converted to <br>. The safe fallback.
  // After rendering tips, renderSightseeing() is called to populate the grid below.
  function renderTravelTips() {
    const tips = conferenceData?.travelTips || [];
    const grid = document.getElementById("travelTipsGrid");
    if (!grid) return;
    grid.innerHTML = "";
    tips.forEach((t, i) => {
      const iconContent = TRAVEL_TIP_ICONS[t.icon] || TRAVEL_TIP_ICONS.map;
      const el = document.createElement("div");
      el.className = "travel-tip-card fade-in";
      el.style.animationDelay = `${i * 0.04}s`;
      let bodyHtml;
      if (t.items && t.items.length) {
        bodyHtml = t.items
          .map(
            (item) =>
              `<a href="${item.url}" target="_blank" rel="noopener" class="travel-tip-card__link"><strong>${esc(item.name)}</strong></a> – ${esc(item.desc)}`
          )
          .join("<br>");
      } else if (t.bodyHtml) {
        bodyHtml = t.bodyHtml;
      } else {
        bodyHtml = String(t.body || "")
          .split("\n")
          .map((line) => esc(line.trim()))
          .filter(Boolean)
          .join("<br>");
      }
      el.innerHTML = `
        <div class="travel-tip-card__title">
          <svg class="travel-tip-card__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            ${iconContent}
          </svg>
          ${esc(t.title)}
        </div>
        <div class="travel-tip-card__body">${bodyHtml}</div>`;
      grid.appendChild(el);
    });
    renderSightseeing();
  }

  function renderSightseeing() {
    const spots = conferenceData?.sightseeing || [];
    const grid = document.getElementById("sightseeingGrid");
    if (!grid) return;
    grid.innerHTML = "";
    spots.forEach((s, i) => {
      const el = document.createElement("div");
      el.className = "sightseeing-card fade-in";
      el.style.animationDelay = `${i * 0.05}s`;
      el.innerHTML = `
        <div class="sightseeing-card__img-wrap">
          <img src="${s.image}" alt="${esc(s.name)}" class="sightseeing-card__img" loading="lazy">
        </div>
        <div class="sightseeing-card__content">
          <h4 class="sightseeing-card__name">${esc(s.name)}</h4>
          <p class="sightseeing-card__desc">${esc(s.desc)}</p>
        </div>`;
      grid.appendChild(el);
    });
  }

  // ── Practical Info ──

  function renderInfo() {
    const d = conferenceData;
    const grid = document.getElementById("infoGrid");
    grid.innerHTML = "";

    const cards = [
      {
        icon: "M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z",
        icon2: "M12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
        title: "Venue",
        body: `<strong>Conference venue:</strong><br>${esc(agendaData.days[0]?.location || d.venue)} <a href="${mapsUrl("Andaz Singapore 5 Fraser Street")}" target="_blank" rel="noopener" class="info-card__maplink"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> Map</a><br><br><strong>Dinner venues:</strong><br>` +
          `<strong>Day 1:</strong> Coca at Suntec <a href="${mapsUrl("Coca Suntec City Singapore")}" target="_blank" rel="noopener" class="info-card__maplink"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> Map</a><br>` +
          `<strong>Day 2:</strong> Long Beach Seafood East Coast <a href="${mapsUrl("Long Beach Seafood East Coast Singapore")}" target="_blank" rel="noopener" class="info-card__maplink"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> Map</a><br>` +
          `<strong>Day 3:</strong> Fu Yuan Teochew Dining <a href="${mapsUrl("Fu Yuan Teochew Dining Singapore")}" target="_blank" rel="noopener" class="info-card__maplink"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> Map</a>`,
      },
      {
        icon: "M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
        title: "Dress Code",
        body: agendaData.days
          .map(
            (day) =>
              `<strong>${esc(day.label)}:</strong> ${esc(day.dressCode)}`
          )
          .join("<br>"),
      },
      {
        icon: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2",
        icon2: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
        title: "Global Office",
        body: d.globalOffice && d.globalOffice.length
          ? '<div class="info-card__list">' +
            d.globalOffice
              .map(
                (o) =>
                  `<div class="info-card__list-item"><span><strong>${esc(o.name)}</strong><br>${esc(o.role)}</span><span><a href="tel:${esc(o.phone)}">${esc(o.phone)}</a></span></div>`
              )
              .join("") +
            "</div>"
          : "Contact information not available.",
      },
      {
        icon: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
        title: "Device Etiquette",
        body: "Please refrain from using laptops, tablets, or phones during sessions. Coffee and lunch breaks are scheduled for catching up on business matters.",
      },
    ];

    cards.forEach((c) => {
      const el = document.createElement("div");
      el.className = "info-card fade-in";
      el.innerHTML = `
        <div class="info-card__title">
          <svg class="info-card__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="${c.icon}"/>
            ${c.icon2 ? `<path d="${c.icon2}"/>` : ""}
          </svg>
          ${esc(c.title)}
        </div>
        <div class="info-card__body">${c.body}</div>`;
      grid.appendChild(el);
    });
  }

  // ── Saturday Tour ──

  function renderSaturday() {
    const sat = conferenceData.saturday;
    const container = document.getElementById("saturdayContainer");
    if (!sat || !container) return;

    const t = sat.tour;
    const l = sat.lunch;

    const contactHtml = sat.contact
      ? `<a href="mailto:${esc(sat.contact.email)}" class="sat__contact-link">${esc(sat.contact.label)}</a>.`
      : "";

    const tourPhotosHtml = (t.photos || [])
      .map((p) => `
        <div class="sat__photo">
          <img src="${esc(p.src)}" alt="${esc(p.alt)}" loading="lazy">
          <span class="sat__photo-label">${esc(p.alt)}</span>
        </div>`)
      .join("");

    container.innerHTML = `
      <div class="sat__header">
        <h2 class="section__title section__title--light">${esc(sat.title)}</h2>
        <p class="sat__date">${esc(sat.date)}</p>
      </div>
      <p class="sat__intro">${esc(sat.intro)} ${contactHtml}</p>

      <div class="sat__cards">

        <div class="sat__card">
          <div class="sat__card-header">
            <h3 class="sat__card-title">${esc(t.title)}</h3>
          </div>
          <div class="sat__card-body">
            <p class="sat__desc">${esc(t.description)}</p>
            <ul class="sat__details">
              <li><strong>Time:</strong> ${esc(t.time)}</li>
              <li><strong>Cost:</strong> ${esc(t.cost)}</li>
              <li><strong>Includes:</strong> ${esc(t.includes)}</li>
              <li><strong>Spouses:</strong> ${esc(t.spouses)}</li>
            </ul>
            <div class="sat__photos">${tourPhotosHtml}</div>
          </div>
        </div>

        <div class="sat__card">
          <div class="sat__card-header">
            <h3 class="sat__card-title">
              <a href="${esc(l.url)}" target="_blank" rel="noopener" class="sat__venue-link">${esc(l.title)}</a>
            </h3>
          </div>
          <div class="sat__card-body">
            <p class="sat__desc">${esc(l.description)}</p>
            <ul class="sat__details">
              <li><strong>Location:</strong> ${esc(l.location)}</li>
              <li><strong>Cost:</strong> ${esc(l.cost)}</li>
              <li><strong>Note:</strong> ${esc(l.note)}</li>
            </ul>
            ${l.photo ? `<img src="${esc(l.photo)}" alt="Penang Place restaurant" class="sat__venue-photo" loading="lazy">` : ""}
            ${l.afternoteHtml ? `<p class="sat__afternote">${esc(l.afternoteHtml)}</p>` : ""}
          </div>
        </div>

      </div>`;
  }

  // ── Navigation ──

  function initNav() {
    const toggle = document.getElementById("navToggle");
    const links = document.getElementById("navLinks");

    toggle.addEventListener("click", () => {
      toggle.classList.toggle("active");
      links.classList.toggle("open");
    });

    links.querySelectorAll("a").forEach((a) => {
      a.addEventListener("click", () => {
        toggle.classList.remove("active");
        links.classList.remove("open");
      });
    });

    window.addEventListener("scroll", () => {
      const nav = document.getElementById("mainNav");
      nav.classList.toggle("nav--scrolled", window.scrollY > 10);
      updateActiveLink();
    });

    updateActiveLink();
  }

  // Scroll-spy: highlights the nav link that corresponds to the section currently
  // in view. The 100px offset accounts for the fixed nav bar height so a section
  // is considered "active" before its top edge reaches the very top of the viewport.
  // The algorithm walks all sections in order and keeps the last one whose top is
  // at-or-above the adjusted scroll position — i.e. the lowest section that has
  // scrolled into view wins. "hero" is the default so the Home link is always
  // highlighted when the page first loads.
  function updateActiveLink() {
    const sections = ["hero", "agenda", "speakers", "directory", "info", "traveltips", "gallery"];
    const scrollY = window.scrollY + 100;

    let current = "hero";
    sections.forEach((id) => {
      const el = document.getElementById(id);
      if (el && el.offsetTop <= scrollY) current = id;
    });

    document.querySelectorAll(".nav__links a").forEach((a) => {
      a.classList.toggle("active", a.dataset.section === current);
    });
  }

  // ── Boot ──
  document.addEventListener("DOMContentLoaded", init);
})();
