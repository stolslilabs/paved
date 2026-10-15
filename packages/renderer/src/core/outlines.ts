import * as THREE from "three";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { OPENING_DISTANCE } from "./CameraController";
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
  // Dark grey, not black: about 88 % black.
  color: "#1f1f1f",
};

/** The depth bias of the outlines (`polygonOffset`, negative: towards the camera). */
export const OUTLINE_DEPTH_BIAS = { factor: -1, units: -4 } as const;

/** After the tile faces. */
const OUTLINE_RENDER_ORDER = 1;

/** How an outline is drawn at a zoom: its width in device px and its opacity; opacity 0 is not drawn. */
export interface OutlineStroke {
  width: number;
  opacity: number;
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
  return width > 0 ? { width, opacity } : OFF;
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
function probeMajorPerformanceCaveat(): boolean | undefined {
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

attribute vec3 instanceStart;
attribute vec3 instanceEnd;

// The segment's two ends on screen, in device px (window coordinates): the same at every vertex of its quad.
flat varying vec4 vSegment;

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
  dir = len > 0.0 ? dir / len : vec2( 1.0, 0.0 );
  // The quad covers the stroke (at least a pixel wide) and one more pixel on every side, for the antialiased edge.
  float reach = max( linewidth, 1.0 ) * 0.5 + 1.0;
  // LineSegmentsGeometry's quad: x is -1 or 1 across the segment, y is -1 or 0 at its start, 1 or 2 at its end. This
  // side of the normal keeps its triangles front-facing (the material culls back faces).
  vec2 offset = vec2( dir.y, - dir.x ) * position.x * reach;
  if ( position.y < 0.0 ) offset -= dir * reach;
  else if ( position.y > 1.0 ) offset += dir * reach;
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
  gl_FragColor = vec4( diffuse, opacity * coverage );
  #include <fog_fragment>
}
`;

/**
 * The colour the outline material is given for `css` to show on screen. The scene is drawn into the composer's linear
 * target and its passes copy it to the canvas without an sRGB encoding or tone mapping (`Effects`), so the value the
 * shader writes is the 8-bit value shown: the CSS channels go in as they are.
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
}

const viewport = new THREE.Vector4();

/** One mesh's outline: its crease edges as instanced quads, told the viewport it is drawn into before each draw. */
class Outline extends THREE.Mesh<LineSegmentsGeometry, OutlineMaterial> {
  override onBeforeRender(renderer: THREE.WebGLRenderer): void {
    // The viewport of the target being drawn (the composer's, or the canvas), in device px: what gl_FragCoord counts.
    this.material.uniforms.viewport.value.copy(renderer.getCurrentViewport(viewport));
  }
}

/** The outline object of one mesh: its crease edges (`buildEdgesGeometry`'s segments). */
export function createOutline(edges: THREE.BufferGeometry, material: OutlineMaterial): THREE.Mesh {
  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(edges.getAttribute("position").array as Float32Array);
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
