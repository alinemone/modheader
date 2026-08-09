const STORAGE_KEY = "openheader_state";

let state = { paused: false, profiles: [], activeProfileId: null };

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

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function newProfile(name) {
  return {
    id: uid(),
    name: name || "Profile 1",
    enabled: true,
    requestEnabled: true,
    responseEnabled: true,
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

function newFilter(value = "", type = "contains") {
  return { id: uid(), enabled: true, value, type };
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
    if (p.requestEnabled === undefined) p.requestEnabled = true;
    if (p.responseEnabled === undefined) p.responseEnabled = true;
    if (!p.color) p.color = DEFAULT_COLOR;
    for (const f of p.filters) {
      if (!f.id) f.id = uid();
      if (!f.type) f.type = "contains";
      if (f.type === "exact" || f.type === "domain") {
        f.value = filterToRegex(f);
        f.type = "regex";
      }
      if (!["contains", "wildcard", "regex"].includes(f.type)) {
        f.type = "contains";
      }
    }
  }
  if (!s.activeProfileId) s.activeProfileId = s.profiles[0].id;
  if (!s.settings) s.settings = { font: "default", fontSize: 13 };
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
  const st = state.settings || { font: "default", fontSize: 13 };
  const root = document.documentElement.style;
  root.setProperty("--ui-font", UI_FONTS[st.font] || UI_FONTS.default);
  root.setProperty("--row-font-size", (st.fontSize || 13) + "px");
}

let colorMenu = null;

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

function closeSettings() {
  const menu = document.getElementById("settingsMenu");
  menu.hidden = true;
  document.removeEventListener("click", onSettingsDocClick, true);
}

function onSettingsDocClick(e) {
  const menu = document.getElementById("settingsMenu");
  if (!menu.contains(e.target) && e.target.id !== "railSettings") {
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
  const r = anchor.getBoundingClientRect();
  const h = menu.offsetHeight;
  let top = r.top;
  if (top + h > window.innerHeight - 8) top = window.innerHeight - h - 8;
  if (top < 8) top = 8;
  menu.style.top = top + "px";
  menu.style.left = r.right + 8 + "px";
  setTimeout(() => document.addEventListener("click", onSettingsDocClick, true), 0);
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
    btn.textContent = state.paused ? "▶" : "⏸";
    btn.title = state.paused ? "Resume all" : "Pause all";
  }

  const profile = activeProfile();
  const idx = activeIndex() + 1;

  const pid = document.getElementById("profileId");
  pid.textContent = idx;
  pid.style.background = profile.color;
  document.querySelector(".titlebar").style.background = state.paused
    ? ""
    : profile.color;
  const nameEl = document.getElementById("profileName");
  if (document.activeElement !== nameEl) nameEl.value = profile.name;

  renderRailProfiles();
  renderProfileList();

  renderHeaderRows("requestRows", profile.headers, "reqHeaderNames", "requestEnabled");
  renderHeaderRows("responseRows", profile.responseHeaders, "resHeaderNames", "responseEnabled");
  renderFilterRows("filterRows", profile.filters);

  updateGroupToggle("requestEnabled", profile.headers);
  updateGroupToggle("responseEnabled", profile.responseHeaders);

  const hasFilters = profile.filters.length > 0;
  document.getElementById("filterSection").hidden = !hasFilters;
  document.getElementById("applyNote").hidden = hasFilters;

  document.getElementById("fontFamily").value = state.settings.font;
  document.getElementById("fontSize").value = String(state.settings.fontSize);
  renderExportScope();

  updateRuleCount();
}

let dragId = null;

const RAIL_MAX = 5;

function renderRailProfiles() {
  const wrap = document.getElementById("railProfiles");
  wrap.innerHTML = "";
  const active = activeProfile();
  state.profiles.slice(0, RAIL_MAX).forEach((p, i) => {
    const b = document.createElement("button");
    b.className = "rail-pcircle" + (p.id === active.id ? " current" : "");
    b.title = p.name;
    b.textContent = i + 1;
    b.style.borderColor = p.color;
    if (p.id === active.id) {
      b.style.background = p.color;
      b.style.color = "#fff";
      const c = document.createElement("i");
      c.className = "check";
      c.textContent = "✔";
      b.appendChild(c);
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
      const c = document.createElement("i");
      c.className = "pcheck";
      c.textContent = "✔";
      badge.appendChild(c);
    }

    const nm = document.createElement("span");
    nm.className = "pname";
    nm.textContent = p.name;
    nm.title = p.name;

    const del = document.createElement("button");
    del.className = "pdel";
    del.textContent = "🗑";
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

function deleteProfile(id) {
  if (state.profiles.length === 1) {
    alert("At least one profile must remain.");
    return;
  }
  const p = state.profiles.find((x) => x.id === id);
  if (!confirm(`Delete profile “${p.name}”?`)) return;
  state.profiles = state.profiles.filter((x) => x.id !== id);
  if (state.activeProfileId === id)
    state.activeProfileId = state.profiles[0].id;
  render();
  save();
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

function renderHeaderRows(containerId, list, datalistId, groupId) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";
  const frag = document.createDocumentFragment();
  list.forEach((h) => {
    const row = document.createElement("div");
    row.className = "row" + (h.enabled ? "" : " disabled");
    row.dataset.id = h.id;

    const chk = document.createElement("input");
    chk.type = "checkbox";
    chk.className = "en";
    chk.checked = h.enabled;

    let lbl = null;
    if (h.label || labelEditing.has(h.id)) {
      lbl = document.createElement("input");
      lbl.type = "text";
      lbl.className = "row-label";
      lbl.placeholder = "label";
      lbl.value = h.label || "";
      lbl.dataset.hid = h.id;
    }

    const name = document.createElement("input");
    name.type = "text";
    name.className = "name";
    name.placeholder = "Name";
    name.value = h.name;
    if (datalistId) name.dataset.list = datalistId;

    const value = document.createElement("input");
    value.type = "text";
    value.className = "value";
    value.placeholder = "Value";
    value.value = h.value;

    const tag = document.createElement("button");
    tag.className = "tag";
    tag.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="M3.75 5.75v5.1c0 .66.26 1.3.73 1.77l6.9 6.9a1.75 1.75 0 0 0 2.47 0l5.67-5.67a1.75 1.75 0 0 0 0-2.47l-6.9-6.9a2.5 2.5 0 0 0-1.77-.73h-5.1a2 2 0 0 0-2 2Z" />' +
      '<circle cx="8" cy="8" r="1.25" />' +
      '<path class="tag-plus" d="M15.75 7.25v5M13.25 9.75h5" />' +
      "</svg>";
    tag.title = "Add label";
    tag.setAttribute("aria-label", "Add label");

    const del = document.createElement("button");
    del.className = "del";
    del.textContent = "✕";
    del.title = "Remove";

    if (lbl) row.append(chk, name, value, lbl, tag, del);
    else row.append(chk, name, value, tag, del);
    frag.appendChild(row);
  });
  container.appendChild(frag);
}

function renderFilterRows(containerId, list) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";
  const frag = document.createDocumentFragment();
  list.forEach((f) => {
    const row = document.createElement("div");
    row.className = "row filter-row" + (f.enabled ? "" : " disabled");
    row.dataset.id = f.id;

    const chk = document.createElement("input");
    chk.type = "checkbox";
    chk.className = "en";
    chk.checked = f.enabled;

    const type = document.createElement("select");
    type.className = "filter-type";
    [
      ["contains", "Contains"],
      ["wildcard", "Wildcard"],
      ["regex", "Regex"],
    ].forEach(([optionValue, label]) => {
      const option = document.createElement("option");
      option.value = optionValue;
      option.textContent = label;
      type.appendChild(option);
    });
    type.value = f.type || "contains";

    const value = document.createElement("input");
    value.type = "text";
    value.className = "value";
    const placeholders = {
      contains: "example.com or http://127.0.0.1",
      wildcard: "*.basalam.*",
      regex: "^https://(www\\.)?example\\.com/",
    };
    value.placeholder = placeholders[f.type || "contains"];
    value.value = f.value;

    const del = document.createElement("button");
    del.className = "del";
    del.textContent = "✕";
    del.title = "Remove filter";

    row.append(chk, type, value, del);
    frag.appendChild(row);
  });
  container.appendChild(frag);
}

function updateRuleCount() {
  const el = document.getElementById("ruleCount");
  if (state.paused) {
    el.textContent = "⏸ Paused";
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

function wildcardToRegex(value) {
  return String(value)
    .split("*")
    .map(escapeRegex)
    .join(".*");
}

function filterToRegex(filter) {
  const value = String(filter.value || "").trim();
  switch (filter.type || "contains") {
    case "wildcard":
      return wildcardToRegex(value);
    case "exact":
      return `^${escapeRegex(value)}$`;
    case "domain": {
      const domain = value
        .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
        .split(/[/?#]/)[0]
        .replace(/^\.+|\.+$/g, "");
      return `^https?:\\/\\/(?:[^/]+\\.)?${escapeRegex(domain)}(?::\\d+)?(?:[/?#]|$)`;
    }
    case "regex":
      return value;
    default:
      return `.*${escapeRegex(value)}.*`;
  }
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
      comment: `OpenModHeader:${f.type || "contains"}:${encodeURIComponent(
        f.value || ""
      )}`,
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
      const tagged = /^OpenModHeader:(contains|wildcard|exact|domain|regex)(?::(.*))?$/.exec(
        f.comment || ""
      );
      let type = tagged ? tagged[1] : "regex";
      if (tagged && tagged[2] !== undefined) {
        try {
          v = decodeURIComponent(tagged[2]);
        } catch (e) {}
      } else if (!tagged) {
        const containsMatch = v.match(/^\.\*(.+?)\.\*$/);
        if (containsMatch) {
          type = "contains";
          v = containsMatch[1].replace(/\\(.)/g, "$1");
        }
      }
      if (type === "exact" || type === "domain") {
        v = filterToRegex({ type, value: v });
        type = "regex";
      }
      if (!["contains", "wildcard", "regex"].includes(type)) type = "contains";
      return newFilter(v, type);
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
      ? { list: activeProfile().headers, groupId: "requestEnabled" }
      : { list: activeProfile().responseHeaders, groupId: "responseEnabled" };
  const find = (e) => {
    const row = e.target.closest(".row");
    if (!row) return null;
    const { list, groupId } = ctx();
    const h = list.find((x) => x.id === row.dataset.id);
    return h ? { row, h, list, groupId } : null;
  };

  container.addEventListener("change", (e) => {
    if (!e.target.classList.contains("en")) return;
    const c = find(e);
    if (!c) return;
    c.h.enabled = e.target.checked;
    c.row.classList.toggle("disabled", !c.h.enabled);
    updateGroupToggle(c.groupId, c.list);
    commit();
  });

  container.addEventListener("input", (e) => {
    const t = e.target;
    const c = find(e);
    if (!c) return;
    if (t.classList.contains("name")) c.h.name = t.value;
    else if (t.classList.contains("value")) c.h.value = t.value;
    else if (t.classList.contains("row-label")) c.h.label = t.value;
    else return;
    commit();
  });

  container.addEventListener("click", (e) => {
    const t = e.target;
    if (t.classList.contains("del")) {
      const c = find(e);
      if (!c) return;
      const i = c.list.indexOf(c.h);
      if (i >= 0) c.list.splice(i, 1);
      labelEditing.delete(c.h.id);
      render();
      commit();
    } else if (t.classList.contains("tag")) {
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
    if (e.target.classList.contains("en")) {
      c.f.enabled = e.target.checked;
      c.row.classList.toggle("disabled", !c.f.enabled);
    } else if (e.target.classList.contains("filter-type")) {
      c.f.type = e.target.value;
      renderFilterRows("filterRows", c.list);
    } else {
      return;
    }
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
    const c = find(e);
    if (!c) return;
    if (e.target.classList.contains("del")) {
      const i = c.list.indexOf(c.f);
      if (i >= 0) c.list.splice(i, 1);
      render();
      commit();
    }
  });
}

function bindEvents() {
  setupHeaderDelegation("requestRows");
  setupHeaderDelegation("responseRows");
  setupFilterDelegation("filterRows");

  document.getElementById("railAddProfile").addEventListener("click", addProfile);
  document.getElementById("tbAdd").addEventListener("click", addProfile);

  document.getElementById("railPause").addEventListener("click", togglePause);
  document.getElementById("tbPause").addEventListener("click", togglePause);

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

  document.getElementById("tbDelete").addEventListener("click", () => {
    deleteProfile(activeProfile().id);
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

  document.getElementById("fontFamily").addEventListener("change", (e) => {
    state.settings.font = e.target.value;
    applySettings();
    save();
  });

  document.getElementById("fontSize").addEventListener("change", (e) => {
    state.settings.fontSize = parseInt(e.target.value, 10) || 13;
    applySettings();
    save();
  });

  document.getElementById("railSettings").addEventListener("click", (e) => {
    e.stopPropagation();
    toggleSettings(e.currentTarget);
  });

  document.getElementById("requestEnabled").addEventListener("change", (e) => {
    const on = e.target.checked;
    activeProfile().headers.forEach((h) => (h.enabled = on));
    render();
    save();
  });

  document.getElementById("responseEnabled").addEventListener("change", (e) => {
    const on = e.target.checked;
    activeProfile().responseHeaders.forEach((h) => (h.enabled = on));
    render();
    save();
  });

  document.querySelectorAll(".mini-add, .add-row").forEach((btn) => {
    btn.addEventListener("click", () => addRow(btn.dataset.target));
  });

  document.getElementById("modBtn").addEventListener("click", () => {
    activeProfile().requestEnabled = true;
    addRow("request");
  });

  document.getElementById("filterBtn").addEventListener("click", () => {
    addRow("filter");
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
    if (e.key === "Escape" && !helpOverlay.hidden) closeHelp();
  });
}

function addRow(target, item = null) {
  const p = activeProfile();
  if (target === "request") p.headers.push(newHeader());
  else if (target === "response") p.responseHeaders.push(newHeader());
  else if (target === "filter") p.filters.push(item || newFilter());
  render();
  save();

  const map = { request: "requestRows", response: "responseRows", filter: "filterRows" };
  const rows = document.getElementById(map[target]);
  const last = rows && rows.lastElementChild;
  if (last) {
    const input = last.querySelector("input[type=text]");
    if (input) input.focus();
  }
}

(function init() {
  const cached = readCache();
  const hadCache = !!(cached && cached.profiles && cached.profiles.length);
  state = normalize(cached);
  bindEvents();
  render();
  reconcile(hadCache);
})();
