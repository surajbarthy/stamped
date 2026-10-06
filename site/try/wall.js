const grid = document.querySelector("#grid");
const note = document.querySelector("#note");
let stamps = [];

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
    const held = next[index];
    next[index] = next[swap];
    next[swap] = held;
  }
  return next;
}

function render(items) {
  grid.replaceChildren();
  if (items.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "No stamps on the wall yet.";
    grid.append(empty);
    return;
  }

  for (const stamp of items) {
    const card = document.createElement("figure");
    const image = document.createElement("img");
    image.src = stamp.image;
    image.alt = "";
    const time = document.createElement("time");
    time.dateTime = new Date(stamp.createdAt).toISOString();
    time.textContent = formatWhen(stamp.createdAt);
    card.append(image, time);
    grid.append(card);
  }
}

async function load() {
  const response = await fetch("/api/stamps");
  if (!response.ok) throw new Error("Couldn't load the wall.");
  const payload = await response.json();
  stamps = Array.isArray(payload)
    ? payload.map((item) => ({
        createdAt: item.createdAt,
        image: item.image,
      }))
    : [];
  note.textContent = stamps.some((item) => String(item.image).includes("sample-"))
    ? "The first pictures are samples, so the wall isn't blank."
    : "";
  render(stamps);
}

document.querySelector("#randomize").addEventListener("click", () => {
  stamps = shuffle(stamps);
  render(stamps);
});

load().catch(() => {
  note.textContent = "The wall didn't load.";
});
