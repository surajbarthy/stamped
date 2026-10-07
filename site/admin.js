const KEY_STORE = "slopstamp:admin-key";

const login = document.querySelector("#login");
const keyInput = document.querySelector("#key");
const panel = document.querySelector("#panel");
const grid = document.querySelector("#grid");
const note = document.querySelector("#note");
const tally = document.querySelector("#tally");
const modeBox = document.querySelector("#mode");
const toast = document.querySelector("#toast");
const tabs = [...document.querySelectorAll("[data-status]")];

let adminKey = readKey();
let status = "pending";
let toastTimer = 0;
const objectUrls = [];

function readKey() {
  try {
    return localStorage.getItem(KEY_STORE) || "";
  } catch {
    return "";
  }
}

function storeKey(value) {
  try {
    if (value) localStorage.setItem(KEY_STORE, value);
    else localStorage.removeItem(KEY_STORE);
  } catch {
    // Private windows can refuse storage; the key then lasts for this page only.
  }
}

function showToast(text) {
  window.clearTimeout(toastTimer);
  toast.textContent = text;
  toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2600);
}

function formatWhen(timestamp) {
  return new Date(timestamp).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { Authorization: `Bearer ${adminKey}`, "Content-Type": "application/json", ...(options.headers || {}) },
  });
  if (response.status === 401) {
    signOut("That key didn't work.");
    throw new Error("unauthorized");
  }
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "Request failed.");
  return response;
}

function signOut(message) {
  adminKey = "";
  storeKey("");
  panel.hidden = true;
  login.hidden = false;
  tally.textContent = "";
  if (message) showToast(message);
  keyInput.focus();
}

async function loadImage(id, img) {
  try {
    const response = await api(`/api/admin/stamps/${id}/image`);
    const url = URL.createObjectURL(await response.blob());
    objectUrls.push(url);
    img.src = url;
    img.parentElement.href = url;
  } catch {
    img.alt = "Couldn't load this picture.";
  }
}

function actionButton(label, action, id, danger = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn btn-small";
  if (danger) button.style.color = "var(--stamp)";
  button.textContent = label;
  button.addEventListener("click", () => void act(id, action));
  return button;
}

const REASON_LABELS = { private: "private info", harmful: "sexual, violent or illegal", other: "other" };

function reportSummary(stamp) {
  if (!stamp.reports) return "";
  const parts = Object.entries(stamp.reasons || {})
    .filter(([, count]) => count > 0)
    .map(([reason, count]) => `${count} ${REASON_LABELS[reason] || reason}`);
  return ` · reported: ${parts.length ? parts.join(", ") : stamp.reports}`;
}

function render(payload) {
  for (const url of objectUrls.splice(0)) URL.revokeObjectURL(url);
  const counts = payload.counts || {};
  tally.textContent = `${counts.pending || 0} waiting · ${counts.published || 0} on the wall · ${counts.hidden || 0} hidden`;
  modeBox.checked = payload.mode === "approve-first";
  note.textContent = {
    pending: "Nothing here shows on the wall until you approve it.",
    published: "Live on the wall now. One private-info or harmful report hides a post; other reports take three, and none once you've cleared it.",
    hidden: "Hidden by you or by reports. Approve to put one back.",
  }[status];

  grid.replaceChildren();
  if (payload.stamps.length === 0) {
    const empty = document.createElement("div");
    empty.className = "wall-message";
    empty.textContent = status === "pending" ? "Nothing waiting. Nice." : "Nothing here.";
    grid.append(empty);
    return;
  }

  for (const stamp of payload.stamps) {
    const card = document.createElement("div");
    card.className = "admin-card";
    const link = document.createElement("a");
    link.target = "_blank";
    link.rel = "noreferrer";
    const img = document.createElement("img");
    img.alt = `Post stamped ${formatWhen(stamp.createdAt)}`;
    img.loading = "lazy";
    link.append(img);
    const meta = document.createElement("p");
    meta.className = "admin-meta";
    meta.textContent = `Stamped ${formatWhen(stamp.createdAt)} · posted ${formatWhen(stamp.postedAt)}${reportSummary(stamp)}${stamp.cleared ? " · cleared by you" : ""}`;
    const actions = document.createElement("div");
    actions.className = "admin-actions";
    if (stamp.status !== "published") actions.append(actionButton("Approve", "approve", stamp.id));
    if (stamp.status !== "hidden") actions.append(actionButton("Hide", "hide", stamp.id));
    actions.append(actionButton("Delete for good", "delete", stamp.id, true));
    card.append(link, meta, actions);
    grid.append(card);
    void loadImage(stamp.id, img);
  }
}

async function refresh() {
  tabs.forEach((tab) => tab.setAttribute("aria-selected", String(tab.dataset.status === status)));
  try {
    const response = await api(`/api/admin/stamps?status=${status}`);
    render(await response.json());
  } catch (error) {
    if (error.message !== "unauthorized") showToast(error.message);
  }
}

async function act(id, action) {
  if (action === "delete" && !window.confirm("Delete this post and its picture for good?")) return;
  try {
    await api(`/api/admin/stamps/${id}`, { method: "POST", body: JSON.stringify({ action }) });
    showToast({ approve: "Approved.", hide: "Hidden.", delete: "Deleted." }[action]);
    await refresh();
  } catch (error) {
    if (error.message !== "unauthorized") showToast(error.message);
  }
}

async function open() {
  login.hidden = true;
  panel.hidden = false;
  await refresh();
}

login.addEventListener("submit", (event) => {
  event.preventDefault();
  adminKey = keyInput.value.trim();
  keyInput.value = "";
  storeKey(adminKey);
  void open();
});

tabs.forEach((tab) =>
  tab.addEventListener("click", () => {
    status = tab.dataset.status;
    void refresh();
  })
);

modeBox.addEventListener("change", async () => {
  const mode = modeBox.checked ? "approve-first" : "publish-instantly";
  try {
    await api("/api/admin/settings", { method: "POST", body: JSON.stringify({ mode }) });
    showToast(modeBox.checked ? "New posts wait for you." : "New posts go live right away.");
  } catch (error) {
    modeBox.checked = !modeBox.checked;
    if (error.message !== "unauthorized") showToast(error.message);
  }
});

document.querySelector("#logout").addEventListener("click", () => signOut("Forgot the key on this browser."));

if (adminKey) void open();
else keyInput.focus();
