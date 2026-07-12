// OpenHeader — background service worker
//
// تنها کاری که این فایل می‌کند: خواندن پروفایل‌ها از chrome.storage.local و
// ساختن قوانین پویا (dynamic rules) برای API استاندارد declarativeNetRequest کروم.
// هیچ درخواست شبکه‌ای، هیچ ارتباط با سرور خارجی، و هیچ جمع‌آوری داده‌ای وجود ندارد.

const STORAGE_KEY = "openheader_state";

// نوع منابعی که قوانین روی آن‌ها اعمال می‌شود (همه‌ی ترافیک).
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

// خواندن وضعیت ذخیره‌شده.
async function loadState() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return data[STORAGE_KEY] || { paused: false, profiles: [] };
}

// تبدیل یک ردیف هدر به فرمت declarativeNetRequest.
function toHeaderSpec(h) {
  const op = h.op || "set";
  if (op === "remove") {
    return { header: h.name, operation: "remove" };
  }
  return { header: h.name, operation: op, value: h.value ?? "" };
}

// از یک پروفایل، لیستی از condition ها می‌سازد (بر اساس فیلترهای URL).
// فقط فیلتر «شامل» پشتیبانی می‌شود، چون declarativeNetRequest فیلتر منفیِ
// دلخواه روی urlFilter ندارد و ما نمی‌خواهیم رفتاری وعده بدهیم که واقعی نیست.
function buildConditions(profile) {
  const includes = (profile.filters || []).filter(
    (f) => f.enabled && f.type === "urls" && f.value.trim()
  );

  // بدون فیلتر: یک شرط کلی برای همه‌ی URLها.
  if (includes.length === 0) {
    return [{ resourceTypes: ALL_RESOURCE_TYPES }];
  }

  // برای هر الگوی «شامل» یک شرط جداگانه.
  // type === "regex" از regexFilter و در غیر این صورت از urlFilter (زیررشته) استفاده می‌کند.
  const isAscii = (s) => /^[\x00-\x7F]*$/.test(s);
  const conditions = [];
  for (const f of includes) {
    const value = f.value.trim();
    // کروم برای urlFilter/regexFilter فقط ASCII می‌پذیرد؛ مقدار غیر‌ASCII را رد کن
    // تا کلِ به‌روزرسانی قوانین با خطا متوقف نشود.
    if (!isAscii(value)) continue;

    const cond = { resourceTypes: ALL_RESOURCE_TYPES };
    if (f.type === "regex") {
      // regexِ نامعتبر را هم رد کن.
      try {
        new RegExp(value);
      } catch (e) {
        continue;
      }
      cond.regexFilter = value;
    } else {
      cond.urlFilter = value;
    }
    conditions.push(cond);
  }
  // اگر کاربر فیلتر تعریف کرده ولی همه نامعتبر بودند، امن‌ترین کار این است که
  // هیچ‌جا اعمال نشود (نه اینکه ناخواسته روی همه‌ی سایت‌ها اعمال شود).
  return conditions;
}

// از وضعیت کامل، آرایه‌ی قوانین declarativeNetRequest را می‌سازد.
// فقط پروفایلِ «دیفالت/فعال» (activeProfileId) اعمال می‌شود.
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

// همه‌ی قوانین قدیمی را پاک و قوانین جدید را اعمال می‌کند.
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

    // نمایش تعداد قوانین فعال روی آیکون افزونه.
    const count = newRules.length;
    await chrome.action.setBadgeText({ text: count ? String(count) : "" });
    await chrome.action.setBadgeBackgroundColor({ color: "#2563eb" });
  } catch (e) {
    await chrome.action.setBadgeText({ text: "!" });
    await chrome.action.setBadgeBackgroundColor({ color: "#d32f2f" });
  }
}

// هر بار که ذخیره‌سازی تغییر کند، قوانین را دوباره می‌سازیم.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[STORAGE_KEY]) {
    syncRules();
  }
});

chrome.runtime.onInstalled.addListener(syncRules);
chrome.runtime.onStartup.addListener(syncRules);

// همگام‌سازی اولیه هنگام بیدار شدن service worker.
syncRules();
