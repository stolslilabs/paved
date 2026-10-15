import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotionConfig } from "motion/react";
import { GameCanvas } from "@paved/renderer/react";
import { DEFAULT_RENDERER_SETTINGS, TILE_SIZE, type GameScene, type RendererSettingsInput } from "@paved/renderer";
import { toRenderTiles } from "../../components/containers/board-viewport";
import { RENDERER_ASSETS } from "../../mocks/assets";
import { BOARD_72 } from "../../mocks/board";
import { tourPose, viewPose, type Bounds, type Pose, type View } from "./outlines-tour";

export interface OutlinesBoardProps {
  /** Pan and zoom through the views by itself. Off under reduced motion, whatever this says. */
  tour: boolean;
  /** The view the camera holds while the tour is off. */
  view: View;
  /** The camera's distance while the tour is off, 5 (fully zoomed in) to 300 (fully zoomed out); unset, the view's own. */
  distance?: number;
  /** Draw every frame even when nothing moves, as the frame-time measures need. */
  redraw?: boolean;
  /** Show the current zoom and the outlines' stroke on the board. */
  readout?: boolean;
  /** The renderer's settings (`RendererSettings`), flat: the outlines' fade, width and colour, the camera's zoom limits. */
  /** Outlines on software WebGL: "auto" turns them off there; "on" and "off" force them whatever the detection says. */
  force?: "auto" | "on" | "off";
  fadeOffFactor?: number;
  fadeFullFactor?: number;
  widthVoxels?: number;
  minWidthDevicePx?: number;
  maxWidthPx?: number;
  color?: string;
  minDistance?: number;
  maxDistance?: number;
  capZoomOut?: boolean;
  zoomOutCapDistance?: number;
  multisampling?: boolean;
}

const { outlines: OUTLINES, camera: CAMERA } = DEFAULT_RENDERER_SETTINGS;

/** The story's defaults: the renderer's. */
export const SETTINGS_DEFAULTS = {
  force: OUTLINES.force,
  fadeOffFactor: OUTLINES.fadeOffFactor,
  fadeFullFactor: OUTLINES.fadeFullFactor,
  widthVoxels: OUTLINES.widthVoxels,
  minWidthDevicePx: OUTLINES.minWidthDevicePx,
  maxWidthPx: OUTLINES.maxWidthPx,
  color: OUTLINES.color,
  minDistance: CAMERA.minDistance,
  maxDistance: CAMERA.maxDistance,
  capZoomOut: CAMERA.capZoomOut,
  zoomOutCapDistance: CAMERA.zoomOutCapDistance,
  multisampling: DEFAULT_RENDERER_SETTINGS.multisampling,
};

interface Zoom {
  distance: number;
  tilePx: number;
  openingTilePx: number;
  width: number;
  opacity: number;
}

const round = (z: Zoom): Zoom => ({
  distance: Math.round(z.distance),
  tilePx: Math.round(z.tilePx),
  openingTilePx: Math.round(z.openingTilePx),
  width: Math.round(z.width * 100) / 100,
  opacity: Math.round(z.opacity * 100) / 100,
});
const same = (a: Zoom | null, b: Zoom) => !!a && a.distance === b.distance && a.tilePx === b.tilePx && a.openingTilePx === b.openingTilePx && a.width === b.width && a.opacity === b.opacity;

function boundsOf(tiles: { worldX: number; worldZ: number }[]): Bounds {
  const xs = tiles.map((t) => t.worldX * TILE_SIZE);
  const zs = tiles.map((t) => t.worldZ * TILE_SIZE);
  const [minX, maxX, minZ, maxZ] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  const [cx, cz] = [(minX + maxX) / 2, (minZ + maxZ) / 2];
  const near = xs.map((x, i) => ({ x, z: zs[i], d: (x - cx) ** 2 + (zs[i] - cz) ** 2 })).sort((a, b) => a.d - b.d)[0];
  return { minX, maxX, minZ, maxZ, anchor: [near.x, near.z] };
}

function place(scene: GameScene, pose: Pose): void {
  scene.controls.controls.target.set(...pose.target);
  scene.camera.position.set(...pose.position);
  scene.camera.lookAt(...pose.target);
  scene.requestRender();
}

/**
 * The recorded 72-tile board of the bench through the real renderer, filling the story, its camera on a tour of the
 * views where outlines used to fail: straight down, panning, the game's opening distance, fully zoomed out and in.
 * Stop the tour to hold one view, set its distance, or drag the board. `data-ready` is set once the board is drawn.
 */
export function OutlinesBoard({ tour, view, distance, redraw = false, readout = true, ...rest }: OutlinesBoardProps) {
  const tiles = useMemo(() => toRenderTiles(BOARD_72.tiles, 1), []);
  const bounds = useMemo(() => boundsOf(tiles), [tiles]);
  const [scene, setScene] = useState<GameScene | null>(null);
  const [ready, setReady] = useState(false);
  const reduced = useReducedMotionConfig();
  const touring = tour && !reduced;
  const startedAt = useRef<number | null>(null);
  const [zoom, setZoom] = useState<Zoom | null>(null);
  const o = { ...SETTINGS_DEFAULTS, ...rest };
  const settings = useMemo<RendererSettingsInput>(
    () => ({
      outlines: {
        force: o.force,
        fadeOffFactor: o.fadeOffFactor,
        fadeFullFactor: o.fadeFullFactor,
        widthVoxels: o.widthVoxels,
        minWidthDevicePx: o.minWidthDevicePx,
        maxWidthPx: o.maxWidthPx,
        color: o.color,
      },
      camera: { minDistance: o.minDistance, maxDistance: o.maxDistance, capZoomOut: o.capZoomOut, zoomOutCapDistance: o.zoomOutCapDistance },
      multisampling: o.multisampling,
    }),
    [o.force, o.fadeOffFactor, o.fadeFullFactor, o.widthVoxels, o.minWidthDevicePx, o.maxWidthPx, o.color, o.minDistance, o.maxDistance, o.capZoomOut, o.zoomOutCapDistance, o.multisampling],
  );

  // The readout follows the camera, whoever moves it (the tour, a drag, the wheel).
  useEffect(() => {
    if (!scene || !readout) return;
    let id = 0;
    let last: Zoom | null = null;
    const step = () => {
      const z = scene.getZoom();
      const next = round({ distance: z.distance, tilePx: z.tilePx, openingTilePx: z.openingTilePx, width: z.outline.width, opacity: z.outline.opacity });
      if (!same(last, next)) setZoom((last = next));
      id = requestAnimationFrame(step);
    };
    id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [scene, readout]);

  const onReady = useCallback((s: GameScene) => setScene(s), []);

  // Hold the chosen view.
  useEffect(() => {
    if (!scene || touring) return;
    place(scene, viewPose(view, bounds, distance));
    // Two frames: the one that draws the pose, and one after it, before a capture may be taken.
    let id = requestAnimationFrame(() => (id = requestAnimationFrame(() => setReady(true))));
    return () => cancelAnimationFrame(id);
  }, [scene, touring, view, distance, bounds]);

  // The tour, and the redraw of every frame.
  useEffect(() => {
    if (!scene || (!touring && !redraw)) return;
    let id = 0;
    const step = (ts: number) => {
      if (touring) {
        startedAt.current ??= ts;
        place(scene, tourPose(ts - startedAt.current, bounds));
      } else {
        scene.requestRender();
      }
      id = requestAnimationFrame(step);
    };
    id = requestAnimationFrame(step);
    if (touring) setReady(true);
    return () => cancelAnimationFrame(id);
  }, [scene, touring, redraw, bounds]);

  return (
    <div className="relative h-dvh w-full bg-board" data-ready={ready || undefined}>
      <GameCanvas tiles={tiles} basePath={RENDERER_ASSETS} settings={settings} onReady={onReady} style={{ position: "absolute", inset: 0 }} />
      {readout && zoom && (
        <output className="absolute top-3 left-3 rounded-md bg-background/80 px-3 py-2 font-mono text-xs text-foreground" aria-live="off">
          distance {zoom.distance} · tile {zoom.tilePx} px (opens at {zoom.openingTilePx}) · outline {zoom.opacity > 0 ? `${zoom.width} device px at ${Math.round(zoom.opacity * 100)}%` : "off"}
        </output>
      )}
    </div>
  );
}
