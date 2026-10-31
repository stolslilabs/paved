/**
 * AVATAR-LIVING (exploration): colours moved from one family to another in OKLCH (Ottosson's OKLab, polar), so a trait's tones
 * keep the measured structure of the king's: each tone's lightness and chroma scaled by the ratio of the new family's base to the
 * king's, its hue turned by the difference. The king's auburn hair's eight tones become eight blond tones, as far apart.
 */

type Lch = [number, number, number];

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function hexToLch(hex: number): Lch {
  const r = toLinear(((hex >> 16) & 255) / 255);
  const g = toLinear(((hex >> 8) & 255) / 255);
  const b = toLinear((hex & 255) / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), Math.atan2(B, A)];
}

/** Linear sRGB of an OKLCH colour (may fall outside [0, 1]: out of gamut). */
function lchToLinear([L, C, H]: Lch): [number, number, number] {
  const A = C * Math.cos(H);
  const B = C * Math.sin(H);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}

/** The colour, its chroma lowered until it is within sRGB (hue and lightness kept). */
function lchToHex(lch: Lch): number {
  let [L, C, H] = lch;
  L = Math.min(0.985, Math.max(0.02, L));
  const inside = (c: number) => lchToLinear([L, c, H]).every((v) => v >= -1e-4 && v <= 1 + 1e-4);
  if (!inside(C)) {
    let lo = 0;
    let hi = C;
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      if (inside(mid)) lo = mid;
      else hi = mid;
    }
    C = lo;
  }
  const [r, g, b] = lchToLinear([L, C, H]).map((v) => Math.round(Math.min(1, Math.max(0, toGamma(Math.min(1, Math.max(0, v))))) * 255));
  return (r! << 16) | (g! << 8) | b!;
}

/**
 * `hex`, a tone of the family whose base is `from`, as the matching tone of the family whose base is `to`: its lightness and
 * chroma scaled by the bases' ratios, its hue turned by their difference. A grey base (no chroma) takes the tones' chroma off.
 */
export function shiftTone(hex: number, from: number, to: number): number {
  if (from === to) return hex;
  const [L, C, H] = hexToLch(hex);
  const [Lf, Cf, Hf] = hexToLch(from);
  const [Lt, Ct, Ht] = hexToLch(to);
  // Lightness: scaled to a darker family (its tones closer together, as dark tones are); to a lighter one, the same spread
  // about the new base (scaled, a blond's light tones would clip white).
  const L2 = Lt < Lf ? L * (Lt / Lf) : Lt + (L - Lf);
  const C2 = Cf > 0.01 ? C * (Ct / Cf) : Ct;
  return lchToHex([L2, C2, H + (Ht - Hf)]);
}

/** The OKLab lightness of a colour (0 black, 1 white): the checks' contrast between two features. */
export const lightness = (hex: number): number => hexToLch(hex)[0];

/** WCAG's contrast ratio of two sRGB colours (1 to 21). */
export function contrast(a: number, b: number): number {
  const lum = (hex: number) => {
    const [r, g, bl] = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((c) => toLinear(c / 255));
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
}

/** The OKLab distance of two colours (perceptual: about 0.02 is just noticeable). */
export function distance(a: number, b: number): number {
  const [La, Ca, Ha] = hexToLch(a);
  const [Lb, Cb, Hb] = hexToLch(b);
  return Math.hypot(La - Lb, Ca * Math.cos(Ha) - Cb * Math.cos(Hb), Ca * Math.sin(Ha) - Cb * Math.sin(Hb));
}

/**
 * `hex` moved in lightness away from `from` until the two are at least `gap` apart (OKLab), its hue and chroma kept: a feature
 * that must read against what it sits on (a beard on the skin). `way`: -1 darker, 1 lighter; by default away from `from`.
 */
export function apart(hex: number, from: number, gap: number, way?: -1 | 1): number {
  if (distance(hex, from) >= gap) return hex;
  const [L, C, H] = hexToLch(hex);
  const sign = way ?? (L <= hexToLch(from)[0] ? -1 : 1);
  for (let step = 1; step <= 40; step++) {
    const moved = lchToHex([L + sign * step * 0.01, C, H]);
    if (distance(moved, from) >= gap) return moved;
  }
  return lchToHex([L + sign * 0.4, C, H]);
}
