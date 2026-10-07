(() => {
  if (window.__stamped?.toggle) return;

  const state = {
    active: false,
    stamps: [],
    bar: null,
    panel: null,
    count: null,
    hint: null,
    status: null,
    statusTimer: 0,
    saveButton: null,
    thumbs: null,
  };

  // The bar's look, matching slopstamp.xyz: a white sheet with an ink border
  // and a 2px offset shadow, Comic Sans, and raised grey buttons that press in.
  // It sits in a shadow root so the page's own styles can't change it.
  const BAR_CSS = `
    :host { all: initial; }
    .bar {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 8px;
      box-sizing: border-box;
      max-width: calc(100vw - 24px);
      padding: 8px 10px;
      border: 2px solid #111;
      background: #fff;
      color: #111;
      box-shadow: 2px 2px 0 #111;
      font-family: "Comic Sans MS", "Comic Sans", "Comic Neue", "Chalkboard SE", cursive;
      font-size: 15px;
      line-height: 1.2;
    }
    .bar.plain {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    }
    .controls {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: center;
      gap: 10px;
    }
    .count { font-weight: 700; white-space: nowrap; }
    .hint, .status { color: #555; font-size: 14px; white-space: nowrap; }
    .status { color: #e10600; font-weight: 700; }
    /* Same yellow note as the demo on slopstamp.xyz. */
    .status.note {
      padding: 3px 10px;
      border: 2px solid #111;
      background: #ffff99;
      color: #111;
      font-size: 15px;
    }
    [hidden] { display: none !important; }
    button {
      box-sizing: border-box;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-height: 30px;
      margin: 0;
      padding: 0 10px;
      border: 2px solid;
      border-radius: 0;
      color: #111;
      font: inherit;
      font-size: 14px;
      font-weight: 700;
      line-height: 1;
      cursor: pointer;
    }
    button:focus-visible { outline: 3px dotted #111; outline-offset: 2px; }
    .gallery {
      border-color: #fff #6b6b6b #6b6b6b #fff;
      background: #e4e1d8;
      box-shadow: 0 0 0 1px #111;
    }
    .gallery:hover { background: #edeae2; }
    .gallery:active {
      padding-top: 2px;
      border-color: #6b6b6b #fff #fff #6b6b6b;
      background: #d8d5cc;
    }
    /* A box that fills when saving is on, like the site's font switch. */
    .save {
      border-color: #111;
      background: #fff;
      font-weight: 400;
    }
    .save:hover { background: #ffff99; }
    .save::before {
      content: "";
      box-sizing: border-box;
      width: 14px;
      height: 14px;
      border: 2px solid #111;
      background: #fff;
    }
    .save[aria-pressed="true"]::before {
      background: #111;
      box-shadow: inset 0 0 0 2px #fff;
    }
    .thumbs {
      display: flex;
      gap: 6px;
      max-width: min(560px, calc(100vw - 48px));
      overflow-x: auto;
    }
    .thumbs:empty { display: none; }
    .thumb { position: relative; flex: 0 0 auto; }
    .thumb img {
      display: block;
      box-sizing: border-box;
      width: 76px;
      height: 48px;
      object-fit: cover;
      border: 2px solid #111;
      background: #f4f1e8;
    }
    .thumb-delete {
      position: absolute;
      top: 4px;
      right: 4px;
      justify-content: center;
      width: 18px;
      min-height: 18px;
      height: 18px;
      padding: 0;
      border: 0;
      background: #111;
      color: #fff;
      font-size: 13px;
    }
  `;

  // Follows the Plain font switch in the gallery.
  const FONT_KEY = "slopstamp:font";

  let saveEnabled = true;
  let saveTouched = false;
  let captureQueue = Promise.resolve();

  function isBarEvent(event) {
    return event.target instanceof Element && Boolean(event.target.closest(".stamped-bar"));
  }

  function stampLabel(count) {
    return count === 1 ? "1 stamp" : `${count} stamps`;
  }

  function setStatus(text, kind = "error") {
    window.clearTimeout(state.statusTimer);
    state.status.textContent = text;
    state.status.classList.toggle("note", kind === "note");
    state.status.hidden = !text;
    if (text) {
      state.statusTimer = window.setTimeout(() => {
        state.status.textContent = "";
        state.status.hidden = true;
      }, 2200);
    }
  }

  function updateSaveButton() {
    if (!state.saveButton) return;
    state.saveButton.textContent = "Save to gallery";
    state.saveButton.setAttribute("aria-pressed", saveEnabled ? "true" : "false");
  }

  function updateChrome() {
    state.count.textContent = stampLabel(state.stamps.length);
    state.hint.textContent = "Esc to close";
    document.documentElement.classList.toggle("stamped-active", state.active);
    // The bar is only there while stamp mode is on. Stamps already placed stay.
    if (!state.active && state.bar.matches(":focus-within")) state.bar.shadowRoot.activeElement?.blur();
    state.bar.classList.toggle("stamped-bar-closed", !state.active);
    updateSaveButton();
  }

  function notifyMode() {
    void chrome.runtime.sendMessage({ type: "stamped:mode", active: state.active });
  }

  function ensureBar() {
    if (state.bar) return;

    const host = document.createElement("div");
    host.className = "stamped-bar";
    const root = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = BAR_CSS;

    const bar = document.createElement("div");
    bar.className = "bar";

    const controls = document.createElement("div");
    controls.className = "controls";

    const count = document.createElement("span");
    count.className = "count";
    count.setAttribute("aria-live", "polite");

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.className = "save";
    saveButton.addEventListener("click", () => {
      saveTouched = true;
      saveEnabled = !saveEnabled;
      updateSaveButton();
      void chrome.runtime.sendMessage({ type: "stamped:set-saving", enabled: saveEnabled });
    });

    const galleryButton = document.createElement("button");
    galleryButton.type = "button";
    galleryButton.className = "gallery";
    galleryButton.textContent = "Gallery";
    galleryButton.addEventListener("click", () => {
      void chrome.runtime.sendMessage({ type: "stamped:open-gallery" });
    });

    const hint = document.createElement("span");
    hint.className = "hint";

    const status = document.createElement("span");
    status.className = "status";
    status.hidden = true;

    const thumbs = document.createElement("div");
    thumbs.className = "thumbs";

    controls.append(count, saveButton, galleryButton, hint, status);
    bar.append(controls, thumbs);
    root.append(style, bar);
    document.documentElement.append(host);

    state.bar = host;
    state.panel = bar;
    state.count = count;
    state.hint = hint;
    state.saveButton = saveButton;
    state.status = status;
    state.thumbs = thumbs;
    void loadSettings();
    void loadFont();
  }

  async function loadFont() {
    try {
      const stored = await chrome.storage.local.get(FONT_KEY);
      state.panel.classList.toggle("plain", stored[FONT_KEY] === "plain");
    } catch {
      // Keep Comic Sans.
    }
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[FONT_KEY] && state.panel) void loadFont();
  });

  async function loadSettings() {
    try {
      const response = await chrome.runtime.sendMessage({ type: "stamped:get-settings" });
      if (saveTouched) return;
      saveEnabled = response?.saveEnabled !== false;
    } catch {
      if (!saveTouched) saveEnabled = true;
    }
    updateSaveButton();
  }

  function setActive(active) {
    state.active = active;
    ensureBar();
    updateChrome();
  }

  function placeStamp(x, y) {
    const mark = document.createElement("div");
    mark.className = "stamped-mark";

    const label = document.createElement("span");
    label.className = "stamped-label";
    const top = document.createElement("span");
    top.textContent = "AI";
    const bottom = document.createElement("span");
    bottom.textContent = "slop";
    label.append(top, bottom);

    const time = document.createElement("time");
    time.className = "stamped-time";
    time.dateTime = new Date().toISOString();
    time.textContent = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

    mark.append(label, time);
    mark.style.left = `${x}px`;
    mark.style.top = `${y}px`;
    document.documentElement.append(mark);
    state.stamps.push(mark);
    updateChrome();
    if (saveEnabled) enqueueCapture(mark);
  }

  function whenStampVisible(mark) {
    return new Promise((resolve) => {
      const timer = window.setTimeout(resolve, 420);
      mark.addEventListener(
        "animationend",
        () => {
          window.clearTimeout(timer);
          resolve();
        },
        { once: true }
      );
    });
  }

  function enqueueCapture(mark) {
    const visible = whenStampVisible(mark);
    captureQueue = captureQueue
      .then(async () => {
        await visible;
        await captureView();
      })
      .catch(() => {});
  }

  function addThumb(id, image) {
    const item = document.createElement("div");
    item.className = "thumb";
    item.dataset.id = id;

    const img = document.createElement("img");
    img.src = image;
    img.alt = "Saved picture";

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "thumb-delete";
    remove.setAttribute("aria-label", "Delete this picture");
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      void deleteThumb(id, item);
    });

    item.append(img, remove);
    state.thumbs.append(item);
  }

  async function deleteThumb(id, item) {
    try {
      const response = await chrome.runtime.sendMessage({ type: "stamped:delete", ids: [id] });
      if (!response?.ok) {
        setStatus(response?.error || "Couldn't delete that picture.");
        return;
      }
      item.remove();
      setStatus("Deleted", "note");
    } catch {
      setStatus("Couldn't delete that picture.");
    }
  }

  function blockPageEvent(event) {
    if (!state.active || isBarEvent(event)) return;
    event.preventDefault();
    event.stopPropagation();
  }

  function onPointerDown(event) {
    if (!state.active || event.button !== 0 || isBarEvent(event)) return;
    event.preventDefault();
    event.stopPropagation();
    placeStamp(event.pageX, event.pageY);
  }

  function onKeyDown(event) {
    if (!state.active || event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    setActive(false);
    notifyMode();
  }

  async function captureView() {
    ensureBar();
    state.bar.classList.add("stamped-bar-hidden");
    await new Promise((resolve) => {
      requestAnimationFrame(() => {
        window.setTimeout(resolve, 50);
      });
    });

    try {
      const response = await chrome.runtime.sendMessage({
        type: "stamped:capture",
        stampCount: state.stamps.length,
        pageUrl: location.href,
        pageTitle: document.title,
      });
      if (!response?.ok || !response.id) {
        setStatus(response?.error || "Couldn't save this picture.");
        return;
      }
      const key = `stamped:shot:${response.id}`;
      const stored = await chrome.storage.local.get(key);
      if (!stored[key]) {
        setStatus("Couldn't save this picture.");
        return;
      }
      addThumb(response.id, stored[key]);
      setStatus("Saved to your gallery", "note");
    } catch {
      setStatus("Couldn't save this picture.");
    } finally {
      state.bar.classList.remove("stamped-bar-hidden");
    }
  }

  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("mousedown", blockPageEvent, true);
  document.addEventListener("mouseup", blockPageEvent, true);
  document.addEventListener("click", blockPageEvent, true);
  document.addEventListener("keydown", onKeyDown, true);

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "stamped:status") {
      sendResponse({ ok: true, active: state.active });
      return false;
    }
    if (message?.type === "stamped:start") {
      setActive(true);
      sendResponse({ ok: true, active: true });
      return false;
    }
    if (message?.type === "stamped:stop") {
      setActive(false);
      sendResponse({ ok: true, active: false });
      return false;
    }
    if (message?.type === "stamped:toggle") {
      const active = toggle();
      sendResponse({ ok: true, active });
      return true;
    }
    return false;
  });

  function toggle() {
    setActive(!state.active);
    notifyMode();
    return state.active;
  }

  window.__stamped = { toggle };
})();
