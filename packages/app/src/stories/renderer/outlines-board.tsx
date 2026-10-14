import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotionConfig } from "motion/react";
import { GameCanvas } from "@paved/renderer/react";
import { TILE_SIZE, type GameScene } from "@paved/renderer";
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
}

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
export function OutlinesBoard({ tour, view, distance, redraw = false }: OutlinesBoardProps) {
  const tiles = useMemo(() => toRenderTiles(BOARD_72.tiles, 1), []);
  const bounds = useMemo(() => boundsOf(tiles), [tiles]);
  const [scene, setScene] = useState<GameScene | null>(null);
  const [ready, setReady] = useState(false);
  const reduced = useReducedMotionConfig();
  const touring = tour && !reduced;
  const startedAt = useRef<number | null>(null);

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
      <GameCanvas tiles={tiles} basePath={RENDERER_ASSETS} onReady={onReady} style={{ position: "absolute", inset: 0 }} />
    </div>
  );
}
