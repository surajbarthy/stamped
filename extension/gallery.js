const INDEX_KEY = "stamped:index";
const COMMUNITY_ORIGIN = "http://127.0.0.1:8787";

const grid = document.querySelector("#grid");
const summary = document.querySelector("#summary");
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
const postConfirm = document.querySelector("#post-confirm");
const postYes = document.querySelector("#post-yes");
const deleteButton = document.querySelector("#delete");
const deleteConfirm = document.querySelector("#delete-confirm");
const toast = document.querySelector("#toast");

let shots = [];
let openId = null;
let toastTimer = null;
const posting = new Set();

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
  postConfirm.hidden = true;
  deleteConfirm.hidden = true;
  deleteButton.hidden = false;
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
  if (shot.sharedAt) {
    postButton.textContent = `On the wall since ${formatWhen(shot.sharedAt)}`;
    postButton.disabled = true;
    postConfirm.hidden = true;
  } else {
    postButton.textContent = isPosting ? "Posting…" : "Post to the wall";
    postButton.disabled = isPosting;
  }
  postButton.hidden = !postConfirm.hidden;
  postYes.disabled = isPosting;
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

async function markShared(id, sharedAt) {
  const index = await readIndex();
  await chrome.storage.local.set({
    [INDEX_KEY]: index.map((item) => (item.id === id ? { ...item, sharedAt } : item)),
  });
}

async function postToWall(shot) {
  if (shot.sharedAt || posting.has(shot.id)) return;
  posting.add(shot.id);
  renderViewer();
  try {
    const response = await fetch(`${COMMUNITY_ORIGIN}/api/stamps`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        createdAt: shot.createdAt,
        image: shot.image,
      }),
    });
    if (!response.ok) throw new Error("Couldn't post to the wall.");
    posting.delete(shot.id);
    postConfirm.hidden = true;
    await markShared(shot.id, Date.now());
    showToast("Posted. The wall shows the picture and the time.");
  } catch {
    posting.delete(shot.id);
    renderViewer();
    showToast("Couldn't reach the wall. Check that the Slop Stamp site is running, then try again.");
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
  postConfirm.hidden = false;
  postButton.hidden = true;
  postYes.focus();
});
document.querySelector("#post-no").addEventListener("click", () => {
  postConfirm.hidden = true;
  postButton.hidden = false;
  postButton.focus();
});
postYes.addEventListener("click", () => {
  const shot = currentShot();
  if (shot) void postToWall(shot);
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

void refresh();
