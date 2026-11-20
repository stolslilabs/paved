import { deflateSync, inflateSync } from "node:zlib";
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b: Uint8Array) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
export function writePng(w: number, h: number, rgb: Uint8Array): Buffer {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; Buffer.from(rgb.buffer, rgb.byteOffset + y * w * 3, w * 3).copy(raw, y * (w * 3 + 1) + 1); }
  const chunk = (type: string, data: Buffer) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
/** Decodes a non-interlaced 8-bit PNG (RGB, RGBA or palette) to RGB triples. */
export function readPng(buf: Uint8Array): { w: number; h: number; rgb: Uint8Array } {
  const b = Buffer.from(buf); let o = 8; const idat: Buffer[] = []; let w = 0, h = 0, ct = 0, plte: Buffer | null = null;
  while (o < b.length) { const len = b.readUInt32BE(o); const type = b.toString("ascii", o + 4, o + 8); const data = b.subarray(o + 8, o + 8 + len); if (type === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); if (data[8] !== 8) throw new Error("depth " + data[8]); ct = data[9]!; } else if (type === "PLTE") plte = Buffer.from(data); else if (type === "IDAT") idat.push(Buffer.from(data)); o += 12 + len; }
  const bpp = ct === 2 ? 3 : ct === 6 ? 4 : ct === 3 ? 1 : ct === 0 ? 1 : 2; const raw = inflateSync(Buffer.concat(idat)); const stride = w * bpp; const out = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) { const f = raw[y * (stride + 1)]!; for (let x = 0; x < stride; x++) { const v = raw[y * (stride + 1) + 1 + x]!; const a = x >= bpp ? out[y * stride + x - bpp]! : 0; const up = y ? out[(y - 1) * stride + x]! : 0; const c = x >= bpp && y ? out[(y - 1) * stride + x - bpp]! : 0; let p = 0; if (f === 1) p = a; else if (f === 2) p = up; else if (f === 3) p = (a + up) >> 1; else if (f === 4) { const pa = Math.abs(up - c), pb = Math.abs(a - c), pc = Math.abs(a + up - 2 * c); p = pa <= pb && pa <= pc ? a : pb <= pc ? up : c; } out[y * stride + x] = (v + p) & 255; } }
  const rgb = new Uint8Array(w * h * 3);
  for (let i = 0; i < w * h; i++) { if (ct === 3) { const k = out[i]!; rgb.set(plte!.subarray(k * 3, k * 3 + 3), i * 3); } else if (ct === 0) rgb.fill(out[i]!, i * 3, i * 3 + 3); else rgb.set(out.subarray(i * bpp, i * bpp + 3), i * 3); }
  return { w, h, rgb };
}
