const INDEX_KEY = "stamped:index";
const SAVE_KEY = "stamped:saveEnabled";
const MAX_SHOTS = 100;

let galleryTabId = null;
let writeChain = Promise.resolve();

function imageKey(id) {
  return `stamped:shot:${id}`;
}

function hostnameOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function enqueue(task) {
  const run = writeChain.then(task, task);
  writeChain = run.then(
    () => {},
    () => {}
  );
  return run;
}

async function readIndex() {
  const stored = await chrome.storage.local.get(INDEX_KEY);
  const index = stored[INDEX_KEY];
  return Array.isArray(index) ? index : [];
}

async function saveCapture(tab, stampCount, pageUrl, pageTitle) {
  if (!tab?.windowId) {
    throw new Error("This page can't be captured.");
  }

  const options = { format: "jpeg", quality: 75 };
  let dataUrl;
  try {
    dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, options);
  } catch {
    try {
      dataUrl = await chrome.tabs.captureVisibleTab(options);
    } catch {
      // The icon click grants access to this tab until it navigates away, so a
      // failure here usually means the page changed under stamp mode.
      throw new Error("Click the Slop Stamp icon again to keep saving here.");
    }
  }
  const count = Number.isFinite(stampCount) ? Math.max(0, Math.floor(stampCount)) : 0;
  const url = pageUrl || tab.url || "";
  const record = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    pageUrl: url,
    pageTitle: pageTitle || tab.title || "",
    hostname: hostnameOf(url),
    stampCount: count,
  };

  return enqueue(async () => {
    const index = await readIndex();
    index.unshift(record);
    const removed = index.splice(MAX_SHOTS);
    await chrome.storage.local.set({
      [INDEX_KEY]: index,
      [imageKey(record.id)]: dataUrl,
    });
    if (removed.length > 0) {
      await chrome.storage.local.remove(removed.map((item) => imageKey(item.id)));
    }
    return record;
  });
}

async function deleteCaptures(ids) {
  const removeIds = Array.isArray(ids) ? ids.filter((id) => typeof id === "string") : [];
  if (removeIds.length === 0) return;
  return enqueue(async () => {
    const index = await readIndex();
    const remaining = index.filter((item) => !removeIds.includes(item.id));
    await chrome.storage.local.set({ [INDEX_KEY]: remaining });
    await chrome.storage.local.remove(removeIds.map(imageKey));
  });
}

async function getSaveEnabled() {
  const stored = await chrome.storage.local.get(SAVE_KEY);
  return stored[SAVE_KEY] !== false;
}

async function setBadge(tabId, active) {
  await chrome.action.setBadgeText({ tabId, text: active ? "ON" : "" });
  if (active) {
    await chrome.action.setBadgeBackgroundColor({ tabId, color: "#d63232" });
  }
}

async function openGallery() {
  const url = chrome.runtime.getURL("gallery.html");
  if (galleryTabId != null) {
    try {
      const existing = await chrome.tabs.get(galleryTabId);
      await chrome.tabs.update(existing.id, { active: true });
      if (existing.windowId != null) {
        await chrome.windows.update(existing.windowId, { focused: true });
      }
      return;
    } catch {
      galleryTabId = null;
    }
  }

  const created = await chrome.tabs.create({ url });
  galleryTabId = created.id ?? null;
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    const active = await toggleTab(tab.id);
    if (active === null) return;
    await setBadge(tab.id, active);
  } catch {
    // Restricted pages such as chrome:// cannot be stamped.
  }
});

function askToggle(tabId) {
  return chrome.tabs
    .sendMessage(tabId, { type: "stamped:toggle" })
    .then((response) => (typeof response?.active === "boolean" ? response.active : null))
    .catch(() => null);
}

async function toggleTab(tabId) {
  const existing = await askToggle(tabId);
  if (existing !== null) return existing;

  await chrome.scripting.insertCSS({
    target: { tabId },
    files: ["stamp.css"],
  });
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"],
  });
  return askToggle(tabId);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "stamped:capture") {
    saveCapture(sender.tab, message.stampCount, message.pageUrl, message.pageTitle)
      .then((record) => sendResponse({ ok: true, id: record.id, createdAt: record.createdAt }))
      .catch((error) => sendResponse({ ok: false, error: error?.message || "Couldn't capture this page." }));
    return true;
  }

  if (message?.type === "stamped:delete") {
    deleteCaptures(message.ids)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error?.message || "Couldn't delete that picture." }));
    return true;
  }

  if (message?.type === "stamped:get-settings") {
    getSaveEnabled()
      .then((saveEnabled) => sendResponse({ ok: true, saveEnabled }))
      .catch(() => sendResponse({ ok: true, saveEnabled: true }));
    return true;
  }

  if (message?.type === "stamped:set-saving") {
    chrome.storage.local
      .set({ [SAVE_KEY]: message.enabled !== false })
      .then(() => sendResponse({ ok: true, saveEnabled: message.enabled !== false }))
      .catch((error) => sendResponse({ ok: false, error: error?.message || "Couldn't update saving." }));
    return true;
  }

  if (message?.type === "stamped:mode" && sender.tab?.id) {
    setBadge(sender.tab.id, message.active === true)
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message?.type === "stamped:open-gallery") {
    openGallery()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error?.message || "Couldn't open the gallery." }));
    return true;
  }

  return false;
});
