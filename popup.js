// OpenHeader — popup UI logic
// All data lives only in chrome.storage.local. Nothing ever leaves your machine.

const STORAGE_KEY = "openheader_state";

let state = { paused: false, profiles: [], activeProfileId: null };

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
    headers: [], // request headers
    responseHeaders: [],
    filters: [],
  };
}

function newHeader() {
  return { id: uid(), enabled: true, name: "", value: "", op: "set", label: "" };
}

// Rows whose optional label field is currently open for editing (in-memory only).
const labelEditing = new Set();

function newFilter() {
  return { id: uid(), enabled: true, type: "urls", value: "" };
}

async function load() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  state = data[STORAGE_KEY] || { paused: false, profiles: [] };
  if (!state.profiles || state.profiles.length === 0) {
    state.profiles = [newProfile()];
  }
  // Backfill fields for older saved data.
  for (const p of state.profiles) {
    if (p.requestEnabled === undefined) p.requestEnabled = true;
    if (p.responseEnabled === undefined) p.responseEnabled = true;
  }
  if (!state.activeProfileId) state.activeProfileId = state.profiles[0].id;
}

async function save() {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
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

// ---------- Render ----------

function render() {
  document.body.classList.toggle("paused", !!state.paused);

  const profile = activeProfile();
  const idx = activeIndex() + 1;

  // Title bar: active profile number + editable name
  document.getElementById("profileId").textContent = idx;
  const nameEl = document.getElementById("profileName");
  if (document.activeElement !== nameEl) nameEl.value = profile.name;

  // Left rail (up to 5 circles) + drawer list (all profiles)
  renderRailProfiles();
  renderProfileList();

  renderHeaderRows("requestRows", profile.headers, "reqHeaderNames", "requestEnabled");
  renderHeaderRows("responseRows", profile.responseHeaders, "resHeaderNames", "responseEnabled");
  renderFilterRows("filterRows", profile.filters);

  // Section master checkboxes reflect their children.
  updateGroupToggle("requestEnabled", profile.headers);
  updateGroupToggle("responseEnabled", profile.responseHeaders);

  // Filters section is shown once at least one filter exists
  const hasFilters = profile.filters.length > 0;
  document.getElementById("filterSection").hidden = !hasFilters;
  document.getElementById("applyNote").hidden = hasFilters;

  updateRuleCount();
}

let dragId = null;

// Rail: up to 5 profile circles. The default/active one carries the green check.
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
    if (p.id === active.id) {
      const c = document.createElement("i");
      c.className = "check";
      c.textContent = "✔";
      b.appendChild(c);
    }
    b.addEventListener("click", () => {
      state.activeProfileId = p.id;
      render();
      save();
    });
    wrap.appendChild(b);
  });
}

// Drawer: full list of profiles. The active/default one carries the green check.
function renderProfileList() {
  const list = document.getElementById("profileList");
  const prevScroll = list.scrollTop; // keep scroll position across re-render
  list.innerHTML = "";
  const active = activeProfile();
  state.profiles.forEach((p, i) => {
    const item = document.createElement("div");
    item.className = "pitem" + (p.id === active.id ? " active" : "");
    item.draggable = true;

    const badge = document.createElement("div");
    badge.className = "pbadge";
    badge.textContent = i + 1;
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

    // Click makes this profile the default. The drawer stays open.
    item.addEventListener("click", () => {
      state.activeProfileId = p.id;
      render();
      save();
    });

    // Drag to reorder.
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

// Master checkbox reflects children: checked (all on), indeterminate (mixed), off.
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
  list.forEach((h) => {
    const row = document.createElement("div");
    row.className = "row" + (h.enabled ? "" : " disabled");

    const chk = document.createElement("input");
    chk.type = "checkbox";
    chk.checked = h.enabled;
    chk.addEventListener("change", () => {
      h.enabled = chk.checked;
      row.classList.toggle("disabled", !h.enabled);
      updateGroupToggle(groupId, list); // keep the section master in sync
      commit();
    });

    // Optional inline label shown in front of the record.
    let lbl = null;
    if (h.label || labelEditing.has(h.id)) {
      lbl = document.createElement("input");
      lbl.type = "text";
      lbl.className = "row-label";
      lbl.placeholder = "label";
      lbl.value = h.label || "";
      lbl.dataset.hid = h.id;
      lbl.addEventListener("input", () => {
        h.label = lbl.value;
        commit();
      });
      lbl.addEventListener("blur", () => {
        if (!lbl.value.trim()) {
          labelEditing.delete(h.id);
          render();
        }
      });
    }

    const name = document.createElement("input");
    name.type = "text";
    name.className = "name";
    name.placeholder = "Name";
    name.value = h.name;
    if (datalistId) name.setAttribute("list", datalistId);
    name.addEventListener("input", () => {
      h.name = name.value;
      commit();
    });

    const value = document.createElement("input");
    value.type = "text";
    value.className = "value";
    value.placeholder = "Value";
    value.value = h.value;
    value.addEventListener("input", () => {
      h.value = value.value;
      commit();
    });

    const tag = document.createElement("button");
    tag.className = "tag";
    tag.textContent = "🏷";
    tag.title = "Add label";
    tag.addEventListener("click", () => {
      labelEditing.add(h.id);
      render();
      const input = container.querySelector(`.row-label[data-hid="${h.id}"]`);
      if (input) input.focus();
    });

    const del = document.createElement("button");
    del.className = "del";
    del.textContent = "✕";
    del.title = "Remove";
    del.addEventListener("click", () => {
      const i = list.indexOf(h);
      if (i >= 0) list.splice(i, 1);
      labelEditing.delete(h.id);
      render();
      commit();
    });

    if (lbl) row.append(chk, name, value, lbl, tag, del);
    else row.append(chk, name, value, tag, del);
    container.appendChild(row);
  });
}

function renderFilterRows(containerId, list) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";
  list.forEach((f) => {
    const row = document.createElement("div");
    row.className = "row" + (f.enabled ? "" : " disabled");

    const chk = document.createElement("input");
    chk.type = "checkbox";
    chk.checked = f.enabled;
    chk.addEventListener("change", () => {
      f.enabled = chk.checked;
      row.classList.toggle("disabled", !f.enabled);
      commit();
    });

    const value = document.createElement("input");
    value.type = "text";
    value.className = "value";
    value.placeholder = "URL contains, e.g. example.com";
    value.value = f.value;
    value.addEventListener("input", () => {
      f.value = value.value;
      commit();
    });

    const del = document.createElement("button");
    del.className = "del";
    del.textContent = "✕";
    del.title = "Remove filter";
    del.addEventListener("click", () => {
      const i = list.indexOf(f);
      if (i >= 0) list.splice(i, 1);
      render();
      commit();
    });

    row.append(chk, value, del);
    container.appendChild(row);
  });
}

function updateRuleCount() {
  const el = document.getElementById("ruleCount");
  if (state.paused) {
    el.textContent = "⏸ Paused";
    return;
  }
  el.textContent = `Active: ${activeProfile().name}`;
}

// Debounced save while typing.
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

// ---------- Import / Export (ModHeader-compatible) ----------

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

// Internal state -> ModHeader export format (array of profiles).
function toModHeaderExport() {
  return state.profiles.map((p, i) => ({
    title: p.name,
    shortTitle: String(i + 1),
    backgroundColor: "#6d071a",
    textColor: "#ffffff",
    headers: (p.headers || []).map(headerToModHeader),
    respHeaders: (p.responseHeaders || []).map(headerToModHeader),
    urlFilters: (p.filters || []).map((f) => ({
      comment: "",
      enabled: !!f.enabled,
      urlRegex:
        f.type === "regex" ? f.value : `.*${escapeRegex(f.value)}.*`,
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

// ModHeader import format -> internal profiles.
function fromModHeaderImport(arr) {
  return arr.map((p) => {
    const prof = newProfile(p.title || p.shortTitle || "Imported");
    prof.headers = (p.headers || []).map(headerFromModHeader);
    prof.responseHeaders = (p.respHeaders || []).map(headerFromModHeader);
    prof.filters = (p.urlFilters || []).map((f) => {
      // Everything becomes a plain "contains" filter (no regex).
      let v = (f.urlRegex || "").trim();
      const m = v.match(/^\.\*(.+?)\.\*$/); // strip ModHeader's ".*…​.*" wrapper
      if (m) v = m[1];
      v = v.replace(/\\(.)/g, "$1"); // unescape \. -> . etc.
      return { id: uid(), enabled: f.enabled !== false, type: "urls", value: v };
    });
    return prof;
  });
}

function exportProfiles() {
  const json = JSON.stringify(toModHeaderExport(), null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "openheader_profiles.json";
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

    // Replace the lone empty default profile; otherwise append.
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
    alert(`Imported ${imported.length} profile(s).`);
  } catch (e) {
    alert("Import failed: " + e.message);
  }
}

// ---------- Events ----------

function bindEvents() {
  document.getElementById("railAddProfile").addEventListener("click", addProfile);
  document.getElementById("tbAdd").addEventListener("click", addProfile);

  document.getElementById("railPause").addEventListener("click", togglePause);
  document.getElementById("tbPause").addEventListener("click", togglePause);

  const nameEl = document.getElementById("profileName");
  nameEl.addEventListener("input", () => {
    activeProfile().name = nameEl.value;
    renderProfileList(); // refresh rail tooltips without stealing focus
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
    document.getElementById("importFile").click();
  });
  document.getElementById("importFile").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) importProfiles(file);
    e.target.value = ""; // allow re-importing the same file
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

  document.querySelectorAll(".mini-add").forEach((btn) => {
    btn.addEventListener("click", () => addRow(btn.dataset.target));
  });

  document.getElementById("modBtn").addEventListener("click", () => {
    activeProfile().requestEnabled = true;
    addRow("request");
  });

  document.getElementById("filterBtn").addEventListener("click", () => {
    addRow("filter");
  });

  document.getElementById("railHelp").addEventListener("click", () => {
    alert(
      "OpenHeader — open-source header modifier.\n\n" +
        "• No external servers, no tracking.\n" +
        "• Uses Chrome's declarativeNetRequest API.\n" +
        "• All data stays in local storage on this device.\n\n" +
        "Source: https://github.com/alinemone/modheader"
    );
  });
}

function addRow(target) {
  const p = activeProfile();
  if (target === "request") p.headers.push(newHeader());
  else if (target === "response") p.responseHeaders.push(newHeader());
  else if (target === "filter") p.filters.push(newFilter());
  render();
  save();

  // Focus the newly added row's first input for a smooth ModHeader-like feel.
  const map = { request: "requestRows", response: "responseRows", filter: "filterRows" };
  const rows = document.getElementById(map[target]);
  const last = rows && rows.lastElementChild;
  if (last) {
    const input = last.querySelector("input[type=text]");
    if (input) input.focus();
  }
}

// ---------- Start ----------

(async function init() {
  await load();
  bindEvents();
  render();
  await save(); // ensure initial structure exists in storage
})();
