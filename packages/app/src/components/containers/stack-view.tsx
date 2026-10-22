import { useEffect, useRef, useState } from "react";
import { useReducedMotionConfig } from "motion/react";
import { GameCanvas } from "@paved/renderer/react";
import type { GameScene, RendererSettingsInput, TileRenderData, TileSkins } from "@paved/renderer";
import { cn } from "../../lib/utils";
import { TILT, TURN } from "../elements/tile-slab";
import { toRenderTiles } from "./board-viewport";

/** Board centre of the contracts: the stack's tiles sit on its cell, as the hand's tile (`TileView`) does. */
const CENTER = 2_147_483_647;
/** The camera's distance, world units: far enough that its perspective is nil, so the scene meets the stack's CSS pile. */
export const STACK_DISTANCE = 1500;
/** The camera's vertical field of view, degrees (`CameraController`'s). */
const FOV = 50;
/** A tile drawn, a tile moved: a short glide, ms (the stack's rise, `RISE_MS`). */
const GLIDE_MS = 260;

/**
 * Over the page, as one object with the stack's CSS pile: no background, fog, vignette or bloom (the bloom's light would
 * leave a halo on the page); the camera may stand as far as `STACK_DISTANCE`.
 */
const SETTINGS: RendererSettingsInput = {
  transparent: true,
  camera: { maxDistance: STACK_DISTANCE * 1.2 },
  look: { vignette: { enabled: false }, bloom: { enabled: false }, fog: { enabled: false } },
};

/** What a glide moves of a tile: its lift, size, yaw and lean (its angle). */
interface Pose {
  lift: number;
  scale: number;
  yaw: number;
  lean: number;
}

const poseOf = (t: StackTile): Pose => ({ lift: t.lift, scale: t.scale, yaw: t.yaw ?? 0, lean: t.lean?.angle ?? 0 });

/** One tile of the stack's view: its draw order (`id`, kept as it moves up), how high it hovers and its size, in world units. */
export interface StackTile {
  id: number;
  plan: number;
  orientation: number;
  lift: number;
  scale: number;
  /** See-through: the tile in hand is on a cell, or its move is on its way (the board draws it). */
  faded?: boolean;
  /** Turned around its vertical, radians: a tile of the pile a little askew. */
  yaw?: number;
  /** Leaning toward the view (`TileRenderData.lean`): the tile in hand nearly seen from above, the next halfway. */
  lean?: { angle: number; toward: number };
  /** A tile of the pile, squashed to a slab this thick (world units). */
  thickness?: number;
}

/** The stack's tiles and framing (`TileStack`'s `StackFrame`), and where the assets are. */
export interface StackViewProps {
  tiles: readonly StackTile[];
  /** Where a tile that was not there comes from (out of the pile), world units. */
  enterLift: number;
  /** The world point at the view's centre. */
  target: readonly [number, number, number];
  /** The view's height and the px per world unit, at the same scale: the camera's zoom (`stackZoom`). */
  heightPx: number;
  unitPx: number;
  /** As `BoardViewport`'s: where the renderer finds the models. */
  basePath?: string;
  /** As `TileView`'s: the tiles in their player's skin, the variant of the board's centre. */
  skins?: TileSkins;
  className?: string;
}

/** The camera's zoom that draws `unitPx` CSS px per world unit in a view `heightPx` CSS px high, at `STACK_DISTANCE`. */
export function stackZoom(unitPx: number, heightPx: number): number {
  return (2 * STACK_DISTANCE * Math.tan(((FOV / 2) * Math.PI) / 180) * unitPx) / heightPx;
}

const ease = (k: number) => 1 - (1 - k) ** 3;

/**
 * The tile stack's tiles drawn by the real renderer, in one transparent canvas (after Dorfromantik's): the pile, real tiles
 * of the deck squashed to slabs and a little askew, then the coming tiles and the tile in hand, each with its height and
 * voxels, seen as the stack is (`TILT`, `TURN`). One WebGL context for all, as `TileView` was one for the hand. A tile that
 * moves up (the next becomes the tile in hand, leaning further toward the view) glides there; none under reduced motion. It takes
 * no input: the stack's deck button lies over it.
 */
export function StackView({ tiles, enterLift, target, heightPx, unitPx, basePath, skins, className }: StackViewProps) {
  const zoom = stackZoom(unitPx, heightPx);
  const reduced = useReducedMotionConfig() ?? false;
  const sceneRef = useRef<GameScene | null>(null);
  // Where each tile was last drawn, by id: a glide starts from there (mid-glide too).
  const shown = useRef(new Map<number, Pose>());
  const [drawn, setDrawn] = useState<TileRenderData[]>([]);
  // The page gives a new list each render: the glide starts only when a tile changed.
  const changes = tiles
    .map((t) => `${t.id}:${t.plan}:${t.orientation}:${t.lift}:${t.scale}:${t.faded ? 1 : 0}:${t.yaw ?? 0}:${t.lean?.angle ?? 0}:${t.thickness ?? 0}`)
    .join("|");

  useEffect(() => {
    const at = (k: number) =>
      tiles.map((t) => {
        const to = poseOf(t);
        const from = shown.current.get(t.id) ?? { ...to, lift: enterLift };
        const mix = (a: number, b: number) => a + (b - a) * k;
        const lean = mix(from.lean, to.lean);
        return { ...t, lift: mix(from.lift, to.lift), scale: mix(from.scale, to.scale), yaw: mix(from.yaw, to.yaw), lean: lean ? { angle: lean, toward: t.lean?.toward ?? 0 } : undefined };
      });
    const draw = (list: StackTile[]) => {
      setDrawn(
        toRenderTiles(
          list.map((t) => ({ id: t.id, plan: t.plan, orientation: t.orientation, x: CENTER, y: CENTER })),
          0,
        ).map((r, i) => {
          const { lift, scale, faded, yaw, lean, thickness } = list[i]!;
          return { ...r, lift, scale, faded, yaw, lean, thickness };
        }),
      );
    };
    const keep = (list: readonly StackTile[]) => {
      for (const t of list) shown.current.set(t.id, poseOf(t));
    };
    const done = () => {
      keep(tiles);
      draw([...tiles]);
    };
    const still = (t: StackTile) => {
      const [was, now] = [shown.current.get(t.id), poseOf(t)];
      return was && was.lift === now.lift && was.scale === now.scale && was.yaw === now.yaw && was.lean === now.lean;
    };
    if (reduced || tiles.every(still)) {
      done();
      return;
    }
    const start = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const k = Math.min(1, (now - start) / GLIDE_MS);
      if (k >= 1) return done();
      const list = at(ease(k));
      keep(list);
      draw(list);
      frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
    // `changes` stands for `tiles`.
  }, [changes, enterLift, reduced]);

  // The camera on its sphere around the target, at the stack's view; again when the framing changes (the pile sank).
  const [tx, ty, tz] = target;
  const frame = (scene: GameScene) => {
    const tilt = (TILT * Math.PI) / 180;
    const turn = (TURN * Math.PI) / 180;
    const { camera } = scene;
    scene.controls.controls.target.set(tx, ty, tz);
    camera.up.set(0, 1, 0);
    camera.position.set(
      tx + STACK_DISTANCE * Math.sin(tilt) * Math.sin(turn),
      ty + STACK_DISTANCE * Math.cos(tilt),
      tz + STACK_DISTANCE * Math.sin(tilt) * Math.cos(turn),
    );
    camera.zoom = zoom;
    camera.updateProjectionMatrix();
    camera.lookAt(tx, ty, tz);
    scene.requestRender();
  };
  useEffect(() => {
    if (sceneRef.current) frame(sceneRef.current);
    // `frame` reads only the target and the zoom.
  }, [tx, ty, tz, zoom]);

  return (
    <span aria-hidden className={cn("pointer-events-none block size-full", className)}>
      <GameCanvas
        tiles={drawn}
        basePath={basePath}
        skins={skins}
        settings={SETTINGS}
        cameraMode="showcase"
        onReady={(scene) => {
          sceneRef.current = scene;
          // Set before `init` it was dropped (no controls yet): the showcase's free azimuth, no board bounds.
          scene.setCameraMode("showcase");
          frame(scene);
        }}
      />
    </span>
  );
}
