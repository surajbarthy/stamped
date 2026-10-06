// Checks that an upload really is a JPEG or PNG, reads its size, and drops
// metadata segments (EXIF, comments, text chunks) before it is stored.

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
// Ancillary PNG chunks that can carry text, dates, or camera data.
const PNG_DROP = new Set(["tEXt", "zTXt", "iTXt", "eXIf", "tIME"]);

function readU32(bytes, offset) {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function chunkType(bytes, offset) {
  return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
}

function isPng(bytes) {
  return bytes.length > 33 && PNG_SIGNATURE.every((value, index) => bytes[index] === value);
}

function isJpeg(bytes) {
  return bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function inspectPng(bytes) {
  if (chunkType(bytes, 12) !== "IHDR") return null;
  // A PNG must end with IEND; a truncated upload is rejected.
  if (chunkType(bytes, bytes.length - 8) !== "IEND") return null;
  return { type: "image/png", width: readU32(bytes, 16), height: readU32(bytes, 20) };
}

// Start-of-frame markers that carry the picture size.
const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

function inspectJpeg(bytes) {
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (length < 2 || offset + 2 + length > bytes.length) return null;
    if (SOF.has(marker)) {
      const height = (bytes[offset + 5] << 8) | bytes[offset + 6];
      const width = (bytes[offset + 7] << 8) | bytes[offset + 8];
      return { type: "image/jpeg", width, height };
    }
    if (marker === 0xda) return null;
    offset += 2 + length;
  }
  return null;
}

export function inspectImage(bytes) {
  if (isJpeg(bytes)) return inspectJpeg(bytes);
  if (isPng(bytes)) return inspectPng(bytes);
  return null;
}

function stripJpeg(bytes) {
  const parts = [bytes.subarray(0, 2)];
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    const marker = bytes[offset + 1];
    if (marker === 0xda) {
      // Start of scan: the rest is image data through the end marker.
      parts.push(bytes.subarray(offset));
      break;
    }
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    const end = offset + 2 + length;
    // Keep APP0 (JFIF), APP2 (colour profile) and APP14 (Adobe colour transform);
    // drop EXIF, XMP, other APPn and comments.
    const isApp = marker >= 0xe0 && marker <= 0xef;
    const keep = !(isApp && ![0xe0, 0xe2, 0xee].includes(marker)) && marker !== 0xfe;
    if (keep) parts.push(bytes.subarray(offset, end));
    offset = end;
  }
  return concat(parts);
}

function stripPng(bytes) {
  const parts = [bytes.subarray(0, 8)];
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = readU32(bytes, offset);
    const end = offset + 12 + length;
    if (end > bytes.length) break;
    if (!PNG_DROP.has(chunkType(bytes, offset + 4))) parts.push(bytes.subarray(offset, end));
    offset = end;
  }
  return concat(parts);
}

function concat(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export function stripMetadata(bytes, type) {
  return type === "image/png" ? stripPng(bytes) : stripJpeg(bytes);
}
