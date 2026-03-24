/* ============================================
   Kestria Conference – Application Layer
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
      initMySeat();
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
    document.getElementById("heroTheme").textContent = "Go Beyond";
    const tagline = (d.tagline || "").replace(/^Go Beyond[:\s]*/i, "");
    document.getElementById("heroTaglineMain").textContent =
      tagline || "Connecting Minds, Shaping Success";
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
      btn.className = "day-tab" + (i === activeDay ? " active" : "");
      btn.setAttribute("role", "tab");
      btn.textContent = `${day.label} · ${day.dateLabel}`;
      btn.addEventListener("click", () => {
        container.querySelectorAll(".day-tab").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        renderDay(i);
      });
      container.appendChild(btn);
    });
  }

  function renderDay(index) {
    activeDay = index;
    const day = agendaData.days[index];
    const meta = document.getElementById("dayMeta");
    meta.innerHTML = `<strong>${day.location}</strong> · Dress code: ${esc(day.dressCode)}`;

    const timeline = document.getElementById("timeline");
    timeline.innerHTML = "";

    day.sessions.forEach((s, si) => {
      const el = document.createElement("div");
      el.className = `session session--${s.type} fade-in`;
      el.style.animationDelay = `${si * 0.04}s`;

      const hasDesc = s.description || (s.subtitle && s.subtitle.length > 80);
      if (hasDesc) el.setAttribute("data-expandable", "");

      const badge = getSeatBadge(index, s);
      let html = `<div class="session__time">${esc(s.time)}${badge}</div>`;
      html += `<div class="session__title">${esc(s.title)}</div>`;
      if (s.subtitle) {
        html += `<div class="session__subtitle">${esc(s.subtitle)}</div>`;
      }
      if (s.speakers && s.speakers.length) {
        html += `<div class="session__speakers">${s.speakers.map(esc).join(", ")}</div>`;
      }
      if (s.description) {
        html += `<div class="session__description">${esc(s.description)}</div>`;
      }
      el.innerHTML = html;

      if (hasDesc) {
        el.addEventListener("click", () => el.classList.toggle("expanded"));
      }
      timeline.appendChild(el);
    });
  }

  // ── Speakers ──

  function renderSpeakers() {
    const grid = document.getElementById("speakerGrid");
    const d = conferenceData;
    grid.innerHTML = "";

    if (d.keynote && d.keynote.name) {
      grid.appendChild(buildSpeakerCard(d.keynote, "keynote", "Keynote Speaker"));
    }
    if (d.partner && d.partner.name) {
      grid.appendChild(
        buildSpeakerCard(d.partner, "partner", "Conference Partner")
      );
    }
  }

  const BIO_PREVIEW_LEN = 280;
  const COMPANY_PREVIEW_LEN = 200;

  function buildSpeakerCard(speaker, type, label) {
    const card = document.createElement("div");
    card.className = "speaker-card fade-in";

    const bio = speaker.bio || "";
    const companyDesc = speaker.companyDescription || "";
    const bioLong = bio.length > BIO_PREVIEW_LEN;
    const companyLong = companyDesc.length > COMPANY_PREVIEW_LEN;
    const shortBio = bioLong ? bio.substring(0, BIO_PREVIEW_LEN) + "…" : bio;
    const shortCompany = companyLong ? companyDesc.substring(0, COMPANY_PREVIEW_LEN) + "…" : companyDesc;

    const avatarContent = speaker.photo
      ? `<img src="${esc(speaker.photo)}" alt="${esc(speaker.name)}" loading="lazy">`
      : initials(speaker.name);

    card.innerHTML = `
      <div class="speaker-card__label speaker-card__label--${type}">${esc(label)}</div>
      <div class="speaker-card__header">
        <div class="speaker-card__avatar${speaker.photo ? " speaker-card__avatar--photo" : ""}">${avatarContent}</div>
        <div class="speaker-card__info">
          <div class="speaker-card__name">${esc(speaker.name)}</div>
          <div class="speaker-card__role">${esc(speaker.title)}</div>
          <div class="speaker-card__org">${esc(speaker.org)}</div>
        </div>
      </div>
      <div class="speaker-card__body">
        <div class="speaker-card__bio">
          <p data-full="${esc(bio)}" data-preview="${esc(shortBio)}">${esc(bioLong ? shortBio : bio)}</p>
          ${bioLong ? `<button type="button" class="speaker-card__expand" data-target="bio">Read more</button>` : ""}
        </div>
        ${companyDesc ? `
        <div class="speaker-card__company">
          <p data-full="${esc(companyDesc)}" data-preview="${esc(shortCompany)}" style="font-style:italic">${esc(companyLong ? shortCompany : companyDesc)}</p>
          ${companyLong ? `<button type="button" class="speaker-card__expand" data-target="company">Read more</button>` : ""}
        </div>` : ""}
      </div>`;

    card.querySelectorAll(".speaker-card__expand").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const wrap = btn.closest(".speaker-card__bio, .speaker-card__company");
        const p = wrap.querySelector("p");
        const isExpanded = btn.dataset.expanded === "1";
        if (isExpanded) {
          p.textContent = p.dataset.preview || "";
          btn.textContent = "Read more";
          delete btn.dataset.expanded;
        } else {
          p.textContent = p.dataset.full || "";
          btn.textContent = "Show less";
          btn.dataset.expanded = "1";
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
    "EVK_1163.JPG", "EVK_7088.JPG", "EVK_7507.JPG", "EVK_7814.JPG", "EVK_8865.JPG",
    "EVK_8885.JPG", "EVK_9079.JPG", "EVK_9457.JPG", "EVK_9586.JPG",
    "EVK_9666.JPG", "EVK_9724.JPG"
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

  const TRAVEL_TIP_ICONS = {
    car: "M5 17h14v-5H5v5zm2-6l1.5-4.5h9L19 11H5z",
    money: "M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6",
    wallet: "M21 12V7H5a2 2 0 010-4h14v4",
    plug: "M12 22v-8M9 14H6a2 2 0 01-2-2v-4a2 2 0 012-2h3M15 14h3a2 2 0 002-2v-4a2 2 0 00-2-2h-3M12 2v4",
    map: "M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z",
    map2: "M12 7a3 3 0 100 6 3 3 0 000-6z",
    utensils: "M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2H3zM21 2v7c0 1.1-.9 2-2 2h-4a2 2 0 01-2-2V2h8z",
    glass: "M8 21h8M12 3v18M5 3h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1z",
    camera: "M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-2h6l2 2h4a2 2 0 012 2z",
    cloud: "M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z",
  };

  function renderTravelTips() {
    const tips = conferenceData?.travelTips || [];
    const grid = document.getElementById("travelTipsGrid");
    if (!grid) return;
    grid.innerHTML = "";
    tips.forEach((t, i) => {
      const path = TRAVEL_TIP_ICONS[t.icon] || TRAVEL_TIP_ICONS.map;
      const path2 = t.icon === "map" ? TRAVEL_TIP_ICONS.map2 : null;
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
            <path d="${path}"/>
            ${path2 ? `<path d="${path2}"/>` : ""}
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
        body: `<strong>Conference venue:</strong><br>${esc(agendaData.days[0]?.location || d.venue)} <a href="${mapsUrl(d.venue + " " + d.city)}" target="_blank" rel="noopener" class="info-card__maplink"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> Map</a><br><br><strong>Dinner venues:</strong><br>` +
          `<strong>Day 2:</strong> Halászbástya Restaurant <a href="${mapsUrl("Halászbástya Restaurant Budapest")}" target="_blank" rel="noopener" class="info-card__maplink"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> Map</a><br>` +
          `<strong>Day 3:</strong> Spiler Shanghai Secret Bar <a href="${mapsUrl("Spiler Shanghai Secret Bar Budapest")}" target="_blank" rel="noopener" class="info-card__maplink"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> Map</a>`,
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

  function updateActiveLink() {
    const sections = ["hero", "myseat", "agenda", "speakers", "directory", "info", "traveltips", "gallery"];
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
