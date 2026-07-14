const STORAGE_KEY = "openheader_state";

const ALL_RESOURCE_TYPES = [
  "main_frame",
  "sub_frame",
  "stylesheet",
  "script",
  "image",
  "font",
  "object",
  "xmlhttprequest",
  "ping",
  "csp_report",
  "media",
  "websocket",
  "other",
];

async function loadState() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return data[STORAGE_KEY] || { paused: false, profiles: [] };
}

function toHeaderSpec(h) {
  const op = h.op || "set";
  if (op === "remove") {
    return { header: h.name, operation: "remove" };
  }
  return { header: h.name, operation: op, value: h.value ?? "" };
}

function buildConditions(profile) {
  const includes = (profile.filters || []).filter(
    (f) => f.enabled && f.value.trim()
  );

  if (includes.length === 0) {
    return [{ resourceTypes: ALL_RESOURCE_TYPES }];
  }

  const isAscii = (s) => /^[\x00-\x7F]*$/.test(s);
  const conditions = [];
  for (const f of includes) {
    const value = f.value.trim();
    if (!isAscii(value)) continue;
    conditions.push({ resourceTypes: ALL_RESOURCE_TYPES, urlFilter: value });
  }
  return conditions;
}

function buildRules(state) {
  const rules = [];
  let id = 1;

  if (state.paused) return rules;

  const profile =
    state.profiles.find((p) => p.id === state.activeProfileId) ||
    state.profiles[0];
  if (!profile) return rules;

  const requestHeaders = (profile.headers || [])
    .filter((h) => h.enabled && h.name.trim())
    .map(toHeaderSpec);

  const responseHeaders = (profile.responseHeaders || [])
    .filter((h) => h.enabled && h.name.trim())
    .map(toHeaderSpec);

  if (requestHeaders.length === 0 && responseHeaders.length === 0) return rules;

  const action = { type: "modifyHeaders" };
  if (requestHeaders.length) action.requestHeaders = requestHeaders;
  if (responseHeaders.length) action.responseHeaders = responseHeaders;

  const conditions = buildConditions(profile);
  for (const condition of conditions) {
    rules.push({ id: id++, priority: 1, action, condition });
  }

  return rules;
}

async function syncRules() {
  try {
    const state = await loadState();
    const newRules = buildRules(state);

    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    const removeRuleIds = existing.map((r) => r.id);

    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds,
      addRules: newRules,
    });

    const count = newRules.length;
    await chrome.action.setBadgeText({ text: count ? String(count) : "" });
    await chrome.action.setBadgeBackgroundColor({ color: "#2563eb" });
  } catch (e) {
    await chrome.action.setBadgeText({ text: "!" });
    await chrome.action.setBadgeBackgroundColor({ color: "#d32f2f" });
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[STORAGE_KEY]) {
    syncRules();
  }
});

chrome.runtime.onInstalled.addListener(syncRules);
chrome.runtime.onStartup.addListener(syncRules);

syncRules();
