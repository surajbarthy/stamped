const INDEX_KEY = "stamped:index";
const COMMUNITY_ORIGIN = "http://127.0.0.1:8787";

const grid = document.querySelector("#grid");
const status = document.querySelector("#status");
const statShots = document.querySelector("#stat-shots");
const statStamps = document.querySelector("#stat-stamps");
const statSites = document.querySelector("#stat-sites");
const modal = document.querySelector("#modal");
const modalImage = document.querySelector("#modal-image");
const modalTitle = document.querySelector("#modal-title");
const modalUrl = document.querySelector("#modal-url");
const modalMeta = document.querySelector("#modal-meta");

let shots = [];
let openId = null;

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

function stampLabel(count) {
  return count === 1 ? "1 stamp" : `${count} stamps`;
}

function setStatus(text) {
  status.hidden = !text;
  status.textContent = text;
}

async function loadShots() {
  const stored = await chrome.storage.local.get(INDEX_KEY);
  const index = Array.isArray(stored[INDEX_KEY]) ? stored[INDEX_KEY] : [];
  const images = index.length
    ? await chrome.storage.local.get(index.map((item) => imageKey(item.id)))
    : {};

  shots = index.map((item) => ({
    ...item,
    image: images[imageKey(item.id)] || "",
  }));
}

function renderStats() {
  const sites = new Set(shots.map((shot) => shot.hostname).filter(Boolean));
  statShots.textContent = String(shots.length);
  statStamps.textContent = String(shots.reduce((sum, shot) => sum + (shot.stampCount || 0), 0));
  statSites.textContent = String(sites.size);
}

function renderGrid() {
  grid.replaceChildren();
  if (shots.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No screenshots yet. Stamp a page and it saves here. Delete a thumbnail on the page if you don't want to keep that one.";
    grid.append(empty);
    return;
  }

  for (const shot of shots) {
    const card = document.createElement("figure");
    card.className = "shot";

    const image = document.createElement("img");
    image.src = shot.image;
    image.alt = shot.pageTitle || shot.hostname || "Stamped page";

    const caption = document.createElement("figcaption");
    const title = document.createElement("strong");
    title.textContent = shot.hostname || shot.pageTitle || "Untitled page";
    const meta = document.createElement("p");
    meta.textContent = `${stampLabel(shot.stampCount || 0)} · ${formatWhen(shot.createdAt)}`;
    caption.append(title, meta);

    const actions = document.createElement("div");
    actions.className = "shot-actions";
    actions.append(
      actionButton("Download", () => downloadShot(shot)),
      actionButton("Community", () => shareCommunity(shot)),
      actionButton("Share", () => shareSystem(shot))
    );

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "shot-delete";
    remove.textContent = "Delete";
    remove.addEventListener("click", (event) => {
      event.stopPropagation();
      void deleteShots([shot.id]);
    });

    card.append(image, caption, actions, remove);
    card.addEventListener("click", () => openModal(shot.id));
    grid.append(card);
  }
}

function openModal(id) {
  const shot = shots.find((item) => item.id === id);
  if (!shot) return;
  openId = id;
  modalImage.src = shot.image;
  modalImage.alt = shot.pageTitle || shot.hostname || "Stamped page";
  modalTitle.textContent = shot.pageTitle || shot.hostname || "Untitled page";
  modalUrl.textContent = shot.pageUrl || "";
  modalMeta.textContent = `${stampLabel(shot.stampCount || 0)} · ${formatWhen(shot.createdAt)}`;
  modal.hidden = false;
}

function closeModal() {
  openId = null;
  modal.hidden = true;
  modalImage.removeAttribute("src");
}

function currentShot() {
  return shots.find((item) => item.id === openId) || null;
}

function actionButton(label, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    void onClick();
  });
  return button;
}

function downloadShot(shot) {
  const link = document.createElement("a");
  link.href = shot.image;
  const extension = String(shot.image).startsWith("data:image/jpeg") ? "jpg" : "png";
  link.download = `ai-slop-${shot.createdAt}.${extension}`;
  link.click();
}

async function shareCommunity(shot) {
  try {
    const response = await fetch(`${COMMUNITY_ORIGIN}/api/stamps`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        createdAt: shot.createdAt,
        image: shot.image,
      }),
    });
    if (!response.ok) throw new Error("Couldn't share to the community gallery.");
    setStatus("Shared. The community only gets the picture and the time.");
  } catch {
    setStatus("Couldn't reach the community gallery. Open the site and try again.");
  }
}

async function shareSystem(shot) {
  const blob = await (await fetch(shot.image)).blob();
  const file = new File([blob], `ai-slop-${shot.createdAt}.png`, { type: blob.type || "image/png" });
  try {
    if (navigator.share) {
      const payload = { files: [file] };
      if (!navigator.canShare || navigator.canShare(payload)) {
        await navigator.share(payload);
        return;
      }
    }
    await navigator.clipboard.write([new ClipboardItem({ [file.type]: blob })]);
    setStatus("Copied the image.");
  } catch (error) {
    if (error?.name === "AbortError") return;
    downloadShot(shot);
  }
}

async function deleteShots(ids) {
  const stored = await chrome.storage.local.get(INDEX_KEY);
  const index = Array.isArray(stored[INDEX_KEY]) ? stored[INDEX_KEY] : [];
  const remaining = index.filter((item) => !ids.includes(item.id));
  await chrome.storage.local.set({ [INDEX_KEY]: remaining });
  await chrome.storage.local.remove(ids.map(imageKey));
  if (openId && ids.includes(openId)) closeModal();
}

async function refresh() {
  try {
    await loadShots();
    renderStats();
    renderGrid();
    setStatus("");
    if (openId && !shots.some((shot) => shot.id === openId)) closeModal();
  } catch (error) {
    setStatus(error?.message || "Couldn't load the gallery.");
  }
}

document.querySelector("#export").addEventListener("click", async () => {
  const payload = shots.map((shot) => ({
    id: shot.id,
    createdAt: shot.createdAt,
    pageUrl: shot.pageUrl,
    pageTitle: shot.pageTitle,
    hostname: shot.hostname,
    stampCount: shot.stampCount,
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
  } catch (error) {
    setStatus(error?.message || "Couldn't export.");
  }
});

document.querySelector("#delete-all").addEventListener("click", () => {
  if (shots.length === 0) return;
  if (!window.confirm("Delete all screenshots? This cannot be undone.")) return;
  void deleteShots(shots.map((shot) => shot.id));
});

document.querySelector("#modal-close").addEventListener("click", closeModal);
document.querySelector("#modal-delete").addEventListener("click", () => {
  if (openId) void deleteShots([openId]);
});
document.querySelector("#modal-download").addEventListener("click", () => {
  const shot = currentShot();
  if (shot) downloadShot(shot);
});
document.querySelector("#modal-community").addEventListener("click", () => {
  const shot = currentShot();
  if (shot) void shareCommunity(shot);
});
document.querySelector("#modal-share").addEventListener("click", () => {
  const shot = currentShot();
  if (shot) void shareSystem(shot);
});
document.querySelector(".modal-backdrop").addEventListener("click", closeModal);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !modal.hidden) closeModal();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[INDEX_KEY]) void refresh();
});

void refresh();
