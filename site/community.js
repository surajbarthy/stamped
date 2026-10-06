const grid = document.querySelector("#grid");
const note = document.querySelector("#note");
const shuffleButton = document.querySelector("#shuffle");
const viewer = document.querySelector("#viewer");
const viewerImage = document.querySelector("#viewer-image");
const viewerTime = document.querySelector("#viewer-time");
const viewerCount = document.querySelector("#viewer-count");
const tally = document.querySelector("#tally");
const reportButton = document.querySelector("#viewer-report");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

let stamps = [];
let openIndex = -1;
const reported = new Set();

function formatWhen(timestamp) {
  return new Date(timestamp).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function shuffle(items) {
  const next = items.slice();
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [next[index], next[swap]] = [next[swap], next[index]];
  }
  return next;
}

function isSample(stamp) {
  return String(stamp.id).startsWith("sample-");
}

function renderSkeleton() {
  grid.replaceChildren();
  for (let index = 0; index < 6; index += 1) {
    const block = document.createElement("div");
    block.className = "tile tile-skeleton";
    grid.append(block);
  }
}

function renderMessage(text, action) {
  grid.replaceChildren();
  const box = document.createElement("div");
  box.className = "wall-message";
  const copy = document.createElement("p");
  copy.textContent = text;
  box.append(copy);
  if (action) box.append(action);
  grid.append(box);
}

function render(items) {
  grid.setAttribute("aria-busy", "false");
  if (items.length === 0) {
    renderMessage("Nothing on the wall yet. Stamp a page, open your gallery, and post one.");
    return;
  }

  grid.replaceChildren();
  items.forEach((stamp, index) => {
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "tile";
    tile.style.viewTransitionName = `stamp-${String(stamp.id).replace(/[^a-zA-Z0-9-]/g, "")}`;
    tile.setAttribute("aria-label", `Open the picture stamped ${formatWhen(stamp.createdAt)}`);

    const frame = document.createElement("span");
    frame.className = "tile-frame";
    const image = document.createElement("img");
    image.src = stamp.image;
    image.alt = "";
    image.width = 1600;
    image.height = 1000;
    image.loading = index < 4 ? "eager" : "lazy";
    image.decoding = "async";
    frame.append(image);

    const time = document.createElement("time");
    time.dateTime = new Date(stamp.createdAt).toISOString();
    time.textContent = isSample(stamp) ? `Sample · ${formatWhen(stamp.createdAt)}` : formatWhen(stamp.createdAt);

    tile.append(frame, time);
    tile.addEventListener("click", () => openViewer(index));
    grid.append(tile);
  });
}

function showInViewer(index) {
  openIndex = (index + stamps.length) % stamps.length;
  const stamp = stamps[openIndex];
  viewerImage.src = stamp.image;
  viewerTime.dateTime = new Date(stamp.createdAt).toISOString();
  viewerTime.textContent = formatWhen(stamp.createdAt);
  viewerCount.textContent = `${openIndex + 1} of ${stamps.length}${isSample(stamp) ? " (sample)" : ""}`;
  reportButton.hidden = isSample(stamp);
  reportButton.disabled = reported.has(stamp.id);
  reportButton.textContent = reported.has(stamp.id) ? "Reported. Thanks." : "Report this picture";
}

async function reportOpen() {
  const stamp = stamps[openIndex];
  if (!stamp || reported.has(stamp.id)) return;
  reportButton.disabled = true;
  try {
    const response = await fetch(`/api/stamps/${encodeURIComponent(stamp.id)}/report`, { method: "POST" });
    if (!response.ok) throw new Error();
    reported.add(stamp.id);
    reportButton.textContent = "Reported. Thanks.";
  } catch {
    reportButton.disabled = false;
    reportButton.textContent = "Couldn't send that. Try again.";
  }
}

function openViewer(index) {
  showInViewer(index);
  viewer.showModal();
}

async function load() {
  renderSkeleton();
  const response = await fetch("/api/stamps");
  if (!response.ok) throw new Error("Couldn't load the wall.");
  const payload = await response.json();
  stamps = Array.isArray(payload)
    ? payload.map((item) => ({
        id: item.id,
        createdAt: item.createdAt,
        image: item.image,
      }))
    : [];
  const samples = stamps.filter(isSample).length;
  note.textContent = samples
    ? `${samples === stamps.length ? "All" : samples} of these are samples, so the wall is never empty. They say Sample under the picture.`
    : "";
  tally.textContent = stamps.length === 1 ? "1 picture" : `${stamps.length} pictures`;
  shuffleButton.disabled = stamps.length < 2;
  render(stamps);
}

function retryButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn";
  button.textContent = "Try again";
  button.addEventListener("click", () => void start());
  return button;
}

function start() {
  return load().catch(() => {
    grid.setAttribute("aria-busy", "false");
    renderMessage("The wall didn't load. Check your connection and try again.", retryButton());
  });
}

shuffleButton.addEventListener("click", () => {
  stamps = shuffle(stamps);
  if (!document.startViewTransition || reduceMotion.matches) {
    render(stamps);
    return;
  }
  document.startViewTransition(() => render(stamps));
});

document.querySelector("#viewer-prev").addEventListener("click", () => showInViewer(openIndex - 1));
document.querySelector("#viewer-next").addEventListener("click", () => showInViewer(openIndex + 1));
reportButton.addEventListener("click", () => void reportOpen());
document.querySelector("#viewer-close").addEventListener("click", () => viewer.close());
viewer.addEventListener("click", (event) => {
  if (event.target === viewer) viewer.close();
});
viewer.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") showInViewer(openIndex - 1);
  if (event.key === "ArrowRight") showInViewer(openIndex + 1);
});
viewer.addEventListener("close", () => {
  const tile = grid.children[openIndex];
  if (tile instanceof HTMLElement) tile.focus();
});

void start();
