import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { inspectImage, stripMetadata } from "../src/image.js";

const jpeg = new Uint8Array(readFileSync(new URL("../../site/img/stamp-mode.jpg", import.meta.url)));

function withExif(bytes) {
  const payload = new TextEncoder().encode("Exif\0\0GPS 40.7128 N, 74.0060 W");
  const segment = new Uint8Array(4 + payload.length);
  segment.set([0xff, 0xe1, ((payload.length + 2) >> 8) & 0xff, (payload.length + 2) & 0xff]);
  segment.set(payload, 4);
  const out = new Uint8Array(bytes.length + segment.length);
  out.set(bytes.subarray(0, 2));
  out.set(segment, 2);
  out.set(bytes.subarray(2), 2 + segment.length);
  return out;
}

function crc32(bytes) {
  let crc = ~0;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function pngChunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function tinyPng(width, height, extra = []) {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header.set([8, 2, 0, 0, 0], 8);
  const raw = new Uint8Array((width * 3 + 1) * height);
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    ...extra,
    pngChunk("IDAT", new Uint8Array(deflateSync(raw))),
    pngChunk("IEND", new Uint8Array()),
  ];
  return new Uint8Array(Buffer.concat(parts));
}

test("reads JPEG size", () => {
  assert.deepEqual(inspectImage(jpeg), { type: "image/jpeg", width: 3456, height: 1994 });
});

test("drops EXIF from JPEG and keeps the picture", () => {
  const tagged = withExif(jpeg);
  assert.ok(Buffer.from(tagged).includes("GPS"));
  const clean = stripMetadata(tagged, "image/jpeg");
  assert.ok(!Buffer.from(clean).includes("GPS"));
  assert.equal(clean.length, jpeg.length);
  assert.deepEqual(inspectImage(clean), inspectImage(jpeg));
});

test("reads PNG size and drops text chunks", () => {
  const png = tinyPng(80, 70, [pngChunk("tEXt", new TextEncoder().encode("Author\0Someone"))]);
  assert.deepEqual(inspectImage(png), { type: "image/png", width: 80, height: 70 });
  const clean = stripMetadata(png, "image/png");
  assert.ok(Buffer.from(png).includes("Someone"));
  assert.ok(!Buffer.from(clean).includes("Someone"));
  assert.deepEqual(inspectImage(clean), { type: "image/png", width: 80, height: 70 });
});

test("rejects things that aren't pictures", () => {
  assert.equal(inspectImage(new TextEncoder().encode("<script>alert(1)</script>")), null);
  assert.equal(inspectImage(jpeg.subarray(0, 40)), null);
  assert.equal(inspectImage(tinyPng(80, 70).subarray(0, 60)), null);
});
