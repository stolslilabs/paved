import * as THREE from "three";
import type { AmbientEffect } from "./ambient-loop";
import { createOverlayDepth, overlayDepthTest, type OverlayDepth } from "./overlay-pass";
import type { PlacementSlot } from "./placement";
import { TILE_SIZE } from "./types";

/**
 * The square grid (SQUARE-GRID): Realms' hex board (BibliothecaDAO/eternum, `apps/game/src/three`, main e42bf721 of 2026-10-21)
 * drawn on square cells, in Paved's colours. Three parts, each the port of one of Realms':
 *
 * - The backdrop (its world map's unexplored ground, `terrain/terrain-fog-field.ts`): the board floats over Realms' fog instead of
 *   the landscape, its formula as is, in Paved's colours. A near-black ground under a drifting veil the colour of the tiles'
 *   grass (up to 68 % of its mist's strength, 0.24 at its "detail" terrain tier: its fog's two octaves of MaterialX Perlin noise,
 *   ported bit for bit, `MX_NOISE_GLSL`), faint threads in Paved's gold along the veil's contour (its ethereal energy at 4.5 %, a
 *   light flowing along them), and every cell's border as its fog draws a hex's (#747970 at 20 %). Away from the placed tiles the
 *   fog turns to grey: in colour within `grayFrom` cells of a tile, grey past `grayTo` (`grayscaleAt`, read from a distance field
 *   of the tiles' cells, `distanceField`). Realms draws its fog with no post-processing but its tone map (ACES at an exposure of
 *   0.8): here it is drawn into its own target and laid under the scene by the finish pass with that tone map, after Paved's grade
 *   (`overlay-pass.ts`'s underlay). The fog of war, its landscape and the scene's distance fog stay off while it shows
 *   (`GameScene`).
 * - The lines (its `terrain/terrain-hex-node.ts` and `shadeTerrainSurface` of `terrain/terrain-material.ts`), with the backdrop
 *   off: every cell's border drawn in the landscape ground's own shader (`SQUARE_GRID_GLSL`, run by `fog-of-war.ts`), made of the
 *   ground's colour, a line `lines.halfWidth` each side of the edge, antialiased over 1.2 px, mixed in at 42 %.
 * - The highlight (its `managers/highlight-hex-manager.ts`, the overlay of an army's allowed moves), on every playable slot as
 *   Realms lights an allowed hex (each the end of its own path): rounded squares stacked in the cell, a big one (Realms' route
 *   fill), a middle one turned the other way, a small one on top (Realms' endpoint), in the app's brown, green and white (Paved's
 *   "P" in its display font at the middle, off by default). They breathe on Realms' pulse, on the pending tile's clock (`update`'s
 *   phase: the two breathe together), and the top square keeps its opacity over the others (`layerOpacities`); a new set rolls in cell by cell,
 *   the first with a flash. Its shapes have a few styles (`HighlightStyle`). Unlike Realms', it lies in the grid's plane
 *   (`HIGHLIGHT_Y`). None on a slot no rotation fits, none under the tile in hand (its preview or the tile placed:
 *   `highlightsOf`), and once a tile is placed the others fade (`highlight.dim`). It is drawn as given, untouched by the look's
 *   tone map and grade, as Realms draws it (`toneMapped: false`): its own scene, drawn by `OverlayPass` and laid over the graded
 *   scene. It takes the plates' place (`GameScene` turns them off while it shows).
 *
 * Realms' lengths are shares of its hex radius (1, a cell √3 across); here they are the same shares of the half cell (1.5, a cell
 * `TILE_SIZE` across). Its world units are `ETERNUM_SCALE` of Paved's (its noise scales, its line widths).
 *
 * Render on demand holds: a change of cell, slot or tile draws one frame (the caller's `requestRender`, and `onChange` once the
 * logo's font is in); `update` asks for frames while a set rolls in or the dim eases; the backdrop's drift and the pulse ask for
 * them on the ambient loop (`step`, an `AmbientEffect`), so they stop with the ambient effects (the settings, the Low tier, reduced
 * motion) and while the board is covered; a pending tile asks for every frame, and the pulse follows it there.
 */
export interface SquareGridSettings {
  /** Off by default in the renderer; the app's board turns it on. */
  enabled: boolean;
  lines: {
    enabled: boolean;
    /** How far the line reaches each side of a cell edge, world units: Realms' 0.008, scaled. */
    halfWidth: number;
    /** How far the ground goes to the line's colour on the line (Realms' 0.42). */
    strength: number;
    /** The ground is grass, 0 to 1: the line goes that far (times 0.65) towards a muted green (Realms' grass contrast). */
    grass: number;
  };
  backdrop: {
    enabled: boolean;
    /**
     * The fog's colours, CSS hex: its ground (Paved's board, a touch of the tiles' green in it), and the veil it goes to under the
     * thickest mist (a sage of the tiles' grass, as light as Realms' taupe veil: at its small share a darker one would not show),
     * `veilStrength` times `mist` of the way at most (Realms' 0.68 for Blitz, and its "detail" tier's mist strength, 0.24).
     */
    ground: string;
    veil: string;
    veilStrength: number;
    mist: number;
    /** How fast the fog drifts, a share of Realms' (its "detail" tier's 1). */
    motion: number;
    /** The threads along the veil's contour (Realms' ethereal energy, 0.045; 0: none), from `energyColor` to `energyGlow`. */
    energy: number;
    energyColor: string;
    energyGlow: string;
    /** Every cell's border on the fog (Realms draws a hex's in #747970 at 0.2). */
    lineColor: string;
    lineStrength: number;
    /** The exposure of Realms' tone map (ACES), which the backdrop is drawn with instead of the look's. */
    exposure: number;
    /** The shapes the fog draws (`BackdropPattern`): Paved's voxel blocks (the owner's pick), Realms' own, or another of Paved's. */
    pattern: BackdropPattern;
    /** The voxel blocks a cell's side ("voxels"): eight, five of the tiles' voxels each (a tile is forty). */
    voxels: number;
    /**
     * How far the veil takes the season's hue (the cycle's ground colour of the season's day, at the veil's lightness:
     * `seasonVeil`; steady through the day and the night), 0 to 1. The time of day reaches the whole backdrop as its brightness
     * only (`backdropLight`).
     */
    seasonShare: number;
    /** The fog is in colour within `grayFrom` cells of a placed tile, grey past `grayTo` (a smoothstep between). */
    grayFrom: number;
    grayTo: number;
  };
  highlight: {
    enabled: boolean;
    /**
     * The squares' colours, bottom to top, and the logo's, CSS hex: the app's brown (amber-700), its green (meadow-400, its
     * success) and white; the logo white.
     */
    colors: { route: string; middle: string; top: string; logo: string };
    /**
     * The shapes (`HighlightStyle`); `twist`, the top square's turn in degrees (the middle one turns the other way) for "twist"
     * and "frame", and the most "breathe" turns them.
     */
    style: HighlightStyle;
    twist: number;
    /**
     * Paved's "P" at the middle (off by default): its text, its font (the app's display font), its size (a share of the cell)
     * and opacity.
     */
    logo: { enabled: boolean; text: string; font: string; scale: number; opacity: number };
    /** The fillers' opacity, a share of their layers' own (Realms'): the whole highlight, its logo and its flash included. */
    opacity: number;
    /** The layers breathe (Realms' pulse). */
    pulse: boolean;
    /** A new set rolls in cell by cell, the first with a flash; never under reduced motion. */
    rollout: boolean;
    /**
     * Once a tile is placed (waiting for validation), the other cells fade: their chroma down to `saturation` of itself, their
     * opacity times `opacity` (on top of the fillers' own), over `ms` (at once under reduced motion); back when the tile goes.
     */
    dim: { saturation: number; opacity: number; ms: number };
  };
}

type HighlightInput = Partial<Omit<SquareGridSettings["highlight"], "dim" | "colors" | "logo">> & {
  dim?: Partial<SquareGridSettings["highlight"]["dim"]>;
  colors?: Partial<SquareGridSettings["highlight"]["colors"]>;
  logo?: Partial<SquareGridSettings["highlight"]["logo"]>;
};

export type SquareGridSettingsInput = { enabled?: boolean } & { [K in Exclude<keyof SquareGridSettings, "enabled" | "highlight">]?: Partial<SquareGridSettings[K]> } & {
  highlight?: HighlightInput;
};

/**
 * The backdrop's shapes, each from the same drifting mist, the same colours and the same grey away from the tiles: "realms",
 * Realms' veil and its threads along the mist's contour; "cobbles", paving stones (Paved's name), three to a cell's side, a gold
 * light running along their mortar; "contours", the mist's contour lines as on a map, every fourth one gilded; "voxels", the mist
 * in blocks (`voxels` a cell's side, eight by default: five of the tiles' voxels each), in four steps, a gap between them.
 */
export type BackdropPattern = "realms" | "cobbles" | "contours" | "voxels";

export const BACKDROP_PATTERNS: readonly BackdropPattern[] = ["realms", "cobbles", "contours", "voxels"];

/**
 * The highlight's shapes: "plain", Realms' own (squares one in the other, square to the cell); "twist", the top square turned by
 * `twist` degrees and the middle one the other way; "diamond", the top square turned a quarter (a diamond), the middle one by
 * `twist` the other way; "breathe", the two turning with the pulse, up to `twist` at its height and back; "frame", "twist" over a
 * bottom square that is a frame (its middle open).
 */
export type HighlightStyle = "plain" | "twist" | "diamond" | "breathe" | "frame";

export const HIGHLIGHT_STYLES: readonly HighlightStyle[] = ["plain", "twist", "diamond", "breathe", "frame"];

/** Realms' world to Paved's: its cell is √3 across (a pointy hex of radius 1), Paved's `TILE_SIZE`. */
export const ETERNUM_SCALE = TILE_SIZE / Math.sqrt(3);

/** Half a cell: Realms' radii, shares of its hex radius, are shares of it here. */
const HALF_CELL = TILE_SIZE / 2;

export const DEFAULT_SQUARE_GRID_SETTINGS: SquareGridSettings = {
  enabled: false,
  lines: { enabled: true, halfWidth: 0.008 * ETERNUM_SCALE, strength: 0.42, grass: 1 },
  backdrop: {
    enabled: true,
    ground: "#0e100d",
    veil: "#a4ab80",
    veilStrength: 0.68,
    mist: 0.24,
    motion: 1,
    energy: 0.045,
    energyColor: "#f0bf5b",
    energyGlow: "#f6d8a1",
    lineColor: "#747970",
    lineStrength: 0.2,
    exposure: 0.8,
    grayFrom: 1.5,
    grayTo: 6,
    pattern: "voxels",
    voxels: 8,
    seasonShare: 0.6,
  },
  highlight: {
    enabled: true,
    colors: { route: "#914e02", middle: "#6eca6f", top: "#ffffff", logo: "#ffffff" },
    style: "twist",
    twist: 12,
    logo: { enabled: false, text: "P", font: '700 192px "Almendra", Georgia, serif', scale: 0.42, opacity: 0.5 },
    opacity: 0.4,
    pulse: true,
    rollout: true,
    dim: { saturation: 0.15, opacity: 0.4, ms: 200 },
  },
};

/** `input` over `base`, group by group; a style or a pattern that is not one of the list keeps the base's. */
export function resolveSquareGridSettings(input: SquareGridSettingsInput = {}, base = DEFAULT_SQUARE_GRID_SETTINGS): SquareGridSettings {
  const h = input.highlight;
  const highlight = {
    ...base.highlight,
    ...h,
    dim: { ...base.highlight.dim, ...h?.dim },
    colors: { ...base.highlight.colors, ...h?.colors },
    logo: { ...base.highlight.logo, ...h?.logo },
  };
  if (!HIGHLIGHT_STYLES.includes(highlight.style)) highlight.style = base.highlight.style;
  const backdrop = { ...base.backdrop, ...input.backdrop };
  if (!BACKDROP_PATTERNS.includes(backdrop.pattern)) backdrop.pattern = base.backdrop.pattern;
  return {
    enabled: input.enabled ?? base.enabled,
    lines: { ...base.lines, ...input.lines },
    backdrop,
    highlight,
  };
}

/** Whether the backdrop shows: the grid and its backdrop on. The fog of war, its landscape and the distance fog stay off then. */
export function backdropShown(settings: SquareGridSettings): boolean {
  return settings.enabled && settings.backdrop.enabled;
}

/** Whether the highlight shows: the grid and its highlight on. The plates stay off then. */
export function highlightShown(settings: SquareGridSettings): boolean {
  return settings.enabled && settings.highlight.enabled;
}

/** What the ground's shader takes of the lines: their strength (0: none), their half width and the grass share. */
export interface GridLineUniforms {
  strength: number;
  halfWidth: number;
  grass: number;
}

/** The lines as the landscape ground draws them: none with the grid or its lines off. */
export function gridLineUniforms(settings: SquareGridSettings): GridLineUniforms {
  const { lines } = settings;
  return { strength: settings.enabled && lines.enabled ? clamp01(lines.strength) : 0, halfWidth: Math.max(0, lines.halfWidth), grass: clamp01(lines.grass) };
}

/** The distance from a point of the board (world x, z) to the nearest cell edge: half a cell at a centre, 0 on an edge. */
export function squareEdgeDistance(x: number, z: number): number {
  const lx = x - TILE_SIZE * Math.floor(x / TILE_SIZE + 0.5);
  const lz = z - TILE_SIZE * Math.floor(z / TILE_SIZE + 0.5);
  return HALF_CELL - Math.max(Math.abs(lx), Math.abs(lz));
}

/** How much of the line covers a point `distance` from the edge, the distance moving `pixel` a screen pixel (the shader's). */
export function gridLineAt(distance: number, pixel: number, halfWidth: number): number {
  const edge1 = halfWidth + 1.2 * Math.max(pixel, 0.001);
  const t = clamp01((distance - halfWidth) / (edge1 - halfWidth));
  return 1 - t * t * (3 - 2 * t);
}

/** The line's colour over a ground of linear colour `ground` (the shader's): the ground at 45 %, a 0.14 grey on a dark one, towards a muted green on grass. */
export function gridLineColor(ground: readonly [number, number, number], grass: number): [number, number, number] {
  const luminance = ground[0] * 0.2126 + ground[1] * 0.7152 + ground[2] * 0.0722;
  const t = clamp01((luminance - 0.025) / (0.12 - 0.025));
  const dark = 1 - t * t * (3 - 2 * t);
  const green = [0.22, 0.26, 0.19];
  return ground.map((c, i) => {
    const base = c * 0.45 * (1 - dark) + 0.14 * dark;
    return base + (green[i]! - base) * clamp01(grass) * 0.65;
  }) as [number, number, number];
}

/** The cell edge distance in GLSL (`squareGridEdge(board)`), shared by the landscape's lines and the backdrop's. */
const SQUARE_EDGE_GLSL = /* glsl */ `
float squareGridEdge(vec2 board) {
  vec2 local = board - ${TILE_SIZE.toFixed(1)} * floor(board / ${TILE_SIZE.toFixed(1)} + 0.5);
  return ${HALF_CELL.toFixed(2)} - max(abs(local.x), abs(local.y));
}
`;

/**
 * The lines in the landscape ground's fragment shader: `squareGridShade(colour, board)` is the ground's linear colour at a point
 * of the board (world x, z, cells at whole multiples of `TILE_SIZE`) with the line over it. Uniforms: `uGridLine` (the strength,
 * 0: none), `uGridHalfWidth`, `uGridGrass`. Needs `fwidth` (WebGL 2, or the derivatives extension three turns on).
 */
export const SQUARE_GRID_GLSL = /* glsl */ `
uniform float uGridLine;
uniform float uGridHalfWidth;
uniform float uGridGrass;
${SQUARE_EDGE_GLSL}
vec3 squareGridShade(vec3 surface, vec2 board) {
  if (uGridLine <= 0.0) return surface;
  float d = squareGridEdge(board);
  float px = max(fwidth(d), 0.001);
  float border = 1.0 - smoothstep(uGridHalfWidth, uGridHalfWidth + 1.2 * px, d);
  float luminance = dot(surface, vec3(0.2126, 0.7152, 0.0722));
  float dark = 1.0 - smoothstep(0.025, 0.12, luminance);
  vec3 line = mix(surface * 0.45, vec3(0.14), dark);
  line = mix(line, vec3(0.22, 0.26, 0.19), uGridGrass * 0.65);
  return mix(surface, line, border * uGridLine);
}
`;

/**
 * MaterialX's 3D Perlin noise (`mx_perlin_noise_float` of its `stdlib/genglsl/lib/mx_noise.glsl`, as three's
 * `MaterialXNoise.js` ports it, which Realms' fog calls through `mx_noise_float`): Jenkins' lookup3 hash of the lattice corner,
 * Perlin's 12 gradients, the quintic fade, a trilinear blend, scaled by 0.982. GLSL ES 3.00 (WebGL 2): it needs `uint`.
 */
export const MX_NOISE_GLSL = /* glsl */ `
uint mxRotl32(uint x, int k) { return (x << k) | (x >> (32 - k)); }
uint mxBjfinal(uint a, uint b, uint c) {
  c ^= b; c -= mxRotl32(b, 14);
  a ^= c; a -= mxRotl32(c, 11);
  b ^= a; b -= mxRotl32(a, 25);
  c ^= b; c -= mxRotl32(b, 16);
  a ^= c; a -= mxRotl32(c, 4);
  b ^= a; b -= mxRotl32(a, 14);
  c ^= b; c -= mxRotl32(b, 24);
  return c;
}
uint mxHash(int x, int y, int z) {
  uint a = 0xdeadbeefu + (3u << 2u) + 13u;
  uint b = a;
  uint c = a;
  a += uint(x);
  b += uint(y);
  c += uint(z);
  return mxBjfinal(a, b, c);
}
float mxGradient(uint hash, float x, float y, float z) {
  uint h = hash & 15u;
  float u = h < 8u ? x : y;
  float v = h < 4u ? y : ((h == 12u || h == 14u) ? x : z);
  return ((h & 1u) != 0u ? -u : u) + ((h & 2u) != 0u ? -v : v);
}
float mxFade(float t) { return t * t * t * (t * (t * 6.0 - 15.0) + 10.0); }
float mxPerlin(vec3 p) {
  vec3 fl = floor(p);
  ivec3 i = ivec3(fl);
  vec3 f = p - fl;
  float u = mxFade(f.x);
  float v = mxFade(f.y);
  float w = mxFade(f.z);
  float g000 = mxGradient(mxHash(i.x, i.y, i.z), f.x, f.y, f.z);
  float g100 = mxGradient(mxHash(i.x + 1, i.y, i.z), f.x - 1.0, f.y, f.z);
  float g010 = mxGradient(mxHash(i.x, i.y + 1, i.z), f.x, f.y - 1.0, f.z);
  float g110 = mxGradient(mxHash(i.x + 1, i.y + 1, i.z), f.x - 1.0, f.y - 1.0, f.z);
  float g001 = mxGradient(mxHash(i.x, i.y, i.z + 1), f.x, f.y, f.z - 1.0);
  float g101 = mxGradient(mxHash(i.x + 1, i.y, i.z + 1), f.x - 1.0, f.y, f.z - 1.0);
  float g011 = mxGradient(mxHash(i.x, i.y + 1, i.z + 1), f.x, f.y - 1.0, f.z - 1.0);
  float g111 = mxGradient(mxHash(i.x + 1, i.y + 1, i.z + 1), f.x - 1.0, f.y - 1.0, f.z - 1.0);
  float u1 = 1.0 - u;
  float v1 = 1.0 - v;
  float w1 = 1.0 - w;
  float result = w1 * (v1 * (g000 * u1 + g100 * u) + v * (g010 * u1 + g110 * u)) + w * (v1 * (g001 * u1 + g101 * u) + v * (g011 * u1 + g111 * u));
  return 0.982 * result;
}
`;

/** A light as `backdropLight` reads it: its colour (linear) times its intensity, and its direction towards it (none: all around). */
export interface SurfaceLight {
  color: THREE.Color;
  intensity: number;
  direction?: THREE.Vector3;
}

/** The light an upward surface takes from `lights` (an ambient or a sky light all of its colour, a directional one its cosine). */
export function upwardIrradiance(lights: ReadonlyArray<SurfaceLight>): THREE.Color {
  const out = new THREE.Color(0, 0, 0);
  for (const light of lights) {
    const facing = light.direction ? Math.max(0, light.direction.clone().normalize().y) : 1;
    out.r += light.color.r * light.intensity * facing;
    out.g += light.color.g * light.intensity * facing;
    out.b += light.color.b * light.intensity * facing;
  }
  return out;
}

const luminance = (c: THREE.Color) => c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;

/**
 * The backdrop's brightness: the luminance an upward surface takes now over what it takes under the look's own lights (the
 * summer's day the look is). 1 with the look's lights, lower at night. A brightness only: the hue stays the season's
 * (`seasonVeil`), with no dusk or night tint.
 */
export function backdropLight(now: ReadonlyArray<SurfaceLight>, look: ReadonlyArray<SurfaceLight>): number {
  const b = luminance(upwardIrradiance(look));
  return b > 1e-4 ? luminance(upwardIrradiance(now)) / b : 1;
}

/** The season's veil: the season's ground colour (dark), brought to the lightness of `veil` with its hue kept. */
export function seasonVeil(ground: THREE.Color, veil: THREE.Color): THREE.Color {
  const from = luminance(ground);
  return from > 1e-5 ? ground.clone().multiplyScalar(luminance(veil) / from) : veil.clone();
}

/** How far the fog is from colour (1) to grey (0) at `cells` from the nearest placed tile: a smoothstep from `grayFrom` to `grayTo`. */
export function grayscaleAt(cells: number, grayFrom: number, grayTo: number): number {
  if (!(grayTo > grayFrom)) return cells <= grayFrom ? 1 : 0;
  const t = clamp01((cells - grayFrom) / (grayTo - grayFrom));
  return 1 - t * t * (3 - 2 * t);
}

/** A distance field of the placed tiles: each cell's distance, in cells, to the nearest tile, up to `reach` (and past the field). */
export interface DistanceField {
  /** Its first cell (grid coordinates) and its size in cells. */
  minX: number;
  minY: number;
  width: number;
  height: number;
  /** The distance it stores up to: a byte of 255 is `reach` cells or more. */
  reach: number;
  /** Row by row (y), one byte a cell. */
  data: Uint8Array;
}

/**
 * The placed tiles' distance field (the backdrop's grey, `grayscaleAt`): one byte a cell over the tiles' bounds and `reach`
 * cells more on each side, so the field's border is grey (`reach` past `grayTo`). Euclidean, cell centre to cell centre. A board
 * with no tile is all in colour (a one-cell field at 0).
 */
export function distanceField(cells: ReadonlyArray<{ x: number; y: number }>, reach: number): DistanceField {
  if (cells.length === 0) return { minX: 0, minY: 0, width: 1, height: 1, reach, data: new Uint8Array([0]) };
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const c of cells) {
    minX = Math.min(minX, c.x);
    maxX = Math.max(maxX, c.x);
    minY = Math.min(minY, c.y);
    maxY = Math.max(maxY, c.y);
  }
  const margin = Math.ceil(reach);
  minX -= margin;
  minY -= margin;
  const width = maxX + margin - minX + 1;
  const height = maxY + margin - minY + 1;
  const data = new Uint8Array(width * height);
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      let best = Infinity;
      for (const c of cells) best = Math.min(best, Math.hypot(minX + i - c.x, minY + j - c.y));
      data[j * width + i] = Math.round(Math.min(1, best / reach) * 255);
    }
  }
  return { minX, minY, width, height, reach, data };
}

/** The backdrop's floor: the board's frame, flat, past the farthest view; its own scene (the underlay), so nothing hides it but the board. */
const FLOOR_SIZE = 4000;
const FLOOR_Y = -0.02;

const BACKDROP_VERTEX = /* glsl */ `
varying vec2 vBoard;
void main() {
  vBoard = position.xz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/*
 * In the shader, Realms' fog (`createFogMaterial` of its `terrain-fog-field.ts`, the surface layer, fully covered), in its units
 * (world over `ETERNUM_SCALE`):
 * - The mist (`fogMist`): a broad octave drifting and a finer one bent by it, their sum around 0.5; its veil the mist's thick part.
 * - The pattern drawn with it (`PATTERN`, `BackdropPattern`): Realms' veil and its energy (0), paving stones (1), contour lines (2)
 *   or voxel blocks (3); the energy in `uEnergyColor` to `uEnergyGlow`, at `uEnergy`; the veil in the season's hue (`uSeasonVeil`).
 * - Then grey away from the tiles (the distance field, `grayscaleAt`), every cell's border as Realms' fog draws a hex's, and all of
 *   it as bright as the board's tops are now against the look's own light (`uLight`: the time of day, `backdropLight`).
 * Its linear colour: the finish pass tone-maps it as Realms does.
 */
const BACKDROP_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform vec3 uGround;
uniform vec3 uVeil;
uniform float uVeilStrength;
uniform float uMist;
uniform float uMotion;
uniform float uEnergy;
uniform vec3 uEnergyColor;
uniform vec3 uEnergyGlow;
uniform vec3 uLineColor;
uniform float uLineStrength;
uniform float uLineHalfWidth;
uniform sampler2D uDistField;
uniform vec4 uDistRect;
uniform float uDistReach;
uniform float uGrayFrom;
uniform float uGrayTo;
uniform vec3 uSeasonVeil;
uniform float uSeasonShare;
uniform float uLight;
uniform float uVoxels;
varying vec2 vBoard;
${SQUARE_EDGE_GLSL}
${MX_NOISE_GLSL}
float fogMist(vec2 ground, float drift) {
  float broad = mxPerlin(vec3(ground.x * 0.16 + drift * 0.06, ground.y * 0.16 - drift * 0.04, drift * 0.025));
  float wisps = mxPerlin(vec3(ground.x * 0.7 + broad * 0.7 - drift * 0.12, ground.y * 0.7 + drift * 0.08, drift * 0.06));
  return clamp(broad * 0.55 + wisps * 0.45 + 0.5, 0.0, 1.0);
}
float fogHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec2 fogHash2(vec2 p) { return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
// Realms' light flowing across the board: 0 to 1 in waves.
float fogFlow(vec2 ground, float drift) { return sin(ground.x * 0.7 + ground.y * 0.43 - drift * 0.42) * 0.5 + 0.5; }
void main() {
  vec2 ground = vBoard / ${ETERNUM_SCALE.toFixed(6)};
  float drift = uTime * uMotion;
  float mist = fogMist(ground, drift);
  float flow = fogFlow(ground, drift);
  vec3 energy = mix(uEnergyColor, uEnergyGlow, flow);
  // The veil takes the season's hue (the cycle's ground colour, at the veil's own lightness).
  vec3 veilColor = mix(uVeil, uSeasonVeil, uSeasonShare);
#if PATTERN == 1
  // Paving stones, three to a cell's side (Voronoi cells), each its own shade, lit by the mist drifting over them; the mortar
  // dark, a gold light running along it.
  vec2 sp = vBoard / ${(TILE_SIZE / 3).toFixed(6)};
  vec2 ip = floor(sp);
  vec2 fp = fract(sp);
  float f1 = 8.0;
  float f2 = 8.0;
  vec2 id = ip;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 r = g + 0.15 + 0.7 * fogHash2(ip + g) - fp;
      float d = dot(r, r);
      if (d < f1) { f2 = f1; f1 = d; id = ip + g; } else if (d < f2) { f2 = d; }
    }
  }
  float edge = sqrt(f2) - sqrt(f1);
  float mortar = 1.0 - smoothstep(0.05, 0.05 + max(fwidth(edge), 1e-4) * 1.5, edge);
  float light = (0.35 + 0.65 * smoothstep(0.2, 0.8, mist)) * (0.45 + 0.55 * fogHash(id));
  vec3 color = mix(uGround, veilColor, light * uMist * uVeilStrength * 1.6);
  color = mix(color, uGround * 0.55, mortar);
  color += energy * mortar * smoothstep(0.55, 0.95, flow) * uEnergy * 2.5;
#elif PATTERN == 2
  // Contour lines of the mist, as on a map: twelve levels, every fourth one stronger and gilded; the land between them tinted
  // by its height.
  float level = mist * 12.0;
  float line = 1.0 - smoothstep(0.0, max(fwidth(level), 1e-4) * 1.2, abs(fract(level - 0.5) - 0.5));
  float major = 1.0 - step(0.5, mod(floor(level + 0.5), 4.0));
  vec3 color = mix(uGround, veilColor, smoothstep(0.2, 0.9, mist) * uMist * uVeilStrength * 0.8);
  color = mix(color, veilColor, line * (0.1 + 0.14 * major));
  color += energy * line * major * (0.4 + 0.6 * flow) * uEnergy * 2.0;
#elif PATTERN == 3
  // Voxel blocks, \`uVoxels\` a cell's side (eight by default, five of the tiles' voxels each): the mist read at each block's
  // middle, in four steps, a gap between the blocks.
  vec2 bp = vBoard * (uVoxels / ${TILE_SIZE.toFixed(1)});
  vec2 block = floor(bp);
  float m = fogMist((block + 0.5) * (${TILE_SIZE.toFixed(1)} / uVoxels) / ${ETERNUM_SCALE.toFixed(6)}, drift);
  float steps = floor(smoothstep(0.18, 0.86, m) * 4.0) / 4.0;
  vec3 color = mix(uGround, veilColor, steps * uMist * uVeilStrength * 1.3);
  vec2 inBlock = abs(fract(bp) - 0.5);
  float gap = smoothstep(0.5 - max(fwidth(bp.x), 1e-4) * 1.5, 0.5, max(inBlock.x, inBlock.y));
  color = mix(color, uGround, gap * 0.6);
#else
  // Realms' own: the veil over the ground, its threads along the mist's 0.51 contour.
  vec3 color = mix(uGround, veilColor, smoothstep(0.18, 0.86, mist) * uMist * uVeilStrength);
  if (uEnergy > 0.0) {
    float contour = abs(mist - 0.51);
    float thread = 1.0 - smoothstep(0.003, max(fwidth(mist), 0.001) + 0.009, contour);
    float halo = (1.0 - smoothstep(0.008, 0.065, contour)) * 0.13;
    float flowing = smoothstep(0.35, 0.94, flow) * 0.8 + 0.2;
    color += energy * (thread + halo) * flowing * uEnergy;
  }
#endif
  float cells = texture2D(uDistField, (vBoard / ${TILE_SIZE.toFixed(1)} - uDistRect.xy + 0.5) * uDistRect.zw).r * uDistReach;
  float saturation = 1.0 - smoothstep(uGrayFrom, max(uGrayTo, uGrayFrom + 1e-4), cells);
  color = mix(vec3(dot(color, vec3(0.2126, 0.7152, 0.0722))), color, saturation);
  float d = squareGridEdge(vBoard);
  float border = 1.0 - smoothstep(uLineHalfWidth, max(fwidth(d), 0.001) * 1.2 + uLineHalfWidth, d);
  // As bright as the board's tops are now (the time of day), against the look's own light.
  gl_FragColor = vec4(mix(color, uLineColor, border * uLineStrength) * uLight, 1.0);
}
`;

type BackdropMaterial = THREE.ShaderMaterial & {
  uniforms: {
    uTime: { value: number };
    uGround: THREE.IUniform<THREE.Color>;
    uVeil: THREE.IUniform<THREE.Color>;
    uVeilStrength: THREE.IUniform<number>;
    uMist: THREE.IUniform<number>;
    uMotion: THREE.IUniform<number>;
    uEnergy: THREE.IUniform<number>;
    uEnergyColor: THREE.IUniform<THREE.Color>;
    uEnergyGlow: THREE.IUniform<THREE.Color>;
    uLineColor: THREE.IUniform<THREE.Color>;
    uLineStrength: THREE.IUniform<number>;
    uLineHalfWidth: THREE.IUniform<number>;
    uDistField: THREE.IUniform<THREE.Texture | null>;
    uDistRect: THREE.IUniform<THREE.Vector4>;
    uDistReach: THREE.IUniform<number>;
    uGrayFrom: THREE.IUniform<number>;
    uGrayTo: THREE.IUniform<number>;
    uSeasonVeil: THREE.IUniform<THREE.Color>;
    uSeasonShare: THREE.IUniform<number>;
    uLight: THREE.IUniform<number>;
    uVoxels: THREE.IUniform<number>;
  };
};

function createBackdropMaterial(time: { value: number }): BackdropMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: time,
      uGround: { value: new THREE.Color() },
      uVeil: { value: new THREE.Color() },
      uVeilStrength: { value: 0 },
      uMist: { value: 0 },
      uMotion: { value: 1 },
      uEnergy: { value: 0 },
      uEnergyColor: { value: new THREE.Color() },
      uEnergyGlow: { value: new THREE.Color() },
      uLineColor: { value: new THREE.Color() },
      uLineStrength: { value: 0 },
      uLineHalfWidth: { value: DEFAULT_SQUARE_GRID_SETTINGS.lines.halfWidth },
      uDistField: { value: null },
      uDistRect: { value: new THREE.Vector4(0, 0, 1, 1) },
      uDistReach: { value: 1 },
      uGrayFrom: { value: 0 },
      uGrayTo: { value: 1 },
      uSeasonVeil: { value: new THREE.Color() },
      uSeasonShare: { value: 0 },
      uLight: { value: 1 },
      uVoxels: { value: 8 },
    },
    vertexShader: BACKDROP_VERTEX,
    fragmentShader: BACKDROP_FRAGMENT,
    defines: { PATTERN: 0 },
    depthTest: false,
    depthWrite: false,
    fog: false,
  }) as BackdropMaterial;
}

/** The highlight's layers, bottom to top: the three squares (Realms' route, a middle one, Realms' endpoint) and the logo. */
export type HighlightLayer = "route" | "middle" | "top" | "logo";

/**
 * Each square's look: its opacity alone at rest, how much the pulse adds to it (times the pulse factor), its scale in the cell and
 * its draw order. The big square and the top one are Realms' destination (its route fill at 0.92 + 0.06, its endpoint; its
 * default camera view's `resolveHighlightViewTuning`); the middle one sits between them. The top square's opacity is what it
 * shows over the two under it (`layerOpacities`).
 */
export const HIGHLIGHT_LAYERS: Record<Exclude<HighlightLayer, "logo">, { opacity: number; pulse: number; scale: number; order: number }> = {
  route: { opacity: 0.16, pulse: 1.25, scale: 0.98, order: 5 },
  middle: { opacity: 0.1, pulse: 1.3, scale: 0.77, order: 6 },
  top: { opacity: 0.22, pulse: 1.5, scale: 0.56, order: 7 },
};

/** The logo's draw order (over the squares) and the flash's. */
const LOGO_ORDER = 8;
const GLOW_ORDER = 9;

/**
 * The highlight lies in the grid's plane, level with the tiles' feet (`PLATE_Y`: a twentieth of a voxel up). Realms floats its
 * own above its terrain; here it stays in the plane, and the tiles hide what is behind them (its depth test, `overlay-pass.ts`).
 */
export const HIGHLIGHT_Y = 0.05 * (TILE_SIZE / 40);

/** The frame's width ("frame"), a share of the half cell: the bottom square's ring from the cell's edge in. */
const FRAME_WIDTH = 0.14;

/**
 * Realms' pulse factor at a phase of the pulse (0 to 1, the pending tile's: `PlacementRenderer.pulsePhase`): |sin πφ| / 16, from
 * 0 to 0.0625, its height at half the phase, when the pending tile is at its most opaque. Realms' own is |sin 2t| / 16, the same
 * curve over π/2 s; on the tile's clock the two breathe together.
 */
export function highlightPulse(phase: number): number {
  return Math.abs(Math.sin(Math.PI * phase) / 16);
}

/**
 * The layers' opacities at a pulse factor (0: at rest). The route and the middle square at theirs; the top square at what keeps
 * its own opacity where it lies over the other two: over the middle square, `1 - (1 - top) / (1 - middle)`, so the stack shows
 * what Realms' route and endpoint show without the middle square. The logo at its own, breathing as the top square does.
 */
export function layerOpacities(pulse: number, logo: number): Record<HighlightLayer, number> {
  const p = Math.max(0, pulse);
  const at = (name: Exclude<HighlightLayer, "logo">) => HIGHLIGHT_LAYERS[name].opacity + p * HIGHLIGHT_LAYERS[name].pulse;
  const middle = at("middle");
  return {
    route: at("route"),
    middle,
    top: Math.max(0, 1 - (1 - at("top")) / (1 - middle)),
    logo: clamp01(logo + p * HIGHLIGHT_LAYERS.top.pulse),
  };
}

/** The coverage of layers drawn one over another (each its opacity): 1 less what each lets through. */
export function stackedOpacity(...opacities: number[]): number {
  return 1 - opacities.reduce((through, a) => through * (1 - a), 1);
}

/**
 * The top square's and the middle square's turns, radians, for a style at a pulse factor: none ("plain"); `twist` and its
 * opposite; a quarter and `-twist` ("diamond"); or `twist` times the pulse's height and its opposite ("breathe").
 */
export function highlightTurns(style: HighlightStyle, twist: number, pulse: number): { top: number; middle: number } {
  const rad = (twist * Math.PI) / 180;
  if (style === "plain") return { top: 0, middle: 0 };
  if (style === "diamond") return { top: Math.PI / 4, middle: -rad };
  const turn = style === "breathe" ? rad * clamp01(pulse * 16) : rad;
  return { top: turn, middle: -turn };
}

/** A grid cell, in the board's grid coordinates (x east, y south: world x and z over `TILE_SIZE`). */
export interface GridCell {
  x: number;
  y: number;
}

/** The tile in hand on a cell: shown there (its preview) or placed and waiting for validation. */
export type GhostCell = GridCell & { placed: boolean };

const cellKey = (x: number, y: number) => `${x},${y}`;

/**
 * The cells the highlight lights: every playable slot (`legal` not false); none where no rotation fits, and none under the tile
 * in hand (its preview, or the tile placed), whose filler would muddle the tile. Ordered from the board's first tile out, the
 * order they roll in.
 */
export function highlightsOf(slots: ReadonlyArray<PlacementSlot>, ghost: GridCell | null): GridCell[] {
  const out = new Map<string, GridCell>();
  for (const s of slots) if (s.legal !== false) out.set(cellKey(s.x, s.y), { x: s.x, y: s.y });
  if (ghost) out.delete(cellKey(ghost.x, ghost.y));
  return [...out.values()].sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y) || a.y - b.y || a.x - b.x);
}

/** How far the cells are dimmed (0 lit, 1 dim) `elapsed` ms into a change from `from` to `to` over `ms` (a smoothstep). */
export function dimAt(from: number, to: number, elapsed: number, ms: number): number {
  const t = ms > 0 ? clamp01(elapsed / ms) : 1;
  return from + (to - from) * t * t * (3 - 2 * t);
}

/**
 * A pixel of the highlight at the fillers' opacity (`base`) and dimmed `dim` of the way (the shader's): its chroma down to
 * `saturation` of itself, its opacity times `base`, then times `opacity` as it dims.
 */
export function dimmedPixel(rgb: readonly [number, number, number], alpha: number, dim: number, look: Pick<SquareGridSettings["highlight"]["dim"], "saturation" | "opacity">, base = 1): { rgb: [number, number, number]; alpha: number } {
  const luma = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  const d = clamp01(dim);
  return {
    rgb: rgb.map((c) => c + (luma + (c - luma) * look.saturation - c) * d) as [number, number, number],
    alpha: alpha * base * (1 + (look.opacity - 1) * d),
  };
}

/** The fillers' opacity and the dim in the overlay materials' shader, after their colour is written (`overlayDepthTest`'s `output`). */
const DIM_GLSL = /* glsl */ `
  float dimLuma = dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  gl_FragColor.rgb = mix(gl_FragColor.rgb, mix(vec3(dimLuma), gl_FragColor.rgb, uDimSaturation), uDim);
  gl_FragColor.a *= uFillerOpacity * mix(1.0, uDimOpacity, uDim);
`;

/** Realms' roll-in: each new cell grows from 1 % to its scale over 180 ms (ease out), 18 ms after the one before. */
export const ROLLOUT = { stepMs: 18, entryMs: 180, from: 0.01 } as const;

/** A rolling cell's share of its scale `elapsed` ms after the set was drawn, its `order` among the new cells. */
export function rolloutScale(elapsed: number, order: number): number {
  const t = clamp01((elapsed - order * ROLLOUT.stepMs) / ROLLOUT.entryMs);
  return ROLLOUT.from + (1 - ROLLOUT.from) * (1 - (1 - t) * (1 - t));
}

/** Realms' flash on the first cell of a new set: 42 % to 150 % of the cell over 300 ms, its opacity up to 0.8 in 120 ms, down in 240. */
export const LAUNCH_GLOW = { ms: 360, growMs: 300, from: 0.42, to: 1.5, peak: 0.8, riseMs: 120 } as const;

/** The flash `elapsed` ms in: its scale and opacity (0 once done). */
export function launchGlowAt(elapsed: number): { scale: number; opacity: number } {
  if (!(elapsed >= 0) || elapsed >= LAUNCH_GLOW.ms) return { scale: LAUNCH_GLOW.to, opacity: 0 };
  const grow = clamp01(elapsed / LAUNCH_GLOW.growMs);
  const scale = LAUNCH_GLOW.from + (LAUNCH_GLOW.to - LAUNCH_GLOW.from) * (1 - (1 - grow) * (1 - grow));
  if (elapsed < LAUNCH_GLOW.riseMs) {
    const t = elapsed / LAUNCH_GLOW.riseMs;
    return { scale, opacity: LAUNCH_GLOW.peak * (1 - (1 - t) * (1 - t)) };
  }
  const t = clamp01((elapsed - LAUNCH_GLOW.riseMs) / (LAUNCH_GLOW.ms - LAUNCH_GLOW.riseMs));
  return { scale, opacity: LAUNCH_GLOW.peak * (1 - t) };
}

/** Points along each of the highlight's rounded corners (Realms' `getRoundPoints` count). */
const CORNER_POINTS = 5;

/** A rounded square's outline at half side `half`, its corners rounded by `r`, counter-clockwise (`reverse`: clockwise, a hole). */
function roundedSquarePoints(half: number, r: number, reverse = false): THREE.Vector2[] {
  const corners: Array<[number, number, number]> = [
    [half - r, half - r, 0],
    [-(half - r), half - r, Math.PI / 2],
    [-(half - r), -(half - r), Math.PI],
    [half - r, -(half - r), (3 * Math.PI) / 2],
  ];
  const points: THREE.Vector2[] = [];
  for (const [cx, cy, from] of corners) {
    for (let i = 0; i < CORNER_POINTS; i++) {
      const a = from + (i / (CORNER_POINTS - 1)) * (Math.PI / 2);
      points.push(new THREE.Vector2(cx + r * Math.cos(a), cy + r * Math.sin(a)));
    }
  }
  return reverse ? points.reverse() : points;
}

/**
 * Realms' "highlight" shape on a square: the cell at 97.5 %, its corners rounded by 15 % of that, flat in the plane (x, y) facing
 * +z (rotated onto the ground by each instance). `frame`: a ring of it, `FRAME_WIDTH` of the half cell wide (the "frame" style).
 */
export function createHighlightGeometry(frame = false): THREE.BufferGeometry {
  const half = 0.975 * HALF_CELL;
  const shape = new THREE.Shape(roundedSquarePoints(half, 0.15 * half));
  if (frame) {
    const inner = half - FRAME_WIDTH * HALF_CELL;
    shape.holes.push(new THREE.Path(roundedSquarePoints(inner, 0.15 * inner, true)));
  }
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.computeBoundingSphere();
  return geometry;
}

/** The logo's canvas: its side in px, and how far the glyph may reach from its middle (a share of the side). */
const LOGO_PX = 256;

/**
 * Draws the logo's text (white, centred on its own ink) into a canvas texture, or null where there is no canvas (a test, a native
 * host). Its colour space is sRGB: white stays white.
 */
function createLogoTexture(text: string, font: string): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = LOGO_PX;
  canvas.height = LOGO_PX;
  if (!canvas.getContext?.("2d")) return null;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  drawLogo(texture, text, font);
  return texture;
}

/** The logo's text into its texture, centred on its ink (a glyph's box is not its ink's). */
function drawLogo(texture: THREE.CanvasTexture, text: string, font: string): void {
  const canvas = texture.image as HTMLCanvasElement;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, LOGO_PX, LOGO_PX);
  ctx.font = font;
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const m = ctx.measureText(text);
  const left = m.actualBoundingBoxLeft ?? 0;
  const right = m.actualBoundingBoxRight ?? m.width;
  const ascent = m.actualBoundingBoxAscent ?? LOGO_PX * 0.7;
  const descent = m.actualBoundingBoxDescent ?? 0;
  ctx.fillText(text, (LOGO_PX - (left + right)) / 2 + left, (LOGO_PX + ascent - descent) / 2);
  texture.needsUpdate = true;
}

/** One highlight layer: an instanced draw of a shape in one colour, its own material (its opacity breathes). */
interface Layer {
  order: number;
  material: THREE.MeshBasicMaterial;
  mesh: THREE.InstancedMesh | null;
}

/** The fillers' opacity and the dim's uniforms, shared by the overlay's materials. */
interface DimUniforms {
  [name: string]: THREE.IUniform;
  uFillerOpacity: { value: number };
  uDim: { value: number };
  uDimSaturation: { value: number };
  uDimOpacity: { value: number };
}

/**
 * An overlay material (`overlay-pass.ts`): unlit, in its colour as given (no tone map, no grade: the overlay pass lays it over
 * them), tested against the scene's depth, dimmed with the others (`DIM_GLSL`). `additive`: adds its light without covering.
 */
function overlayMaterial(depth: OverlayDepth, dim: DimUniforms, additive = false): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
  if (additive) {
    // Its light adds to what is under it; its coverage (the alpha) stays, so it darkens nothing.
    material.blending = THREE.CustomBlending;
    material.blendSrc = THREE.SrcAlphaFactor;
    material.blendDst = THREE.OneFactor;
    material.blendSrcAlpha = THREE.ZeroFactor;
    material.blendDstAlpha = THREE.OneFactor;
  }
  material.onBeforeCompile = overlayDepthTest(depth, {
    uniforms: dim,
    declarations: "uniform float uFillerOpacity;\nuniform float uDim;\nuniform float uDimSaturation;\nuniform float uDimOpacity;",
    output: DIM_GLSL,
  });
  material.customProgramCacheKey = () => "paved-square-grid-overlay";
  return material;
}

/**
 * Draws the square grid: its backdrop (`group`, for the underlay scene: `OverlayPass` draws it into its own target, the finish
 * pass lays it under the scene with Realms' tone map) and its highlight (`overlay`, for the overlay scene: drawn as given, laid
 * over the scene, its materials reading `overlayDepth`). The landscape's lines are its ground's (`SQUARE_GRID_GLSL`). Both groups
 * go in groups that turn with the board's compass; their children's positions are the board's. Owns its geometries, materials
 * and textures: `dispose` frees them and hides everything (a scene given `init` again draws with them anew, as three uploads a
 * freed one again). Every setter returns whether what is drawn changed (the caller then draws a frame); `onChange` is told when
 * something changes outside a setter (the logo's font came in).
 */
export class SquareGridRenderer implements AmbientEffect {
  readonly group = new THREE.Group();
  readonly overlay = new THREE.Group();
  readonly overlayDepth = createOverlayDepth();
  onChange: (() => void) | null = null;
  private settings: SquareGridSettings = DEFAULT_SQUARE_GRID_SETTINGS;
  private reduced = false;

  private readonly floorGeometry = new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE).rotateX(-Math.PI / 2);
  private readonly floorMaterial: BackdropMaterial;
  private readonly floor: THREE.Mesh<THREE.PlaneGeometry, BackdropMaterial>;
  private field: THREE.DataTexture | null = null;
  /** The season's ground colour last given (`setLight`), null: the veil's own hue. */
  private season: THREE.Color | null = null;
  private fieldKey = "";
  private tileCells: GridCell[] = [];

  private readonly shape = createHighlightGeometry();
  private readonly frame = createHighlightGeometry(true);
  private readonly logoQuad = new THREE.PlaneGeometry(1, 1);
  private logoTexture: THREE.CanvasTexture | null = null;
  private logoKey = "";
  private readonly dimUniforms: DimUniforms = { uFillerOpacity: { value: 1 }, uDim: { value: 0 }, uDimSaturation: { value: 1 }, uDimOpacity: { value: 1 } };
  private readonly layers: Record<HighlightLayer, Layer>;
  private readonly glowMaterial: THREE.MeshBasicMaterial;
  private readonly glow: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;

  private slots: PlacementSlot[] = [];
  private ghost: GhostCell | null = null;
  /** The cells lit, each with its order among the cells rolling in (null: at its scale). */
  private cells: Array<GridCell & { order: number | null }> = [];
  /** The key of the cells drawn; null draws the next set whatever it is, an empty one included. */
  private drawnKey: string | null = "";
  /** The roll-in under way: when the set was drawn, the new cells' count, and whether the flash plays. */
  private rollout: { since: number; entering: number; glow: boolean } | null = null;
  /** The dim's ease: from, to (1 once a tile is placed), since when (ms); `dimDrawn` once its end is on screen. */
  private dim = { from: 0, to: 0, since: Number.NEGATIVE_INFINITY };
  private dimDrawn = true;
  /** The pulse factor now, and the squares' turns it gives ("breathe"). */
  private pulse = 0;
  private turns = { top: 0, middle: 0 };
  private disposed = false;

  /** `time`: the ambient loop's time uniform, the backdrop's drift. */
  constructor(time: { value: number } = { value: 0 }) {
    this.group.name = "square-grid";
    this.overlay.name = "square-grid-overlay";
    this.floorMaterial = createBackdropMaterial(time);
    this.floor = new THREE.Mesh(this.floorGeometry, this.floorMaterial);
    this.floor.position.y = FLOOR_Y;
    this.floor.frustumCulled = false;
    this.floor.raycast = () => {};
    this.floor.name = "square-grid-backdrop";
    const layer = (order: number): Layer => ({ order, material: overlayMaterial(this.overlayDepth, this.dimUniforms), mesh: null });
    this.layers = {
      route: layer(HIGHLIGHT_LAYERS.route.order),
      middle: layer(HIGHLIGHT_LAYERS.middle.order),
      top: layer(HIGHLIGHT_LAYERS.top.order),
      logo: layer(LOGO_ORDER),
    };
    this.glowMaterial = overlayMaterial(this.overlayDepth, this.dimUniforms, true);
    this.glowMaterial.opacity = 0;
    this.glow = new THREE.Mesh(this.shape, this.glowMaterial);
    this.glow.rotation.x = -Math.PI / 2;
    this.glow.renderOrder = GLOW_ORDER;
    this.glow.raycast = () => {};
    this.glow.visible = false;
    this.group.add(this.floor);
    this.overlay.add(this.glow);
    this.setTileCells([]);
    this.applySettings();
  }

  getSettings(): SquareGridSettings {
    return this.settings;
  }

  /** New settings: the backdrop's colours, the highlight's colours, shapes and logo, what shows, and the highlight drawn again at once. */
  setSettings(settings: SquareGridSettings): boolean {
    this.settings = settings;
    this.applySettings();
    return true;
  }

  /** Reduced motion: no roll-in, no flash, the dim at once (the pulse and the drift stop with the ambient loop). */
  setReducedMotion(reduced: boolean): boolean {
    if (reduced === this.reduced) return false;
    this.reduced = reduced;
    if (reduced) {
      this.finishRollout();
      this.dim.from = this.dim.to;
      this.applyDim(this.dim.to);
    }
    return true;
  }

  /**
   * The brightness of the moment (`backdropLight`) and the season's ground colour (its day's, null: the veil's own): the backdrop
   * as bright as the board, its veil in the season's hue. True when it changed.
   */
  setLight(light: number, ground: THREE.Color | null): boolean {
    const u = this.floorMaterial.uniforms;
    this.season = ground && ground.clone();
    const veil = this.seasonVeilNow();
    if (u.uLight.value === light && u.uSeasonVeil.value.equals(veil)) return false;
    u.uLight.value = light;
    u.uSeasonVeil.value.copy(veil);
    return true;
  }

  /** The veil in the season's hue, or its own with no season given. */
  private seasonVeilNow(): THREE.Color {
    const veil = new THREE.Color(this.settings.backdrop.veil);
    return this.season ? seasonVeil(this.season, veil) : veil;
  }

  /** The cells the placed tiles stand on: the backdrop is in colour near them, grey away from them (its distance field). */
  setTileCells(cells: ReadonlyArray<GridCell>): boolean {
    this.tileCells = cells.map((c) => ({ x: c.x, y: c.y }));
    return this.syncField();
  }

  /** The slots of the tile in hand (`legal` false where no rotation fits: no filler there). */
  setSlots(slots: ReadonlyArray<PlacementSlot>, now: number = performance.now()): boolean {
    this.slots = slots.slice();
    return this.syncHighlight(now, null);
  }

  /**
   * The tile in hand on a cell (null: none), shown there or placed: its cell loses its filler, and once it is placed the other
   * cells fade (`highlight.dim`).
   */
  setGhost(ghost: GhostCell | null, now: number = performance.now()): boolean {
    const before = this.ghost;
    if (before?.x === ghost?.x && before?.y === ghost?.y && before?.placed === ghost?.placed) return false;
    this.ghost = ghost && { x: ghost.x, y: ghost.y, placed: ghost.placed };
    const to = ghost?.placed ? 1 : 0;
    if (to !== this.dim.to) {
      const current = this.dimNow(now);
      this.dim = { from: current, to, since: now };
      this.dimDrawn = false;
      if (this.reduced || !Number.isFinite(now)) this.dim.from = to;
      this.applyDim(this.dimNow(now));
    }
    this.syncHighlight(now, before);
    return true;
  }

  /** What shows now, for the tests and the stories' readout. */
  stats(): { backdrop: boolean; route: number; middle: number; top: number; logo: number; rolling: boolean; dim: number; pulse: number; turns: { top: number; middle: number } } {
    const count = (name: HighlightLayer) => (this.layers[name].mesh?.visible ? this.layers[name].mesh!.count : 0);
    return {
      backdrop: this.floor.visible,
      route: count("route"),
      middle: count("middle"),
      top: count("top"),
      logo: count("logo"),
      rolling: this.rollout !== null,
      dim: this.dimUniforms.uDim.value,
      pulse: this.pulse,
      turns: { ...this.turns },
    };
  }

  /** The cells lit now, in their order. */
  highlights(): GridCell[] {
    return this.cells.map(({ x, y }) => ({ x, y }));
  }

  /**
   * An ambient step (`AmbientLoop`): the backdrop drifts (its shader reads the loop's time) and the pulse shows (`update` moves
   * it). True while one of them shows, so the step draws a frame.
   */
  step(_seconds: number): boolean {
    return this.floor.visible || this.breathes();
  }

  /**
   * Moves the pulse to `phase` (0 to 1: the pending tile's, else the free-running clock of the same period, `GameScene`), and
   * the roll-in, the flash and the dim to `now` (ms). True while the roll-in, the flash or the dim moves, so the scene draws the
   * next frame; the pulse draws with the ambient steps, or with the pending tile's frames.
   */
  update(now: number, phase: number | null = null): boolean {
    this.applyPulse(this.breathes() && phase !== null ? highlightPulse(phase) : 0);
    let moving = false;
    const rollout = this.rollout;
    if (rollout) {
      const elapsed = now - rollout.since;
      this.writeLayers(elapsed);
      const done = elapsed >= rollout.entering * ROLLOUT.stepMs + ROLLOUT.entryMs && (!rollout.glow || elapsed >= LAUNCH_GLOW.ms);
      if (done) this.finishRollout();
      moving = true;
    } else if (this.settings.highlight.style === "breathe" && this.cells.length > 0) {
      this.writeLayers(Number.POSITIVE_INFINITY);
    }
    if (!this.dimDrawn) {
      const done = now - this.dim.since >= this.settings.highlight.dim.ms || this.dim.from === this.dim.to;
      this.applyDim(this.dimNow(now));
      // Its end drawn by this frame: the next asks for none.
      if (done) this.dimDrawn = true;
      moving = true;
    }
    return moving;
  }

  /** The cells breathe: the pulse on, a cell lit, motion allowed. */
  private breathes(): boolean {
    return this.settings.highlight.pulse && !this.reduced && this.cells.length > 0 && highlightShown(this.settings);
  }

  private dimNow(now: number): number {
    return Number.isFinite(now) ? dimAt(this.dim.from, this.dim.to, now - this.dim.since, this.settings.highlight.dim.ms) : this.dim.to;
  }

  private applyDim(value: number): void {
    this.dimUniforms.uDim.value = value;
  }

  /** The tiles' distance field on its texture, rebuilt when the tiles or the reach change (the reach: past `grayTo`). */
  private syncField(): boolean {
    const reach = Math.max(1, Math.ceil(this.settings.backdrop.grayTo) + 2);
    const key = `${reach}|${this.tileCells.map((c) => cellKey(c.x, c.y)).join(";")}`;
    if (key === this.fieldKey) return false;
    this.fieldKey = key;
    const field = distanceField(this.tileCells, reach);
    this.field?.dispose();
    this.field = new THREE.DataTexture(field.data, field.width, field.height, THREE.RedFormat, THREE.UnsignedByteType);
    this.field.magFilter = this.field.minFilter = THREE.LinearFilter;
    this.field.wrapS = this.field.wrapT = THREE.ClampToEdgeWrapping;
    this.field.unpackAlignment = 1;
    this.field.needsUpdate = true;
    const u = this.floorMaterial.uniforms;
    u.uDistField.value = this.field;
    u.uDistRect.value.set(field.minX, field.minY, 1 / field.width, 1 / field.height);
    u.uDistReach.value = field.reach;
    return true;
  }

  private applySettings(): void {
    const s = this.settings;
    const b = s.backdrop;
    const u = this.floorMaterial.uniforms;
    u.uGround.value.set(b.ground);
    u.uVeil.value.set(b.veil);
    u.uVeilStrength.value = clamp01(b.veilStrength);
    u.uMist.value = clamp01(b.mist);
    u.uMotion.value = Math.max(0, b.motion);
    u.uEnergy.value = Math.max(0, b.energy);
    u.uEnergyColor.value.set(b.energyColor);
    u.uEnergyGlow.value.set(b.energyGlow);
    u.uLineColor.value.set(b.lineColor);
    u.uLineStrength.value = clamp01(b.lineStrength);
    u.uLineHalfWidth.value = Math.max(0, s.lines.halfWidth);
    u.uGrayFrom.value = b.grayFrom;
    u.uGrayTo.value = b.grayTo;
    u.uVoxels.value = Math.max(1, b.voxels);
    u.uSeasonShare.value = clamp01(b.seasonShare);
    u.uSeasonVeil.value.copy(this.seasonVeilNow());
    // A pattern is its own program: a new one compiles once.
    const pattern = BACKDROP_PATTERNS.indexOf(b.pattern);
    if (this.floorMaterial.defines.PATTERN !== pattern) {
      this.floorMaterial.defines.PATTERN = pattern;
      this.floorMaterial.needsUpdate = true;
    }
    this.floor.visible = backdropShown(s);
    this.syncField();
    const { colors } = s.highlight;
    this.layers.route.material.color.set(colors.route);
    this.layers.middle.material.color.set(colors.middle);
    this.layers.top.material.color.set(colors.top);
    this.layers.logo.material.color.set(colors.logo);
    this.glowMaterial.color.set(colors.route);
    this.dimUniforms.uFillerOpacity.value = clamp01(s.highlight.opacity);
    this.dimUniforms.uDimSaturation.value = clamp01(s.highlight.dim.saturation);
    this.dimUniforms.uDimOpacity.value = clamp01(s.highlight.dim.opacity);
    this.syncLogo();
    this.applyPulse(0);
    this.drawnKey = null;
    this.syncHighlight(Number.NaN, this.ghost);
  }

  /**
   * The logo's texture: drawn again when its text or font change, and once the font is in (the app's display font loads on its
   * own; until then the canvas draws the fallback), which tells `onChange`.
   */
  private syncLogo(): void {
    const { logo } = this.settings.highlight;
    const key = logo.enabled ? `${logo.text}|${logo.font}` : "";
    if (key === this.logoKey) return;
    this.logoKey = key;
    if (!logo.enabled) return;
    this.logoTexture ??= createLogoTexture(logo.text, logo.font);
    const texture = this.logoTexture;
    if (!texture) return;
    drawLogo(texture, logo.text, logo.font);
    this.layers.logo.material.map = texture;
    this.layers.logo.material.needsUpdate = true;
    const fonts = (globalThis as { document?: { fonts?: { load(font: string, text?: string): Promise<unknown> } } }).document?.fonts;
    void fonts?.load(logo.font, logo.text).then(
      () => {
        if (this.disposed || this.logoKey !== key) return;
        drawLogo(texture, logo.text, logo.font);
        this.onChange?.();
      },
      () => undefined,
    );
  }

  /** Whether the logo draws: on, with its texture. */
  private logoShown(): boolean {
    return this.settings.highlight.logo.enabled && this.logoTexture !== null;
  }

  /**
   * The cells lit by the slots and the tile in hand, drawn again when they changed: a cell lit before (or under the tile in hand
   * a moment ago) stays at its scale, a new one rolls in after the new ones before it (at once under reduced motion or with the
   * roll-in off), the first with a flash when none was lit (Realms' `highlightHexes`). True when what is drawn changed.
   */
  private syncHighlight(now: number, ghostBefore: GridCell | null): boolean {
    const s = this.settings;
    const next = highlightShown(s) ? highlightsOf(this.slots, this.ghost) : [];
    const key = next.map((c) => cellKey(c.x, c.y)).join(";");
    if (key === this.drawnKey) return false;
    this.drawnKey = key;
    const before = new Set(this.cells.map((c) => cellKey(c.x, c.y)));
    if (ghostBefore) before.add(cellKey(ghostBefore.x, ghostBefore.y));
    const animate = s.highlight.rollout && !this.reduced && Number.isFinite(now);
    let entering = 0;
    this.cells = next.map((c) => ({ x: c.x, y: c.y, order: animate && !before.has(cellKey(c.x, c.y)) ? entering++ : null }));
    // The bottom square's shape follows the style ("frame": a ring).
    this.ensureLayer(this.layers.route, this.cells.length, s.highlight.style === "frame" ? this.frame : this.shape);
    this.ensureLayer(this.layers.middle, this.cells.length, this.shape);
    this.ensureLayer(this.layers.top, this.cells.length, this.shape);
    this.ensureLayer(this.layers.logo, this.logoShown() ? this.cells.length : 0, this.logoQuad);
    if (entering > 0) {
      const first = this.cells.find((c) => c.order === 0)!;
      const glow = before.size === 0;
      this.rollout = { since: now, entering, glow };
      if (glow) this.glow.position.set(first.x * TILE_SIZE, HIGHLIGHT_Y, first.y * TILE_SIZE);
      this.writeLayers(0);
    } else {
      this.finishRollout();
    }
    return true;
  }

  private ensureLayer(layer: Layer, count: number, geometry: THREE.BufferGeometry): void {
    if (count === 0 && !layer.mesh) return;
    if (layer.mesh && layer.mesh.instanceMatrix.count >= count && layer.mesh.geometry === geometry) return;
    const capacity = Math.max(64, 2 ** Math.ceil(Math.log2(Math.max(1, count))));
    layer.mesh?.removeFromParent();
    layer.mesh?.dispose();
    const mesh = new THREE.InstancedMesh(geometry, layer.material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.renderOrder = layer.order;
    // The instances move over the board: no culling by the first one's bounds.
    mesh.frustumCulled = false;
    mesh.raycast = () => {};
    layer.mesh = mesh;
    this.overlay.add(mesh);
  }

  /**
   * Every layer's instances at `elapsed` ms into the roll-in (a cell lit before, at its scale): the squares turned by the style,
   * the logo square to the board (it reads upright from the opening view); and the flash.
   */
  private writeLayers(elapsed: number): void {
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const flat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    const { style, twist, logo } = this.settings.highlight;
    this.turns = highlightTurns(style, twist, this.pulse);
    const turned = (turn: number) => flat.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), turn));
    const looks: Record<HighlightLayer, { rotation: THREE.Quaternion; scale: number }> = {
      route: { rotation: flat, scale: HIGHLIGHT_LAYERS.route.scale },
      middle: { rotation: turned(this.turns.middle), scale: HIGHLIGHT_LAYERS.middle.scale },
      top: { rotation: turned(this.turns.top), scale: HIGHLIGHT_LAYERS.top.scale },
      // The logo's quad is 1 a side: its scale is its side in world units.
      logo: { rotation: flat, scale: logo.scale * TILE_SIZE },
    };
    for (const [name, layer] of Object.entries(this.layers) as Array<[HighlightLayer, Layer]>) {
      const mesh = layer.mesh;
      if (!mesh) continue;
      const look = looks[name];
      const count = name === "logo" && !this.logoShown() ? 0 : this.cells.length;
      for (let i = 0; i < count; i++) {
        const c = this.cells[i]!;
        const s = look.scale * (c.order === null ? 1 : rolloutScale(elapsed, c.order));
        position.set(c.x * TILE_SIZE, HIGHLIGHT_Y, c.y * TILE_SIZE);
        mesh.setMatrixAt(i, matrix.compose(position, look.rotation, scale.set(s, s, s)));
      }
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.visible = mesh.count > 0;
    }
    const glow = this.rollout?.glow ? launchGlowAt(elapsed) : null;
    this.glow.visible = glow !== null && glow.opacity > 0;
    if (glow) {
      this.glow.scale.setScalar(glow.scale);
      this.glowMaterial.opacity = glow.opacity;
    }
  }

  private finishRollout(): void {
    this.rollout = null;
    for (const c of this.cells) c.order = null;
    this.writeLayers(Number.POSITIVE_INFINITY);
  }

  private applyPulse(pulse: number): void {
    this.pulse = pulse;
    const opacities = layerOpacities(pulse, this.settings.highlight.logo.opacity);
    for (const [name, layer] of Object.entries(this.layers) as Array<[HighlightLayer, Layer]>) layer.material.opacity = opacities[name];
  }

  dispose(): void {
    this.disposed = true;
    this.floorGeometry.dispose();
    this.floorMaterial.dispose();
    this.floor.visible = false;
    this.field?.dispose();
    this.field = null;
    this.fieldKey = "";
    for (const layer of Object.values(this.layers)) {
      layer.mesh?.removeFromParent();
      layer.mesh?.dispose();
      layer.mesh = null;
      layer.material.dispose();
    }
    this.shape.dispose();
    this.frame.dispose();
    this.logoQuad.dispose();
    this.logoTexture?.dispose();
    this.logoTexture = null;
    this.logoKey = "";
    this.glowMaterial.dispose();
    this.glow.visible = false;
    this.slots = [];
    this.ghost = null;
    this.cells = [];
    this.drawnKey = "";
    this.rollout = null;
    this.onChange = null;
  }
}

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
}
