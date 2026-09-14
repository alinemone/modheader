/* ==========================================================================
   Cookies — a self-contained side feature.

   Nothing in here reads or writes header state, profiles, or any internal of
   shared/app.js. The only seam is window.OpenModHeaderApi, the short list of
   verbs app.js publishes for bolt-on features. Delete this folder and the two
   tags that load it from the two index.html files and the extension is exactly
   what it was before.

   It is a PAGE, not a dialog: the cookie list replaces the header list inside
   the same .main column, under the same title bar, so both halves of the
   extension share one chrome, one type scale and one set of settings. The
   title bar button swaps between a cookie and a back-to-the-list glyph, which
   is the whole of the navigation.

   Both surfaces are served by this one file — neither index.html carries any
   cookie markup.
   ========================================================================== */
(function () {
  "use strict";

  /* ── icons ──────────────────────────────────────────────────────────────
     Same stroked 24-box family as the rest of the UI, kept local so this
     file does not reach into app.js for its icon table.
     ────────────────────────────────────────────────────────────────────── */
  const PATHS = {
    cookie:
      '<path d="M20.8 12.4A8.8 8.8 0 1 1 11.6 3.2a3.6 3.6 0 0 0 4.4 4.4 3.6 3.6 0 0 0 4.8 4.8Z"/>' +
      '<circle cx="9" cy="10" r="1.05" fill="currentColor" stroke="none"/>' +
      '<circle cx="8.6" cy="15.4" r="1.05" fill="currentColor" stroke="none"/>' +
      '<circle cx="14" cy="15" r="1.05" fill="currentColor" stroke="none"/>',
    // the way back to the header list — a plain back arrow, which is the one
    // glyph nobody has to decode
    back: '<path d="M19.2 12H4.8"/><path d="M11.2 5.2 4.4 12l6.8 6.8"/>',
    copy:
      '<rect x="9" y="9" width="11" height="11" rx="2.2"/>' +
      '<path d="M5.5 15.2A1.7 1.7 0 0 1 4 13.5V6a2 2 0 0 1 2-2h7.5a1.7 1.7 0 0 1 1.7 1.5"/>',
    // send this one into the request headers: an arrow meeting the wall the
    // list lives behind
    toheader:
      '<path d="M3 12h11.4"/><path d="M11 8.4 14.6 12 11 15.6"/>' +
      '<path d="M18.6 4.6v14.8"/>',
    // send this one to another site: a globe, because that is the only thing
    // that changes about the copy
    tourl:
      '<circle cx="12" cy="12" r="8.2"/><path d="M3.9 12h16.2"/>' +
      '<path d="M12 3.8c2.1 2.3 3.2 5.1 3.2 8.2s-1.1 5.9-3.2 8.2c-2.1-2.3-3.2-5.1-3.2-8.2S9.9 6.1 12 3.8Z"/>',
    pencil:
      '<path d="M4 20.1h4.2L19 9.3a2.2 2.2 0 0 0-3.1-3.1L5.1 17V20Z"/>' +
      '<path d="M14.4 7.6l3.1 3.1"/>',
    trash:
      '<path d="M4 7h16M9.5 7V5.2A1.2 1.2 0 0 1 10.7 4h2.6a1.2 1.2 0 0 1 1.2 1.2V7"/>' +
      '<path d="M6.4 7l.8 11.4A1.7 1.7 0 0 0 8.9 20h6.2a1.7 1.7 0 0 0 1.7-1.6L17.6 7"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
    refresh:
      '<path d="M19.9 12a7.9 7.9 0 1 1-2.3-5.6"/><path d="M20.1 4.4v4.6h-4.6"/>',
    chev: '<path d="M6 9.5 12 15.5 18 9.5"/>',
  };

  function icon(name) {
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${PATHS[name] || ""}</svg>`;
  }

  /* ── module state ───────────────────────────────────────────────────── */
  const TARGET_KEY = "openheader_cookie_target";
  const DEFAULT_TARGET = "http://localhost";

  let page = null; // the .ck-page column, built once and reused
  let navBtn = null; // the title bar button that opens and closes it
  let el = null; // named handles into the page
  let tab = null; // { url, origin, host, hostname, protocol }
  let cookies = []; // whatever the last read returned
  let scope = "url"; // "url" — sent to this exact URL · "domain" — whole site
  let query = "";
  let target = DEFAULT_TARGET; // where the transfer button copies cookies to
  let editing = null; // the cookie being edited, or null while adding
  let loadToken = 0; // guards against a slow read landing after a newer one
  const expanded = new Set();

  const keyOf = (c) => `${c.domain}|${c.path}|${c.name}`;
  const isOpen = () => document.documentElement.dataset.view === "cookies";

  /* ── clipboard ──────────────────────────────────────────────────────── */
  async function copyText(text, message) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      // Clipboard API is blocked in some embedding contexts; the old path
      // still works because this document is focused when a button is hit.
      const area = document.createElement("textarea");
      area.value = text;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      try {
        document.execCommand("copy");
      } catch (err) {
        area.remove();
        toast("Could not copy to the clipboard");
        return;
      }
      area.remove();
    }
    toast(message);
  }

  /* ── toast ──────────────────────────────────────────────────────────────
     Deliberately not app.js's showToast(): that one is built around an undo
     action, and these messages are confirmations with nothing to undo.
     ────────────────────────────────────────────────────────────────────── */
  let toastEl = null;
  let toastTimer = null;

  function toast(message) {
    clearTimeout(toastTimer);
    if (toastEl) toastEl.remove();
    toastEl = document.createElement("div");
    toastEl.className = "ck-toast";
    toastEl.textContent = message;
    document.body.appendChild(toastEl);
    toastTimer = setTimeout(() => {
      if (toastEl) toastEl.remove();
      toastEl = null;
    }, 2600);
  }

  /* ── current tab ────────────────────────────────────────────────────── */
  async function readTab() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const url = tabs && tabs[0] && tabs[0].url;
      if (!url) return null;
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) return null;
      return {
        url: parsed.href,
        origin: parsed.origin,
        host: parsed.host,
        hostname: parsed.hostname,
        protocol: parsed.protocol,
      };
    } catch (e) {
      return null;
    }
  }

  /* ── cookie plumbing ────────────────────────────────────────────────── */
  function cookieUrl(c) {
    const host = String(c.domain || "").replace(/^\./, "");
    return `${c.secure ? "https" : "http"}://${host}${c.path || "/"}`;
  }

  async function readCookies() {
    if (!tab) return [];
    const filter = scope === "domain" ? { domain: tab.hostname } : { url: tab.url };
    const list = await chrome.cookies.getAll(filter);
    return list.slice().sort((a, b) => a.name.localeCompare(b.name));
  }

  async function writeCookie(details) {
    const created = await chrome.cookies.set(details);
    if (!created) {
      const why = chrome.runtime.lastError && chrome.runtime.lastError.message;
      throw new Error(why || "Chrome rejected the cookie");
    }
    return created;
  }

  async function dropCookie(c) {
    await chrome.cookies.remove({ url: cookieUrl(c), name: c.name });
  }

  /* ── the transfer target ────────────────────────────────────────────────
     One address for the whole feature, remembered across both surfaces the
     same way the profiles are. localhost by default, because copying a live
     session onto the app you are developing is what this is for.
     ────────────────────────────────────────────────────────────────────── */
  function parseTarget(raw) {
    const text = String(raw || "").trim();
    if (!text) return null;
    try {
      const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : "http://" + text);
      if (!["http:", "https:"].includes(url.protocol)) return null;
      if (!url.hostname) return null;
      return url;
    } catch (e) {
      return null;
    }
  }

  async function loadTarget() {
    try {
      const stored = await chrome.storage.local.get(TARGET_KEY);
      const value = stored && stored[TARGET_KEY];
      if (typeof value === "string" && value.trim()) target = value.trim();
    } catch (e) {}
  }

  let targetTimer = null;
  function saveTarget(value) {
    target = value;
    clearTimeout(targetTimer);
    targetTimer = setTimeout(() => {
      try {
        chrome.storage.local.set({ [TARGET_KEY]: value });
      } catch (e) {}
    }, 250);
  }

  /* ── formatting ─────────────────────────────────────────────────────── */
  function expiryText(c) {
    if (c.session || !c.expirationDate) return "session";
    const d = new Date(c.expirationDate * 1000);
    if (Number.isNaN(d.getTime())) return "session";
    if (d.getTime() < Date.now()) return "expired";
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function sameSiteText(value) {
    if (value === "no_restriction") return "SameSite=None";
    if (value === "lax") return "SameSite=Lax";
    if (value === "strict") return "SameSite=Strict";
    return "";
  }

  function toLocalInput(seconds) {
    const d = new Date(seconds * 1000);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return (
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
      `T${pad(d.getHours())}:${pad(d.getMinutes())}`
    );
  }

  function fromLocalInput(value) {
    const ms = new Date(value).getTime();
    return Number.isFinite(ms) ? ms / 1000 : null;
  }

  function visibleCookies() {
    const q = query.trim().toLowerCase();
    if (!q) return cookies;
    return cookies.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        String(c.value || "").toLowerCase().includes(q)
    );
  }

  /* ── the page ───────────────────────────────────────────────────────────
     Built into .main, next to the header list it replaces, so it inherits
     the title bar, the rail and every one of the appearance settings.
     ────────────────────────────────────────────────────────────────────── */
  function build() {
    if (page) return;

    page = document.createElement("div");
    page.className = "ck-page";

    /* head — what you are looking at, and a way to re-read it */
    const head = document.createElement("div");
    head.className = "ck-head";

    const title = document.createElement("strong");
    title.className = "ck-title";
    title.innerHTML = icon("cookie");
    const titleText = document.createElement("span");
    titleText.textContent = "Cookies";
    title.appendChild(titleText);

    const host = document.createElement("span");
    host.className = "ck-host";

    const refresh = document.createElement("button");
    refresh.type = "button";
    refresh.className = "ck-ghost";
    refresh.title = "Reload cookies";
    refresh.setAttribute("aria-label", "Reload cookies");
    refresh.innerHTML = icon("refresh");
    refresh.addEventListener("click", () => load());

    head.append(title, host, refresh);

    /* tools */
    const tools = document.createElement("div");
    tools.className = "ck-tools";

    const search = document.createElement("input");
    search.type = "search";
    search.className = "ck-search";
    search.placeholder = "Filter by name or value";
    search.spellcheck = false;
    search.addEventListener("input", () => {
      query = search.value;
      renderList();
    });

    const scopeSel = document.createElement("select");
    scopeSel.className = "ck-scope";
    scopeSel.title = "Which cookies to list";
    [
      ["url", "This URL"],
      ["domain", "Whole site"],
    ].forEach(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      scopeSel.appendChild(option);
    });
    scopeSel.addEventListener("change", () => {
      scope = scopeSel.value;
      load();
    });

    const add = document.createElement("button");
    add.type = "button";
    add.className = "ck-primary";
    add.innerHTML = icon("plus");
    const addText = document.createElement("span");
    addText.textContent = "Add";
    add.appendChild(addText);
    add.addEventListener("click", () => showForm(null));

    tools.append(search, scopeSel, add);

    /* body — the list and the editor take turns in here */
    const body = document.createElement("div");
    body.className = "ck-body";

    const list = document.createElement("div");
    list.className = "ck-list";
    list.addEventListener("click", onListClick);

    const form = document.createElement("form");
    form.className = "ck-form";
    form.hidden = true;
    form.addEventListener("submit", onFormSubmit);

    body.append(list, form);

    /* foot */
    const foot = document.createElement("footer");
    foot.className = "ck-foot";

    const count = document.createElement("span");
    count.className = "ck-count";

    const copyHeader = document.createElement("button");
    copyHeader.type = "button";
    copyHeader.className = "ck-ghost-text";
    copyHeader.title = "Copy every listed cookie as one Cookie header value";
    copyHeader.textContent = "Copy as Cookie header";
    copyHeader.addEventListener("click", () => {
      const listed = visibleCookies();
      if (listed.length === 0) return;
      copyText(
        listed.map((c) => `${c.name}=${c.value}`).join("; "),
        `Copied ${listed.length} cookie${listed.length === 1 ? "" : "s"} as a header value`
      );
    });

    const copyJson = document.createElement("button");
    copyJson.type = "button";
    copyJson.className = "ck-ghost-text";
    copyJson.title = "Copy every listed cookie as JSON";
    copyJson.textContent = "Copy JSON";
    copyJson.addEventListener("click", () => {
      const listed = visibleCookies();
      if (listed.length === 0) return;
      copyText(JSON.stringify(listed, null, 2), "Copied cookies as JSON");
    });

    foot.append(count, copyHeader, copyJson);

    page.append(head, tools, body, foot);

    const main = document.querySelector(".main");
    const footer = main && main.querySelector(".footer");
    if (footer) main.insertBefore(page, footer);
    else (main || document.body).appendChild(page);

    el = { host, tools, search, scopeSel, list, form, count, foot };
  }

  /* ── the transfer dialog ────────────────────────────────────────────────
     Both transfers ask before they act. A cookie's own name is almost never
     the name the other side wants — a session cookie becomes an X-Auth-Token
     header, or a cookie from prod is filed under a different name on the dev
     host — so the key and the value are editable, pre-filled with the cookie
     as it stands. Confirming is one Enter away when nothing needs changing.
     ────────────────────────────────────────────────────────────────────── */
  let modal = null;

  function closeModal() {
    if (!modal) return;
    modal.remove();
    modal = null;
  }

  /* One field of a dialog. The kinds are exactly the kinds the cookie editor
     already uses, so a dialog and the editor are the same form twice. */
  function renderField(f, inputs) {
    if (f.type === "grid") {
      const grid = document.createElement("div");
      grid.className = "ck-grid";
      f.fields.forEach((sub) => grid.appendChild(renderField(sub, inputs)));
      return grid;
    }

    if (f.type === "checks") {
      const flags = document.createElement("div");
      flags.className = "ck-flags";
      f.items.forEach((item) => {
        const box = checkbox(item.label, item.checked);
        inputs[item.key] = box.input;
        flags.appendChild(box);
      });
      return flags;
    }

    let control;
    if (f.type === "textarea") {
      control = document.createElement("textarea");
      control.rows = 3;
    } else if (f.type === "select") {
      control = document.createElement("select");
      f.options.forEach(([value, label]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        control.appendChild(option);
      });
    } else if (f.type === "datetime") {
      control = document.createElement("input");
      control.type = "datetime-local";
    } else {
      control = document.createElement("input");
      control.type = "text";
      // Same suggestions, and the same on-focus attachment, as a header name
      // in the list: a datalist left attached shows its arrow at all times.
      if (f.list) {
        control.addEventListener("focus", () => control.setAttribute("list", f.list));
        control.addEventListener("blur", () => control.removeAttribute("list"));
      }
    }

    control.spellcheck = false;
    control.value = f.value == null ? "" : f.value;
    if (f.placeholder) control.placeholder = f.placeholder;
    if (f.mono) control.classList.add("ck-mono");
    inputs[f.key] = control;
    return field(f.label, control, f.hint);
  }

  function openModal(spec) {
    closeModal();

    modal = document.createElement("div");
    modal.className = "ck-modal";

    const form = document.createElement("form");
    form.className = "ck-modal-panel";
    form.setAttribute("role", "dialog");
    form.setAttribute("aria-modal", "true");
    form.setAttribute("aria-label", spec.title);

    const head = document.createElement("div");
    head.className = "ck-modal-head";
    const title = document.createElement("strong");
    title.innerHTML = icon(spec.icon);
    const titleText = document.createElement("span");
    titleText.textContent = spec.title;
    title.appendChild(titleText);
    const close = document.createElement("button");
    close.type = "button";
    close.className = "ck-ghost";
    close.title = "Cancel";
    close.setAttribute("aria-label", "Cancel");
    close.innerHTML = icon("x");
    close.addEventListener("click", closeModal);
    head.append(title, close);

    const sub = document.createElement("p");
    sub.className = "ck-modal-sub";
    sub.textContent = spec.subtitle || "";
    sub.hidden = !spec.subtitle;

    const inputs = {};
    const body = document.createElement("div");
    body.className = "ck-modal-body";
    spec.fields.forEach((f) => body.appendChild(renderField(f, inputs)));

    const error = document.createElement("p");
    error.className = "ck-error";
    error.hidden = true;

    const actions = document.createElement("div");
    actions.className = "ck-form-actions";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "ck-ghost-text";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", closeModal);
    const submit = document.createElement("button");
    submit.type = "submit";
    submit.className = "ck-primary";
    submit.textContent = spec.confirm;
    actions.append(cancel, submit);

    form.append(head, sub, body, error, actions);
    modal.appendChild(form);

    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeModal();
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      error.hidden = true;
      const values = {};
      Object.keys(inputs).forEach((k) => {
        const control = inputs[k];
        values[k] = control.type === "checkbox" ? control.checked : control.value;
      });
      const problem = await spec.onSubmit(values);
      if (problem) {
        error.textContent = problem;
        error.hidden = false;
        return;
      }
      closeModal();
    });

    page.appendChild(modal);
    if (spec.onBuild) spec.onBuild(inputs);

    const first = Object.values(inputs)[0];
    if (first) {
      first.focus();
      if (first.select) first.select();
    }
  }

  /* ── list view ──────────────────────────────────────────────────────── */
  function note(text, sub) {
    const wrap = document.createElement("p");
    wrap.className = "ck-note";
    wrap.textContent = text;
    if (sub) {
      const small = document.createElement("small");
      small.textContent = sub;
      wrap.appendChild(small);
    }
    return wrap;
  }

  function chip(text, kind) {
    const span = document.createElement("span");
    span.className = "ck-chip" + (kind ? " " + kind : "");
    span.textContent = text;
    return span;
  }

  function renderList() {
    if (!el) return;
    el.list.innerHTML = "";

    if (!tab) {
      el.list.appendChild(
        note("No site to read", "Open an HTTP or HTTPS tab and reload this page.")
      );
      el.count.textContent = "";
      return;
    }

    const listed = visibleCookies();

    if (cookies.length === 0) {
      el.list.appendChild(
        note(
          "No cookies here",
          scope === "url"
            ? "Nothing is sent to this URL. Try “Whole site”."
            : "This site has not stored anything yet."
        )
      );
    } else if (listed.length === 0) {
      el.list.appendChild(note("Nothing matches that filter"));
    } else {
      const frag = document.createDocumentFragment();
      listed.forEach((c) => frag.appendChild(renderItem(c)));
      el.list.appendChild(frag);
    }

    el.count.textContent =
      cookies.length === 0
        ? ""
        : listed.length === cookies.length
        ? `${cookies.length} cookie${cookies.length === 1 ? "" : "s"}`
        : `${listed.length} of ${cookies.length}`;
  }

  function renderItem(c) {
    const key = keyOf(c);
    const expiry = expiryText(c);

    const item = document.createElement("div");
    // An expired cookie gets the red rail a duplicate header gets: in both
    // cases the row is still listed but the browser has stopped acting on it.
    item.className = "ck-item" + (expiry === "expired" ? " ck-dead" : "");
    item.dataset.key = key;

    const line = document.createElement("div");
    line.className = "ck-line";

    const name = document.createElement("span");
    name.className = "ck-name";
    name.textContent = c.name;
    name.title = c.name;

    const acts = document.createElement("div");
    acts.className = "ck-acts";
    [
      ["copy", "copy", "Copy value"],
      ["toheader", "toheader", "Send to a request header…"],
      ["tourl", "tourl", "Copy to another site…"],
      ["edit", "pencil", "Edit cookie"],
      ["del", "trash", "Delete cookie"],
    ].forEach(([act, glyph, label]) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.act = act;
      btn.className = act === "del" ? "ck-act ck-danger" : "ck-act";
      btn.title = label;
      btn.setAttribute("aria-label", label);
      btn.innerHTML = icon(glyph);
      acts.appendChild(btn);
    });

    line.append(name, acts);

    const value = document.createElement("button");
    value.type = "button";
    value.dataset.act = "expand";
    value.className = "ck-val" + (expanded.has(key) ? " open" : "");
    value.textContent = c.value || "(empty)";
    value.title = expanded.has(key) ? "Collapse value" : "Show the whole value";

    const meta = document.createElement("div");
    meta.className = "ck-meta";
    meta.appendChild(chip(c.domain + (c.path === "/" ? "" : c.path)));
    meta.appendChild(chip(expiry, expiry === "expired" ? "warn" : ""));
    if (c.secure) meta.appendChild(chip("Secure", "good"));
    if (c.httpOnly) meta.appendChild(chip("HttpOnly", "good"));
    const ss = sameSiteText(c.sameSite);
    if (ss) meta.appendChild(chip(ss));

    item.append(line, value, meta);
    return item;
  }

  function findCookie(key) {
    return cookies.find((c) => keyOf(c) === key) || null;
  }

  function onListClick(e) {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const item = btn.closest(".ck-item");
    if (!item) return;
    const c = findCookie(item.dataset.key);
    if (!c) return;

    const act = btn.dataset.act;

    if (act === "expand") {
      const key = keyOf(c);
      if (expanded.has(key)) expanded.delete(key);
      else expanded.add(key);
      renderList();
      return;
    }

    if (act === "copy") {
      copyText(c.value || "", `Copied the value of ${c.name}`);
      return;
    }

    if (act === "toheader") {
      sendToHeaders(c);
      return;
    }

    if (act === "tourl") {
      sendToTarget(c);
      return;
    }

    if (act === "edit") {
      showForm(c);
      return;
    }

    if (act === "del") remove(c);
  }

  /* ── the two transfers ──────────────────────────────────────────────── */
  function sendToHeaders(c) {
    openModal({
      icon: "toheader",
      title: "Send to a request header",
      subtitle:
        "The cookie goes into the active profile as a request header under its " +
        "own name. Change the name if the server expects another one.",
      confirm: "Add to headers",
      fields: [
        {
          key: "name",
          label: "Header name",
          value: c.name,
          // the same suggestion list the request rows use, so the standard
          // header names are one keystroke away when the cookie's own name is
          // not what you want
          list: "reqHeaderNames",
          hint: "Clear it to pick from the standard request headers",
          mono: true,
        },
        { key: "value", label: "Value", value: c.value || "", type: "textarea", mono: true },
      ],
      onSubmit: ({ name, value }) => {
        const api = window.OpenModHeaderApi;
        if (!api || !api.setRequestHeader) {
          return "The header list is not available here.";
        }
        const headerName = name.trim();
        if (!headerName) return "A header needs a name.";

        const outcome = api.setRequestHeader(headerName, value);
        toast(
          outcome === "updated"
            ? `Updated the ${headerName} header`
            : `Added the ${headerName} request header`
        );
        return null;
      },
    });
  }

  function sendToTarget(c) {
    const isSession = !!c.session || !c.expirationDate;

    openModal({
      icon: "tourl",
      title: "Copy to another site",
      subtitle:
        "Everything is pre-filled from this cookie and every part of it can be " +
        "changed. The copy belongs to the target host only.",
      confirm: "Write cookie",
      fields: [
        {
          key: "url",
          label: "Address",
          value: target,
          placeholder: DEFAULT_TARGET,
          hint: "A path in the address becomes the cookie's path",
          mono: true,
        },
        { key: "name", label: "Name", value: c.name, mono: true },
        { key: "value", label: "Value", value: c.value || "", type: "textarea", mono: true },
        {
          type: "grid",
          fields: [
            {
              key: "sameSite",
              label: "SameSite",
              type: "select",
              value: c.sameSite || "unspecified",
              options: [
                ["unspecified", "Unspecified"],
                ["lax", "Lax"],
                ["strict", "Strict"],
                ["no_restriction", "None (needs Secure)"],
              ],
            },
            {
              key: "expires",
              label: "Expires",
              type: "datetime",
              value: c.expirationDate ? toLocalInput(c.expirationDate) : "",
            },
          ],
        },
        {
          type: "checks",
          items: [
            { key: "session", label: "Session cookie", checked: isSession },
            { key: "secure", label: "Secure", checked: !!c.secure },
            { key: "httpOnly", label: "HttpOnly", checked: !!c.httpOnly },
          ],
        },
      ],

      // The same two interlocks the editor has: an expiry means nothing on a
      // session cookie, and Chrome refuses SameSite=None without Secure.
      onBuild: (i) => {
        const syncExpiry = () => {
          i.expires.disabled = i.session.checked;
          if (!i.session.checked && !i.expires.value) {
            i.expires.value = toLocalInput(Date.now() / 1000 + 30 * 86400);
          }
        };
        i.session.addEventListener("change", syncExpiry);
        syncExpiry();

        const syncSecure = () => {
          const forced = i.sameSite.value === "no_restriction";
          if (forced) i.secure.checked = true;
          i.secure.disabled = forced;
        };
        i.sameSite.addEventListener("change", syncSecure);
        syncSecure();
      },

      onSubmit: async (v) => {
        const url = parseTarget(v.url);
        if (!url) return "Enter an http or https address.";
        const cookieName = v.name.trim();
        if (!cookieName) return "A cookie needs a name.";

        const path = url.pathname && url.pathname !== "/" ? url.pathname : "/";

        // No domain: the copy is host-only on the target, which is what you
        // want for localhost and never worse elsewhere.
        const details = {
          url: `${url.protocol}//${url.host}${path}`,
          name: cookieName,
          value: v.value,
          path,
          secure: v.secure,
          httpOnly: v.httpOnly,
          sameSite: v.sameSite,
        };

        if (!v.session) {
          const seconds = fromLocalInput(v.expires);
          if (seconds === null) {
            return "Pick an expiry date, or mark it as a session cookie.";
          }
          details.expirationDate = seconds;
        }

        try {
          await writeCookie(details);
        } catch (err) {
          return err.message || `Could not write ${cookieName} to ${url.host}.`;
        }

        // Remembered for next time: the address is nearly always the same one
        // twice running.
        saveTarget(v.url.trim());
        toast(`Copied ${cookieName} to ${url.host}`);
        if (tab && url.hostname === tab.hostname) load();
        return null;
      },
    });
  }

  async function remove(c) {
    try {
      await dropCookie(c);
      toast(`Deleted ${c.name}`);
    } catch (e) {
      toast(`Could not delete ${c.name}`);
    }
    load();
  }

  /* ── editor ─────────────────────────────────────────────────────────────
     One form serves both add and edit; `editing` holds the original cookie
     so a rename can delete the old one instead of leaving a twin behind.
     ────────────────────────────────────────────────────────────────────── */
  function field(label, control, hint) {
    const wrap = document.createElement("label");
    wrap.className = "ck-field";
    const text = document.createElement("span");
    text.textContent = label;
    wrap.append(text, control);
    if (hint) {
      const small = document.createElement("small");
      small.textContent = hint;
      wrap.appendChild(small);
    }
    return wrap;
  }

  function textInput(value, placeholder) {
    const input = document.createElement("input");
    input.type = "text";
    input.spellcheck = false;
    input.value = value || "";
    if (placeholder) input.placeholder = placeholder;
    return input;
  }

  function checkbox(label, checked) {
    const wrap = document.createElement("label");
    wrap.className = "ck-check";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = !!checked;
    const text = document.createElement("span");
    text.textContent = label;
    wrap.append(input, text);
    wrap.input = input;
    return wrap;
  }

  function showForm(cookie) {
    editing = cookie;
    const form = el.form;
    form.innerHTML = "";

    const head = document.createElement("div");
    head.className = "ck-form-head";
    const back = document.createElement("button");
    back.type = "button";
    back.className = "ck-ghost ck-back";
    back.title = "Back to the list";
    back.setAttribute("aria-label", "Back to the list");
    back.innerHTML = icon("chev");
    const heading = document.createElement("strong");
    heading.textContent = cookie ? `Edit ${cookie.name}` : "New cookie";
    back.addEventListener("click", showList);
    head.append(back, heading);

    const name = textInput(cookie ? cookie.name : "", "session_id");
    name.required = true;

    const value = document.createElement("textarea");
    value.rows = 3;
    value.spellcheck = false;
    value.value = cookie ? cookie.value : "";
    value.placeholder = "Value";

    // A host-only cookie carries no leading dot and belongs to exactly one
    // host, which is what an empty field means to chrome.cookies.set.
    const domain = textInput(
      cookie ? (cookie.hostOnly ? "" : cookie.domain) : "",
      tab ? tab.hostname : "example.com"
    );
    const path = textInput(cookie ? cookie.path : "/", "/");

    const sameSite = document.createElement("select");
    [
      ["unspecified", "Unspecified"],
      ["lax", "Lax"],
      ["strict", "Strict"],
      ["no_restriction", "None (needs Secure)"],
    ].forEach(([v, label]) => {
      const option = document.createElement("option");
      option.value = v;
      option.textContent = label;
      sameSite.appendChild(option);
    });
    sameSite.value = (cookie && cookie.sameSite) || "unspecified";

    const session = checkbox(
      "Session cookie",
      cookie ? !!cookie.session || !cookie.expirationDate : true
    );
    const expires = document.createElement("input");
    expires.type = "datetime-local";
    expires.value =
      cookie && cookie.expirationDate ? toLocalInput(cookie.expirationDate) : "";
    expires.disabled = session.input.checked;
    session.input.addEventListener("change", () => {
      expires.disabled = session.input.checked;
      if (!session.input.checked && !expires.value) {
        expires.value = toLocalInput(Date.now() / 1000 + 30 * 86400);
      }
    });

    const secure = checkbox("Secure", cookie ? !!cookie.secure : tab && tab.protocol === "https:");
    const httpOnly = checkbox("HttpOnly", cookie ? !!cookie.httpOnly : false);

    // Chrome refuses SameSite=None without Secure, so the form does not let
    // the two disagree in the first place.
    const syncSecure = () => {
      const forced = sameSite.value === "no_restriction";
      if (forced) secure.input.checked = true;
      secure.input.disabled = forced;
    };
    sameSite.addEventListener("change", syncSecure);
    syncSecure();

    const grid = document.createElement("div");
    grid.className = "ck-grid";
    grid.append(
      field("Domain", domain, "Blank keeps it on this host only"),
      field("Path", path)
    );

    const grid2 = document.createElement("div");
    grid2.className = "ck-grid";
    grid2.append(field("SameSite", sameSite), field("Expires", expires));

    const flags = document.createElement("div");
    flags.className = "ck-flags";
    flags.append(session, secure, httpOnly);

    const error = document.createElement("p");
    error.className = "ck-error";
    error.hidden = true;

    const actions = document.createElement("div");
    actions.className = "ck-form-actions";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "ck-ghost-text";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", showList);
    const save = document.createElement("button");
    save.type = "submit";
    save.className = "ck-primary";
    save.textContent = cookie ? "Save changes" : "Add cookie";
    actions.append(cancel, save);

    form.append(
      head,
      field("Name", name),
      field("Value", value),
      grid,
      grid2,
      flags,
      error,
      actions
    );
    form._fields = {
      name, value, domain, path, sameSite, expires, session, secure, httpOnly, error,
    };

    el.list.hidden = true;
    el.tools.hidden = true;
    el.foot.hidden = true;
    form.hidden = false;
    name.focus();
  }

  function showList() {
    editing = null;
    el.form.hidden = true;
    el.form.innerHTML = "";
    el.list.hidden = false;
    el.tools.hidden = false;
    el.foot.hidden = false;
  }

  async function onFormSubmit(e) {
    e.preventDefault();
    const f = el.form._fields;
    if (!f) return;

    f.error.hidden = true;

    const name = f.name.value.trim();
    if (!name) {
      f.error.textContent = "A cookie needs a name.";
      f.error.hidden = false;
      return;
    }

    const domain = f.domain.value.trim();
    const path = f.path.value.trim() || "/";
    const secure = f.secure.input.checked;
    const host = domain.replace(/^\./, "") || (tab && tab.hostname);
    if (!host) {
      f.error.textContent = "No host to attach this cookie to.";
      f.error.hidden = false;
      return;
    }

    const details = {
      url: `${secure ? "https" : "http"}://${host}${path}`,
      name,
      value: f.value.value,
      path,
      secure,
      httpOnly: f.httpOnly.input.checked,
      sameSite: f.sameSite.value,
    };
    if (domain) details.domain = domain;

    if (!f.session.input.checked) {
      const seconds = fromLocalInput(f.expires.value);
      if (seconds === null) {
        f.error.textContent = "Pick an expiry date, or mark it as a session cookie.";
        f.error.hidden = false;
        return;
      }
      details.expirationDate = seconds;
    }

    try {
      // A rename, or a move to another domain or path, is a different cookie
      // as far as the browser is concerned — drop the original so the edit
      // does not silently leave two behind.
      if (
        editing &&
        (editing.name !== name ||
          editing.path !== path ||
          editing.domain.replace(/^\./, "") !== host)
      ) {
        await dropCookie(editing);
      }
      await writeCookie(details);
    } catch (err) {
      f.error.textContent = err.message || "Chrome rejected the cookie.";
      f.error.hidden = false;
      return;
    }

    toast(editing ? `Saved ${name}` : `Added ${name}`);
    showList();
    load();
  }

  /* ── loading ────────────────────────────────────────────────────────── */
  async function load() {
    if (!el) return;
    const token = ++loadToken;

    tab = await readTab();
    if (token !== loadToken) return;

    el.host.textContent = tab ? tab.host : "No site";
    el.host.title = tab ? tab.url : "";

    if (!tab) {
      cookies = [];
      renderList();
      return;
    }

    try {
      const next = await readCookies();
      if (token !== loadToken) return;
      cookies = next;
    } catch (e) {
      if (token !== loadToken) return;
      cookies = [];
      el.list.innerHTML = "";
      el.list.appendChild(
        note("Cannot read cookies", e.message || "The cookies permission is missing.")
      );
      el.count.textContent = "";
      return;
    }

    renderList();
  }

  /* ── open and close ─────────────────────────────────────────────────── */
  function onKeydown(e) {
    if (e.key !== "Escape" || !isOpen()) return;
    // Swallow it: app.js also listens for Escape, and it would close things
    // behind this page that the user cannot even see.
    e.stopPropagation();
    if (modal) closeModal();
    else if (el && !el.form.hidden) showList();
    else showHeaders();
  }

  // While the side panel stays open the user keeps browsing, so the list has
  // to follow the tab it claims to be describing.
  const reload = () => {
    if (isOpen() && el && el.form.hidden) load();
  };

  let watching = false;
  function watch() {
    if (watching) return;
    watching = true;
    if (chrome.tabs) {
      chrome.tabs.onActivated.addListener(reload);
      chrome.tabs.onUpdated.addListener((id, change, updated) => {
        if (change.url && updated.active) reload();
      });
    }
    if (chrome.cookies && chrome.cookies.onChanged) {
      chrome.cookies.onChanged.addListener(() => {
        clearTimeout(watch._timer);
        watch._timer = setTimeout(reload, 250);
      });
    }
  }

  function setNav(open) {
    if (!navBtn) return;
    navBtn.innerHTML = icon(open ? "back" : "cookie");
    navBtn.title = open ? "Back to the header list" : "Cookies for this site";
    navBtn.setAttribute("aria-label", navBtn.title);
    navBtn.classList.toggle("on", open);
  }

  function showCookies() {
    if (!chrome.cookies) {
      alert(
        'The "cookies" permission is missing. Reload the extension after updating the manifest.'
      );
      return;
    }
    build();
    watch();
    showList();
    query = "";
    el.search.value = "";
    el.scopeSel.value = scope;
    expanded.clear();
    document.documentElement.dataset.view = "cookies";
    setNav(true);
    document.addEventListener("keydown", onKeydown, true);
    load();
  }

  function showHeaders() {
    closeModal();
    delete document.documentElement.dataset.view;
    setNav(false);
    document.removeEventListener("keydown", onKeydown, true);
    // The list spent this whole time at zero width, so nothing it measured
    // while hidden can be trusted.
    const api = window.OpenModHeaderApi;
    if (api && api.refreshLayout) api.refreshLayout();
  }

  /* ── the title bar button ───────────────────────────────────────────────
     Inserted rather than declared in the two index.html files, so removing
     this folder removes the button with it. It lands between pause and ⋯:
     reading the bar from the right that is ⋯, cookies, pause, ＋.
     ────────────────────────────────────────────────────────────────────── */
  function mount() {
    const more = document.getElementById("tbMore");
    const bar = more && more.parentElement;
    if (!bar) return;

    navBtn = document.createElement("button");
    navBtn.type = "button";
    navBtn.id = "tbCookies";
    navBtn.className = "tb-btn";
    setNav(false);
    navBtn.addEventListener("click", () => {
      if (isOpen()) showHeaders();
      else showCookies();
    });

    bar.insertBefore(navBtn, more);
    loadTarget();
  }

  mount();
})();
