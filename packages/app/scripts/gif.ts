/**
 * An animated GIF from RGBA frames, encoded here (a fixed palette, a colour cube and a grey ramp, LZW): no package and no
 * ffmpeg needed. Shared by the capture scripts (`home-village-captures.ts`, `home-loading-captures.ts`).
 */

/** The GIF's palette: a 6 x 6 x 6 colour cube (216), then a ramp of 40 greys (the fog, the panels), 256 in all. */
const GREYS = 40;
const palette = (): number[] => {
  const out: number[] = [];
  for (let r = 0; r < 6; r++) for (let g = 0; g < 6; g++) for (let b = 0; b < 6; b++) out.push(r * 51, g * 51, b * 51);
  for (let i = 0; i < GREYS; i++) {
    const v = Math.round((i * 255) / (GREYS - 1));
    out.push(v, v, v);
  }
  return out;
};
/** A pixel's palette index: a near-grey one on the ramp, any other in the cube. */
const indexOf = (r: number, g: number, b: number): number => {
  if (Math.max(r, g, b) - Math.min(r, g, b) < 14) return 216 + Math.round((((r + g + b) / 3) * (GREYS - 1)) / 255);
  return Math.round(r / 51) * 36 + Math.round(g / 51) * 6 + Math.round(b / 51);
};

/** A frame's palette indices, LZW-coded in 255-byte sub-blocks (GIF89a, minimum code size 8). */
function lzw(indices: Uint8Array): number[] {
  const out: number[] = [];
  let cur = 0;
  let bits = 0;
  let size = 9;
  const emit = (code: number) => {
    cur |= code << bits;
    bits += size;
    while (bits >= 8) {
      out.push(cur & 0xff);
      cur >>>= 8;
      bits -= 8;
    }
  };
  const CLEAR = 256;
  let next = 258;
  let table = new Map<number, number>();
  emit(CLEAR);
  let prefix = indices[0]!;
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i]!;
    const key = (prefix << 8) | k;
    const found = table.get(key);
    if (found !== undefined) {
      prefix = found;
      continue;
    }
    emit(prefix);
    if (next === 4096) {
      emit(CLEAR);
      table = new Map();
      next = 258;
      size = 9;
    } else {
      table.set(key, next);
      if (next === 1 << size) size++;
      next++;
    }
    prefix = k;
  }
  emit(prefix);
  emit(257);
  if (bits > 0) out.push(cur & 0xff);
  const blocks: number[] = [8];
  for (let i = 0; i < out.length; i += 255) {
    const chunk = out.slice(i, i + 255);
    blocks.push(chunk.length, ...chunk);
  }
  blocks.push(0);
  return blocks;
}

/** An animated GIF of `frames` (RGBA), each shown `delayCs` hundredths of a second, looping. */
export function encodeGif(width: number, height: number, frames: Uint8Array[], delayCs: number): Buffer {
  const bytes: number[] = [];
  const u16 = (n: number) => bytes.push(n & 0xff, (n >> 8) & 0xff);
  bytes.push(...Buffer.from("GIF89a"));
  u16(width);
  u16(height);
  bytes.push(0xf7, 0, 0, ...palette());
  bytes.push(0x21, 0xff, 11, ...Buffer.from("NETSCAPE2.0"), 3, 1, 0, 0, 0);
  for (const rgbaFrame of frames) {
    const indices = new Uint8Array(width * height);
    for (let p = 0; p < indices.length; p++) indices[p] = indexOf(rgbaFrame[p * 4]!, rgbaFrame[p * 4 + 1]!, rgbaFrame[p * 4 + 2]!);
    bytes.push(0x21, 0xf9, 4, 0);
    u16(delayCs);
    bytes.push(0, 0, 0x2c);
    u16(0);
    u16(0);
    u16(width);
    u16(height);
    bytes.push(0);
    for (const b of lzw(indices)) bytes.push(b);
  }
  bytes.push(0x3b);
  return Buffer.from(bytes);
}
