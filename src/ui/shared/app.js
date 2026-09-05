const STORAGE_KEY = "openheader_state";

let state = { paused: false, profiles: [], activeProfileId: null };

function detectSurface() {
  const configured =
    window.OpenModHeaderSurface && window.OpenModHeaderSurface.name;
  if (configured) return configured;

  const declared = document.documentElement.dataset.surface;
  if (declared) return declared;

  try {
    const views =
      chrome.extension && chrome.extension.getViews
        ? chrome.extension.getViews({ type: "popup" })
        : [];
    return views.includes(window) ? "popup" : "sidePanel";
  } catch (e) {
    return "popup";
  }
}

document.documentElement.dataset.surface = detectSurface();

const PROFILE_COLORS = [
  "#6d071a", "#d32f2f", "#e8710a", "#c79100", "#2e7d32",
  "#0f766e", "#1a73e8", "#3f51b5", "#7b1fa2", "#455a64",
];

const UI_FONTS = {
  default: 'system-ui, "Segoe UI", Roboto, Tahoma, Arial, sans-serif',
  segoe: '"Segoe UI", Tahoma, sans-serif',
  calibri: 'Calibri, "Segoe UI", sans-serif',
  tahoma: 'Tahoma, Arial, sans-serif',
  verdana: 'Verdana, Geneva, sans-serif',
  arial: 'Arial, Helvetica, sans-serif',
  georgia: 'Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, Consolas, "Courier New", monospace',
};

const DEFAULT_COLOR = PROFILE_COLORS[0];
const DEFAULT_SETTINGS = {
  theme: "light",
  font: "default",
  fontSize: 13,
  viewMode: "popup",
  density: "comfortable",
  pinMode: "push",
  maskSecrets: true,
};

/* ── icons ────────────────────────────────────────────────────────────────
   One stroked set for the whole UI. Emoji render differently per platform
   and cannot inherit stroke weight, so nothing here uses them.
   ────────────────────────────────────────────────────────────────────────── */
const ICON = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  pause: '<path d="M9 5v14M15 5v14"/>',
  play: '<path d="M7 4.8 19 12 7 19.2Z"/>',
  more:
    '<circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none"/>' +
    '<circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/>' +
    '<circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  // sliders rather than a cog: at 17px a cog turns into a blob, and this menu
  // is about appearance anyway
  gear:
    '<path d="M5 20.5v-6.2M5 9.7V3.5M12 20.5v-8.6M12 7.3V3.5M19 20.5v-4.2M19 11.7V3.5"/>' +
    '<path d="M2.6 14.3h4.8M9.6 7.3h4.8M16.6 16.3h4.8"/>',
  help:
    '<circle cx="12" cy="12" r="9"/>' +
    '<path d="M9.6 9.2a2.5 2.5 0 1 1 3.3 2.4c-.6.2-.9.8-.9 1.4v.5"/>' +
    '<circle cx="12" cy="17" r="1" fill="currentColor" stroke="none"/>',
  chev: '<path d="M6 9.5 12 15.5 18 9.5"/>',
  x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  trash:
    '<path d="M4 7h16M9.5 7V5.2A1.2 1.2 0 0 1 10.7 4h2.6a1.2 1.2 0 0 1 1.2 1.2V7"/>' +
    '<path d="M6.4 7l.8 11.4A1.7 1.7 0 0 0 8.9 20h6.2a1.7 1.7 0 0 0 1.7-1.6L17.6 7"/>',
  eye:
    '<path d="M2.2 12S6 5.2 12 5.2 21.8 12 21.8 12 18 18.8 12 18.8 2.2 12 2.2 12Z"/>' +
    '<circle cx="12" cy="12" r="3"/>',
  eyeoff:
    '<path d="M4 4l16 16M10 5.6A9.6 9.6 0 0 1 12 5.4c6 0 9.8 6.6 9.8 6.6a18 18 0 0 1-3.3 4M6.6 7.9A17.6 17.6 0 0 0 2.2 12S6 18.6 12 18.6c1.2 0 2.3-.2 3.3-.6"/>',
  tag:
    '<path d="M3.9 5.9v5c0 .7.3 1.3.7 1.8l6.8 6.8c.7.7 1.8.7 2.5 0l5.6-5.6c.7-.7.7-1.8 0-2.5l-6.8-6.8a2.5 2.5 0 0 0-1.8-.7h-5a2 2 0 0 0-2 2Z"/>' +
    '<circle cx="8" cy="8" r="1.1"/>',
  grip:
    '<circle cx="2.5" cy="2" r="1.25"/><circle cx="6.5" cy="2" r="1.25"/>' +
    '<circle cx="2.5" cy="7.5" r="1.25"/><circle cx="6.5" cy="7.5" r="1.25"/>' +
    '<circle cx="2.5" cy="13" r="1.25"/><circle cx="6.5" cy="13" r="1.25"/>',
};

function svgIcon(name) {
  const box = name === "grip" ? "0 0 9 15" : "0 0 24 24";
  return `<svg viewBox="${box}" aria-hidden="true">${ICON[name] || ""}</svg>`;
}

function paintIcons(root = document) {
  root.querySelectorAll("[data-i]").forEach((el) => {
    el.innerHTML = svgIcon(el.dataset.i);
  });
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function newProfile(name) {
  return {
    id: uid(),
    name: name || "Profile 1",
    headers: [],
    responseHeaders: [],
    filters: [],
    color: DEFAULT_COLOR,
  };
}

function newHeader() {
  return { id: uid(), enabled: true, name: "", value: "", op: "set", label: "" };
}

const labelEditing = new Set();
const revealed = new Set();
const collapsed = new Set();

function newFilter(value = "") {
  return { id: uid(), enabled: true, value };
}

function readCache() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function writeCache() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {}
}

function normalize(raw) {
  const s = raw || { paused: false, profiles: [] };
  if (!s.profiles || s.profiles.length === 0) s.profiles = [newProfile()];
  for (const p of s.profiles) {
    if (!p.headers) p.headers = [];
    if (!p.responseHeaders) p.responseHeaders = [];
    if (!p.filters) p.filters = [];
    for (const h of [...p.headers, ...p.responseHeaders]) {
      if (!h.id) h.id = uid();
    }
    delete p.enabled;
    delete p.requestEnabled;
    delete p.responseEnabled;
    if (!p.color) p.color = DEFAULT_COLOR;
    for (const f of p.filters) {
      if (!f.id) f.id = uid();
      delete f.type;
    }
  }
  if (!s.activeProfileId) s.activeProfileId = s.profiles[0].id;
  if (!s.settings) s.settings = { ...DEFAULT_SETTINGS };
  if (!s.settings.theme) s.settings.theme = "light";
  if (!s.settings.font) s.settings.font = "default";
  if (!s.settings.fontSize) s.settings.fontSize = 13;
  if (!["popup", "sidePanel"].includes(s.settings.viewMode)) {
    s.settings.viewMode = "popup";
  }
  // "adaptive" used to fold unlabelled rows onto one line, which made the
  // list ragged; it was removed in favour of one shape for every row.
  if (!["comfortable", "compact"].includes(s.settings.density)) {
    s.settings.density = DEFAULT_SETTINGS.density;
  }
  if (!["push", "stack"].includes(s.settings.pinMode)) {
    s.settings.pinMode = DEFAULT_SETTINGS.pinMode;
  }
  if (typeof s.settings.maskSecrets !== "boolean") {
    s.settings.maskSecrets = DEFAULT_SETTINGS.maskSecrets;
  }
  return s;
}

async function save() {
  writeCache();
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}

async function reconcile(hadCache) {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  const stored = data[STORAGE_KEY];
  if (!hadCache && stored) {
    state = normalize(stored);
    render();
    writeCache();
    return;
  }
  if (JSON.stringify(stored) !== JSON.stringify(state)) {
    writeCache();
    await chrome.storage.local.set({ [STORAGE_KEY]: state });
  }
}

function applySettings() {
  const st = state.settings || DEFAULT_SETTINGS;
  const el = document.documentElement;
  const root = el.style;
  el.dataset.theme = st.theme || "light";
  // The side panel is too narrow for the folded row — the key and label
  // columns would leave the value a sliver — so it stays two-line whatever the
  // popup's setting says, and the setting itself is hidden there.
  el.dataset.density =
    el.dataset.surface === "sidePanel"
      ? "comfortable"
      : st.density || "comfortable";
  el.dataset.pin = st.pinMode || "push";
  el.dataset.mask = st.maskSecrets ? "on" : "off";
  root.setProperty("--ui-font", UI_FONTS[st.font] || UI_FONTS.default);
  root.setProperty("--row-font-size", (st.fontSize || 13) + "px");
}

async function notifySurfacePreference(openNow = false) {
  try {
    await chrome.runtime.sendMessage({ type: "surfacePreferenceChanged" });
  } catch (e) {}

  if (!openNow || state.settings.viewMode !== "sidePanel") return;
  if (!chrome.sidePanel || !chrome.sidePanel.open) return;

  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const windowId = tabs && tabs[0] && tabs[0].windowId;
    if (windowId != null) await chrome.sidePanel.open({ windowId });
  } catch (e) {}
}

let colorMenu = null;
let filterStatusRun = 0;

function closeColorMenu() {
  if (!colorMenu) return;
  colorMenu.remove();
  colorMenu = null;
  document.removeEventListener("click", onColorDocClick, true);
}

function onColorDocClick(e) {
  if (colorMenu && !colorMenu.contains(e.target) && e.target.id !== "profileId") {
    closeColorMenu();
  }
}

function openColorMenu(anchor) {
  const wasOpen = !!colorMenu;
  closeColorMenu();
  if (wasOpen) return;
  const menu = document.createElement("div");
  menu.className = "color-menu";
  const cur = activeProfile().color;
  PROFILE_COLORS.forEach((col) => {
    const sw = document.createElement("button");
    sw.className = "swatch" + (col === cur ? " sel" : "");
    sw.style.background = col;
    sw.title = col;
    sw.addEventListener("click", (e) => {
      e.stopPropagation();
      activeProfile().color = col;
      closeColorMenu();
      render();
      save();
    });
    menu.appendChild(sw);
  });
  const r = anchor.getBoundingClientRect();
  menu.style.top = r.bottom + 6 + "px";
  menu.style.left = r.left + "px";
  document.body.appendChild(menu);
  colorMenu = menu;
  setTimeout(() => document.addEventListener("click", onColorDocClick, true), 0);
}

/* ── the ⋯ overflow menu ───────────────────────────────────────────────────
   Delete used to sit next to Pause in the title bar; one slip destroyed a
   whole profile. It lives behind ⋯ now, and deletions are undoable.
   ────────────────────────────────────────────────────────────────────────── */
let popMenu = null;

function closePopMenu() {
  if (!popMenu) return;
  popMenu.remove();
  popMenu = null;
  document.removeEventListener("click", onPopMenuDocClick, true);
}

function onPopMenuDocClick(e) {
  if (popMenu && !popMenu.contains(e.target) && e.target.id !== "tbMore") {
    closePopMenu();
  }
}

function openProfileMenu(anchor) {
  const wasOpen = !!popMenu;
  closePopMenu();
  if (wasOpen) return;

  const menu = document.createElement("div");
  menu.className = "popmenu";

  const dup = document.createElement("button");
  dup.type = "button";
  dup.innerHTML = svgIcon("plus") + "<span>Duplicate profile</span>";
  dup.addEventListener("click", () => {
    closePopMenu();
    duplicateProfile();
  });

  const sep = document.createElement("div");
  sep.className = "sep";

  const del = document.createElement("button");
  del.type = "button";
  del.className = "danger";
  del.innerHTML = svgIcon("trash") + "<span>Delete profile</span>";
  del.addEventListener("click", () => {
    closePopMenu();
    deleteProfile(activeProfile().id);
  });

  menu.append(dup, sep, del);
  document.body.appendChild(menu);

  const r = anchor.getBoundingClientRect();
  const w = menu.offsetWidth;
  menu.style.top = r.bottom + 6 + "px";
  menu.style.left = Math.max(6, Math.min(r.right - w, window.innerWidth - w - 6)) + "px";

  popMenu = menu;
  setTimeout(() => document.addEventListener("click", onPopMenuDocClick, true), 0);
}

/* ── undo toast ──────────────────────────────────────────────────────────── */
let toastEl = null;
let toastTimer = null;

function hideToast() {
  clearTimeout(toastTimer);
  if (toastEl) toastEl.remove();
  toastEl = null;
}

function showToast(message, onUndo) {
  hideToast();
  const el = document.createElement("div");
  el.className = "toast";

  const text = document.createElement("span");
  text.textContent = message;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = "Undo";
  btn.addEventListener("click", () => {
    hideToast();
    onUndo();
  });

  el.append(text, btn);
  document.body.appendChild(el);
  toastEl = el;
  toastTimer = setTimeout(hideToast, 7000);
}

function closeSettings() {
  const menu = document.getElementById("settingsMenu");
  menu.hidden = true;
  document.body.classList.remove("settings-open");
  document.removeEventListener("click", onSettingsDocClick, true);
}

function onSettingsDocClick(e) {
  const menu = document.getElementById("settingsMenu");
  if (!menu.contains(e.target) && !e.target.closest("#railSettings")) {
    closeSettings();
  }
}

function toggleSettings(anchor) {
  const menu = document.getElementById("settingsMenu");
  if (!menu.hidden) {
    closeSettings();
    return;
  }
  menu.hidden = false;
  document.body.classList.add("settings-open");
  const r = anchor.getBoundingClientRect();
  const h = menu.offsetHeight;
  let top = r.top;
  if (top + h > window.innerHeight - 8) top = window.innerHeight - h - 8;
  if (top < 8) top = 8;
  menu.style.top = top + "px";
  menu.style.left = r.right + 8 + "px";
  setTimeout(() => document.addEventListener("click", onSettingsDocClick, true), 0);
}

/* ── filter suggestion menu ────────────────────────────────────────────────
   The ＋ on the Filters head opens this instead of dropping a blank row,
   because the filter you want is almost always the tab you are looking at.
   ────────────────────────────────────────────────────────────────────────── */
function closeFilterMenu() {
  const menu = document.getElementById("filterMenu");
  const btn = document.getElementById("filterAdd");
  if (!menu || menu.hidden) return;
  menu.hidden = true;
  if (btn) btn.setAttribute("aria-expanded", "false");
  document.removeEventListener("click", onFilterMenuDocClick, true);
}

function onFilterMenuDocClick(e) {
  const menu = document.getElementById("filterMenu");
  if (menu && !menu.contains(e.target) && !e.target.closest("#filterAdd")) {
    closeFilterMenu();
  }
}

function toggleFilterMenu() {
  const menu = document.getElementById("filterMenu");
  const btn = document.getElementById("filterAdd");
  if (!menu || !btn) return;
  if (!menu.hidden) {
    closeFilterMenu();
    return;
  }
  menu.hidden = false;
  btn.setAttribute("aria-expanded", "true");
  renderFilterMenuOptions();
  positionFilterMenu();
  setTimeout(() => document.addEventListener("click", onFilterMenuDocClick, true), 0);
}

function positionFilterMenu() {
  const menu = document.getElementById("filterMenu");
  const btn = document.getElementById("filterAdd");
  if (!menu || !btn) return;

  requestAnimationFrame(() => {
    const btnRect = btn.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const gap = 6;
    const margin = 6;
    const left = Math.min(
      btnRect.right - menuRect.width,
      Math.max(margin, window.innerWidth - menuRect.width - margin)
    );
    const top = Math.min(
      btnRect.bottom + gap,
      Math.max(margin, window.innerHeight - menuRect.height - margin)
    );
    menu.style.left = `${Math.max(margin, left)}px`;
    menu.style.top = `${top}px`;
  });
}

async function getCurrentTabUrl() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tabs && tabs[0] && tabs[0].url;
  if (!url) return "";
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) return "";
    return parsed.href;
  } catch (e) {
    return "";
  }
}

async function getCurrentTabInfo() {
  const url = await getCurrentTabUrl();
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return {
      href: parsed.href,
      origin: parsed.origin,
      protocol: parsed.protocol,
      host: parsed.host,
      hostname: parsed.hostname,
    };
  } catch (e) {
    return null;
  }
}

function parentWildcardHost(hostname) {
  if (
    !hostname ||
    hostname === "localhost" ||
    /^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname)
  ) {
    return "";
  }
  const labels = hostname.split(".").filter(Boolean);
  if (labels.length < 2) return "";
  const secondLevelSuffixes = new Set(["ac", "co", "com", "edu", "gov", "net", "org"]);
  const suffixSize =
    labels.length > 2 &&
    labels[labels.length - 1].length === 2 &&
    secondLevelSuffixes.has(labels[labels.length - 2])
      ? 3
      : 2;
  return `*.${labels.slice(-suffixSize).join(".")}`;
}

function uniqueFilterOptions(options) {
  const seen = new Set();
  return options.filter((option) => {
    if (!option.value || seen.has(option.value)) return false;
    seen.add(option.value);
    return true;
  });
}

async function buildCurrentTabFilterOptions() {
  const tab = await getCurrentTabInfo();
  if (!tab) return [];
  return uniqueFilterOptions([
    { value: tab.host, note: "Exact current host" },
    { value: parentWildcardHost(tab.hostname), note: "Wildcard for this site" },
    { value: tab.origin, note: "Current origin only" },
  ]).slice(0, 3);
}

async function renderFilterMenuOptions() {
  const container = document.getElementById("filterMenuOptions");
  if (!container) return;
  container.innerHTML = "";

  const frag = document.createDocumentFragment();
  const options = await buildCurrentTabFilterOptions();

  if (options.length === 0) {
    const empty = document.createElement("button");
    empty.type = "button";
    empty.disabled = true;
    empty.innerHTML =
      '<span class="filter-option-value">No current site</span>' +
      '<span class="filter-option-note">Open an HTTP or HTTPS tab</span>';
    frag.appendChild(empty);
  } else {
    options.forEach((option) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.title = option.value;

      const value = document.createElement("span");
      value.className = "filter-option-value";
      value.textContent = option.value;

      const note = document.createElement("span");
      note.className = "filter-option-note";
      note.textContent = option.note;

      btn.append(value, note);
      btn.addEventListener("click", () => {
        closeFilterMenu();
        addRow("filter", newFilter(option.value));
      });
      frag.appendChild(btn);
    });
  }

  const sep = document.createElement("div");
  sep.className = "sep";
  frag.appendChild(sep);

  const blank = document.createElement("button");
  blank.type = "button";
  blank.innerHTML =
    '<span class="filter-option-value">Empty filter</span>' +
    '<span class="filter-option-note">Type a host or URL yourself</span>';
  blank.addEventListener("click", () => {
    closeFilterMenu();
    addRow("filter");
  });
  frag.appendChild(blank);

  container.appendChild(frag);
  positionFilterMenu();
}

function hasEnabledHeaderMods(profile) {
  return [...(profile.headers || []), ...(profile.responseHeaders || [])].some(
    (h) => h.enabled && String(h.name || "").trim()
  );
}

function effectiveFilters(profile) {
  return (profile.filters || []).filter(
    (f) => f.enabled && String(f.value || "").trim()
  );
}

function filterMatchesUrl(filter, url) {
  if (!filter.enabled || !String(filter.value || "").trim()) return false;
  try {
    return new RegExp(filterToRegex(filter)).test(url);
  } catch (e) {
    return false;
  }
}

function setFilterStatus(kind, text, title) {
  const status = document.getElementById("filterStatus");
  const label = document.getElementById("filterStatusText");
  if (!status || !label) return;
  status.classList.remove("active", "inactive");
  if (kind) status.classList.add(kind);
  label.textContent = text;
  status.title = title || text;
}

async function updateFilterStatus() {
  const status = document.getElementById("filterStatus");
  if (!status) return;

  const run = ++filterStatusRun;
  setFilterStatus("", "Checking", "Checking current tab match status");

  const profile = activeProfile();
  const enabledFilters = effectiveFilters(profile);

  if (state.paused) {
    setFilterStatus("inactive", "Paused", "All modifications are paused");
    return;
  }
  if (!hasEnabledHeaderMods(profile)) {
    setFilterStatus("inactive", "No headers", "No enabled headers are configured");
    return;
  }
  if (enabledFilters.length === 0) {
    setFilterStatus(
      "active",
      "All tabs",
      "No enabled filters are configured; headers apply to all requests"
    );
    return;
  }

  const url = await getCurrentTabUrl();
  if (run !== filterStatusRun) return;

  if (!url) {
    setFilterStatus("inactive", "Unavailable", "Current tab URL cannot be checked");
    return;
  }

  const matched = enabledFilters.some((f) => filterMatchesUrl(f, url));
  setFilterStatus(
    matched ? "active" : "inactive",
    matched ? "Active on this tab" : "Inactive on this tab",
    matched
      ? "Headers are active on the current tab"
      : "Current tab does not match any enabled filter"
  );
}

function activeProfile() {
  return (
    state.profiles.find((p) => p.id === state.activeProfileId) ||
    state.profiles[0]
  );
}

function activeIndex() {
  return state.profiles.findIndex((p) => p.id === activeProfile().id);
}

function render() {
  applySettings();
  document.body.classList.toggle("paused", !!state.paused);

  for (const id of ["railPause", "tbPause"]) {
    const btn = document.getElementById(id);
    if (!btn) continue;
    btn.innerHTML = svgIcon(state.paused ? "play" : "pause");
    btn.title = state.paused ? "Resume all" : "Pause all";
  }

  const profile = activeProfile();
  const idx = activeIndex() + 1;
  const profileColor = profile.color || DEFAULT_COLOR;

  const pid = document.getElementById("profileId");
  pid.textContent = idx;
  pid.style.background = profileColor;
  document.documentElement.style.setProperty("--profile-color", profileColor);
  document.documentElement.style.setProperty("--titlebar-bg", profileColor);
  const nameEl = document.getElementById("profileName");
  if (document.activeElement !== nameEl) nameEl.value = profile.name;

  renderRailProfiles();
  renderProfileList();

  renderHeaderRows("requestRows", profile.headers, "reqHeaderNames");
  renderHeaderRows("responseRows", profile.responseHeaders, "resHeaderNames");
  renderFilterRows("filterRows", profile.filters);

  updateGroupToggle("requestEnabled", profile.headers);
  updateGroupToggle("responseEnabled", profile.responseHeaders);
  updateGroupToggle("filterEnabled", profile.filters);

  updateSectionCount("requestCount", profile.headers, "header");
  updateSectionCount("responseCount", profile.responseHeaders, "header");

  document.getElementById("applyNote").hidden =
    effectiveFilters(profile).length > 0;

  document.getElementById("fontFamily").value = state.settings.font;
  document.getElementById("fontSize").value = String(state.settings.fontSize);
  document.getElementById("themeMode").value = state.settings.theme || "light";
  document.getElementById("surfaceMode").value = state.settings.viewMode || "popup";
  document.getElementById("rowDensity").value = state.settings.density;
  document.getElementById("pinMode").value = state.settings.pinMode;
  document.getElementById("maskSecrets").checked = !!state.settings.maskSecrets;
  renderExportScope();

  applyCollapsed();
  updateRuleCount();
  updateFilterStatus();
  layoutPins();
}

let dragId = null;
let headerDrag = null;
let headerDragPointerY = null;
let headerAutoScrollFrame = null;

function getHeaderAutoScrollSpeed(pointerY, top, bottom) {
  const edge = 56;
  const maxSpeed = 14;
  if (pointerY < top + edge) {
    return -Math.ceil(Math.min(1, (top + edge - pointerY) / edge) * maxSpeed);
  }
  if (pointerY > bottom - edge) {
    return Math.ceil(Math.min(1, (pointerY - (bottom - edge)) / edge) * maxSpeed);
  }
  return 0;
}

function runHeaderAutoScroll() {
  if (!headerDrag || headerDragPointerY === null) {
    headerAutoScrollFrame = null;
    return;
  }
  const scrollArea = document.querySelector(".content");
  if (scrollArea) {
    const rect = scrollArea.getBoundingClientRect();
    const speed = getHeaderAutoScrollSpeed(
      headerDragPointerY,
      rect.top,
      rect.bottom
    );
    if (speed) scrollArea.scrollTop += speed;
  }
  headerAutoScrollFrame = requestAnimationFrame(runHeaderAutoScroll);
}

function updateHeaderAutoScroll(pointerY) {
  headerDragPointerY = pointerY;
  if (headerAutoScrollFrame === null) {
    headerAutoScrollFrame = requestAnimationFrame(runHeaderAutoScroll);
  }
}

function stopHeaderAutoScroll() {
  headerDragPointerY = null;
  if (headerAutoScrollFrame !== null) {
    cancelAnimationFrame(headerAutoScrollFrame);
    headerAutoScrollFrame = null;
  }
}

const RAIL_MAX = 5;

function renderRailProfiles() {
  const wrap = document.getElementById("railProfiles");
  wrap.innerHTML = "";
  const active = activeProfile();
  const profiles =
    document.documentElement.dataset.surface === "sidePanel"
      ? state.profiles
      : state.profiles.slice(0, RAIL_MAX);
  profiles.forEach((p, i) => {
    const b = document.createElement("button");
    b.className = "rail-pcircle" + (p.id === active.id ? " current" : "");
    b.title = p.name;
    b.textContent = i + 1;
    b.style.borderColor = p.color;
    if (p.id === active.id) {
      b.style.background = p.color;
      b.style.color = "#fff";
      const dot = document.createElement("i");
      dot.className = "check";
      dot.title = state.paused ? "Paused" : "Active";
      b.appendChild(dot);
    } else {
      b.style.color = p.color;
    }
    b.addEventListener("click", () => {
      state.activeProfileId = p.id;
      render();
      save();
    });
    wrap.appendChild(b);
  });
}

function renderProfileList() {
  const list = document.getElementById("profileList");
  const prevScroll = list.scrollTop;
  list.innerHTML = "";
  const active = activeProfile();
  state.profiles.forEach((p, i) => {
    const item = document.createElement("div");
    item.className = "pitem" + (p.id === active.id ? " active" : "");
    item.draggable = true;

    const badge = document.createElement("div");
    badge.className = "pbadge";
    badge.textContent = i + 1;
    badge.style.background = p.color;
    if (p.id === active.id) {
      const dot = document.createElement("i");
      dot.className = "pcheck";
      badge.appendChild(dot);
    }

    const nm = document.createElement("span");
    nm.className = "pname";
    nm.textContent = p.name;
    nm.title = p.name;

    const del = document.createElement("button");
    del.className = "pdel";
    del.innerHTML = svgIcon("trash");
    del.title = "Delete profile";
    del.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteProfile(p.id);
    });

    item.addEventListener("click", () => {
      state.activeProfileId = p.id;
      render();
      save();
    });

    item.addEventListener("dragstart", (e) => {
      dragId = p.id;
      item.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });
    item.addEventListener("dragend", () => item.classList.remove("dragging"));
    item.addEventListener("dragover", (e) => e.preventDefault());
    item.addEventListener("drop", (e) => {
      e.preventDefault();
      reorderProfiles(dragId, p.id);
    });

    item.append(badge, nm, del);
    list.appendChild(item);
  });
  list.scrollTop = prevScroll;
}

function duplicateProfile() {
  const src = activeProfile();
  const copy = JSON.parse(JSON.stringify(src));
  copy.id = uid();
  copy.name = `${src.name} copy`;
  [...copy.headers, ...copy.responseHeaders, ...copy.filters].forEach((x) => {
    x.id = uid();
  });
  state.profiles.splice(activeIndex() + 1, 0, copy);
  state.activeProfileId = copy.id;
  render();
  save();
}

function deleteProfile(id) {
  if (state.profiles.length === 1) {
    alert("At least one profile must remain.");
    return;
  }
  const index = state.profiles.findIndex((x) => x.id === id);
  if (index < 0) return;
  const [removed] = state.profiles.splice(index, 1);
  const wasActive = state.activeProfileId === id;
  if (wasActive) state.activeProfileId = state.profiles[0].id;
  render();
  save();

  showToast(`Deleted “${removed.name}”`, () => {
    state.profiles.splice(Math.min(index, state.profiles.length), 0, removed);
    if (wasActive) state.activeProfileId = removed.id;
    render();
    save();
  });
}

function openDrawer() {
  document.getElementById("drawer").hidden = false;
  document.getElementById("backdrop").hidden = false;
}

function closeDrawer() {
  document.getElementById("drawer").hidden = true;
  document.getElementById("backdrop").hidden = true;
}

function toggleDrawer() {
  if (document.getElementById("drawer").hidden) openDrawer();
  else closeDrawer();
}

function reorderProfiles(fromId, toId) {
  if (!fromId || fromId === toId) return;
  const from = state.profiles.findIndex((p) => p.id === fromId);
  const to = state.profiles.findIndex((p) => p.id === toId);
  if (from < 0 || to < 0) return;
  const [moved] = state.profiles.splice(from, 1);
  const target = state.profiles.findIndex((p) => p.id === toId);
  state.profiles.splice(target + (from < to ? 1 : 0), 0, moved);
  render();
  save();
}

function updateGroupToggle(id, list) {
  const el = document.getElementById(id);
  if (!el) return;
  const total = list.length;
  const on = list.filter((h) => h.enabled).length;
  el.indeterminate = on > 0 && on < total;
  el.checked = total > 0 && on === total;
}

function updateSectionCount(id, list, noun) {
  const el = document.getElementById(id);
  if (!el) return;
  const total = list.length;
  if (total === 0) {
    el.textContent = `no ${noun}s`;
    return;
  }
  el.textContent = `${list.filter((x) => x.enabled).length} of ${total} on`;
}

/* ── masking ──────────────────────────────────────────────────────────────
   Long credential-shaped values are hidden by default so the panel is safe
   to screen-share; the eye reveals one row at a time.
   ────────────────────────────────────────────────────────────────────────── */
const SECRET_NAME = /(authorization|token|secret|key|cookie|session|password|credential)/i;

function looksSecret(h) {
  const value = String(h.value || "");
  if (value.length < 12) return false;
  return SECRET_NAME.test(h.name || "") || /^bearer\s/i.test(value);
}

function maskValue(value) {
  const raw = String(value || "");
  const prefix = /^bearer\s/i.test(raw) ? raw.slice(0, 7) : "";
  return prefix + "••••••••" + raw.slice(-8);
}

// The eye mirrors whatever the field is showing right now, whether that came
// from the button or from focusing the input. Single place, so the two paths
// cannot drift apart.
function setEyeState(eye, hidden) {
  if (!eye) return;
  eye.classList.toggle("on", !hidden);
  eye.innerHTML = svgIcon(hidden ? "eye" : "eyeoff");
  eye.title = hidden ? "Reveal value" : "Hide value";
}

/* ── duplicate detection ──────────────────────────────────────────────────
   background.js puts every enabled header into one modifyHeaders action in
   list order, so for two `set` operations on the same name the later one is
   what actually gets sent.
   ────────────────────────────────────────────────────────────────────────── */
function duplicateStatus(list) {
  const byName = new Map();
  list.forEach((h) => {
    if (!h.enabled) return;
    const key = String(h.name || "").trim().toLowerCase();
    if (!key) return;
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(h.id);
  });

  const status = new Map();
  byName.forEach((ids, key) => {
    if (ids.length < 2) return;
    ids.forEach((id, i) => {
      status.set(id, {
        applied: i === ids.length - 1,
        count: ids.length,
        name: key,
      });
    });
  });
  return status;
}

function renderHeaderRows(containerId, list, datalistId) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";

  if (list.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-note";
    empty.textContent = "Nothing here yet — use ＋ to add one.";
    container.appendChild(empty);
    return;
  }

  const dupes = duplicateStatus(list);
  const mask = !!state.settings.maskSecrets;
  const frag = document.createDocumentFragment();

  list.forEach((h) => {
    const showLabel = !!h.label || labelEditing.has(h.id);
    const dupe = dupes.get(h.id);

    const row = document.createElement("div");
    row.className =
      "row header-row" +
      (h.enabled ? "" : " disabled") +
      (showLabel ? " haslabel" : " nolabel") +
      (dupe ? " conflict" : "");
    row.dataset.id = h.id;
    // The amber row is the whole flag; the detail lives in the tooltip so the
    // row keeps the same shape as every other one.
    if (dupe) {
      row.title = dupe.applied
        ? `${dupe.count} enabled headers named “${h.name}” — this one is the one sent`
        : `${dupe.count} enabled headers named “${h.name}” — a lower row is sent instead`;
    }

    const dragHandle = document.createElement("button");
    dragHandle.type = "button";
    dragHandle.className = "drag-handle";
    dragHandle.draggable = true;
    dragHandle.title = "Drag to reorder header";
    dragHandle.setAttribute("aria-label", "Drag to reorder header");
    dragHandle.innerHTML = svgIcon("grip");

    const chk = document.createElement("input");
    chk.type = "checkbox";
    chk.className = "en";
    chk.checked = h.enabled;

    const main = document.createElement("div");
    main.className = "rmain";
    const l1 = document.createElement("div");
    l1.className = "l1";
    const l2 = document.createElement("div");
    l2.className = "l2";

    const name = document.createElement("input");
    name.type = "text";
    name.className = "name";
    name.placeholder = "Header name";
    name.value = h.name;
    if (datalistId) name.dataset.list = datalistId;

    // Name first in a column measured from the section's longest key, then the
    // label slot. The slot holds its width whether or not this row is
    // labelled, so every row is the same shape; sizeColumns() removes it
    // entirely when nothing in the section is labelled.
    const slot = document.createElement("span");
    slot.className = "labelslot";

    if (showLabel) {
      const chip = document.createElement("span");
      chip.className = "labelchip" + (h.label ? " has-label" : "");
      chip.innerHTML = svgIcon("tag");

      const lbl = document.createElement("input");
      lbl.type = "text";
      lbl.className = "row-label";
      lbl.placeholder = "label";
      lbl.value = h.label || "";
      lbl.dataset.hid = h.id;

      chip.appendChild(lbl);
      slot.appendChild(chip);
    }

    l1.append(name, slot);

    const secret = looksSecret(h);
    const hidden = secret && mask && !revealed.has(h.id);

    const value = document.createElement("input");
    value.type = "text";
    value.className = "value";
    value.placeholder = "Value";
    value.value = hidden ? maskValue(h.value) : h.value;
    // Masked, not locked: the dots are only what an unfocused field shows.
    // Focus swaps the real value in so it stays editable (see focusin below).
    if (hidden) value.dataset.masked = "1";
    l2.appendChild(value);

    main.append(l1, l2);

    const actions = document.createElement("div");
    actions.className = "ract";

    // Three slots, always. Reveal only applies to secrets and the tag only to
    // unlabelled rows, but an inapplicable slot still holds its space so ✕
    // lands on the same vertical line down the whole list.
    const eye = document.createElement("button");
    eye.type = "button";
    eye.className = "eye" + (secret && mask ? "" : " ghost");
    setEyeState(eye, hidden);
    if (!(secret && mask)) eye.tabIndex = -1;
    actions.appendChild(eye);

    const tag = document.createElement("button");
    tag.type = "button";
    tag.className = "tag" + (showLabel ? " ghost" : "");
    tag.innerHTML = svgIcon("tag");
    tag.title = "Add label";
    tag.setAttribute("aria-label", "Add label");
    if (showLabel) tag.tabIndex = -1;
    actions.appendChild(tag);

    const del = document.createElement("button");
    del.type = "button";
    del.className = "del";
    del.innerHTML = svgIcon("x");
    del.title = "Remove";
    actions.appendChild(del);

    row.append(dragHandle, chk, main, actions);
    frag.appendChild(row);
  });

  container.appendChild(frag);
  sizeColumns(container);
}

/* ── COLUMN SIZING ────────────────────────────────────────────────────────
   The name column is measured from the longest header name actually in the
   section rather than being a fixed guess, so the labels sit just past the
   widest key and every row lines up with it. A section with no labels at all
   drops the label column entirely and the value moves up against the key.

   Sections are sized independently: response header names are far longer than
   request ones, and forcing both to the same column would waste half the row.
   ────────────────────────────────────────────────────────────────────────── */
const GAP_AFTER_NAME = 10;
const CHIP_CHROME = 26; // tag glyph + gaps + the pill's own padding
const MIN_VALUE_W = 92; // compact keeps at least this much for the value

let measureCanvas = null;

function textWidth(text, font) {
  if (!measureCanvas) measureCanvas = document.createElement("canvas");
  const ctx = measureCanvas.getContext("2d");
  ctx.font = font;
  return ctx.measureText(text || "").width;
}

function fontOf(el) {
  const s = getComputedStyle(el);
  return `${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
}

function widest(inputs, font) {
  return inputs.reduce((max, el) => Math.max(max, textWidth(el.value, font)), 0);
}

const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), Math.max(lo, hi));

function sizeColumns(container) {
  const names = [...container.querySelectorAll(".name")];
  if (names.length === 0) return;

  const labels = [...container.querySelectorAll(".row-label")];
  // Presence of a chip, not of text: a row whose label is being typed for the
  // first time still has an empty value, and collapsing the column under it
  // would hide the very input the caret is in.
  const hasLabels = labels.length > 0;
  container.classList.toggle("no-labels", !hasLabels);

  // Measure against .rmain, not the container: the row also spends width on
  // the grip, checkbox and action column, and .rmain is what the columns
  // actually divide up.
  const main = container.querySelector(".rmain");
  const avail = (main && main.clientWidth) || container.clientWidth || 320;
  const compact = document.documentElement.dataset.density === "compact";

  const nameCol = clamp(
    Math.ceil(widest(names, fontOf(names[0]))) + 2,
    76,
    Math.round(avail * (compact ? 0.38 : 0.55))
  );
  // In compact the value shares the line, so the label may not grow past what
  // it leaves behind. In comfortable the value has its own line and does not
  // compete at all.
  const labelMax = compact
    ? avail - nameCol - GAP_AFTER_NAME - MIN_VALUE_W
    : Math.round(avail * 0.45);
  const labelCol = hasLabels
    ? clamp(Math.ceil(widest(labels, fontOf(labels[0]))) + CHIP_CHROME, 44, labelMax)
    : 0;

  // The whole key+label block needs an explicit width too. Left to shrink-wrap
  // its content, a row with a short label would be narrower than one with a
  // long label and the values would step in and out down the list.
  const block = hasLabels ? nameCol + GAP_AFTER_NAME + labelCol : nameCol;

  container.style.setProperty("--name-col", nameCol + "px");
  container.style.setProperty("--label-col", labelCol + "px");
  container.style.setProperty("--l1-col", block + "px");
}

function sizeAllColumns() {
  ["requestRows", "responseRows"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) sizeColumns(el);
  });
}

function renderFilterRows(containerId, list) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";

  if (list.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-note";
    empty.textContent = "No filters — modifications apply to every URL.";
    container.appendChild(empty);
    return;
  }

  const frag = document.createDocumentFragment();
  list.forEach((f) => {
    const row = document.createElement("div");
    row.className = "row filter-row" + (f.enabled ? "" : " disabled");
    row.dataset.id = f.id;

    const chk = document.createElement("input");
    chk.type = "checkbox";
    chk.className = "en";
    chk.checked = f.enabled;

    const value = document.createElement("input");
    value.type = "text";
    value.className = "value";
    value.placeholder = "*.example.com, localhost, 127.0.0.1";
    value.value = f.value;

    const del = document.createElement("button");
    del.type = "button";
    del.className = "del";
    del.innerHTML = svgIcon("x");
    del.title = "Remove filter";

    row.append(chk, value, del);
    frag.appendChild(row);
  });
  container.appendChild(frag);
}

/* ── pinned section heads ─────────────────────────────────────────────────
   A head is MOVED into .pinbar, never cloned and never made sticky. It
   leaves the list at the same moment the bar grows by its height, so the
   list shortens by exactly what the scrollport loses and rows never jump.
   ────────────────────────────────────────────────────────────────────────── */
let PIN = null;
let headHeld = false;
let pinDeferred = false;

function setupPinning() {
  const area = document.querySelector(".listarea");
  if (!area) return;
  const bar = document.getElementById("pinbar");
  const content = area.querySelector(".content");

  const thumb = document.createElement("i");
  thumb.className = "vthumb";
  area.appendChild(thumb);

  const secs = [...content.querySelectorAll(".sec")].map((sec) => {
    const head = sec.querySelector(".sechead");
    head._sec = sec; // survives being moved out of .sec
    return { sec, head, pinned: false };
  });

  PIN = { area, bar, content, thumb, secs };

  content.addEventListener("scroll", layoutPins, { passive: true });
  new ResizeObserver(layoutPins).observe(content);

  // A head is pinned by moving the element, and a control whose element moves
  // between mousedown and mouseup never gets a click at all — the browser has
  // nothing to deliver it to. That is why the section's own checkbox looked
  // dead while the rows below it, which never move, were fine. Freeze the
  // layout for as long as a head is held down.
  document.addEventListener(
    "pointerdown",
    (e) => {
      if (e.target.closest && e.target.closest(".sechead")) headHeld = true;
    },
    true
  );

  // pointerup runs before the browser dispatches click, so re-laying out here
  // would move the head out from under the click we are trying to protect.
  // Yield a task first; click is dispatched synchronously with mouseup.
  const release = () => {
    if (!headHeld) return;
    setTimeout(() => {
      headHeld = false;
      if (pinDeferred) {
        pinDeferred = false;
        layoutPins();
      }
    }, 0);
  };
  document.addEventListener("pointerup", release, true);
  document.addEventListener("pointercancel", release, true);
}

function pinHead(s) {
  if (s.pinned) return;
  PIN.bar.appendChild(s.head);
  s.pinned = true;
}

function unpinHead(s) {
  if (!s.pinned) return;
  s.sec.prepend(s.head);
  s.pinned = false;
}

function layoutPins() {
  if (!PIN) return;
  if (headHeld) {
    pinDeferred = true; // re-run on release
    return;
  }
  const { area, bar, content, thumb, secs } = PIN;
  const stack = (state.settings && state.settings.pinMode) === "stack";

  // Measured against the whole list area, so the answer does not depend on
  // how much is currently pinned — pinning moves height from one to the other.
  const scrolls = content.scrollHeight + bar.offsetHeight > area.clientHeight + 1;

  if (!scrolls) {
    secs.forEach(unpinHead);
  } else {
    const headH = secs[0].head.offsetHeight || 32;
    const portTop = content.getBoundingClientRect().top;
    const wanted = new Set([0]); // the first head stays up while the list scrolls

    for (let i = 1; i < secs.length; i++) {
      const s = secs[i];
      // Normalised to the unpinned geometry so the threshold is identical in
      // both directions and a head cannot flicker at the boundary.
      const top =
        s.sec.getBoundingClientRect().top - portTop - (s.pinned ? headH : 0);
      if (top <= 0) wanted.add(i);
    }

    if (!stack) {
      const last = Math.max(...wanted);
      wanted.clear();
      wanted.add(last);
    }

    secs.forEach((s, i) => (wanted.has(i) ? pinHead(s) : unpinHead(s)));
    secs.forEach((s) => {
      if (s.pinned) bar.appendChild(s.head); // keep the bar in section order
    });
  }

  // the thumb spans the scrollport only, which now begins under the bar
  const range = content.scrollHeight - content.clientHeight;
  if (range < 1) {
    thumb.style.display = "none";
    return;
  }
  thumb.style.display = "";
  const h = Math.max(
    30,
    content.clientHeight * (content.clientHeight / content.scrollHeight)
  );
  thumb.style.height = h + "px";
  thumb.style.top =
    content.offsetTop + (content.scrollTop / range) * (content.clientHeight - h) + "px";
}

function sectionOf(el) {
  return el.closest(".sec") || (el.closest(".sechead") || {})._sec || null;
}

function applyCollapsed() {
  document.querySelectorAll(".sec").forEach((sec) => {
    sec.classList.toggle("collapsed", collapsed.has(sec.dataset.sec));
  });
}

function updateRuleCount() {
  const el = document.getElementById("ruleCount");
  if (state.paused) {
    el.textContent = "Paused";
    return;
  }
  el.textContent = `Active: ${activeProfile().name}`;
}

let saveTimer = null;
function commit() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    save();
    updateRuleCount();
    updateFilterStatus();
  }, 150);
}

function togglePause() {
  state.paused = !state.paused;
  render();
  save();
}

function addProfile() {
  const p = newProfile(`Profile ${state.profiles.length + 1}`);
  state.profiles.push(p);
  state.activeProfileId = p.id;
  render();
  save();
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hostPatternToRegex(value) {
  let raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  let scheme = "[a-z][a-z0-9+.-]*";
  const schemeMatch = raw.match(/^([a-z][a-z0-9+.-]*|\*):\/\//i);
  if (schemeMatch) {
    scheme = schemeMatch[1] === "*" ? scheme : escapeRegex(schemeMatch[1]);
    raw = raw.slice(schemeMatch[0].length);
  }
  raw = raw
    .replace(/^[^@/]+@/, "")
    .split(/[/?#]/)[0]
    .replace(/^\.+|\.+$/g, "");

  let port = "";
  const portMatch = raw.match(/^(.*):(\d+|\*)$/);
  if (portMatch && !portMatch[1].includes(":")) {
    raw = portMatch[1];
    port = portMatch[2] === "*" ? "(?::\\d+)?" : `:${portMatch[2]}`;
  } else {
    port = "(?::\\d+)?";
  }

  if (!raw) return "";

  const optionalLeadingLabels = raw.startsWith("*.");
  if (optionalLeadingLabels) raw = raw.slice(2);

  const host = raw
    .split("*")
    .map(escapeRegex)
    .join("[A-Za-z0-9-]*");

  const prefix = optionalLeadingLabels ? "(?:[A-Za-z0-9-]+\\.)*" : "";
  return `^${scheme}:\\/\\/${prefix}${host}${port}(?:[\\/?#]|$)`;
}

function filterToRegex(filter) {
  return hostPatternToRegex(filter.value);
}

function headerToModHeader(h) {
  return {
    appendMode: h.op === "append",
    comment: h.label || "",
    enabled: !!h.enabled,
    name: h.name || "",
    value: h.value || "",
  };
}

function headerFromModHeader(h) {
  return {
    id: uid(),
    enabled: h.enabled !== false,
    name: h.name || "",
    value: h.value || "",
    op: h.appendMode ? "append" : "set",
    label: h.comment || "",
  };
}

function toModHeaderExport(profiles = state.profiles) {
  return profiles.map((p, i) => ({
    title: p.name,
    shortTitle: String(i + 1),
    backgroundColor: "#6d071a",
    textColor: "#ffffff",
    headers: (p.headers || []).map(headerToModHeader),
    respHeaders: (p.responseHeaders || []).map(headerToModHeader),
    urlFilters: (p.filters || []).map((f) => ({
      comment: `OpenModHeader:host:${encodeURIComponent(f.value || "")}`,
      enabled: !!f.enabled,
      urlRegex: filterToRegex(f),
    })),
    cookieHeaders: [],
    cspHeaders: [],
    excludeRequestDomainFilters: [],
    excludeUrlFilters: [],
    initiatorDomainFilters: [],
    reqCookieAppend: [],
    requestMethodFilters: [],
    resourceFilters: [],
    setCookieHeaders: [],
    tabFilters: [],
    tabGroupFilters: [],
    timeFilters: [],
    urlReplacements: [],
    windowFilters: [],
    hideComment: false,
    version: 2,
  }));
}

function fromModHeaderImport(arr) {
  return arr.map((p) => {
    const prof = newProfile(p.title || p.shortTitle || "Imported");
    prof.headers = (p.headers || []).map(headerFromModHeader);
    prof.responseHeaders = (p.respHeaders || []).map(headerFromModHeader);
    prof.filters = (p.urlFilters || []).map((f) => {
      let v = (f.urlRegex || "").trim();
      const tagged = /^OpenModHeader:[^:]+(?::(.*))?$/.exec(f.comment || "");
      if (tagged && tagged[1] !== undefined) {
        try {
          v = decodeURIComponent(tagged[1]);
        } catch (e) {}
      } else if (!tagged) {
        const containsMatch = v.match(/^\.\*(.+?)\.\*$/);
        if (containsMatch) {
          v = containsMatch[1].replace(/\\(.)/g, "$1");
        }
      }
      return newFilter(v);
    });
    return prof;
  });
}

function renderExportScope() {
  const select = document.getElementById("exportScope");
  const previous = select.value || "all";
  select.innerHTML = "";
  const all = document.createElement("option");
  all.value = "all";
  all.textContent = `All profiles (${state.profiles.length})`;
  select.appendChild(all);
  state.profiles.forEach((profile, index) => {
    const option = document.createElement("option");
    option.value = profile.id;
    option.textContent = `${index + 1}. ${profile.name}`;
    select.appendChild(option);
  });
  select.value = Array.from(select.options).some((o) => o.value === previous)
    ? previous
    : "all";
}

function safeFilename(value) {
  return String(value || "profile")
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 80) || "profile";
}

function exportProfiles() {
  const scope = document.getElementById("exportScope").value;
  const profiles =
    scope === "all" ? state.profiles : state.profiles.filter((p) => p.id === scope);
  if (profiles.length === 0) return;
  const json = JSON.stringify(toModHeaderExport(profiles), null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download =
    scope === "all"
      ? "open_modheader_profiles.json"
      : `open_modheader_${safeFilename(profiles[0].name)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importProfiles(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const arr = Array.isArray(data) ? data : data.profiles;
    if (!Array.isArray(arr) || arr.length === 0) {
      alert("Unrecognized file: expected a ModHeader profiles array.");
      return;
    }
    const imported = fromModHeaderImport(arr);

    const p0 = state.profiles[0];
    const onlyEmptyDefault =
      state.profiles.length === 1 &&
      p0.headers.length === 0 &&
      p0.responseHeaders.length === 0 &&
      p0.filters.length === 0;

    state.profiles = onlyEmptyDefault
      ? imported
      : state.profiles.concat(imported);
    state.activeProfileId = imported[0].id;
    render();
    save();
    closeSettings();
    alert(`Imported ${imported.length} profile(s).`);
  } catch (e) {
    alert("Import failed: " + e.message);
  }
}

function setupHeaderDelegation(containerId) {
  const container = document.getElementById(containerId);
  const ctx = () =>
    containerId === "requestRows"
      ? { list: activeProfile().headers, groupId: "requestEnabled", target: "request" }
      : { list: activeProfile().responseHeaders, groupId: "responseEnabled", target: "response" };
  const find = (e) => {
    const row = e.target.closest(".row");
    if (!row) return null;
    const { list, groupId, target } = ctx();
    const h = list.find((x) => x.id === row.dataset.id);
    return h ? { row, h, list, groupId, target } : null;
  };

  const clearDropState = () => {
    container.querySelectorAll(".header-row").forEach((row) => {
      row.classList.remove("dragging", "drop-before", "drop-after");
    });
  };

  container.addEventListener("dragstart", (e) => {
    if (!e.target.closest(".drag-handle")) {
      e.preventDefault();
      return;
    }
    const c = find(e);
    if (!c) return;
    headerDrag = { containerId, headerId: c.h.id };
    updateHeaderAutoScroll(e.clientY);
    c.row.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", c.h.id);
  });

  container.addEventListener("dragover", (e) => {
    if (!headerDrag || headerDrag.containerId !== containerId) return;
    const c = find(e);
    if (!c || c.h.id === headerDrag.headerId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    container.querySelectorAll(".header-row").forEach((row) => {
      row.classList.remove("drop-before", "drop-after");
    });
    const after = e.clientY >= c.row.getBoundingClientRect().top + c.row.offsetHeight / 2;
    c.row.classList.add(after ? "drop-after" : "drop-before");
  });

  container.addEventListener("drop", (e) => {
    if (!headerDrag || headerDrag.containerId !== containerId) return;
    const c = find(e);
    if (!c || c.h.id === headerDrag.headerId) return;
    e.preventDefault();
    const after = c.row.classList.contains("drop-after");
    reorderHeaders(c.list, headerDrag.headerId, c.h.id, after);
    headerDrag = null;
    stopHeaderAutoScroll();
    clearDropState();
    render();
    save();
  });

  container.addEventListener("dragend", () => {
    headerDrag = null;
    stopHeaderAutoScroll();
    clearDropState();
  });

  container.addEventListener("change", (e) => {
    if (!e.target.classList.contains("en")) return;
    const c = find(e);
    if (!c) return;
    c.h.enabled = e.target.checked;
    // enabling or disabling changes which duplicate wins, so re-render
    render();
    commit();
  });

  // Masking is a display state, not a lock. Clicking into a masked value
  // shows the real text so it can be edited; leaving it puts the dots back.
  container.addEventListener("focusin", (e) => {
    const t = e.target;
    if (!t.classList?.contains("value") || t.dataset.masked !== "1") return;
    const c = find(e);
    if (!c) return;
    t.value = c.h.value;
    setEyeState(t.closest(".row")?.querySelector(".eye"), false);
  });

  container.addEventListener("focusout", (e) => {
    const t = e.target;
    if (!t.classList?.contains("value")) return;
    const c = find(e);
    if (!c) return;
    const wasMasked = t.dataset.masked === "1";
    // Re-evaluate: an edit can turn a token into plain text, or the reverse.
    const shouldMask =
      looksSecret(c.h) && !!state.settings.maskSecrets && !revealed.has(c.h.id);
    if (wasMasked === shouldMask) {
      if (shouldMask) {
        t.value = maskValue(c.h.value);
        setEyeState(t.closest(".row")?.querySelector(".eye"), true);
      }
      return;
    }
    // The row crossed the secret threshold, so its eye button changed too.
    render();
  });

  container.addEventListener("input", (e) => {
    const t = e.target;
    const c = find(e);
    if (!c) return;
    if (t.classList.contains("name")) {
      c.h.name = t.value;
      updateSectionCount(
        c.target === "request" ? "requestCount" : "responseCount",
        c.list,
        "header"
      );
      sizeColumns(container); // the widest key may have just changed
    } else if (t.classList.contains("value")) {
      // A masked field always holds the real value while focused, and input
      // only fires on the focused field, so t.value is never the dots.
      c.h.value = t.value;
    } else if (t.classList.contains("row-label")) {
      c.h.label = t.value;
      t.closest(".labelchip")?.classList.toggle("has-label", !!t.value.trim());
      sizeColumns(container);
    } else {
      return;
    }
    commit();
  });

  container.addEventListener("click", (e) => {
    const t = e.target;

    if (t.closest(".del")) {
      const c = find(e);
      if (!c) return;
      const index = c.list.indexOf(c.h);
      if (index < 0) return;
      c.list.splice(index, 1);
      labelEditing.delete(c.h.id);
      revealed.delete(c.h.id);
      render();
      commit();
      showToast(`Removed ${c.h.name || "header"}`, () => {
        c.list.splice(Math.min(index, c.list.length), 0, c.h);
        render();
        commit();
      });
      return;
    }

    if (t.closest(".eye")) {
      const c = find(e);
      if (!c) return;
      if (revealed.has(c.h.id)) revealed.delete(c.h.id);
      else revealed.add(c.h.id);
      render();
      return;
    }

    if (t.closest(".tag")) {
      const c = find(e);
      if (!c) return;
      labelEditing.add(c.h.id);
      render();
      const input = container.querySelector(`.row-label[data-hid="${c.h.id}"]`);
      if (input) input.focus();
    }
  });

  container.addEventListener("focusin", (e) => {
    const t = e.target;
    if (t.classList.contains("name") && t.dataset.list) {
      t.setAttribute("list", t.dataset.list);
    }
  });

  container.addEventListener("focusout", (e) => {
    const t = e.target;
    if (t.classList.contains("name")) {
      t.removeAttribute("list");
      return;
    }
    if (!t.classList.contains("row-label")) return;
    const c = find(e);
    if (c && !t.value.trim()) {
      labelEditing.delete(c.h.id);
      render();
    }
  });
}

function reorderHeaders(list, fromId, toId, placeAfter) {
  if (!fromId || fromId === toId) return;
  const fromIndex = list.findIndex((h) => h.id === fromId);
  if (fromIndex < 0) return;
  const [moved] = list.splice(fromIndex, 1);
  const targetIndex = list.findIndex((h) => h.id === toId);
  if (targetIndex < 0) {
    list.splice(fromIndex, 0, moved);
    return;
  }
  list.splice(targetIndex + (placeAfter ? 1 : 0), 0, moved);
}

function setupFilterDelegation(containerId) {
  const container = document.getElementById(containerId);
  const find = (e) => {
    const row = e.target.closest(".row");
    if (!row) return null;
    const list = activeProfile().filters;
    const f = list.find((x) => x.id === row.dataset.id);
    return f ? { row, f, list } : null;
  };

  container.addEventListener("change", (e) => {
    const c = find(e);
    if (!c) return;
    if (!e.target.classList.contains("en")) return;
    c.f.enabled = e.target.checked;
    c.row.classList.toggle("disabled", !c.f.enabled);
    updateGroupToggle("filterEnabled", c.list);
    commit();
  });

  container.addEventListener("input", (e) => {
    if (!e.target.classList.contains("value")) return;
    const c = find(e);
    if (!c) return;
    c.f.value = e.target.value;
    commit();
  });

  container.addEventListener("click", (e) => {
    if (!e.target.closest(".del")) return;
    const c = find(e);
    if (!c) return;
    const index = c.list.indexOf(c.f);
    if (index < 0) return;
    c.list.splice(index, 1);
    render();
    commit();
    showToast(`Removed ${c.f.value || "filter"}`, () => {
      c.list.splice(Math.min(index, c.list.length), 0, c.f);
      render();
      commit();
    });
  });
}

/* ── cross-surface sync ───────────────────────────────────────────────────
   The popup and the side panel are separate documents over the same storage,
   and each held its own copy of `state` with no way to hear about the other.
   Whichever wrote last won, so a change made in the popup was silently undone
   the next time the still-open side panel saved anything — and because the
   popup is rebuilt on every open while the panel lives on, the popup was
   always the one that appeared to lose its changes.
   ────────────────────────────────────────────────────────────────────────── */
let pendingRemote = null;

function adoptRemote(next) {
  state = normalize(next);
  writeCache();
  render();
}

// Never yank the ground out from under someone mid-edit: hold the update
// until the field they are in loses focus.
function editingInList() {
  const el = document.activeElement;
  return !!el && el.matches("input, textarea") && !!el.closest(".rows, .sechead");
}

function watchStorage() {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[STORAGE_KEY]) return;
    const next = changes[STORAGE_KEY].newValue;
    if (!next) return;
    // Our own save echoes back here; only react to someone else's.
    if (JSON.stringify(next) === JSON.stringify(state)) return;
    if (editingInList()) {
      pendingRemote = next;
      return;
    }
    adoptRemote(next);
  });

  document.addEventListener("focusout", () => {
    if (!pendingRemote) return;
    const next = pendingRemote;
    pendingRemote = null;
    // Let the field's own focusout handler commit first.
    setTimeout(() => {
      if (JSON.stringify(next) !== JSON.stringify(state)) adoptRemote(next);
    }, 0);
  });
}

function bindEvents() {
  setupHeaderDelegation("requestRows");
  setupHeaderDelegation("responseRows");
  setupFilterDelegation("filterRows");
  watchStorage();

  document.querySelector(".content").addEventListener("dragover", (e) => {
    if (!headerDrag) return;
    e.preventDefault();
    updateHeaderAutoScroll(e.clientY);
  });

  document.getElementById("railAddProfile").addEventListener("click", addProfile);
  document.getElementById("tbAdd").addEventListener("click", addProfile);

  document.getElementById("railPause").addEventListener("click", togglePause);
  document.getElementById("tbPause").addEventListener("click", togglePause);
  document.getElementById("bannerResume").addEventListener("click", togglePause);

  const nameEl = document.getElementById("profileName");
  nameEl.addEventListener("input", () => {
    activeProfile().name = nameEl.value;
    renderProfileList();
    renderExportScope();
    commit();
  });
  nameEl.addEventListener("blur", () => {
    const p = activeProfile();
    if (!p.name.trim()) {
      p.name = `Profile ${activeIndex() + 1}`;
      nameEl.value = p.name;
      save();
    }
  });
  nameEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") nameEl.blur();
  });

  document.getElementById("tbMore").addEventListener("click", (e) => {
    e.stopPropagation();
    openProfileMenu(e.currentTarget);
  });

  document.getElementById("railMenu").addEventListener("click", toggleDrawer);
  document.getElementById("backdrop").addEventListener("click", closeDrawer);
  document.getElementById("drawerAdd").addEventListener("click", addProfile);

  document.getElementById("exportBtn").addEventListener("click", exportProfiles);
  document.getElementById("importBtn").addEventListener("click", () => {
    closeSettings();
    document.getElementById("importFile").click();
  });
  document.getElementById("importFile").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) importProfiles(file);
    e.target.value = "";
  });

  document.getElementById("profileId").addEventListener("click", (e) => {
    e.stopPropagation();
    openColorMenu(e.currentTarget);
  });

  document.getElementById("themeMode").addEventListener("change", (e) => {
    state.settings.theme = e.target.value;
    applySettings();
    save();
  });

  document.getElementById("rowDensity").addEventListener("change", (e) => {
    state.settings.density = e.target.value;
    applySettings();
    sizeAllColumns();
    layoutPins();
    save();
  });

  document.getElementById("pinMode").addEventListener("change", (e) => {
    state.settings.pinMode = e.target.value;
    applySettings();
    layoutPins();
    save();
  });

  document.getElementById("maskSecrets").addEventListener("change", (e) => {
    state.settings.maskSecrets = e.target.checked;
    if (!e.target.checked) revealed.clear();
    render();
    save();
  });

  document.getElementById("fontFamily").addEventListener("change", (e) => {
    state.settings.font = e.target.value;
    applySettings();
    sizeAllColumns();
    layoutPins();
    save();
  });

  document.getElementById("fontSize").addEventListener("change", (e) => {
    state.settings.fontSize = parseInt(e.target.value, 10) || 13;
    applySettings();
    sizeAllColumns();
    layoutPins();
    save();
  });

  document.getElementById("surfaceMode").addEventListener("change", async (e) => {
    state.settings.viewMode = e.target.value === "sidePanel" ? "sidePanel" : "popup";
    await save();
    await notifySurfacePreference(true);
  });

  document.getElementById("railSettings").addEventListener("click", (e) => {
    e.stopPropagation();
    toggleSettings(e.currentTarget);
  });

  document.getElementById("settingsClose").addEventListener("click", closeSettings);

  // Delegated, not bound to the three elements directly: a section head is
  // moved into the pin bar and back as the list scrolls, so anything holding a
  // reference to one of these checkboxes is holding it across a DOM move. The
  // rest of the app already listens this way; these three were the exception.
  const GROUP_TOGGLES = {
    requestEnabled: (p) => p.headers,
    responseEnabled: (p) => p.responseHeaders,
    filterEnabled: (p) => p.filters,
  };

  document.addEventListener("change", (e) => {
    const pick = GROUP_TOGGLES[e.target.id];
    if (!pick) return;
    // From the indeterminate (part-on) state a click resolves to checked, so
    // the first click turns everything on and the next turns everything off.
    const on = e.target.checked;
    pick(activeProfile()).forEach((item) => (item.enabled = on));
    render();
    save();
  });

  // ＋ on a section head. The Filters one opens a menu because the filter you
  // want is nearly always the tab in front of you.
  document.addEventListener("click", (e) => {
    const add = e.target.closest(".sec-add");
    if (!add) return;
    e.stopPropagation();
    if (add.dataset.target === "filter") {
      toggleFilterMenu();
      return;
    }
    addRow(add.dataset.target);
  });

  // collapse a section from its head
  document.addEventListener("click", (e) => {
    const head = e.target.closest(".sechead");
    if (!head) return;
    if (e.target.closest("input, .sec-add")) return;
    const sec = sectionOf(head);
    if (!sec) return;
    const key = sec.dataset.sec;
    if (collapsed.has(key)) collapsed.delete(key);
    else collapsed.add(key);
    applyCollapsed();
    layoutPins();
  });

  const helpOverlay = document.getElementById("helpOverlay");
  const closeHelp = () => {
    helpOverlay.hidden = true;
    document.body.classList.remove("help-open");
  };

  document.getElementById("railHelp").addEventListener("click", () => {
    closeDrawer();
    closeSettings();
    document.body.classList.add("help-open");
    helpOverlay.hidden = false;
    document.getElementById("helpClose").focus();
  });
  document.getElementById("helpClose").addEventListener("click", closeHelp);
  helpOverlay.addEventListener("click", (e) => {
    if (e.target === helpOverlay) closeHelp();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    closeFilterMenu();
    closePopMenu();
    closeColorMenu();
    closeDrawer();
    hideToast();
    if (!document.getElementById("settingsMenu").hidden) closeSettings();
    if (!helpOverlay.hidden) closeHelp();
  });

  window.addEventListener("resize", () => {
    sizeAllColumns();
    layoutPins();
  });
}

function addRow(target, item = null) {
  const p = activeProfile();
  if (target === "request") p.headers.push(newHeader());
  else if (target === "response") p.responseHeaders.push(newHeader());
  else if (target === "filter") p.filters.push(item || newFilter());
  else return;

  collapsed.delete(target);
  render();
  save();

  const map = { request: "requestRows", response: "responseRows", filter: "filterRows" };
  const rows = document.getElementById(map[target]);
  const last = rows && rows.lastElementChild;
  if (!last) return;
  last.scrollIntoView({ block: "nearest" });
  layoutPins();
  const input = last.querySelector("input[type=text]");
  if (input) input.focus();
}

(function init() {
  const cached = readCache();
  const hadCache = !!(cached && cached.profiles && cached.profiles.length);
  state = normalize(cached);
  paintIcons();
  setupPinning();
  bindEvents();
  render();
  reconcile(hadCache).then(() => notifySurfacePreference(false));
})();
