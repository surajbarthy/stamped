#!/usr/bin/env python3
"""Local site for the marketing page and the community stamp wall."""

import base64
import json
import math
import struct
import uuid
import zlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
MEDIA = DATA / "media"
INDEX = DATA / "stamps.json"
PORT = 8787
MAX_STAMPS = 200

FONT = {
    "A": ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
    "I": ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
    "S": ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
    "L": ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
    "O": ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
    "P": ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
}


def chunk(tag, data):
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


def write_png(path, width, height, rgba):
    raw = bytearray()
    stride = width * 4
    for y in range(height):
        raw.append(0)
        raw.extend(rgba[y * stride : (y + 1) * stride])
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b"")
    path.write_bytes(png)


def paint(buf, width, x, y, color):
    if x < 0 or y < 0 or x >= width:
        return
    index = (y * width + x) * 4
    if index < 0 or index + 4 > len(buf):
        return
    buf[index : index + 4] = color


def blit_text(buf, width, text, origin_x, origin_y, scale, color):
    cursor = origin_x
    for character in text:
        glyph = FONT.get(character)
        if not glyph:
            cursor += 3 * scale
            continue
        for row, bits in enumerate(glyph):
            for column, bit in enumerate(bits):
                if bit != "1":
                    continue
                for dy in range(scale):
                    for dx in range(scale):
                        paint(buf, width, cursor + column * scale + dx, origin_y + row * scale + dy, color)
        cursor += (len(glyph[0]) + 1) * scale


def sample_rgba(width, height, seed):
    palette = [
        ((232, 236, 234), (46, 74, 68)),
        ((236, 232, 224), (62, 48, 42)),
        ((228, 232, 240), (42, 52, 74)),
        ((240, 234, 226), (92, 54, 42)),
        ((230, 236, 228), (48, 72, 46)),
        ((238, 230, 234), (74, 42, 58)),
    ]
    paper, ink = palette[seed % len(palette)]
    paper_px = bytes((*paper, 255))
    ink_px = bytes((*ink, 255))
    red = bytes((214, 50, 50, 255))
    cream = bytes((255, 250, 247, 255))
    buf = bytearray(paper_px * (width * height))
    for row, y in enumerate(range(48, height - 56, 18)):
        length = width - 120 - ((row + seed) % 4) * 18
        for x in range(28, length):
            for thickness in range(3):
                paint(buf, width, x, y + thickness, ink_px)
    cx, cy, radius = width - 70, height - 62, 36
    for y in range(cy - radius, cy + radius + 1):
        for x in range(cx - radius, cx + radius + 1):
            distance = math.hypot(x - cx, y - cy)
            if distance > radius:
                continue
            paint(buf, width, x, y, red if distance > radius - 4 else cream)
    blit_text(buf, width, "AI", cx - 14, cy - 16, 2, red)
    blit_text(buf, width, "SLOP", cx - 26, cy + 2, 2, red)
    return buf


def load_index():
    if not INDEX.exists():
        return []
    try:
        payload = json.loads(INDEX.read_text())
    except json.JSONDecodeError:
        return []
    return payload if isinstance(payload, list) else []


def save_index(items):
    INDEX.write_text(json.dumps(items))


def ensure_samples():
    DATA.mkdir(parents=True, exist_ok=True)
    MEDIA.mkdir(parents=True, exist_ok=True)
    items = load_index()
    if items:
        return
    now = 1_759_286_400_000
    seeded = []
    for offset in range(6):
        stamp_id = f"sample-{offset + 1}"
        write_png(MEDIA / f"{stamp_id}.png", 320, 200, sample_rgba(320, 200, offset))
        seeded.append({"id": stamp_id, "createdAt": now - offset * 3_600_000})
    save_index(seeded)


class Handler(BaseHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path.startswith("/data"):
            self.send_error(404)
            return
        if path == "/api/stamps":
            body = json.dumps(
                [
                    {"id": item["id"], "createdAt": item["createdAt"], "image": f"/media/{item['id']}.png"}
                    for item in load_index()
                    if isinstance(item, dict) and "id" in item and "createdAt" in item
                ]
            ).encode()
            self._send(200, "application/json", body)
            return
        if path.startswith("/media/"):
            file_path = MEDIA / Path(path).name
            if not file_path.is_file():
                self.send_error(404)
                return
            self._send(200, "image/png", file_path.read_bytes())
            return
        if path in ("/", "/index.html"):
            self._send_file(ROOT / "index.html", "text/html; charset=utf-8")
            return
        if path in ("/community", "/community.html"):
            self._send_file(ROOT / "community.html", "text/html; charset=utf-8")
            return
        relative = path.lstrip("/")
        file_path = (ROOT / relative).resolve()
        if (ROOT not in file_path.parents and file_path != ROOT) or not file_path.is_file():
            self.send_error(404)
            return
        kind = "text/css; charset=utf-8" if file_path.suffix == ".css" else "text/javascript; charset=utf-8"
        if file_path.suffix == ".html":
            kind = "text/html; charset=utf-8"
        self._send_file(file_path, kind)

    def do_POST(self):
        if self.path.split("?", 1)[0] != "/api/stamps":
            self.send_error(404)
            return
        length = int(self.headers.get("Content-Length", "0"))
        try:
            payload = json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError:
            self.send_error(400)
            return
        created = payload.get("createdAt")
        image = payload.get("image")
        if not isinstance(created, (int, float)) or not isinstance(image, str) or "," not in image:
            self.send_error(400)
            return
        try:
            png = base64.b64decode(image.split(",", 1)[1], validate=True)
        except (ValueError, TypeError):
            self.send_error(400)
            return
        stamp_id = str(uuid.uuid4())
        MEDIA.mkdir(parents=True, exist_ok=True)
        (MEDIA / f"{stamp_id}.png").write_bytes(png)
        items = load_index()
        items.insert(0, {"id": stamp_id, "createdAt": int(created)})
        dropped = items[MAX_STAMPS:]
        items = items[:MAX_STAMPS]
        save_index(items)
        for item in dropped:
            file_path = MEDIA / f"{item.get('id', '')}.png"
            if file_path.is_file() and not str(item.get("id", "")).startswith("sample-"):
                file_path.unlink()
        self._send(201, "application/json", json.dumps({"id": stamp_id, "createdAt": int(created)}).encode())

    def _send_file(self, path, content_type):
        self._send(200, content_type, path.read_bytes())

    def _send(self, status, content_type, body):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        print("%s - %s" % (self.address_string(), format % args))


if __name__ == "__main__":
    ensure_samples()
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Stamped site at http://127.0.0.1:{PORT}", flush=True)
    server.serve_forever()
