(() => {
  if (window.__stamped?.toggle) return;

  const state = {
    active: false,
    stamps: [],
    bar: null,
    count: null,
    hint: null,
    status: null,
    statusTimer: 0,
    saveButton: null,
    thumbs: null,
  };

  let saveEnabled = true;
  let saveTouched = false;
  let captureQueue = Promise.resolve();

  function isBarEvent(event) {
    return event.target instanceof Element && Boolean(event.target.closest(".stamped-bar"));
  }

  function stampLabel(count) {
    return count === 1 ? "1 stamp" : `${count} stamps`;
  }

  function setStatus(text) {
    window.clearTimeout(state.statusTimer);
    state.status.textContent = text;
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
    state.saveButton.textContent = saveEnabled ? "Saving on" : "Saving off";
    state.saveButton.setAttribute("aria-pressed", saveEnabled ? "true" : "false");
  }

  function updateChrome() {
    state.count.textContent = stampLabel(state.stamps.length);
    state.hint.textContent = state.active ? "Esc to close" : "Click the icon to stamp";
    document.documentElement.classList.toggle("stamped-active", state.active);
    updateSaveButton();
  }

  function notifyMode() {
    void chrome.runtime.sendMessage({ type: "stamped:mode", active: state.active });
  }

  function ensureBar() {
    if (state.bar) return;

    const bar = document.createElement("div");
    bar.className = "stamped-bar";

    const controls = document.createElement("div");
    controls.className = "stamped-controls";

    const count = document.createElement("span");
    count.className = "stamped-count";
    count.setAttribute("aria-live", "polite");

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.className = "stamped-save";
    saveButton.addEventListener("click", () => {
      saveTouched = true;
      saveEnabled = !saveEnabled;
      updateSaveButton();
      void chrome.runtime.sendMessage({ type: "stamped:set-saving", enabled: saveEnabled });
    });

    const galleryButton = document.createElement("button");
    galleryButton.type = "button";
    galleryButton.className = "stamped-gallery";
    galleryButton.textContent = "Gallery";
    galleryButton.addEventListener("click", () => {
      void chrome.runtime.sendMessage({ type: "stamped:open-gallery" });
    });

    const hint = document.createElement("span");
    hint.className = "stamped-hint";

    const status = document.createElement("span");
    status.className = "stamped-status";
    status.hidden = true;

    const thumbs = document.createElement("div");
    thumbs.className = "stamped-thumbs";

    controls.append(count, saveButton, galleryButton, hint, status);
    bar.append(controls, thumbs);
    document.documentElement.append(bar);

    state.bar = bar;
    state.count = count;
    state.hint = hint;
    state.saveButton = saveButton;
    state.status = status;
    state.thumbs = thumbs;
    void loadSettings();
  }

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
    item.className = "stamped-thumb";
    item.dataset.id = id;

    const img = document.createElement("img");
    img.src = image;
    img.alt = "Saved stamp";

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "stamped-thumb-delete";
    remove.setAttribute("aria-label", "Delete this screenshot");
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
        setStatus(response?.error || "Couldn't delete that stamp.");
        return;
      }
      item.remove();
      setStatus("Removed");
    } catch {
      setStatus("Couldn't delete that stamp.");
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
        setStatus(response?.error || "Couldn't save this stamp.");
        return;
      }
      const key = `stamped:shot:${response.id}`;
      const stored = await chrome.storage.local.get(key);
      if (!stored[key]) {
        setStatus("Couldn't save this stamp.");
        return;
      }
      addThumb(response.id, stored[key]);
      setStatus("Saved");
    } catch {
      setStatus("Couldn't save this stamp.");
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
