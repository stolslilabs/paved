import * as THREE from "three";

/**
 * The neon (SLOTS, P-68; SLOTS2, P-72): a bright line with a soft halo, drawn in the scene by its own shader, not by the
 * bloom pass (LIGHT-GPU found the bloom costly and shimmering on thin bands). One reusable piece: the slot cells use it
 * now, GLOW can use it for the gold slots.
 *
 * Every line is antialiased by construction, as the outlines are (`outlines.ts`): the fragment shader knows its distance
 * to the line in world units, converts it to device px with the screen-space derivatives, and covers the pixel by the
 * part of it the line covers. A line keeps at least `minPx` device px (a hairline), so it never breaks into dots.
 *
 * A cell frame is inscribed in its cell (SLOTS2): the line runs inside the cell's edge, and the line and its halo are
 * clipped to the cell, so a slot never lights its neighbours. A dashed frame's dashes are capsules (round caps), and the
 * halo is a distance-field glow around each dash (the distance to the rounded segment), so it wraps the dash's ends.
 *
 * The output is premultiplied: the neon adds light (alpha 0), the fill covers what is under it (its alpha). The
 * material blends `ONE, ONE_MINUS_SRC_ALPHA`, so both go in one draw.
 */

/** GLSL: the share of a pixel a line `width` wide covers at distance `dist` from its centre, both in the units of `px` (one device px). */
export const NEON_LINE_GLSL = /* glsl */ `
float neonLine( float dist, float width, float px, float minPx ) {
  float w = max( width / max( px, 1e-6 ), minPx );
  return clamp( w * 0.5 + 0.5 - dist / max( px, 1e-6 ), 0.0, 1.0 );
}
// A soft halo around a line: 1 on it, falling to about 0.02 at 'width' (a gaussian).
float neonGlow( float dist, float width ) {
  float x = dist / max( width, 1e-6 );
  return exp( -4.0 * x * x );
}
// The distance along a side from -s to s (the coordinate u) to its dashes: n periods, a gap 'g' long centred in each. The
// side's ends are always dashed, so a frame's corners are whole L shapes; beyond an end, the distance past it.
float neonDashAlong( float u, float s, float n, float g ) {
  float period = 2.0 * s / n;
  float uc = clamp( u, -s, s );
  float k = clamp( floor( ( uc + s ) / period ), 0.0, n - 1.0 );
  float c = -s + ( k + 0.5 ) * period;
  return max( max( 0.5 * g - abs( uc - c ), 0.0 ), abs( u ) - s );
}
// A gap's length on a side from -s to s cut in n periods: 'share' of a period as the eye sees it, the round caps of radius
// r eating into it at each end; never the whole period.
float neonGap( float share, float s, float n, float r ) {
  float period = 2.0 * s / n;
  return min( share * period + 2.0 * r, 0.95 * period );
}
// The distance from q to a square frame of half side s, its sides cut in n dashes with gaps g long (0: solid): the
// distance to the nearest rounded segment, so a dash ends in a round cap and its glow wraps the end.
float neonFrameDistance( vec2 q, float s, float n, float g ) {
  float alongY = neonDashAlong( q.y, s, n, g );
  float alongX = neonDashAlong( q.x, s, n, g );
  float d = min( length( vec2( alongY, q.x - s ) ), length( vec2( alongY, q.x + s ) ) );
  return min( d, min( length( vec2( alongX, q.y - s ) ), length( vec2( alongX, q.y + s ) ) ) );
}
`;

const frameVertex = /* glsl */ `
varying vec2 vLocal;
void main() {
  // The quad lies flat, centred on its cell: its x and z in cell units (the cell from -0.5 to 0.5).
  vLocal = position.xz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`;

const frameFragment = /* glsl */ `
uniform vec3 color;
uniform float opacity;
uniform float lineWidth;
uniform float glowWidth;
uniform float minPx;
uniform float inset;
uniform float intensity;
uniform float glowIntensity;
uniform float fillOpacity;
uniform float dashed;
uniform float dashBlend;
uniform float gap;
varying vec2 vLocal;
${NEON_LINE_GLSL}
void main() {
  vec2 q = vLocal;
  // A device px in cell units: the larger of the two axes' gradients (isotropic, unlike fwidth's sum).
  vec2 gx = vec2( dFdx( q.x ), dFdy( q.x ) );
  vec2 gy = vec2( dFdx( q.y ), dFdy( q.y ) );
  float px = max( max( length( gx ), length( gy ) ), 1e-6 );
  // The cell, antialiased: everything the frame draws is clipped to it.
  vec2 a = abs( q ) - 0.5;
  float sdCell = length( max( a, 0.0 ) ) + min( max( a.x, a.y ), 0.0 );
  float cell = clamp( 0.5 - sdCell / px, 0.0, 1.0 );
  // The line inside the cell's edge: its half width and its antialiasing half pixel in from the edge.
  float r = 0.5 * max( lineWidth, minPx * px );
  float s = max( 0.5 - inset - r - 0.5 * px, 0.0 );
  float d2 = neonFrameDistance( q, s, 2.0, dashed * neonGap( gap, s, 2.0, r ) );
  float d3 = neonFrameDistance( q, s, 3.0, dashed * neonGap( gap, s, 3.0, r ) );
  float line = mix( neonLine( d2, lineWidth, px, minPx ), neonLine( d3, lineWidth, px, minPx ), dashBlend );
  float glow = mix( neonGlow( d2, glowWidth ), neonGlow( d3, glowWidth ), dashBlend );
  // The line's core whitens, as a neon tube does; the halo keeps the colour.
  vec3 core = mix( color, vec3( 1.0 ), 0.35 );
  vec3 light = ( core * line * intensity + color * glow * glowIntensity ) * cell * opacity;
  float fill = cell * fillOpacity;
  gl_FragColor = vec4( light + color * fill, fill );
}
`;

/** A cell frame: the uniforms `setNeonFrame` sets. */
export type NeonFrameMaterial = THREE.ShaderMaterial & {
  uniforms: {
    color: THREE.IUniform<THREE.Color>;
    opacity: THREE.IUniform<number>;
    lineWidth: THREE.IUniform<number>;
    glowWidth: THREE.IUniform<number>;
    minPx: THREE.IUniform<number>;
    inset: THREE.IUniform<number>;
    intensity: THREE.IUniform<number>;
    glowIntensity: THREE.IUniform<number>;
    fillOpacity: THREE.IUniform<number>;
    dashed: THREE.IUniform<number>;
    dashBlend: THREE.IUniform<number>;
    gap: THREE.IUniform<number>;
  };
};

/** What a cell frame draws: widths in cell units (a share of a tile), `minPx` in device px. */
export interface NeonFrame {
  /** The colour, a CSS hex colour (sRGB), drawn in linear light. */
  color: string;
  /** Multiplies everything the frame draws (the fade). */
  opacity: number;
  /** The line's width, a share of the cell's side. */
  lineWidth: number;
  /** The halo's reach on each side of the line, a share of the cell's side (clipped to the cell). */
  glowWidth: number;
  /** The thinnest line, in device px. */
  minPx: number;
  /** How far in from the cell's edge the line's outer edge runs, a share of the cell's side (0: on the edge). */
  inset: number;
  /** The line's brightness (above 1: brighter than the colour). */
  intensity: number;
  /** The halo's brightness. */
  glowIntensity: number;
  /** The flat fill inside the cell, 0 to 1. */
  fillOpacity: number;
  /** Dashed (true) or solid. */
  dashed: boolean;
  /** The dashes per side, from 2 (0) to 3 (1), blended between (`slotDashBlend`). */
  dashBlend: number;
  /** A gap's share of a dash period, as the eye sees it (the round caps do not shorten it). */
  gap: number;
}

/**
 * The quad's margin around the cell, in cell units: the frame draws nothing beyond the cell, but the pixels on its edge
 * need a fragment for the clip's antialiasing (half a device px is under 0.01 of a cell at the farthest zoom).
 */
export const NEON_FRAME_MARGIN = 0.02;

/**
 * The quad a frame is drawn on: a cell's square and `margin` cell units around it, flat (x, z), in cell units. A mesh
 * scales it to the cell's size (`TILE_SIZE`).
 */
export function createNeonFrameGeometry(margin = NEON_FRAME_MARGIN): THREE.BufferGeometry {
  const side = 1 + 2 * Math.max(0, margin);
  return new THREE.PlaneGeometry(side, side).rotateX(-Math.PI / 2);
}

/** The frame's material, shared by every cell drawn the same way. */
export function createNeonFrameMaterial(frame?: Partial<NeonFrame>): NeonFrameMaterial {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color() },
      opacity: { value: 1 },
      lineWidth: { value: 0.025 },
      glowWidth: { value: 0.06 },
      minPx: { value: 1 },
      inset: { value: 0 },
      intensity: { value: 1 },
      glowIntensity: { value: 0.6 },
      fillOpacity: { value: 0 },
      dashed: { value: 0 },
      dashBlend: { value: 0 },
      gap: { value: 0.3 },
    },
    vertexShader: frameVertex,
    fragmentShader: frameFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    side: THREE.DoubleSide,
  }) as NeonFrameMaterial;
  if (frame) setNeonFrame(material, frame);
  return material;
}

/** Sets a frame material's uniforms to the fields given; the others keep theirs. */
export function setNeonFrame(material: NeonFrameMaterial, frame: Partial<NeonFrame>): void {
  const u = material.uniforms;
  if (frame.color !== undefined) u.color.value.set(frame.color);
  if (frame.opacity !== undefined) u.opacity.value = frame.opacity;
  if (frame.lineWidth !== undefined) u.lineWidth.value = frame.lineWidth;
  if (frame.glowWidth !== undefined) u.glowWidth.value = frame.glowWidth;
  if (frame.minPx !== undefined) u.minPx.value = frame.minPx;
  if (frame.inset !== undefined) u.inset.value = frame.inset;
  if (frame.intensity !== undefined) u.intensity.value = frame.intensity;
  if (frame.glowIntensity !== undefined) u.glowIntensity.value = frame.glowIntensity;
  if (frame.fillOpacity !== undefined) u.fillOpacity.value = frame.fillOpacity;
  if (frame.dashed !== undefined) u.dashed.value = frame.dashed ? 1 : 0;
  if (frame.dashBlend !== undefined) u.dashBlend.value = frame.dashBlend;
  if (frame.gap !== undefined) u.gap.value = frame.gap;
}

/**
 * The line's share of a pixel (`neonLine` in TypeScript, for tests): at `dist` device px from its centre, a line `width`
 * device px wide, at least `minPx`.
 */
export function neonLineCoverage(distPx: number, widthPx: number, minPx = 1): number {
  const w = Math.max(widthPx, minPx);
  return Math.min(1, Math.max(0, w * 0.5 + 0.5 - distPx));
}

/** `neonGlow` in TypeScript. */
export function neonGlow(dist: number, width: number): number {
  const x = dist / Math.max(width, 1e-6);
  return Math.exp(-4 * x * x);
}

/** `neonGap` in TypeScript: a gap's length on a side from -s to s cut in `n` periods, the caps of radius `r` added. */
export function neonGap(share: number, s: number, n: number, r: number): number {
  const period = (2 * s) / n;
  return Math.min(share * period + 2 * r, 0.95 * period);
}

function dashAlong(u: number, s: number, n: number, g: number): number {
  const period = (2 * s) / n;
  const uc = Math.min(s, Math.max(-s, u));
  const k = Math.min(n - 1, Math.max(0, Math.floor((uc + s) / period)));
  const c = -s + (k + 0.5) * period;
  return Math.max(Math.max(0.5 * g - Math.abs(uc - c), 0), Math.abs(u) - s);
}

/**
 * What the frame's shader draws at a point (x, y) of its cell (cell units, the cell from -0.5 to 0.5), one device px
 * being `px` cell units, with `n` dashes a side (2 or 3): the line's coverage, the halo, and the cell's clip (all 0 to 1).
 * The shader in TypeScript, for tests.
 */
export function neonFrameAt(
  x: number,
  y: number,
  frame: Pick<NeonFrame, "lineWidth" | "glowWidth" | "minPx" | "inset" | "dashed" | "gap">,
  px: number,
  n: 2 | 3 = 2,
): { line: number; glow: number; cell: number; distance: number } {
  const ax = Math.abs(x) - 0.5;
  const ay = Math.abs(y) - 0.5;
  const sdCell = Math.hypot(Math.max(ax, 0), Math.max(ay, 0)) + Math.min(Math.max(ax, ay), 0);
  const cell = Math.min(1, Math.max(0, 0.5 - sdCell / px));
  const r = 0.5 * Math.max(frame.lineWidth, frame.minPx * px);
  const s = Math.max(0.5 - frame.inset - r - 0.5 * px, 0);
  const g = frame.dashed ? neonGap(frame.gap, s, n, r) : 0;
  const alongY = dashAlong(y, s, n, g);
  const alongX = dashAlong(x, s, n, g);
  const distance = Math.min(Math.hypot(alongY, x - s), Math.hypot(alongY, x + s), Math.hypot(alongX, y - s), Math.hypot(alongX, y + s));
  return { line: neonLineCoverage(distance / px, frame.lineWidth / px, frame.minPx) * cell, glow: neonGlow(distance, frame.glowWidth) * cell, cell, distance };
}
