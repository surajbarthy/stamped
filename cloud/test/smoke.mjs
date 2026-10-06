// End-to-end check against a running Worker:
//   npx wrangler dev   (with ADMIN_TOKEN in .dev.vars)
//   node test/smoke.mjs http://127.0.0.1:8787 <admin key>
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const base = process.argv[2] || "http://127.0.0.1:8787";
const adminKey = process.argv[3] || "local-admin-key";
const jpeg = readFileSync(new URL("../../site/img/stamp-mode.jpg", import.meta.url));
const image = `data:image/jpeg;base64,${jpeg.toString("base64")}`;
const admin = { Authorization: `Bearer ${adminKey}`, "Content-Type": "application/json" };

async function call(path, options = {}) {
  const response = await fetch(base + path, options);
  const type = response.headers.get("Content-Type") || "";
  const body = type.includes("json") ? await response.json() : await response.arrayBuffer();
  return { status: response.status, body, headers: response.headers };
}

const post = (payload) =>
  call("/api/stamps", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
const wallIds = async () => (await call("/api/stamps")).body.map((item) => item.id);
const setMode = (mode) => call("/api/admin/settings", { method: "POST", headers: admin, body: JSON.stringify({ mode }) });
const act = (id, action) => call(`/api/admin/stamps/${id}`, { method: "POST", headers: admin, body: JSON.stringify({ action }) });

const step = (name) => console.log(`ok - ${name}`);

assert.equal((await setMode("approve-first")).status, 200);

assert.equal((await post({ createdAt: Date.now(), image: "data:text/html;base64,PGgxPg==" })).status, 400);
assert.equal((await post({ createdAt: Date.now(), image: `data:image/jpeg;base64,${Buffer.from("not a jpeg").toString("base64")}` })).status, 400);
assert.equal((await post({ createdAt: 12, image })).status, 400);
step("rejects non-pictures and odd times");

const created = await post({ createdAt: Date.now() - 1000, image, pageUrl: "https://secret.example", name: "me" });
assert.equal(created.status, 201);
assert.equal(created.body.status, "pending");
assert.ok(created.body.deleteToken);
const { id, deleteToken } = created.body;
assert.deepEqual(Object.keys(created.body).sort(), ["createdAt", "deleteToken", "id", "status"]);
step("a post waits for approval");

assert.ok(!(await wallIds()).includes(id));
assert.equal((await call(`/media/${id}`)).status, 404);
step("a waiting post is not on the wall and its picture is not public");

assert.equal((await call("/api/admin/stamps?status=pending")).status, 401);
assert.equal((await call("/api/admin/stamps?status=pending", { headers: { Authorization: "Bearer wrong" } })).status, 401);
const pending = await call("/api/admin/stamps?status=pending", { headers: admin });
assert.ok(pending.body.stamps.some((item) => item.id === id));
const adminImage = await call(`/api/admin/stamps/${id}/image`, { headers: admin });
assert.equal(adminImage.status, 200);
assert.equal(adminImage.body.byteLength, jpeg.length);
step("admin needs the key and can see the waiting picture");

assert.equal((await act(id, "approve")).status, 200);
const wall = (await call("/api/stamps")).body;
const entry = wall.find((item) => item.id === id);
assert.deepEqual(Object.keys(entry).sort(), ["createdAt", "id", "image"]);
const media = await call(entry.image);
assert.equal(media.status, 200);
assert.equal(media.headers.get("Content-Type"), "image/jpeg");
step("approved post is on the wall with only id, time and picture");

for (let count = 0; count < 3; count += 1) {
  assert.equal((await call(`/api/stamps/${id}/report`, { method: "POST" })).status, 200);
}
assert.ok(!(await wallIds()).includes(id));
const hidden = await call("/api/admin/stamps?status=hidden", { headers: admin });
assert.ok(hidden.body.stamps.some((item) => item.id === id && item.reports === 3));
step("three reports hide a post");

assert.equal((await act(id, "approve")).status, 200);
assert.ok((await wallIds()).includes(id));
assert.equal((await call(`/api/stamps/${id}/report`, { method: "POST" })).status, 200);
assert.ok((await wallIds()).includes(id));
step("approving again clears the reports");

assert.equal((await call(`/api/stamps/${id}`, { method: "DELETE" })).status, 401);
assert.equal((await call(`/api/stamps/${id}`, { method: "DELETE", headers: { Authorization: "Bearer nope" } })).status, 403);
assert.equal((await call(`/api/stamps/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${deleteToken}` } })).status, 200);
assert.ok(!(await wallIds()).includes(id));
assert.equal((await call(`/media/${id}`)).status, 404);
assert.equal((await call(`/api/admin/stamps/${id}/image`, { headers: admin })).status, 404);
step("the poster can remove their own post with its key, and only with it");

assert.equal((await setMode("publish-instantly")).status, 200);
const instant = await post({ createdAt: Date.now(), image });
assert.equal(instant.body.status, "published");
assert.ok((await wallIds()).includes(instant.body.id));
assert.equal((await act(instant.body.id, "delete")).status, 200);
assert.ok(!(await wallIds()).includes(instant.body.id));
assert.equal((await setMode("approve-first")).status, 200);
step("publish-instantly mode and admin delete work");

console.log("all smoke checks passed");
