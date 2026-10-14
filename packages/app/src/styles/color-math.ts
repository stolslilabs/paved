/** OKLCH to sRGB and the WCAG 2 contrast ratio: what the Foundations stories compute (no colour is typed twice). */

export type Rgb = readonly [number, number, number];

/** `oklch(0.829 0.130 83.0)` as [L, C, H]. */
export function parseOklch(value: string): [number, number, number] {
  const m = value.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/);
  if (!m) throw new Error(`not an oklch colour: ${value}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** Linear-light sRGB, each channel clipped to [0, 1] (what a browser paints for an in-gamut colour). */
export function oklchToLinear([l, c, h]: readonly [number, number, number]): Rgb {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
  return rgb.map((v) => Math.min(1, Math.max(0, v))) as unknown as Rgb;
}

const encode = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

/** sRGB 0-255 channels. */
export function oklchToRgb(color: readonly [number, number, number]): Rgb {
  return oklchToLinear(color).map((v) => Math.round(encode(v) * 255)) as unknown as Rgb;
}

export function rgbToHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

export function hexToRgb(hex: string): Rgb {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) throw new Error(`not a hex colour: ${hex}`);
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** WCAG 2 relative luminance of linear-light sRGB. */
const luminance = ([r, g, b]: Rgb) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** WCAG 2 contrast ratio of two oklch colours, 1 to 21. */
export function contrast(a: string, b: string): number {
  const la = luminance(oklchToLinear(parseOklch(a)));
  const lb = luminance(oklchToLinear(parseOklch(b)));
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** The WCAG level a ratio reaches for body text (AAA 7, AA 4.5), for large text and UI parts (3), or none. */
export function level(ratio: number): "AAA" | "AA" | "AA large" | "fail" {
  if (ratio >= 7) return "AAA";
  if (ratio >= 4.5) return "AA";
  if (ratio >= 3) return "AA large";
  return "fail";
}
