import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { GameCanvas } from "@paved/renderer/react";
import { skinsOf, type GameScene, type RendererSettingsInput, type TileRenderData } from "@paved/renderer";
import { cn } from "../../lib/utils";
import { hasWebGL } from "../../lib/webgl";
import { TileRender, tileName, type TileRenders } from "../elements/tile-render";
import { PLANS } from "./cobble-types";
import { toRenderTiles } from "./board-viewport";

/**
 * The camera's angles at rest, degrees: 40° off the vertical, 35° around, the angled tile renders' (`scripts/render-tiles/page.ts`)
 * and the stack's (`TILT`, `TURN` of `elements/tile-slab.tsx`). Repeated, not imported: that module in this lazy chunk too would
 * split it out of the boards' chunks, one more file in the first load's preload table (the bundle rule).
 */
const TILT = 40;
const TURN = 35;
/** A key's step: 15° around, 10° of tilt. */
const KEY_AROUND = (15 * Math.PI) / 180;
const KEY_TILT = (10 * Math.PI) / 180;
/** Board centre of the contracts: the tile sits on its cell, as the hand's (`TileView`) and the stack's (`StackView`). */
const CENTER = 2_147_483_647;
/** The camera's distance, world units: far enough that its perspective is nil, as the stack's (`STACK_DISTANCE`). */
const DISTANCE = 1500;
/** The camera's vertical field of view, degrees (`CameraController`'s). */
const FOV = 50;
/** The tile's widest span on screen, world units: its 3-unit square's diagonal, seen from straight above at 45° around, and a little more. */
const TILE_SPAN = 4.3;
/** The view's width over its height (the stage's box, `aspect-[4/3]`). */
const ASPECT = 4 / 3;
/**
 * The share of the view's width the tile's widest span takes: from any angle the drag allows (straight above included, where it is
 * tallest) the tile stays inside the view, never cut by the canvas's edge. No zoom (the owner's ask of 2026-11-05).
 */
const SHARE = 0.66;
/** Where the camera looks, world units above the tile's cell: about the middle of its voxels' height. */
const LOOK_Y = 0.15;

/** Over the page, as the stack: no background, fog, vignette or bloom (its light would leave a halo); the camera as far as `DISTANCE`. */
const SETTINGS: RendererSettingsInput = {
  transparent: true,
  camera: { maxDistance: DISTANCE * 1.2 },
  look: { vignette: { enabled: false }, bloom: { enabled: false }, fog: { enabled: false } },
};

/** The camera's zoom that makes the tile `SHARE` of the view's width (`stackZoom`'s rule: px per world unit over the view's height). */
const ZOOM = (2 * DISTANCE * Math.tan(((FOV / 2) * Math.PI) / 180) * SHARE * ASPECT) / TILE_SPAN;

/** Three's `MOUSE.ROTATE` and `TOUCH.ROTATE` (0): the app does not depend on three itself. */
const ROTATE = 0;

export interface TileShowcaseProps {
  /** Chain plan id, 1 to 19. */
  plan: number;
  /** The skin it wears: the theme's `u8` id (0 the base models). */
  theme: number;
  /** Where the renderer finds the models; omitted, the tile's image (no WebGL context). */
  basePath?: string;
  /** The tile's image without the 3D view (no WebGL, no `basePath`, a scene that did not start). */
  renders?: TileRenders;
  /** The scene could not start (no context, a model that did not load): the page shows the image. */
  onError?: () => void;
  /** What shows until the scene is ready (its models in, `GameScene.init`): the page's tile image, so the stage is never empty. */
  placeholder?: ReactNode;
  className?: string;
}

/** Whether the tile can be drawn in 3D here: a base path and a WebGL context (`lib/webgl.ts`). */
export const canShowcase = (basePath: string | undefined): boolean => basePath !== undefined && hasWebGL();

/**
 * The Tiles page's tile (COLLECTION-PAGE, the book's Collection: "Turn a tile"): one tile drawn by the real renderer in its skin, in a
 * transparent canvas over the page (as the stack's, `StackView`), first seen as the tile renders are (`TILT`, `TURN`). The owner's ask
 * of 2026-11-05: the finger alone presents it, a drag turning it around and tilting the view (the renderer's showcase camera: free
 * around, its tilt kept above the tile's plane, so nothing is seen from under it; a glide after the release, its damping), no zoom, no
 * arrows, no pedestal. The arrow keys turn and tilt it the same, focused. One WebGL context while the page is open, beside the
 * village's; it keeps the view from tile to tile. Without WebGL or a base path it is the tile's angled render.
 */
export function TileShowcase({ plan, theme, basePath, renders, onError, placeholder, className }: TileShowcaseProps) {
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const sceneRef = useRef<GameScene | null>(null);
  const skins = useMemo(() => skinsOf(Array.from({ length: PLANS }, (_, i) => (i + 1 === plan ? theme : 0))), [plan, theme]);
  const tiles = useMemo<TileRenderData[]>(() => toRenderTiles([{ id: 1, plan, orientation: 1, x: CENTER, y: CENTER }], 0), [plan]);
  const name = tileName(plan);

  if (failed || !canShowcase(basePath)) {
    return (
      <span role="img" aria-label={name} className={cn("flex size-full items-center justify-center overflow-hidden", className)}>
        <span className="block aspect-square w-2/3 overflow-hidden rounded-xl">
          <TileRender plan={plan} theme={theme} renders={renders} alt="" />
        </span>
      </span>
    );
  }

  // A key turns or tilts it a step, as a drag would: through the renderer's angles, which keep its showcase camera's bounds (its tilt
  // from straight above to about 76° off it, `CameraController.setMode`: never under the tile's plane).
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const scene = sceneRef.current;
    const step = ({ ArrowLeft: [0, -KEY_AROUND], ArrowRight: [0, KEY_AROUND], ArrowUp: [-KEY_TILT, 0], ArrowDown: [KEY_TILT, 0] } as Record<string, [number, number]>)[event.key];
    if (!scene || !step) return;
    event.preventDefault();
    const { polar, azimuth } = scene.controls.getAngles();
    scene.setCameraAngles(polar + step[0], azimuth + step[1]);
  };

  return (
    <span
      role="img"
      tabIndex={0}
      aria-label={`${name}: drag to turn it`}
      aria-roledescription="3D view"
      onKeyDown={onKeyDown}
      data-slot="tile-showcase"
      className={cn("block size-full cursor-grab active:cursor-grabbing", className)}
    >
      {!ready && placeholder}
      <GameCanvas
        tiles={tiles}
        basePath={basePath}
        skins={skins}
        settings={SETTINGS}
        cameraMode="showcase"
        onError={() => {
          setFailed(true);
          onError?.();
        }}
        onReady={(scene) => {
          sceneRef.current = scene;
          // Set before `init` it was dropped (no controls yet): the showcase's free azimuth, its tilt above the tile.
          scene.setCameraMode("showcase");
          // The finger turns and tilts, nothing else: no zoom, no pan (a mouse's every button turns too); the wheel scrolls the page.
          const controls = scene.controls.controls;
          // The web's adapter is three's OrbitControls (`createOrbitCameraInputAdapter`), whose `enableZoom` the renderer's
          // interface does not name: off, a wheel over the tile scrolls the drawer. The distance pinned too, through the interface.
          (controls as typeof controls & { enableZoom?: boolean }).enableZoom = false;
          controls.minDistance = DISTANCE;
          controls.maxDistance = DISTANCE;
          controls.enablePan = false;
          controls.mouseButtons = { LEFT: ROTATE, MIDDLE: ROTATE, RIGHT: ROTATE };
          // Two fingers: nothing (OrbitControls' two-finger gestures are a pinch's and a pan's, both off).
          controls.touches = { ONE: ROTATE, TWO: ROTATE };
          controls.target.set(0, LOOK_Y, 0);
          // At `DISTANCE` from the tile, then turned to the renders' view by the renderer's own angles.
          const { camera } = scene;
          camera.up.set(0, 1, 0);
          camera.position.set(0, LOOK_Y + DISTANCE, 0);
          camera.zoom = ZOOM;
          camera.updateProjectionMatrix();
          scene.setCameraAngles((TILT * Math.PI) / 180, (TURN * Math.PI) / 180);
          setReady(true);
        }}
      />
    </span>
  );
}
