/* ==========================================================================
   Cookies — a self-contained side feature.

   Nothing in here reads or writes header state, profiles, or any internal of
   shared/app.js. The single seam is the registration at the very bottom: the
   ⋯ menu asks window.OpenModHeaderMenuItems for extra entries, and this file
   pushes one. Delete this folder and the two tags that load it from the two
   index.html files and the extension is exactly what it was before.

   The panel is built entirely from script, so neither index.html carries any
   cookie markup, and one implementation serves the popup and the side panel.
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
    copy:
      '<rect x="9" y="9" width="11" height="11" rx="2.2"/>' +
      '<path d="M5.5 15.2A1.7 1.7 0 0 1 4 13.5V6a2 2 0 0 1 2-2h7.5a1.7 1.7 0 0 1 1.7 1.5"/>',
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
  let root = null; // the overlay, built once and reused
  let el = null; // named handles into that overlay
  let tab = null; // { url, origin, host, hostname, protocol }
  let cookies = []; // whatever the last read returned
  let scope = "url"; // "url" — sent to this exact URL · "domain" — whole site
  let query = "";
  let editing = null; // the cookie being edited, or null while adding
  let loadToken = 0; // guards against a slow read landing after a newer one
  const expanded = new Set();

  const keyOf = (c) => `${c.domain}|${c.path}|${c.name}`;

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

  /* ── the overlay ────────────────────────────────────────────────────── */
  function build() {
    if (root) return;

    root = document.createElement("div");
    root.className = "ck-overlay";
    root.hidden = true;

    const panel = document.createElement("section");
    panel.className = "ck-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-label", "Cookies for the current site");

    /* head */
    const head = document.createElement("header");
    head.className = "ck-head";

    const heading = document.createElement("div");
    heading.className = "ck-heading";
    const title = document.createElement("h2");
    title.innerHTML = icon("cookie");
    const titleText = document.createElement("span");
    titleText.textContent = "Cookies";
    title.appendChild(titleText);
    const host = document.createElement("p");
    host.className = "ck-host";
    heading.append(title, host);

    const refresh = document.createElement("button");
    refresh.type = "button";
    refresh.className = "ck-ghost";
    refresh.title = "Reload cookies";
    refresh.setAttribute("aria-label", "Reload cookies");
    refresh.innerHTML = icon("refresh");
    refresh.addEventListener("click", () => load());

    const close = document.createElement("button");
    close.type = "button";
    close.className = "ck-ghost";
    close.title = "Close";
    close.setAttribute("aria-label", "Close cookies");
    close.innerHTML = icon("x");
    close.addEventListener("click", hide);

    head.append(heading, refresh, close);

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

    panel.append(head, tools, body, foot);
    root.appendChild(panel);
    document.body.appendChild(root);

    root.addEventListener("click", (e) => {
      if (e.target === root) hide();
    });

    el = { panel, host, tools, search, scopeSel, list, form, count, foot };
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
        note("No site to read", "Open an HTTP or HTTPS tab and reload this panel.")
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

    if (act === "edit") {
      showForm(c);
      return;
    }

    if (act === "del") remove(c);
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
    if (e.key !== "Escape" || !root || root.hidden) return;
    // Swallow it: app.js also listens for Escape, and this panel sits on top.
    e.stopPropagation();
    hide();
  }

  // While the side panel stays open the user keeps browsing, so the list has
  // to follow the tab it claims to be describing.
  const reload = () => {
    if (root && !root.hidden && el.form.hidden) load();
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

  function show() {
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
    root.hidden = false;
    document.body.classList.add("ck-open");
    document.addEventListener("keydown", onKeydown, true);
    load();
  }

  function hide() {
    if (!root) return;
    root.hidden = true;
    document.body.classList.remove("ck-open");
    document.removeEventListener("keydown", onKeydown, true);
  }

  /* ── the one seam ───────────────────────────────────────────────────────
     app.js reads this array when it builds the ⋯ menu. It never learns what
     the entry is for.
     ────────────────────────────────────────────────────────────────────── */
  window.OpenModHeaderMenuItems = window.OpenModHeaderMenuItems || [];
  window.OpenModHeaderMenuItems.push({
    icon: icon("cookie"),
    label: "Cookies for this site",
    run: show,
  });
})();
