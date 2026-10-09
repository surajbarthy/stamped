const INDEX_KEY = "stamped:index";
// COMMUNITY_ORIGIN comes from config.js.
const MAX_POST_CHARS = 5_200_000;

const grid = document.querySelector("#grid");
const tally = document.querySelector("#tally");
const tools = document.querySelector("#tools");
const deleteAllConfirm = document.querySelector("#delete-all-confirm");
const deleteAllQuestion = document.querySelector("#delete-all-question");
const viewer = document.querySelector("#viewer");
const viewerImg = document.querySelector("#viewer-img");
const viewerTitle = document.querySelector("#viewer-title");
const viewerUrl = document.querySelector("#viewer-url");
const viewerMeta = document.querySelector("#viewer-meta");
const viewerCount = document.querySelector("#viewer-count");
const postButton = document.querySelector("#post");
const postAgree = document.querySelector("#post-agree");
const postNote = document.querySelector("#post-note");
const coverTools = document.querySelector("#cover-tools");
const deleteButton = document.querySelector("#delete");
const deleteConfirm = document.querySelector("#delete-confirm");
const deleteQuestion = document.querySelector("#delete-question");
const unpostButton = document.querySelector("#unpost");
const unpostConfirm = document.querySelector("#unpost-confirm");
const unpostYes = document.querySelector("#unpost-yes");
const stage = document.querySelector("#viewer-stage");
const coverCanvas = document.querySelector("#cover-canvas");
const coverCount = document.querySelector("#cover-count");
const coverUndo = document.querySelector("#cover-undo");
const toast = document.querySelector("#toast");
const notPostedNote = document.querySelector("#not-posted");

let shots = [];
let openId = null;
let toastTimer = null;
const posting = new Set();
const AGREED_KEY = "stamped:wall-rules-agreed";

// Where each posted picture stands on the wall, checked with the post's own key.
const wallStatus = new Map();
const STATUS_LABELS = {
  pending: "Waiting for review",
  published: "On the wall",
  hidden: "Hidden while we check a report",
};
let lastStatusCheck = 0;

// Deleting waits a few seconds so it can be undone.
const UNDO_MS = 5000;
const pendingDeletes = new Map();

// Covers are boxes in 0..1 image coordinates, so they survive resizes.
let covers = [];
let drag = null;

function imageKey(id) {
  return `stamped:shot:${id}`;
}

function formatWhen(timestamp) {
  return new Date(timestamp).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

// While the picture viewer (a modal dialog) is open, the rest of the page
// can't be clicked, so the status bar moves inside it to keep Undo usable.
function hideToast() {
  toast.classList.remove("is-visible");
}

function showToast(text, action) {
  window.clearTimeout(toastTimer);
  toast.replaceChildren(text);
  if (action) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "link-btn toast-action";
    button.textContent = action.label;
    button.addEventListener("click", () => {
      window.clearTimeout(toastTimer);
      hideToast();
      action.run();
    });
    toast.append(" ", button);
  }
  const home = viewer.open ? viewer : document.body;
  if (toast.parentElement !== home) home.append(toast);
  requestAnimationFrame(() => toast.classList.add("is-visible"));
  toastTimer = window.setTimeout(hideToast, action ? UNDO_MS : 3200);
}

function statusLabel(shot) {
  return STATUS_LABELS[wallStatus.get(shot.id)] || "Posted";
}

async function checkWallStatuses() {
  if (Date.now() - lastStatusCheck < 10_000) return;
  lastStatusCheck = Date.now();
  const posted = shots.filter((shot) => shot.wallId && shot.wallDeleteToken);
  await Promise.all(
    posted.map(async (shot) => {
      let response;
      try {
        response = await fetch(`${COMMUNITY_ORIGIN}/api/stamps/${encodeURIComponent(shot.wallId)}/status`, {
          headers: { Authorization: `Bearer ${shot.wallDeleteToken}` },
        });
      } catch {
        return;
      }
      if (response.status === 404) {
        // Turned down or deleted: free the picture so it can be posted again.
        wallStatus.delete(shot.id);
        await updateRecord(shot.id, { sharedAt: undefined, wallId: undefined, wallDeleteToken: undefined, notPosted: true });
        return;
      }
      if (!response.ok) return;
      const payload = await response.json().catch(() => null);
      if (payload?.status) wallStatus.set(shot.id, payload.status);
    })
  );
  renderGrid();
  if (viewer.open) renderViewer();
}

async function readIndex() {
  const stored = await chrome.storage.local.get(INDEX_KEY);
  return Array.isArray(stored[INDEX_KEY]) ? stored[INDEX_KEY] : [];
}

async function loadShots() {
  const index = await readIndex();
  const images = index.length
    ? await chrome.storage.local.get(index.map((item) => imageKey(item.id)))
    : {};

  shots = index
    .filter((item) => !pendingDeletes.has(item.id))
    .map((item) => ({
      ...item,
      image: images[imageKey(item.id)] || "",
    }));
}

function setStat(id, count, word) {
  document.querySelector(`#${id}`).textContent = String(count);
  document.querySelector(`#${id}-label`).textContent = count === 1 ? word : `${word}s`;
}

function renderSummary() {
  tally.textContent = plural(shots.length, "picture");
  const sites = new Set(shots.map((shot) => shot.hostname).filter(Boolean)).size;
  const stamps = shots.reduce((sum, shot) => sum + (shot.stampCount || 0), 0);
  setStat("stat-shots", shots.length, "picture");
  setStat("stat-sites", sites, "site");
  setStat("stat-stamps", stamps, "stamp");
}

function renderGrid() {
  grid.replaceChildren();
  tools.hidden = shots.length === 0;
  if (shots.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    const lead = document.createElement("p");
    lead.className = "empty-lead";
    lead.textContent = "Nothing saved yet.";
    const how = document.createElement("p");
    how.textContent = "Click the Slop Stamp icon on any page, then click the slop. Each stamp saves a picture here.";
    empty.append(lead, how);
    grid.append(empty);
    return;
  }

  for (const shot of shots) {
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "tile";
    tile.dataset.id = shot.id;

    const frame = document.createElement("span");
    frame.className = "tile-frame";
    const image = document.createElement("img");
    image.src = shot.image;
    image.alt = "";
    image.decoding = "async";
    frame.append(image);
    const tagText = shot.sharedAt ? statusLabel(shot) : shot.notPosted ? "Not posted" : "";
    if (tagText) {
      const tag = document.createElement("span");
      tag.className = "tile-tag";
      tag.textContent = tagText;
      frame.append(tag);
    }

    const caption = document.createElement("span");
    caption.className = "tile-caption";
    const title = document.createElement("strong");
    title.textContent = shot.hostname || shot.pageTitle || "Untitled page";
    const meta = document.createElement("span");
    meta.textContent = `${plural(shot.stampCount || 0, "stamp")} · ${formatWhen(shot.createdAt)}`;
    caption.append(title, meta);

    tile.setAttribute("aria-label", `${title.textContent}, ${meta.textContent}${tagText ? `, ${tagText.toLowerCase()}` : ""}`);
    tile.append(frame, caption);
    tile.addEventListener("click", () => openViewer(shot.id));
    grid.append(tile);
  }
}

function resetConfirms() {
  unpostConfirm.hidden = true;
  deleteConfirm.hidden = true;
  deleteButton.hidden = false;
  clearCovers();
}

// Cover-up editor: on any picture not yet posted, drag boxes over it to
// black them out in the posted copy.

function clearCovers() {
  covers = [];
  drag = null;
  drawCovers();
}

function placeCanvas() {
  if (coverCanvas.hidden) return;
  const box = viewerImg.getBoundingClientRect();
  const host = stage.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  coverCanvas.style.left = `${box.left - host.left}px`;
  coverCanvas.style.top = `${box.top - host.top}px`;
  coverCanvas.style.width = `${box.width}px`;
  coverCanvas.style.height = `${box.height}px`;
  coverCanvas.width = Math.round(box.width * ratio);
  coverCanvas.height = Math.round(box.height * ratio);
  drawCovers();
}

function normalizedBox(a, b) {
  const x = Math.max(0, Math.min(a.x, b.x));
  const y = Math.max(0, Math.min(a.y, b.y));
  return { x, y, w: Math.min(1, Math.max(a.x, b.x)) - x, h: Math.min(1, Math.max(a.y, b.y)) - y };
}

function drawCovers() {
  const context = coverCanvas.getContext("2d");
  const { width, height } = coverCanvas;
  context.clearRect(0, 0, width, height);
  const boxes = drag ? [...covers, normalizedBox(drag.from, drag.to)] : covers;
  for (const box of boxes) {
    context.fillStyle = "#111111";
    context.fillRect(box.x * width, box.y * height, box.w * width, box.h * height);
    context.strokeStyle = "#e10600";
    context.lineWidth = 2 * (window.devicePixelRatio || 1);
    context.strokeRect(box.x * width, box.y * height, box.w * width, box.h * height);
  }
  coverCount.textContent = covers.length === 0 ? "Nothing covered yet." : `${plural(covers.length, "spot")} covered.`;
  coverCount.classList.toggle("is-empty", covers.length === 0);
  coverUndo.disabled = covers.length === 0;
}

function pointFrom(event) {
  const box = coverCanvas.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)),
    y: Math.max(0, Math.min(1, (event.clientY - box.top) / box.height)),
  };
}

coverCanvas.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  coverCanvas.setPointerCapture(event.pointerId);
  const point = pointFrom(event);
  drag = { from: point, to: point };
});
coverCanvas.addEventListener("pointermove", (event) => {
  if (!drag) return;
  drag.to = pointFrom(event);
  drawCovers();
});
coverCanvas.addEventListener("pointerup", (event) => {
  if (!drag) return;
  drag.to = pointFrom(event);
  const box = normalizedBox(drag.from, drag.to);
  drag = null;
  if (box.w > 0.004 && box.h > 0.004) covers.push(box);
  drawCovers();
});
coverCanvas.addEventListener("pointercancel", () => {
  drag = null;
  drawCovers();
});
coverUndo.addEventListener("click", () => {
  covers.pop();
  drawCovers();
});
new ResizeObserver(() => placeCanvas()).observe(stage);
viewerImg.addEventListener("load", () => placeCanvas());

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Couldn't read that picture."));
    image.src = src;
  });
}

// Redraws the picture with the covers burned in. Re-encoding also leaves any
// file metadata behind. Big screenshots are scaled down until they fit the wall.
async function composePost(shot) {
  const image = await loadImage(shot.image);
  let scale = 1;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    context.fillStyle = "#111111";
    for (const box of covers) {
      context.fillRect(
        Math.floor(box.x * canvas.width),
        Math.floor(box.y * canvas.height),
        Math.ceil(box.w * canvas.width),
        Math.ceil(box.h * canvas.height)
      );
    }
    const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
    if (dataUrl.length <= MAX_POST_CHARS) return dataUrl;
    scale *= 0.75;
  }
  throw new Error("That picture is too big for the wall.");
}

function renderViewer() {
  const index = shots.findIndex((item) => item.id === openId);
  const shot = shots[index];
  if (!shot) return;

  viewerImg.src = shot.image;
  viewerImg.alt = `Picture of ${shot.pageTitle || shot.hostname || "a stamped page"}`;
  viewerTitle.textContent = shot.pageTitle || shot.hostname || "Untitled page";
  viewerUrl.textContent = shot.pageUrl || "";
  viewerUrl.hidden = !shot.pageUrl;
  if (shot.pageUrl) viewerUrl.href = shot.pageUrl;
  viewerMeta.textContent = `${plural(shot.stampCount || 0, "stamp")} · ${formatWhen(shot.createdAt)}`;
  viewerCount.textContent = `${index + 1} of ${shots.length}`;

  const isPosting = posting.has(shot.id);
  const posted = Boolean(shot.sharedAt);
  coverCanvas.hidden = posted;
  coverTools.hidden = posted;
  postNote.hidden = posted;
  if (!posted) placeCanvas();
  if (posted) {
    postButton.textContent = `${statusLabel(shot)} · posted ${formatWhen(shot.sharedAt)}`;
    postButton.disabled = true;
  } else {
    postButton.textContent = isPosting ? "Posting…" : "Post to the wall";
    postButton.disabled = isPosting || !postAgree.checked;
  }
  notPostedNote.hidden = posted || !shot.notPosted;
  unpostButton.hidden = !posted || !shot.wallId || !unpostConfirm.hidden;
  if (!posted) unpostConfirm.hidden = true;
  deleteQuestion.textContent =
    "Delete this picture from the gallery? It stays on the wall, and you won't be able to take it down from here afterwards.";
}

function openViewer(id) {
  openId = id;
  resetConfirms();
  renderViewer();
  if (!viewer.open) viewer.showModal();
}

function step(offset) {
  const index = shots.findIndex((item) => item.id === openId);
  if (index === -1 || shots.length === 0) return;
  openViewer(shots[(index + offset + shots.length) % shots.length].id);
}

function closeViewer() {
  if (viewer.open) viewer.close();
}

function currentShot() {
  return shots.find((item) => item.id === openId) || null;
}

function extensionFor(shot) {
  return String(shot.image).startsWith("data:image/jpeg") ? "jpg" : "png";
}

function downloadShot(shot) {
  const link = document.createElement("a");
  link.href = shot.image;
  link.download = `ai-slop-${shot.createdAt}.${extensionFor(shot)}`;
  link.click();
}

async function updateRecord(id, changes) {
  const index = await readIndex();
  await chrome.storage.local.set({
    [INDEX_KEY]: index.map((item) => {
      if (item.id !== id) return item;
      const next = { ...item, ...changes };
      for (const key of Object.keys(changes)) if (changes[key] === undefined) delete next[key];
      return next;
    }),
  });
}

async function errorFrom(response, fallback) {
  const payload = await response.json().catch(() => null);
  return new Error(payload?.error || fallback);
}

async function postToWall(shot) {
  if (shot.sharedAt || posting.has(shot.id)) return;
  posting.add(shot.id);
  renderViewer();
  try {
    const image = await composePost(shot);
    let response;
    try {
      response = await fetch(`${COMMUNITY_ORIGIN}/api/stamps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ createdAt: shot.createdAt, image }),
      });
    } catch {
      throw new Error("Couldn't reach the wall. Check your connection, then try again.");
    }
    if (!response.ok) throw await errorFrom(response, "Couldn't post to the wall.");
    const result = await response.json();
    posting.delete(shot.id);
    clearCovers();
    wallStatus.set(shot.id, result.status);
    await updateRecord(shot.id, { sharedAt: Date.now(), wallId: result.id, wallDeleteToken: result.deleteToken, notPosted: undefined });
    showToast(
      result.status === "pending"
        ? "Posted. It shows on the wall once a person checks it."
        : "Posted. The wall shows the picture and the time."
    );
  } catch (error) {
    posting.delete(shot.id);
    renderViewer();
    showToast(error?.message || "Couldn't post to the wall.");
  }
}

async function removeFromWall(shot) {
  if (!shot.wallId || !shot.wallDeleteToken) return;
  unpostYes.disabled = true;
  try {
    let response;
    try {
      response = await fetch(`${COMMUNITY_ORIGIN}/api/stamps/${encodeURIComponent(shot.wallId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${shot.wallDeleteToken}` },
      });
    } catch {
      throw new Error("Couldn't reach the wall. Check your connection, then try again.");
    }
    if (!response.ok) throw await errorFrom(response, "Couldn't take it down from the wall.");
    unpostConfirm.hidden = true;
    await updateRecord(shot.id, { sharedAt: undefined, wallId: undefined, wallDeleteToken: undefined });
    showToast("Taken down from the wall.");
  } catch (error) {
    showToast(error?.message || "Couldn't take it down from the wall.");
  } finally {
    unpostYes.disabled = false;
  }
}

async function shareSystem(shot) {
  const blob = await (await fetch(shot.image)).blob();
  const file = new File([blob], `ai-slop-${shot.createdAt}.${extensionFor(shot)}`, { type: blob.type || "image/png" });
  try {
    if (navigator.share) {
      const payload = { files: [file] };
      if (!navigator.canShare || navigator.canShare(payload)) {
        await navigator.share(payload);
        return;
      }
    }
    await navigator.clipboard.write([new ClipboardItem({ [file.type]: blob })]);
    showToast("Copied the picture.");
  } catch (error) {
    if (error?.name === "AbortError") return;
    downloadShot(shot);
    showToast("Sharing isn't available here, so the picture downloaded instead.");
  }
}

async function deleteShots(ids) {
  const index = await readIndex();
  const remaining = index.filter((item) => !ids.includes(item.id));
  await chrome.storage.local.set({ [INDEX_KEY]: remaining });
  await chrome.storage.local.remove(ids.map(imageKey));
}

async function refresh() {
  try {
    await loadShots();
    renderSummary();
    renderGrid();
    if (openId && !currentShot()) {
      closeViewer();
    } else if (viewer.open) {
      renderViewer();
    }
  } catch (error) {
    showToast(error?.message || "Couldn't load the gallery.");
  }
}

document.querySelector("#export").addEventListener("click", () => {
  const payload = shots.map((shot) => ({
    id: shot.id,
    createdAt: shot.createdAt,
    pageUrl: shot.pageUrl,
    pageTitle: shot.pageTitle,
    hostname: shot.hostname,
    stampCount: shot.stampCount,
    sharedAt: shot.sharedAt,
    image: shot.image,
  }));
  try {
    const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const day = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `stamped-${day}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    showToast("Downloaded every picture in one file. It includes page addresses, so keep it to yourself.");
  } catch (error) {
    showToast(error?.message || "Couldn't export.");
  }
});

document.querySelector("#delete-all").addEventListener("click", () => {
  if (shots.length === 0) return;
  deleteAllQuestion.textContent = `Delete all ${plural(shots.length, "picture")}? This can't be undone.`;
  tools.hidden = true;
  deleteAllConfirm.hidden = false;
  document.querySelector("#delete-all-no").focus();
});
document.querySelector("#delete-all-no").addEventListener("click", () => {
  deleteAllConfirm.hidden = true;
  tools.hidden = false;
});
document.querySelector("#delete-all-yes").addEventListener("click", async () => {
  await deleteShots(shots.map((shot) => shot.id));
  deleteAllConfirm.hidden = true;
  showToast("Deleted every saved picture.");
});

postButton.addEventListener("click", () => {
  const shot = currentShot();
  if (shot) void postToWall(shot);
});
postAgree.addEventListener("change", () => {
  try {
    if (postAgree.checked) localStorage.setItem(AGREED_KEY, "1");
    else localStorage.removeItem(AGREED_KEY);
  } catch {}
  renderViewer();
});
unpostButton.addEventListener("click", () => {
  unpostConfirm.hidden = false;
  unpostButton.hidden = true;
  document.querySelector("#unpost-no").focus();
});
document.querySelector("#unpost-no").addEventListener("click", () => {
  unpostConfirm.hidden = true;
  unpostButton.hidden = false;
  unpostButton.focus();
});
unpostYes.addEventListener("click", () => {
  const shot = currentShot();
  if (shot) void removeFromWall(shot);
});

function deleteWithUndo(id) {
  const index = shots.findIndex((item) => item.id === id);
  const next = shots[index + 1] || shots[index - 1];
  const timer = window.setTimeout(() => {
    pendingDeletes.delete(id);
    void deleteShots([id]);
  }, UNDO_MS);
  pendingDeletes.set(id, timer);
  if (next) openViewer(next.id);
  else closeViewer();
  window.addEventListener("focus", () => void checkWallStatuses());
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") void checkWallStatuses();
});

void refresh().then(() => checkWallStatuses());
  showToast("Deleted.", {
    label: "Undo",
    run: () => {
      window.clearTimeout(pendingDeletes.get(id));
      pendingDeletes.delete(id);
      void refresh();
    },
  });
}

// Finish any waiting deletes if the gallery closes before Undo runs out.
window.addEventListener("pagehide", () => {
  if (pendingDeletes.size === 0) return;
  const ids = [...pendingDeletes.keys()];
  pendingDeletes.clear();
  void deleteShots(ids);
});

deleteButton.addEventListener("click", () => {
  const shot = currentShot();
  if (!shot) return;
  // A posted picture can only be taken down from here, so ask first.
  if (!shot.sharedAt) {
    deleteWithUndo(shot.id);
    return;
  }
  deleteButton.hidden = true;
  deleteConfirm.hidden = false;
  document.querySelector("#delete-no").focus();
});
document.querySelector("#delete-no").addEventListener("click", () => {
  deleteConfirm.hidden = true;
  deleteButton.hidden = false;
  deleteButton.focus();
});
document.querySelector("#delete-yes").addEventListener("click", () => {
  if (openId) deleteWithUndo(openId);
});

document.querySelector("#download").addEventListener("click", () => {
  const shot = currentShot();
  if (shot) downloadShot(shot);
});
document.querySelector("#share").addEventListener("click", () => {
  const shot = currentShot();
  if (shot) void shareSystem(shot);
});

document.querySelector("#viewer-close").addEventListener("click", closeViewer);
document.querySelector("#viewer-prev").addEventListener("click", () => step(-1));
document.querySelector("#viewer-next").addEventListener("click", () => step(1));
viewer.addEventListener("click", (event) => {
  if (event.target === viewer) closeViewer();
});
// Arrow keys flip pictures. Listen on the whole page: clicking the picture
// leaves nothing focused inside the viewer, and keys then go to the body.
function typingIn(target) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target instanceof HTMLTextAreaElement) return true;
  return target instanceof HTMLInputElement && !["checkbox", "radio", "button"].includes(target.type);
}
document.addEventListener("keydown", (event) => {
  if (!viewer.open || drag || typingIn(event.target)) return;
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  const offset = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
  if (!offset) return;
  event.preventDefault();
  step(offset);
});
viewer.addEventListener("close", () => {
  if (toast.parentElement === viewer) document.body.append(toast);
  const tile = grid.querySelector(`[data-id="${CSS.escape(openId || "")}"]`);
  openId = null;
  viewerImg.removeAttribute("src");
  if (tile instanceof HTMLElement) tile.focus();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[INDEX_KEY]) void refresh();
});

document.querySelector("#wall-link").href = `${COMMUNITY_ORIGIN}/wall`;
document.querySelector("#rules-link").href = `${COMMUNITY_ORIGIN}/rules.html`;
try {
  postAgree.checked = localStorage.getItem(AGREED_KEY) === "1";
} catch {}

void refresh();
