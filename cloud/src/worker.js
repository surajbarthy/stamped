// Slop Stamp wall API. Static pages come from ../site through the ASSETS binding;
// this Worker handles /api/* and /media/*.
//
// A post is only the picture and the time it was taken. Nothing that identifies
// the poster is stored: no IP address, no account, no page address.

import { inspectImage, stripMetadata } from "./image.js";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_BODY_BYTES = 6 * 1024 * 1024;
const WALL_LIMIT = 200;
const ADMIN_LIMIT = 100;
const MODES = ["approve-first", "publish-instantly"];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

function json(status, body, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...CORS, ...extra },
  });
}

function fail(status, error) {
  return json(status, { error });
}

function bearer(request) {
  const header = request.headers.get("Authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function sameText(a, b) {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left[index] ^ right[index];
  return diff === 0;
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function isId(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
}

// The limiter key is the address, but only the binding sees it and nothing is written down.
async function overLimit(limiter, request) {
  if (!limiter) return false;
  const key = request.headers.get("CF-Connecting-IP") || "local";
  const { success } = await limiter.limit({ key });
  return !success;
}

async function moderationMode(env) {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'moderation'").first();
  return MODES.includes(row?.value) ? row.value : "approve-first";
}

function decodeDataUrl(value) {
  if (typeof value !== "string") return null;
  const match = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=\s]+)$/.exec(value);
  if (!match) return null;
  try {
    const binary = atob(match[2].replace(/\s/g, ""));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    return null;
  }
}

function wallEntry(row) {
  return { id: row.id, createdAt: row.created_at, image: `/media/${row.id}` };
}

async function listWall(env) {
  const { results } = await env.DB.prepare(
    "SELECT id, created_at FROM stamps WHERE status = 'published' ORDER BY posted_at DESC LIMIT ?"
  )
    .bind(WALL_LIMIT)
    .all();
  return json(200, results.map(wallEntry), { "Cache-Control": "public, max-age=30" });
}

async function createStamp(request, env) {
  if (await overLimit(env.POST_LIMITER, request)) {
    return fail(429, "Too many posts in a row. Wait a minute and try again.");
  }
  const declared = Number(request.headers.get("Content-Length") || "0");
  if (declared > MAX_BODY_BYTES) return fail(413, "That picture is too big for the wall.");

  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return fail(413, "That picture is too big for the wall.");
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    return fail(400, "That wasn't a picture.");
  }

  const createdAt = payload?.createdAt;
  const now = Date.now();
  if (!Number.isFinite(createdAt) || createdAt < Date.UTC(2024, 0, 1) || createdAt > now + 86_400_000) {
    return fail(400, "That picture has a strange time on it.");
  }
  const bytes = decodeDataUrl(payload?.image);
  if (!bytes) return fail(400, "Only JPEG and PNG pictures can go on the wall.");
  if (bytes.length > MAX_IMAGE_BYTES) return fail(413, "That picture is too big for the wall.");

  const info = inspectImage(bytes);
  if (!info) return fail(400, "Only JPEG and PNG pictures can go on the wall.");
  if (info.width < 64 || info.height < 64 || info.width > 8000 || info.height > 8000) {
    return fail(400, "That picture is an odd size for the wall.");
  }

  const mode = await moderationMode(env);
  if (mode === "approve-first") {
    const pending = await env.DB.prepare("SELECT COUNT(*) AS count FROM stamps WHERE status = 'pending'").first();
    if ((pending?.count || 0) >= Number(env.MAX_PENDING || 300)) {
      return fail(503, "The wall has a backlog right now. Try again later.");
    }
  }

  const clean = stripMetadata(bytes, info.type);
  const id = crypto.randomUUID();
  const deleteToken = randomToken();
  const status = mode === "approve-first" ? "pending" : "published";

  await env.MEDIA.put(id, clean, { httpMetadata: { contentType: info.type } });
  await env.DB.prepare(
    "INSERT INTO stamps (id, created_at, posted_at, status, reports, delete_hash, content_type) VALUES (?, ?, ?, ?, 0, ?, ?)"
  )
    .bind(id, Math.floor(createdAt), now, status, await sha256Hex(deleteToken), info.type)
    .run();

  return json(201, { id, createdAt: Math.floor(createdAt), status, deleteToken });
}

async function removeOwnStamp(request, env, id) {
  const token = bearer(request);
  if (!token) return fail(401, "Missing the key for that post.");
  const row = await env.DB.prepare("SELECT delete_hash FROM stamps WHERE id = ?").bind(id).first();
  if (!row) return json(200, { ok: true });
  if (!sameText(row.delete_hash, await sha256Hex(token))) return fail(403, "That key doesn't match this post.");
  await deleteStamp(env, id);
  return json(200, { ok: true });
}

async function deleteStamp(env, id) {
  await env.DB.prepare("DELETE FROM stamps WHERE id = ?").bind(id).run();
  await env.MEDIA.delete(id);
}

const REPORT_REASONS = ["private", "harmful", "other"];

async function reportStamp(request, env, id) {
  if (await overLimit(env.REPORT_LIMITER, request)) {
    return fail(429, "Too many reports in a row. Wait a minute and try again.");
  }
  const body = await request.json().catch(() => ({}));
  // Older pages send no reason; count those as "other".
  const reason = REPORT_REASONS.includes(body?.reason) ? body.reason : "other";
  const threshold = Math.max(1, Math.floor(Number(env.REPORTS_TO_HIDE) || 3));
  const column = `${reason}_reports`;
  // Private-info and harmful reports hide a live post straight away. "Other"
  // reports hide it at the threshold, unless a moderator already cleared it.
  const hides =
    reason === "other" ? `status = 'published' AND cleared = 0 AND other_reports + 1 >= ${threshold}` : "status = 'published'";
  const row = await env.DB.prepare(
    `UPDATE stamps SET reports = reports + 1, ${column} = ${column} + 1,
       status = CASE WHEN ${hides} THEN 'hidden' ELSE status END
     WHERE id = ? RETURNING status`
  )
    .bind(id)
    .first();
  if (!row) return fail(404, "That picture isn't on the wall.");
  return json(200, { ok: true, hidden: row.status === "hidden" });
}

// Every request checks the post is still published, so a hidden or removed
// picture stops showing within the short browser cache time.
async function serveMedia(env, id) {
  const row = await env.DB.prepare("SELECT status FROM stamps WHERE id = ?").bind(id).first();
  if (row?.status !== "published") return new Response("Not found", { status: 404, headers: CORS });
  const object = await env.MEDIA.get(id);
  if (!object) return new Response("Not found", { status: 404, headers: CORS });

  const response = new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType || "image/jpeg",
      "Cache-Control": "public, max-age=60",
      "X-Content-Type-Options": "nosniff",
      ...CORS,
    },
  });
  return response;
}

// Admin: everything below needs the ADMIN_TOKEN secret as a bearer token.

function isAdmin(request, env) {
  const token = bearer(request);
  return Boolean(env.ADMIN_TOKEN) && Boolean(token) && sameText(token, env.ADMIN_TOKEN);
}

async function adminList(env, url) {
  const status = url.searchParams.get("status") || "pending";
  if (!["pending", "published", "hidden"].includes(status)) return fail(400, "Unknown status.");
  const { results } = await env.DB.prepare(
    "SELECT id, created_at, posted_at, status, reports, private_reports, harmful_reports, other_reports, cleared FROM stamps WHERE status = ? ORDER BY posted_at DESC LIMIT ?"
  )
    .bind(status, ADMIN_LIMIT)
    .all();
  const counts = await env.DB.prepare("SELECT status, COUNT(*) AS count FROM stamps GROUP BY status").all();
  return json(200, {
    mode: await moderationMode(env),
    counts: Object.fromEntries(counts.results.map((row) => [row.status, row.count])),
    stamps: results.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      postedAt: row.posted_at,
      status: row.status,
      reports: row.reports,
      reasons: { private: row.private_reports, harmful: row.harmful_reports, other: row.other_reports },
      cleared: Boolean(row.cleared),
    })),
  });
}

async function adminMedia(env, id) {
  const object = await env.MEDIA.get(id);
  if (!object) return new Response("Not found", { status: 404, headers: CORS });
  return new Response(object.body, {
    headers: { "Content-Type": object.httpMetadata?.contentType || "image/jpeg", "Cache-Control": "no-store", ...CORS },
  });
}

async function adminAct(request, env, id) {
  const body = await request.json().catch(() => ({}));
  if (body.action === "delete") {
    await deleteStamp(env, id);
    return json(200, { ok: true });
  }
  const next = { approve: "published", hide: "hidden" }[body.action];
  if (!next) return fail(400, "Unknown action.");
  // Approving clears earlier reports. Approving a post that was reported or
  // hidden also marks it cleared, so "other" reports can't hide it again.
  const statement =
    next === "published"
      ? "UPDATE stamps SET cleared = CASE WHEN reports > 0 OR status = 'hidden' THEN 1 ELSE cleared END, status = ?, reports = 0, private_reports = 0, harmful_reports = 0, other_reports = 0 WHERE id = ?"
      : "UPDATE stamps SET status = ? WHERE id = ?";
  await env.DB.prepare(statement).bind(next, id).run();
  return json(200, { ok: true, status: next });
}

async function adminSettings(request, env) {
  const body = await request.json().catch(() => ({}));
  if (!MODES.includes(body.mode)) return fail(400, "Unknown mode.");
  await env.DB.prepare("INSERT INTO settings (key, value) VALUES ('moderation', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .bind(body.mode)
    .run();
  return json(200, { mode: body.mode });
}

// /api/admin/stamps?status=, /api/admin/stamps/:id, /api/admin/stamps/:id/image, /api/admin/settings
async function handleAdmin(request, env, url, parts) {
  if (!isAdmin(request, env)) return fail(401, "Wrong admin key.");
  const [, , section, id, extra] = parts;
  if (section === "settings" && parts.length === 3 && request.method === "POST") return adminSettings(request, env);
  if (section !== "stamps") return fail(404, "Not found.");
  if (parts.length === 3 && request.method === "GET") return adminList(env, url);
  if (!isId(id || "")) return fail(404, "Not found.");
  if (parts.length === 5 && extra === "image" && request.method === "GET") return adminMedia(env, id);
  if (parts.length === 4 && request.method === "POST") return adminAct(request, env, id);
  return fail(405, "Not allowed.");
}

async function handleApi(request, env, url) {
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[1] === "admin") return handleAdmin(request, env, url, parts);
  if (parts[1] !== "stamps") return fail(404, "Not found.");
  const id = parts[2];
  if (!id) {
    if (request.method === "GET") return listWall(env);
    if (request.method === "POST") return createStamp(request, env);
    return fail(405, "Not allowed.");
  }
  if (!isId(id)) return fail(404, "Not found.");
  if (request.method === "DELETE" && parts.length === 3) return removeOwnStamp(request, env, id);
  if (request.method === "POST" && parts[3] === "report" && parts.length === 4) return reportStamp(request, env, id);
  return fail(405, "Not allowed.");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    try {
      if (url.pathname.startsWith("/api/")) return await handleApi(request, env, url);
      if (url.pathname.startsWith("/media/")) {
        const id = url.pathname.slice("/media/".length);
        if (!isId(id) || request.method !== "GET") return new Response("Not found", { status: 404 });
        return await serveMedia(env, id);
      }
      return env.ASSETS.fetch(request);
    } catch (error) {
      console.error(error);
      return fail(500, "Something went wrong on the wall.");
    }
  },
};
