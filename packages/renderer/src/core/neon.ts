import * as THREE from "three";

/**
 * The neon (SLOTS, P-68): a bright line with a soft halo, drawn in the scene by its own shader, not by the bloom pass
 * (LIGHT-GPU found the bloom costly and shimmering on thin bands). One reusable piece: the slot cells use it now, GLOW can
 * use it for the gold slots.
 *
 * Every line is antialiased by construction, as the outlines are (`outlines.ts`): the fragment shader knows its distance
 * to the line in world units, converts it to device px with the screen-space derivatives, and covers the pixel by the
 * part of it the line covers. A line keeps at least `minPx` device px (a hairline), so it never breaks into dots.
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
// The dashes along a side: t from 0 to 1 along it, n gaps centred at (k + 0.5) / n, each 'gap' of a period wide. The
// corners (t at 0 and 1) are always dashed, so a frame's corners are whole L shapes. Antialiased along the side.
float neonDashes( float t, float n, float gap ) {
  float s = t * n;
  float edge = ( abs( fract( s ) - 0.5 ) - gap * 0.5 ) / max( fwidth( s ), 1e-6 );
  return clamp( edge + 0.5, 0.0, 1.0 );
}
// A soft halo around a line: 1 on it, falling to about 0.02 at 'width' (a gaussian).
float neonGlow( float dist, float width ) {
  float x = dist / max( width, 1e-6 );
  return exp( -4.0 * x * x );
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
  vec2 a = abs( q ) - 0.5;
  // Signed distance to the cell's square, in cell units: negative inside.
  float sd = length( max( a, 0.0 ) ) + min( max( a.x, a.y ), 0.0 );
  float d = abs( sd );
  vec2 fw = fwidth( q );
  float px = max( max( fw.x, fw.y ), 1e-6 );
  float line = neonLine( d, lineWidth, px, minPx );
  float glow = neonGlow( d, glowWidth );
  // Along which side: the one the point is nearest, from 0 to 1.
  float t = clamp( ( abs( q.x ) > abs( q.y ) ? q.y : q.x ) + 0.5, 0.0, 1.0 );
  float dashes = mix( neonDashes( t, 2.0, gap ), neonDashes( t, 3.0, gap ), dashBlend );
  float mask = mix( 1.0, dashes, dashed );
  // The line's core whitens, as a neon tube does; the halo keeps the colour.
  vec3 core = mix( color, vec3( 1.0 ), 0.35 );
  vec3 light = ( core * line * intensity + color * glow * glowIntensity ) * mask * opacity;
  float fill = clamp( 0.5 - sd / px, 0.0, 1.0 ) * fillOpacity;
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
  /** The halo's reach on each side of the line, a share of the cell's side. */
  glowWidth: number;
  /** The thinnest line, in device px. */
  minPx: number;
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
  /** A gap's share of a dash period. */
  gap: number;
}

/**
 * The quad a frame is drawn on: a cell's square and `margin` cell units around it for the halo, flat (x, z), in cell
 * units. A mesh scales it to the cell's size (`TILE_SIZE`).
 */
export function createNeonFrameGeometry(margin: number): THREE.BufferGeometry {
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
