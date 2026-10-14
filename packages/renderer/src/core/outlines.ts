import * as THREE from "three";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { TILE_SIZE } from "./types";

/**
 * The voxel tiles' outlines (R-OUT).
 *
 * Each tile type's crease edges (`buildEdgesGeometry`) are drawn as screen-space quads (three's `LineSegments2`), so
 * their width is set in pixels, unlike `THREE.LineSegments`, whose lines are always 1 px. The width follows the zoom
 * (`OutlineSettings`): zoomed out past a threshold the outlines are off, they fade in over a short range above it, then
 * widen with the zoom up to a maximum. They are drawn after the faces with a depth bias towards the camera: an outline
 * lies exactly on the faces it borders, and without the bias it wins or loses the depth test by rounding (the flicker
 * the owner saw).
 *
 * The zoom is measured as the on-screen size of one tile, in CSS pixels, at the camera's target ("tile px"): it folds in
 * the distance, the field of view, the camera's zoom and the viewport's height, so a phone and a desktop window get the
 * same line density for the same tile size.
 */
export interface OutlineSettings {
  /** Draw outlines at all. */
  enabled: boolean;
  /** At or below this tile size (CSS px) the outlines are off. */
  fadeThresholdTilePx: number;
  /** Above the threshold the outlines fade in over this many tile px: no pop. */
  fadeRangeTilePx: number;
  /** Width at the end of the fade, in CSS px. */
  minWidthPx: number;
  /** Maximum width, in CSS px: the outlines stop widening there. */
  maxWidthPx: number;
  /** Tile size (CSS px) from which the outlines are at their maximum width. */
  maxWidthTilePx: number;
}

export const DEFAULT_OUTLINE_SETTINGS: OutlineSettings = {
  enabled: true,
  // Tuned on the 72-tile bench board (R-OUT captures): a tile has 16 to 20 voxels a side, and its forests a crease on
  // nearly every voxel. Below about 100 px a tile (a voxel of 5 px) a 1 px line on each of them darkens the tile; at
  // 160 px opaque lines still weigh on the forests, so the fade runs to 192 px. The game opens at 60 px a tile in a
  // 900 px window: it opens without outlines, and they come in as the player zooms in.
  fadeThresholdTilePx: 96,
  fadeRangeTilePx: 96,
  minWidthPx: 1,
  maxWidthPx: 2,
  maxWidthTilePx: 800,
};

/** The depth bias of the outlines (`polygonOffset`, negative: towards the camera). */
export const OUTLINE_DEPTH_BIAS = { factor: -1, units: -4 } as const;

const OUTLINE_COLOR = 0x000000;
/** After the tile faces. */
const OUTLINE_RENDER_ORDER = 1;

/** How an outline is drawn at a zoom: its width in CSS px and its opacity; opacity 0 is not drawn. */
export interface OutlineStroke {
  width: number;
  opacity: number;
}

const smoothstep = (u: number) => u * u * (3 - 2 * u);

/**
 * The stroke for a tile shown `tilePx` CSS px wide: off at or below the threshold; over the fade range the opacity
 * rises smoothly from 0 to 1 at `minWidthPx`; above it the width grows with the logarithm of the tile size (zooming is
 * multiplicative) to `maxWidthPx` at `maxWidthTilePx`, and stays there. Width and opacity never decrease with the zoom.
 */
export function outlineStroke(tilePx: number, settings: OutlineSettings = DEFAULT_OUTLINE_SETTINGS): OutlineStroke {
  const { fadeThresholdTilePx: t0, fadeRangeTilePx: range, minWidthPx, maxWidthPx, maxWidthTilePx } = settings;
  if (!settings.enabled || !(tilePx > t0)) return { width: 0, opacity: 0 };
  const t1 = t0 + Math.max(range, 0);
  const opacity = tilePx >= t1 ? 1 : smoothstep((tilePx - t0) / (t1 - t0));
  const widest = Math.max(maxWidthPx, minWidthPx);
  if (tilePx <= t1 || maxWidthTilePx <= t1) return { width: tilePx >= maxWidthTilePx ? widest : minWidthPx, opacity };
  const u = Math.min(Math.log(tilePx / t1) / Math.log(maxWidthTilePx / t1), 1);
  return { width: minWidthPx + (widest - minWidthPx) * u, opacity };
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

/** The material every outline shares. */
export function createOutlineMaterial(): LineMaterial {
  const material = new LineMaterial({
    color: OUTLINE_COLOR,
    linewidth: 1,
    transparent: true,
    depthWrite: false,
  });
  material.polygonOffset = true;
  material.polygonOffsetFactor = OUTLINE_DEPTH_BIAS.factor;
  material.polygonOffsetUnits = OUTLINE_DEPTH_BIAS.units;
  return material;
}

/** Sets the shared material to a stroke; hidden at opacity 0, so no outline is drawn at all. */
export function applyOutlineStroke(material: LineMaterial, stroke: OutlineStroke): void {
  material.visible = stroke.opacity > 0 && stroke.width > 0;
  if (!material.visible) return;
  material.linewidth = stroke.width;
  material.opacity = stroke.opacity;
}

/** The outline object of one mesh: its crease edges (`buildEdgesGeometry`'s segments) as screen-space quads. */
export function createOutline(edges: THREE.BufferGeometry, material: LineMaterial): LineSegments2 {
  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(edges.getAttribute("position").array as Float32Array);
  edges.dispose();
  const outline = new LineSegments2(geometry, material);
  outline.renderOrder = OUTLINE_RENDER_ORDER;
  outline.userData.outline = true;
  return outline;
}

/** Whether an object is an outline (a `LineSegments2` is a `THREE.Mesh`: traversals of the tiles' meshes skip it). */
export function isOutline(object: THREE.Object3D): boolean {
  return object.userData.outline === true;
}
