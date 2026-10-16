import * as THREE from "three";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { OPENING_DISTANCE } from "./CameraController";
import { mergeCollinearSegments } from "./edges";
import { TILE_SIZE } from "./types";

/**
 * The voxel tiles' outlines (R-OUT, then R-VIS).
 *
 * Each tile type's crease edges (`buildEdgesGeometry`) are drawn as one screen-space quad per segment, on three's
 * instanced `LineSegmentsGeometry`, by this module's own shader (`createOutlineMaterial`). The fragment shader measures
 * each pixel's exact distance to its segment on screen and covers the pixel by the part of it the stroke covers: the
 * edge is antialiased by construction, at any width and off the pixel grid, with no multisampling and no post pass. A
 * stroke thinner than a device pixel is drawn one device pixel wide at that fraction of its opacity.
 *
 * The width is set in the world, as a fraction of a voxel (`widthVoxels`), converted to device pixels at the camera's
 * target, kept to at least `minWidthDevicePx` (a hairline) and capped at `maxWidthPx` CSS px when zoomed in. Zoomed out
 * the outlines fade linearly from fully on at `fadeFullFactor` of the tile size the board opens at on this viewport to
 * off at `fadeOffFactor` of it. They are drawn after the faces with a depth bias towards the camera: an outline lies
 * exactly on the faces it borders, and without the bias it wins or loses the depth test by rounding (the flicker R-OUT
 * removed).
 *
 * The segments are cut by their size on screen (OUT-LOD): collinear pieces are merged once, when the outline is built,
 * and the vertex shader drops a segment shorter on screen than `segmentOffDevicePx`, fading it in up to
 * `segmentFullDevicePx`. The cut follows each segment's own projected length, so it changes continuously with the zoom
 * and costs no CPU.
 *
 * The zoom is measured as the on-screen size of one tile, in CSS pixels, at the camera's target ("tile px"): it folds in
 * the distance, the field of view, the camera's zoom and the viewport's height, so a phone and a desktop window get the
 * same line density for the same tile size.
 */
export interface OutlineSettings {
  /** Draw outlines at all. */
  enabled: boolean;
  /**
   * Software WebGL (`detectSoftwareWebGL`): `"auto"` turns the outlines off there (they cost about 11 times the frame on
   * a CPU rasterizer), `"on"` and `"off"` force them whatever the detection says.
   */
  force: "auto" | "on" | "off";
  /** At or below this share of the opening tile size (`openingTilePx`) the outlines are off. */
  fadeOffFactor: number;
  /** At or above this share of the opening tile size the outlines are fully on; between the two the opacity is linear. */
  fadeFullFactor: number;
  /** The stroke's width in the world, as a fraction of a voxel's width (`VOXEL_SIZE`). */
  widthVoxels: number;
  /** The thinnest stroke, in device px: the world width never draws thinner than this. */
  minWidthDevicePx: number;
  /** The widest stroke, in CSS px: the cap when zoomed in. */
  maxWidthPx: number;
  /** The stroke's colour on screen, a CSS hex colour. */
  color: string;
  /**
   * The screen-size cut (OUT-LOD): a crease segment shorter on screen than this, in device px, is not drawn (its quad
   * is collapsed in the vertex shader, so it costs no fragments and no CPU).
   */
  segmentOffDevicePx: number;
  /** A segment at least this long on screen, in device px, is drawn fully; between the two its opacity is linear. */
  segmentFullDevicePx: number;
}

/** Voxels along a tile's side: every tile model is a 4-unit grid of 0.1-unit voxels, scaled to `TILE_SIZE`. */
export const TILE_VOXELS = 40;
/** A voxel's width in world units. */
export const VOXEL_SIZE = TILE_SIZE / TILE_VOXELS;

/** Below this opacity (one step of an 8-bit channel) the outlines are not drawn at all. */
export const MIN_OUTLINE_OPACITY = 1 / 255;

export const DEFAULT_OUTLINE_SETTINGS: OutlineSettings = {
  enabled: true,
  force: "auto",
  // Outlines show at every screen's opening view: the fade follows the opening tile size S, fully on at S, off at
  // 0.85 S. A 360 x 780 phone opens at about 52 px a tile (off at 44), a 900 px high window at about 60 (off at 51,
  // under the farthest zoom's 48 px: the outlines vanish zoomed out).
  fadeOffFactor: 0.85,
  fadeFullFactor: 1,
  // 1.5 % of a voxel, in the 1 to 2 % that keeps the stroke thin. That is under a device pixel until a voxel is about 33 CSS px wide
  // at DPR 2 (a tile about 1,300 px), so over most of the zoom range the outlines are one-device-pixel hairlines.
  widthVoxels: 0.015,
  minWidthDevicePx: 1,
  maxWidthPx: 2,
  // A very dark grey, not black. The value is what the outline pass writes into the linear target; the FinishPass then
  // tone maps, grades and sRGB-encodes it, which lifts a dark grey a lot. #090909 shows as about #141313 at the middle
  // of the Mockup look (ACES, grade on; the vignette darkens it toward the corners), the nearest the 8-bit input gets to
  // #101010 on screen (#08 gives #0b0a09, #0a gives #1b1a19).
  color: "#090909",
  // Under a device pixel a segment covers a pixel only where a pixel's centre falls within its span, so it shows as a
  // stray dot that comes and goes as the camera moves; at 0.5 px it covers at most half a pixel's row. It fades out
  // from one device pixel down to half of one, so nothing pops. Top-down, the voxels' vertical edges are all under it.
  segmentOffDevicePx: 0.5,
  segmentFullDevicePx: 1,
};

/** The depth bias of the outlines (`polygonOffset`, negative: towards the camera). */
export const OUTLINE_DEPTH_BIAS = { factor: -1, units: -4 } as const;

/** After the tile faces. */
const OUTLINE_RENDER_ORDER = 1;

/**
 * How an outline is drawn at a zoom: its width in device px and its opacity; opacity 0 is not drawn. `segmentOff` and
 * `segmentFull` are the screen-size cut in device px (`OutlineSettings.segmentOffDevicePx`, `segmentFullDevicePx`);
 * unset, the defaults'.
 */
export interface OutlineStroke {
  width: number;
  opacity: number;
  segmentOff?: number;
  segmentFull?: number;
}

const OFF: OutlineStroke = { width: 0, opacity: 0 };

/**
 * The stroke for a tile shown `tilePx` CSS px wide on a screen of `pixelRatio` device px per CSS px, where the board
 * opens at `openingTilePx` (S, `openingTilePixels`). The opacity is 0 at or below `fadeOffFactor` x S, 1 at or above
 * `fadeFullFactor` x S, linear between, and 0 below `MIN_OUTLINE_OPACITY`. The width
 * is `widthVoxels` of a voxel at that zoom, in device px, at least `minWidthDevicePx` and at most `maxWidthPx` CSS px.
 * Width and opacity never decrease as the camera zooms in.
 */
export function outlineStroke(
  tilePx: number,
  settings: OutlineSettings = DEFAULT_OUTLINE_SETTINGS,
  pixelRatio = 1,
  openingTilePx = DEFAULT_OPENING_TILE_PX,
): OutlineStroke {
  const off = settings.fadeOffFactor * openingTilePx;
  const full = settings.fadeFullFactor * openingTilePx;
  if (!settings.enabled || !(tilePx > off) || !(pixelRatio > 0)) return OFF;
  const opacity = tilePx >= full ? 1 : (tilePx - off) / (full - off);
  if (!(opacity >= MIN_OUTLINE_OPACITY)) return OFF;
  const world = settings.widthVoxels * VOXEL_SIZE * (tilePx / TILE_SIZE) * pixelRatio;
  const width = Math.min(Math.max(world, settings.minWidthDevicePx), settings.maxWidthPx * pixelRatio);
  return width > 0 ? { width, opacity, segmentOff: settings.segmentOffDevicePx, segmentFull: settings.segmentFullDevicePx } : OFF;
}

/** The opening tile size `outlineStroke` assumes when it is not given one: a 900 px high window's, about 60 px. */
export const DEFAULT_OPENING_TILE_PX = 60;

/**
 * The opening tile size S of a viewport `heightPx` high: the on-screen size of a tile at the distance the camera opens
 * at (`OPENING_DISTANCE`). It follows the viewport's height, so it changes with a resize.
 */
export function openingTilePixels(camera: THREE.PerspectiveCamera, heightPx: number): number {
  return tilePixels(camera, OPENING_DISTANCE, heightPx);
}

/**
 * The share of a segment `lengthPx` device px long on screen that is drawn, by the screen-size cut: 0 below
 * `off`, 1 from `full`, linear between (a step at `full` when the two are equal). The vertex shader computes the same.
 */
export function segmentFade(lengthPx: number, off: number, full: number): number {
  if (!(lengthPx >= off)) return 0;
  if (lengthPx >= full) return 1;
  return (lengthPx - off) / (full - off);
}

/** Renderer strings of software WebGL: Chrome's SwiftShader, Mesa's llvmpipe and softpipe, Windows' Basic Render Driver. */
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|software|basic render/i;

/** Whether a WebGL renderer string names a software rasterizer. */
export function isSoftwareRenderer(renderer: string | null | undefined): boolean {
  return !!renderer && SOFTWARE_RENDERER.test(renderer);
}

/** What the renderer found about the WebGL it draws with. */
export interface WebGLDetection {
  /** The unmasked renderer string (`WEBGL_debug_renderer_info`), or the plain `RENDERER` when that is hidden. */
  renderer: string | null;
  /** Software WebGL, and why: the renderer string, or a major performance caveat. */
  software: boolean;
  reason: string;
}

/**
 * Detects software WebGL: from the renderer string, and, when the browser exposes it, from a probe context created with
 * `failIfMajorPerformanceCaveat` (`caveatProbe`: true when that context is refused).
 */
export function detectSoftwareWebGL(
  gl: Pick<WebGLRenderingContext, "getExtension" | "getParameter" | "RENDERER"> | null | undefined,
  caveatProbe: () => boolean | undefined = probeMajorPerformanceCaveat,
): WebGLDetection {
  let renderer: string | null = null;
  try {
    const info = gl?.getExtension("WEBGL_debug_renderer_info");
    renderer = (info ? gl?.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl?.getParameter(gl.RENDERER)) ?? null;
  } catch {
    renderer = null;
  }
  if (isSoftwareRenderer(renderer)) return { renderer, software: true, reason: `software renderer "${renderer}"` };
  if (caveatProbe() === true) return { renderer, software: true, reason: "major performance caveat" };
  return { renderer, software: false, reason: renderer ? `GPU renderer "${renderer}"` : "no software renderer found" };
}

/**
 * Whether the browser refuses a WebGL 2 context without a major performance caveat (a software fallback): a throwaway
 * canvas asks with `failIfMajorPerformanceCaveat`, and its context, if any, is released at once. Undefined where there
 * is no DOM (React Native, tests) or the probe fails.
 */
export function probeMajorPerformanceCaveat(): boolean | undefined {
  if (typeof document === "undefined") return undefined;
  try {
    const gl = document.createElement("canvas").getContext("webgl2", { failIfMajorPerformanceCaveat: true });
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return gl === null;
  } catch {
    return undefined;
  }
}

/** Whether the outlines are drawn on this WebGL, given the `force` setting. */
export function outlinesAllowed(force: OutlineSettings["force"], detection: Pick<WebGLDetection, "software">): boolean {
  return force === "on" || (force === "auto" && !detection.software);
}

/** On-screen size of one tile, in CSS px, at `distance` from a perspective camera in a viewport `heightPx` high. */
export function tilePixels(camera: THREE.PerspectiveCamera, distance: number, heightPx: number): number {
  if (!(distance > 0) || !(heightPx > 0)) return 0;
  const visible = (2 * distance * Math.tan(THREE.MathUtils.DEG2RAD * camera.fov * 0.5)) / camera.zoom;
  return (heightPx / visible) * TILE_SIZE;
}

/** The camera distance at which one tile is `tilePx` CSS px wide: `tilePixels`' inverse. */
export function distanceForTilePixels(camera: THREE.PerspectiveCamera, tilePx: number, heightPx: number): number {
  if (!(tilePx > 0) || !(heightPx > 0)) return Infinity;
  return (heightPx * TILE_SIZE * camera.zoom) / (tilePx * 2 * Math.tan(THREE.MathUtils.DEG2RAD * camera.fov * 0.5));
}

const vertexShader = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>

uniform float linewidth;
uniform vec4 viewport;
// The screen-size cut, in device px: off below x, fully drawn from y.
uniform vec2 segmentCut;

attribute vec3 instanceStart;
attribute vec3 instanceEnd;

// The segment's two ends on screen, in device px (window coordinates): the same at every vertex of its quad.
flat varying vec4 vSegment;
// The share of the segment the screen-size cut keeps.
flat varying float vFade;

// Where a segment crossing the camera plane must be cut, three's LineMaterial's estimate.
float trimSegment( const in vec4 start, const in vec4 end ) {
  float a = projectionMatrix[ 2 ][ 2 ];
  float b = projectionMatrix[ 3 ][ 2 ];
  float nearEstimate = ( a > 0.0 ) ? ( - b / ( a + 1.0 ) ) : ( - 0.5 * b / a );
  return ( nearEstimate - start.z ) / ( end.z - start.z );
}

void main() {
  vec4 start = modelViewMatrix * vec4( instanceStart, 1.0 );
  vec4 end = modelViewMatrix * vec4( instanceEnd, 1.0 );
  if ( projectionMatrix[ 2 ][ 3 ] == - 1.0 ) {
    if ( start.z < 0.0 && end.z >= 0.0 ) end.xyz = mix( start.xyz, end.xyz, trimSegment( start, end ) );
    else if ( end.z < 0.0 && start.z >= 0.0 ) start.xyz = mix( end.xyz, start.xyz, trimSegment( end, start ) );
  }
  vec4 clipStart = projectionMatrix * start;
  vec4 clipEnd = projectionMatrix * end;
  vec2 screenStart = ( clipStart.xy / clipStart.w * 0.5 + 0.5 ) * viewport.zw + viewport.xy;
  vec2 screenEnd = ( clipEnd.xy / clipEnd.w * 0.5 + 0.5 ) * viewport.zw + viewport.xy;
  vSegment = vec4( screenStart, screenEnd );

  vec2 dir = screenEnd - screenStart;
  float len = length( dir );
  // The screen-size cut: a segment shorter on screen than segmentCut.x is not drawn. Its quad collapses to one point
  // outside the clip volume, so the GPU discards its triangles before they reach a pixel.
  vFade = segmentCut.y > segmentCut.x ? clamp( ( len - segmentCut.x ) / ( segmentCut.y - segmentCut.x ), 0.0, 1.0 ) : step( segmentCut.y, len );
  if ( vFade <= 0.0 ) {
    gl_Position = vec4( 0.0, 0.0, 2.0, 1.0 );
    return;
  }
  dir = len > 0.0 ? dir / len : vec2( 1.0, 0.0 );
  // The quad covers exactly the pixels the fragment shader can draw: across, the stroke (at least a pixel wide) and the
  // half pixel of its antialiased edge, where the coverage reaches 0; along, the segment's span (its ends are square)
  // and half a pixel more at each end, so no pixel centre on the span is lost to the rasterizer's edge rule.
  float reach = max( linewidth, 1.0 ) * 0.5 + 0.5;
  float pad = 0.5;
  // LineSegmentsGeometry's quad: x is -1 or 1 across the segment, y is -1 at its start, 2 at its end (createOutline
  // draws only its four corners). This side of the normal keeps its triangles front-facing (the material culls back
  // faces).
  vec2 offset = vec2( dir.y, - dir.x ) * position.x * reach;
  if ( position.y < 0.0 ) offset -= dir * pad;
  else if ( position.y > 1.0 ) offset += dir * pad;
  vec4 clip = ( position.y < 0.5 ) ? clipStart : clipEnd;
  clip.xy += offset * 2.0 / viewport.zw * clip.w;
  gl_Position = clip;

  vec4 mvPosition = ( position.y < 0.5 ) ? start : end;
  #include <logdepthbuf_vertex>
  #include <clipping_planes_vertex>
  #include <fog_vertex>
}
`;

const fragmentShader = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>

uniform vec3 diffuse;
uniform float opacity;
uniform float linewidth;

flat varying vec4 vSegment;
flat varying float vFade;

void main() {
  #include <clipping_planes_fragment>
  vec2 a = vSegment.xy;
  vec2 ab = vSegment.zw - a;
  vec2 ap = gl_FragCoord.xy - a;
  float len2 = dot( ab, ab );
  // Square ends exactly at the segment's ends: a straight edge split into many segments is covered once at every
  // pixel, never twice where two segments meet (twice would show as a darker dot while the outlines fade).
  float along = len2 > 0.0 ? dot( ap, ab ) / len2 : 0.0;
  if ( along < 0.0 || along >= 1.0 ) discard;
  float across = len2 > 0.0 ? abs( ab.x * ap.y - ab.y * ap.x ) / sqrt( len2 ) : length( ap );
  // The share of a one-pixel box filter centred on this pixel that the stroke covers.
  float w = max( linewidth, 1.0 );
  float coverage = clamp( w * 0.5 + 0.5 - across, 0.0, 1.0 ) * min( linewidth, 1.0 );
  if ( coverage <= 0.0 ) discard;
  #include <logdepthbuf_fragment>
  gl_FragColor = vec4( diffuse, opacity * coverage * vFade );
  #include <fog_fragment>
}
`;

/**
 * The colour the outline material is given for `css`. The scene is drawn into the composer's linear
 * target; the `FinishPass` (`Effects`) then applies the tone map, the grade, the vignette and the sRGB encoding to the
 * whole frame, outlines included. The CSS channels go in as they are (the value written is the linear one) and are NOT
 * the 8-bit value shown: a dark grey is lifted (see `DEFAULT_OUTLINE_SETTINGS.color`).
 */
function screenColor(css: string, target = new THREE.Color()): THREE.Color {
  return target.setStyle(css, THREE.LinearSRGBColorSpace);
}

/** The outline material: `diffuse` its colour, `opacity`, `linewidth` in device px. */
export type OutlineMaterial = THREE.ShaderMaterial & {
  uniforms: {
    diffuse: THREE.IUniform<THREE.Color>;
    opacity: THREE.IUniform<number>;
    linewidth: THREE.IUniform<number>;
    viewport: THREE.IUniform<THREE.Vector4>;
    segmentCut: THREE.IUniform<THREE.Vector2>;
  };
};

/** The material every outline shares. */
export function createOutlineMaterial(color = DEFAULT_OUTLINE_SETTINGS.color): OutlineMaterial {
  const material = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        diffuse: { value: new THREE.Color() },
        opacity: { value: 1 },
        linewidth: { value: 1 },
        viewport: { value: new THREE.Vector4(0, 0, 1, 1) },
        segmentCut: {
          value: new THREE.Vector2(DEFAULT_OUTLINE_SETTINGS.segmentOffDevicePx, DEFAULT_OUTLINE_SETTINGS.segmentFullDevicePx),
        },
      },
    ]),
    vertexShader,
    fragmentShader,
    fog: true,
    transparent: true,
    depthWrite: false,
  }) as OutlineMaterial;
  screenColor(color, material.uniforms.diffuse.value);
  material.polygonOffset = true;
  material.polygonOffsetFactor = OUTLINE_DEPTH_BIAS.factor;
  material.polygonOffsetUnits = OUTLINE_DEPTH_BIAS.units;
  return material;
}

/** Sets the shared material to a stroke and a colour; hidden at opacity 0, so no outline is drawn at all. */
export function applyOutlineStroke(material: OutlineMaterial, stroke: OutlineStroke, color?: string): void {
  material.visible = stroke.opacity >= MIN_OUTLINE_OPACITY && stroke.width > 0;
  if (color !== undefined) screenColor(color, material.uniforms.diffuse.value);
  if (!material.visible) return;
  material.uniforms.linewidth.value = stroke.width;
  material.uniforms.opacity.value = stroke.opacity;
  material.uniforms.segmentCut.value.set(
    stroke.segmentOff ?? DEFAULT_OUTLINE_SETTINGS.segmentOffDevicePx,
    stroke.segmentFull ?? DEFAULT_OUTLINE_SETTINGS.segmentFullDevicePx,
  );
}

const viewport = new THREE.Vector4();
const modelView = new THREE.Matrix4();
const linearPart = new THREE.Matrix4();
const axisView = new THREE.Vector3();
const centreView = new THREE.Vector3();

/**
 * How an outline's segments are ordered for the screen-size cut: first every segment that is not along the tile's
 * height, then the ones along it (`axis`, in the outline's own space), longest first (`tail`, their lengths). Seen from
 * above, the voxels' vertical edges are the segments the cut drops, so the draw can stop before the short ones.
 */
export interface OutlineSegmentOrder {
  /** Segments before the vertical ones: always drawn. */
  head: number;
  /** The vertical segments' lengths, longest first, in the outline's own units. */
  tail: Float32Array;
  /** The vertical axis, in the outline's own space (unit). */
  axis: THREE.Vector3;
}

/** How far from 1 the cosine of a segment's angle to the vertical axis may be for `orderOutlineSegments` to put it last. */
export const AXIS_TOLERANCE = 1e-9;

/**
 * Puts the segments along the shortest side of their bounding box (a tile's height) last, longest first. Segments are
 * `[ax, ay, az, bx, by, bz]` sextuples; a segment is along the axis when the cosine of its angle to it is within 1e-9
 * of 1 (about 0.003 degree, a sideways part under 4.5e-5 of its length), so `outlineSegmentCount` may bound it as on the
 * axis. Every vertical edge of the tile models is exactly on it (30,196 of the 89,857 merged segments).
 */
export function orderOutlineSegments(positions: Float32Array): { positions: Float32Array; order: OutlineSegmentOrder } {
  const count = Math.floor(positions.length / 6);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < count * 6; i++) {
    const k = i % 3;
    if (positions[i] < min[k]) min[k] = positions[i];
    if (positions[i] > max[k]) max[k] = positions[i];
  }
  const extents = [0, 1, 2].map((k) => max[k] - min[k]);
  const up = count > 0 ? extents.indexOf(Math.min(...extents)) : 1;
  const head: number[] = [];
  const tail: { at: number; length: number }[] = [];
  for (let s = 0; s < count; s++) {
    const i = s * 6;
    const d = [positions[i + 3] - positions[i], positions[i + 4] - positions[i + 1], positions[i + 5] - positions[i + 2]];
    const length = Math.hypot(d[0], d[1], d[2]);
    if (length > 0 && Math.abs(d[up]) / length > 1 - AXIS_TOLERANCE) tail.push({ at: i, length });
    else head.push(i);
  }
  tail.sort((a, b) => b.length - a.length);
  const ordered = new Float32Array(count * 6);
  let o = 0;
  for (const i of [...head, ...tail.map((t) => t.at)]) {
    ordered.set(positions.subarray(i, i + 6), o);
    o += 6;
  }
  const axis = new THREE.Vector3().setComponent(up, 1);
  return { positions: ordered, order: { head: head.length, tail: Float32Array.from(tail, (t) => t.length), axis } };
}

/**
 * How many of an outline's segments to draw for this camera and viewport (device px): every segment but the vertical
 * ones whose projected length is surely under `off` device px, the screen-size cut's lower end. The bound is taken over
 * the outline's bounding sphere, so a segment it skips is one the vertex shader would drop anyway: skipping it changes
 * no pixel, and it saves the segment's vertex work. Everything is drawn for a non-perspective camera, or when the sphere
 * reaches the camera plane.
 */
export function outlineSegmentCount(
  object: THREE.Object3D,
  geometry: THREE.InstancedBufferGeometry,
  order: OutlineSegmentOrder,
  camera: THREE.Camera,
  width: number,
  height: number,
  off: number,
): number {
  const all = order.head + order.tail.length;
  const projection = camera.projectionMatrix.elements;
  const sphere = geometry.boundingSphere;
  if (!(off > 0) || order.tail.length === 0 || projection[11] !== -1 || !sphere) return all;
  modelView.multiplyMatrices(camera.matrixWorldInverse, object.matrixWorld);
  centreView.copy(sphere.center).applyMatrix4(modelView);
  const radius = sphere.radius * modelView.getMaxScaleOnAxis();
  const near = -centreView.z - radius;
  if (!(near > 0)) return all;
  // The axis in view space, with the outline's scale: per unit of the outline's own length.
  axisView.copy(order.axis).applyMatrix4(linearPart.copy(modelView).setPosition(0, 0, 0));
  // Screen motion of a point at view position p moved along the axis a, per unit: f (a_xy z - p_xy a_z) / z^2. Its
  // largest value on the sphere is at most f (|a_xy| / near + max|p_xy| |a_z| / near^2).
  const focal = Math.max((projection[0] * width) / 2, (projection[5] * height) / 2);
  const reach = Math.hypot(Math.abs(centreView.x) + radius, Math.abs(centreView.y) + radius);
  const perUnit = focal * (Math.hypot(axisView.x, axisView.y) / near + (reach * Math.abs(axisView.z)) / (near * near));
  if (!(perUnit > 0)) return order.head;
  // The tail is longest first: keep the segments of at least off / perUnit.
  const shortest = off / perUnit;
  let lo = 0;
  let hi = order.tail.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (order.tail[mid] >= shortest) lo = mid + 1;
    else hi = mid;
  }
  return order.head + lo;
}

/**
 * One mesh's outline: its crease edges as instanced quads, told the viewport it is drawn into before each draw, and
 * drawn up to the segments the screen-size cut keeps (`outlineSegmentCount`). The geometry is shared by every tile of
 * the type: each draw sets its own count just before it.
 */
class Outline extends THREE.Mesh<LineSegmentsGeometry, OutlineMaterial> {
  override onBeforeRender(renderer: THREE.WebGLRenderer, _scene: THREE.Scene, camera: THREE.Camera): void {
    // The viewport of the target being drawn (the composer's, or the canvas), in device px: what gl_FragCoord counts.
    const { uniforms } = this.material;
    uniforms.viewport.value.copy(renderer.getCurrentViewport(viewport));
    const order = this.geometry.userData.segmentOrder as OutlineSegmentOrder | undefined;
    if (!order) return;
    this.geometry.instanceCount = outlineSegmentCount(this, this.geometry, order, camera, viewport.z, viewport.w, uniforms.segmentCut.value.x);
  }
}

/**
 * LineSegmentsGeometry's eight vertices make a quad of three sections (start cap, body, end cap). The outline shader
 * covers the stroke by distance, so it needs only the outer corners: 0 and 1 at the end side (y 2), 6 and 7 at the
 * start side (y -1). Two triangles instead of six, four vertices instead of eight, over the same rectangle.
 */
const OUTLINE_QUAD_INDEX = [0, 6, 1, 6, 7, 1];

/**
 * The outline object of one mesh: its crease edges (`buildEdgesGeometry`'s segments), collinear pieces merged
 * (`mergeCollinearSegments`), ordered for the screen-size cut (`orderOutlineSegments`), one four-vertex quad each.
 */
export function createOutline(edges: THREE.BufferGeometry, material: OutlineMaterial): THREE.Mesh {
  const geometry = new LineSegmentsGeometry();
  const { positions, order } = orderOutlineSegments(mergeCollinearSegments(edges.getAttribute("position").array));
  geometry.setPositions(positions);
  geometry.setIndex(OUTLINE_QUAD_INDEX);
  geometry.userData.segmentOrder = order;
  edges.dispose();
  const outline = new Outline(geometry, material);
  outline.renderOrder = OUTLINE_RENDER_ORDER;
  outline.userData.outline = true;
  return outline;
}

/** Whether an object is an outline (an outline is a `THREE.Mesh`: traversals of the tiles' meshes skip it). */
export function isOutline(object: THREE.Object3D): boolean {
  return object.userData.outline === true;
}
