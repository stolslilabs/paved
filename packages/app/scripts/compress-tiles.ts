/**
 * TEX: the app's copies of the 19 plans' 2D tile images at the size the renderer draws them (256 px), content-hashed, from
 * app-web's 1680 x 1680 originals.
 *
 *   node scripts/compress-tiles.ts [--check]
 *
 * Reads `../app-web/public/assets/tiles/<plan>.png` (left untouched) and writes
 * `public/renderer-assets/tiles/<plan>.<size>.<hash>.png` for each size of `SIZES` (a list, so another size is one number). Each run removes the copies of an earlier
 * one. `--check` writes nothing and fails when a committed copy is not what this run would write, compared by pixels, not
 * bytes (the deflate stream depends on the Node and zlib that wrote it, which nothing pins): each copy's name must carry
 * its file's hash, and its decoded size and pixels must be the ones computed from the original; a missing or extra file fails. Node 24 runs it as is (type stripping): the
 * syntax stays erasable.
 *
 * No package: the originals are 8-bit RGB or RGBA PNGs, read and written with `node:zlib` (PNG's filters are a few lines).
 * The resize is an exact area average (each output pixel is the coverage-weighted mean of the source pixels under it, on
 * premultiplied alpha, in the stored sRGB values: the plan view reads them as stored). PNG, not WebP: three's
 * `TextureLoader` decodes through the browser, which reads PNG everywhere, and no encoder is in the repository.
 *
 * The name's hash is the first 10 hex digits of the file's SHA-256, so a changed copy gets a new name and the host can
 * cache every image forever (`docs/client/v2-architecture.md`, 4.2).
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync, inflateSync } from "node:zlib";

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = resolve(HERE, "../../app-web/public/assets/tiles");
const OUT = resolve(HERE, "../public/renderer-assets/tiles");

/** The sizes written: one serves the placeholder quad and the plan view (the renderer's `TILE_IMAGE_SIZE`). */
const SIZES = [256];

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const hashOf = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex").slice(0, 10);

const CRC = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

interface Image {
  width: number;
  height: number;
  /** RGBA, 8 bits, row by row. */
  data: Uint8Array;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** An 8-bit, non-interlaced, RGB or RGBA PNG as RGBA, or an error naming what differs. */
function decode(name: string, png: Buffer): Image {
  if (png.subarray(0, 8).compare(SIGNATURE) !== 0) throw new Error(`${name}: not a PNG`);
  let header: Buffer | null = null;
  const parts: Buffer[] = [];
  for (let at = 8; at < png.length; ) {
    const length = png.readUInt32BE(at);
    const type = png.toString("latin1", at + 4, at + 8);
    const body = png.subarray(at + 8, at + 8 + length);
    if (type === "IHDR") header = body;
    else if (type === "IDAT") parts.push(body);
    else if (type === "PLTE" || type === "tRNS") throw new Error(`${name}: a palette is not supported`);
    at += 12 + length;
  }
  if (!header) throw new Error(`${name}: no IHDR`);
  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  const [depth, color, , , interlace] = [header[8], header[9], header[10], header[11], header[12]];
  if (depth !== 8 || (color !== 2 && color !== 6) || interlace !== 0) throw new Error(`${name}: not an 8-bit RGB or RGBA PNG without interlace`);
  const bpp = color === 6 ? 4 : 3;
  const stride = width * bpp;
  const raw = inflateSync(Buffer.concat(parts));
  if (raw.length !== (stride + 1) * height) throw new Error(`${name}: ${raw.length} bytes of pixels, expected ${(stride + 1) * height}`);
  const data = new Uint8Array(width * height * 4);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    const row = new Uint8Array(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? row[i - bpp]! : 0;
      const b = prev[i]!;
      const c = i >= bpp ? prev[i - bpp]! : 0;
      const add = filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? (a + b) >> 1 : filter === 4 ? paeth(a, b, c) : -1;
      if (add < 0) throw new Error(`${name}: filter ${filter}`);
      row[i] = (row[i]! + add) & 0xff;
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      data[o] = row[x * bpp]!;
      data[o + 1] = row[x * bpp + 1]!;
      data[o + 2] = row[x * bpp + 2]!;
      data[o + 3] = bpp === 4 ? row[x * bpp + 3]! : 255;
    }
    prev = row;
  }
  return { width, height, data };
}

/** The image at `size` x `size`: each output pixel the area-weighted mean of the source under it, on premultiplied alpha. */
function resize(image: Image, size: number): Image {
  if (image.width !== image.height) throw new Error("not square");
  const scale = image.width / size;
  const out = new Uint8Array(size * size * 4);
  // The source range of an output index along one axis: [start, end) in source pixels, with each pixel's weight.
  const span = (i: number): Array<[number, number]> => {
    const lo = i * scale;
    const hi = (i + 1) * scale;
    const spans: Array<[number, number]> = [];
    for (let p = Math.floor(lo); p < Math.min(Math.ceil(hi), image.width); p++) spans.push([p, Math.min(hi, p + 1) - Math.max(lo, p)]);
    return spans;
  };
  const columns = Array.from({ length: size }, (_, i) => span(i));
  for (let y = 0; y < size; y++) {
    const rows = columns[y]!;
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let weight = 0;
      for (const [sy, wy] of rows) {
        for (const [sx, wx] of columns[x]!) {
          const o = (sy * image.width + sx) * 4;
          const w = wx * wy;
          const alpha = image.data[o + 3]! / 255;
          r += image.data[o]! * alpha * w;
          g += image.data[o + 1]! * alpha * w;
          b += image.data[o + 2]! * alpha * w;
          a += alpha * w;
          weight += w;
        }
      }
      const o = (y * size + x) * 4;
      if (a > 0) {
        out[o] = Math.round(r / a);
        out[o + 1] = Math.round(g / a);
        out[o + 2] = Math.round(b / a);
      }
      out[o + 3] = Math.round((a / weight) * 255);
    }
  }
  return { width: size, height: size, data: out };
}

function chunk(type: string, body: Uint8Array): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, "latin1");
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
  return Buffer.concat([head, body, tail]);
}

/** An 8-bit RGBA PNG (RGB when every pixel is opaque), each row with the filter that leaves the smallest sum of magnitudes. */
function encode({ width, height, data }: Image): Buffer {
  const opaque = data.every((v, i) => i % 4 !== 3 || v === 255);
  const bpp = opaque ? 3 : 4;
  const stride = width * bpp;
  const rows = Buffer.alloc((stride + 1) * height);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const row = new Uint8Array(stride);
    for (let x = 0; x < width; x++) for (let k = 0; k < bpp; k++) row[x * bpp + k] = data[(y * width + x) * 4 + k]!;
    let best = -1;
    let bestSum = Infinity;
    let bestRow: Uint8Array = row;
    for (let filter = 0; filter < 5; filter++) {
      const out = new Uint8Array(stride);
      let sum = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= bpp ? row[i - bpp]! : 0;
        const b = prev[i]!;
        const c = i >= bpp ? prev[i - bpp]! : 0;
        const predict = filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? (a + b) >> 1 : paeth(a, b, c);
        out[i] = (row[i]! - predict) & 0xff;
        sum += out[i]! < 128 ? out[i]! : 256 - out[i]!;
      }
      if (sum < bestSum) [best, bestSum, bestRow] = [filter, sum, out];
    }
    rows[y * (stride + 1)] = best;
    rows.set(bestRow, y * (stride + 1) + 1);
    prev = row;
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, opaque ? 2 : 6, 0, 0, 0], 8);
  return Buffer.concat([SIGNATURE, chunk("IHDR", header), chunk("IDAT", deflateSync(rows, { level: 9 })), chunk("IEND", new Uint8Array(0))]);
}

const check = process.argv.includes("--check");
let stale = false;
const written = new Set<string>();
mkdirSync(OUT, { recursive: true });
const sources = readdirSync(SOURCE).filter((f) => /^[a-z]{9}\.png$/.test(f) && f !== "00.png").sort();
const totals = new Map<number, number>(SIZES.map((s) => [s, 0]));
let before = 0;
for (const file of sources) {
  const key = file.slice(0, 9);
  const src = readFileSync(join(SOURCE, file));
  const image = decode(file, src);
  before += src.length;
  for (const size of SIZES) {
    const pixels = resize(image, size);
    if (check) {
      const names = readdirSync(OUT).filter((n) => n.startsWith(`${key}.${size}.`));
      const name = names.length === 1 && new RegExp(`^${key}\\.${size}\\.([0-9a-f]{10})\\.png$`).test(names[0]!) ? names[0]! : null;
      let same = false;
      if (name) {
        const current = readFileSync(join(OUT, name));
        written.add(name);
        totals.set(size, totals.get(size)! + current.length);
        try {
          const got = decode(name, current);
          same = hashOf(current) === name.split(".")[2] && got.width === size && got.height === size && Buffer.compare(got.data, pixels.data) === 0;
        } catch {}
      }
      console.log(`${key}: ${image.width} -> ${size}: ${same ? "current" : "STALE"} (${name ?? "missing"})`);
      if (!same) stale = true;
      continue;
    }
    const out = encode(pixels);
    const target = `${key}.${size}.${hashOf(out)}.png`;
    written.add(target);
    totals.set(size, totals.get(size)! + out.length);
    console.log(`${key}: ${image.width} -> ${size}: ${src.length} -> ${out.length} B (${target})`);
    writeFileSync(join(OUT, target), out);
  }
}
for (const name of readdirSync(OUT)) {
  if (written.has(name)) continue;
  if (check) stale = true;
  else unlinkSync(join(OUT, name));
}
console.log(`${sources.length} plans: originals ${before} B, ${SIZES.map((s) => `${s}: ${totals.get(s)} B`).join(", ")}`);
if (check && stale) {
  console.error("public/renderer-assets/tiles is not what this script writes: run node scripts/compress-tiles.ts");
  process.exit(1);
}
