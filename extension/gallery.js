const INDEX_KEY = "stamped:index";
// COMMUNITY_ORIGIN comes from config.js.
const MAX_POST_CHARS = 5_200_000;

const grid = document.querySelector("#grid");
const summary = document.querySelector("#summary");
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

let shots = [];
let openId = null;
let toastTimer = null;
const posting = new Set();
const AGREED_KEY = "stamped:wall-rules-agreed";

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

function showToast(text) {
  window.clearTimeout(toastTimer);
  toast.textContent = text;
  toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 3200);
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

  shots = index.map((item) => ({
    ...item,
    image: images[imageKey(item.id)] || "",
  }));
}

function renderSummary() {
  tally.textContent = plural(shots.length, "picture");
  if (shots.length === 0) {
    summary.textContent = "Saved stamps live on this browser.";
    return;
  }
  const sites = new Set(shots.map((shot) => shot.hostname).filter(Boolean)).size;
  const stamps = shots.reduce((sum, shot) => sum + (shot.stampCount || 0), 0);
  summary.textContent = `${plural(shots.length, "picture")} from ${plural(sites, "site")}, with ${plural(stamps, "stamp")} between them. All of it lives on this browser.`;
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
    if (shot.sharedAt) {
      const tag = document.createElement("span");
      tag.className = "tile-tag";
      tag.textContent = "On the wall";
      frame.append(tag);
    }

    const caption = document.createElement("span");
    caption.className = "tile-caption";
    const title = document.createElement("strong");
    title.textContent = shot.hostname || shot.pageTitle || "Untitled page";
    const meta = document.createElement("span");
    meta.textContent = `${plural(shot.stampCount || 0, "stamp")} · ${formatWhen(shot.createdAt)}`;
    caption.append(title, meta);

    tile.setAttribute("aria-label", `${title.textContent}, ${meta.textContent}${shot.sharedAt ? ", on the wall" : ""}`);
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
  viewerImg.alt = `Screenshot of ${shot.pageTitle || shot.hostname || "a stamped page"}`;
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
    postButton.textContent = `Posted ${formatWhen(shot.sharedAt)}`;
    postButton.disabled = true;
  } else {
    postButton.textContent = isPosting ? "Posting…" : "Post to the wall";
    postButton.disabled = isPosting || !postAgree.checked;
  }
  unpostButton.hidden = !posted || !shot.wallId || !unpostConfirm.hidden;
  if (!posted) unpostConfirm.hidden = true;
  deleteQuestion.textContent = shot.sharedAt
    ? "Delete this picture from the gallery? It stays on the wall, and you won't be able to remove it from here afterwards."
    : "Delete this picture from the gallery?";
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
    await updateRecord(shot.id, { sharedAt: Date.now(), wallId: result.id, wallDeleteToken: result.deleteToken });
    showToast(
      result.status === "pending"
        ? "Sent. It shows on the wall once a person checks it."
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
    if (!response.ok) throw await errorFrom(response, "Couldn't remove it from the wall.");
    unpostConfirm.hidden = true;
    await updateRecord(shot.id, { sharedAt: undefined, wallId: undefined, wallDeleteToken: undefined });
    showToast("Removed from the wall.");
  } catch (error) {
    showToast(error?.message || "Couldn't remove it from the wall.");
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
    showToast("Exported a backup. It includes page addresses, so keep it to yourself.");
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

deleteButton.addEventListener("click", () => {
  deleteButton.hidden = true;
  deleteConfirm.hidden = false;
  document.querySelector("#delete-no").focus();
});
document.querySelector("#delete-no").addEventListener("click", () => {
  deleteConfirm.hidden = true;
  deleteButton.hidden = false;
  deleteButton.focus();
});
document.querySelector("#delete-yes").addEventListener("click", async () => {
  if (!openId) return;
  const index = shots.findIndex((item) => item.id === openId);
  const next = shots[index + 1] || shots[index - 1];
  const removed = openId;
  if (next) openViewer(next.id);
  else closeViewer();
  await deleteShots([removed]);
  showToast("Deleted.");
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
viewer.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") step(-1);
  if (event.key === "ArrowRight") step(1);
});
viewer.addEventListener("close", () => {
  const tile = grid.querySelector(`[data-id="${CSS.escape(openId || "")}"]`);
  openId = null;
  viewerImg.removeAttribute("src");
  if (tile instanceof HTMLElement) tile.focus();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[INDEX_KEY]) void refresh();
});

document.querySelector("#community-link").href = `${COMMUNITY_ORIGIN}/community.html`;
document.querySelector("#rules-link").href = `${COMMUNITY_ORIGIN}/rules.html`;
try {
  postAgree.checked = localStorage.getItem(AGREED_KEY) === "1";
} catch {}

void refresh();
