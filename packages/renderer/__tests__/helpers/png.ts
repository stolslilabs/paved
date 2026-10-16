import { inflateSync } from "node:zlib";
/**
 * Decodes an 8-bit, non-interlaced PNG (grey, RGB, palette, grey and alpha, RGBA) to RGBA: enough for the tile models'
 * palette textures, with no image library in the renderer's dependencies.
 */
export function decodePng(png: Uint8Array): { width: number; height: number; rgba: Uint8Array } {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let width = 0, height = 0, depth = 0, colour = 0, interlace = 0;
  let palette: Uint8Array | null = null, trns: Uint8Array | null = null;
  const idat: Uint8Array[] = [];
  for (let at = 8; at < png.length; ) {
    const len = view.getUint32(at);
    const type = String.fromCharCode(...png.subarray(at + 4, at + 8));
    const data = png.subarray(at + 8, at + 8 + len);
    if (type === "IHDR") { width = view.getUint32(at + 8); height = view.getUint32(at + 12); depth = data[8]; colour = data[9]; interlace = data[12]; }
    else if (type === "PLTE") palette = data;
    else if (type === "tRNS") trns = data;
    else if (type === "IDAT") idat.push(data);
    at += 12 + len;
  }
  if (depth !== 8 || interlace !== 0) throw new Error(`unsupported PNG: depth ${depth}, interlace ${interlace}`);
  const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[colour];
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? pixels[y * stride + x - channels] : 0;
      const b = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const c = x >= channels && y > 0 ? pixels[(y - 1) * stride + x - channels] : 0;
      const p = a + b - c;
      const pred = filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? (a + b) >> 1
        : Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c) ? a : Math.abs(p - b) <= Math.abs(p - c) ? b : c;
      pixels[y * stride + x] = (line[x] + pred) & 255;
    }
  }
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const s = pixels.subarray(i * channels, i * channels + channels);
    const o = rgba.subarray(i * 4, i * 4 + 4);
    if (colour === 3) { o.set(palette!.subarray(s[0] * 3, s[0] * 3 + 3)); o[3] = trns && s[0] < trns.length ? trns[s[0]] : 255; }
    else if (colour === 0 || colour === 4) { o.fill(s[0], 0, 3); o[3] = colour === 4 ? s[1] : 255; }
    else { o.set(s.subarray(0, 3)); o[3] = colour === 6 ? s[3] : 255; }
  }
  return { width, height, rgba };
}
