import { useCallback, useEffect, useMemo, useState } from "react";
import { GameCanvas } from "@paved/renderer/react";
import { CategoryType, StructureBoard } from "@paved/game-core";
import { NO_SKINS, TILE_SIZE, type GameScene, type HoverState, type LitTile, type LookPreset, type QualityTier, type RendererSettingsInput } from "@paved/renderer";
import { toRenderTiles } from "../../components/containers/board-viewport";
import { APP_ASSETS } from "../../mocks/assets";
import { BOARD_72 } from "../../mocks/board";
import { lookInput } from "./lighting-look";
import { SKINS_MANIFEST, skinsFor } from "./skins-board";
import { viewPose, type Bounds, type View } from "./outlines-tour";

export interface LightingBoardProps {
  /** The look's preset; every look arg that is set overrides its field. */
  preset: LookPreset;
  /** The graphics quality: "auto" (the device's) or a tier. */
  quality: QualityTier | "auto";
  /** The view the camera holds. */
  view: View;
  /** The camera's distance; unset, the view's own (the opening view: 240). */
  distance?: number;
  /** Show the empty slots around the board, and the ghost of the tile in hand on one of them. */
  highlights: boolean;
  /** Draw every frame even when nothing moves, as the frame-time measures need. */
  redraw?: boolean;
  /** Show the tier in effect and the passes that run. */
  readout?: boolean;
  /** Forest on every plan (each tile its cell's variant, SKIN-RENDER), or the base models. */
  forest?: boolean;
  /** Outlines on software WebGL: "auto" turns them off there; "on" and "off" force them (the GPU measures force them on). */
  force?: "auto" | "on" | "off";
  /** The pixel-ratio cap: "auto" (the device's) or a number. */
  maxPixelRatio?: number | "auto";
  /** One structure lit across its tiles (`GameScene.setLitAreas`): the board's largest city, longest road or largest forest, or none. */
  litStructure?: LitStructure;
  /** The faces' antialiasing: "auto" (the device's), on or off. */
  multisampling?: boolean | "auto";
  /** MSAA's samples (2 or 4). */
  msaaSamples?: number;
  /** The look's flat args (`lighting-look.ts`). */
  [arg: string]: unknown;
}

const tiles = toRenderTiles(BOARD_72.tiles, 1);
const FOREST = skinsFor("all");

export const LIT_STRUCTURES = ["none", "largest-city", "longest-road", "largest-forest"] as const;
export type LitStructure = (typeof LIT_STRUCTURES)[number];

/**
 * The board's structures with their nodes (`StructureBoard`, the engine's union-find seen read-only, the tiles placed in
 * id order as the game placed them). Each lit choice is the structure of its category over the most tiles (the first on
 * a tie), as the renderer's lit tiles of game 1.
 */
const LIT: Record<LitStructure, LitTile[] | null> = (() => {
  const structures = new StructureBoard(BOARD_72.tiles).structures();
  const largest = (category: CategoryType): LitTile[] => {
    const [first] = structures.filter((s) => s.category === category).sort((a, b) => b.tiles - a.tiles);
    return [...first.areas].map(([id, areas]) => ({ gameId: 1, id, areas }));
  };
  return {
    none: null,
    "largest-city": largest(CategoryType.City),
    "longest-road": largest(CategoryType.Road),
    "largest-forest": largest(CategoryType.Forest),
  };
})();

/** The board's bounds, the zoomed-in view's anchor on the lit structure's tiles (their centre) when one is lit. */
function boundsFor(lit: LitTile[] | null): Bounds {
  const cells = lit ? tiles.filter((t) => lit.some((l) => l.id === t.id)) : [];
  if (!cells.length) return BOUNDS;
  const mean = (values: number[]) => (values.reduce((a, b) => a + b, 0) / values.length) * TILE_SIZE;
  return { ...BOUNDS, anchor: [mean(cells.map((t) => t.worldX)), mean(cells.map((t) => t.worldZ))] };
}

function boundsOf(): Bounds {
  const xs = tiles.map((t) => t.worldX * TILE_SIZE);
  const zs = tiles.map((t) => t.worldZ * TILE_SIZE);
  const [minX, maxX, minZ, maxZ] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  const [cx, cz] = [(minX + maxX) / 2, (minZ + maxZ) / 2];
  const near = xs.map((x, i) => ({ x, z: zs[i], d: (x - cx) ** 2 + (zs[i] - cz) ** 2 })).sort((a, b) => a.d - b.d)[0];
  return { minX, maxX, minZ, maxZ, anchor: [near.x, near.z] };
}
const BOUNDS = boundsOf();

/** The empty cells next to a tile: where the slots' outlines show. */
const SLOTS = (() => {
  const taken = new Set(tiles.map((t) => `${t.worldX},${t.worldZ}`));
  const slots = new Map<string, { x: number; y: number }>();
  for (const t of tiles) {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const key = `${t.worldX + dx},${t.worldZ + dz}`;
      if (!taken.has(key)) slots.set(key, { x: t.worldX + dx, y: t.worldZ + dz });
    }
  }
  return [...slots.values()];
})();

/**
 * A valid ghost on the empty slot nearest the board's centre, of a plan already on the board: the renderer draws a ghost
 * only once its model is in, and a plan not on the board loads after the first frame.
 */
const GHOST: HoverState = (() => {
  const cx = (BOUNDS.minX + BOUNDS.maxX) / 2 / TILE_SIZE;
  const cz = (BOUNDS.minZ + BOUNDS.maxZ) / 2 / TILE_SIZE;
  const slot = [...SLOTS].sort((a, b) => (a.x - cx) ** 2 + (a.y - cz) ** 2 - ((b.x - cx) ** 2 + (b.y - cz) ** 2))[0];
  return { x: slot.x, y: slot.y, valid: true, idle: true, planIndex: BOARD_72.tiles[1].plan, orientation: BOARD_72.tiles[1].orientation };
})();

/**
 * The recorded 72-tile board through the real renderer with the look of the args: a preset, any field over it, and the
 * quality tier. `data-ready` is set once the board is drawn at the held view.
 */
export function LightingBoard({ preset, quality, view, distance, highlights, redraw = false, readout = true, forest = false, force = "auto", maxPixelRatio = "auto", multisampling = "auto", msaaSamples = 4, litStructure = "none", ...args }: LightingBoardProps) {
  const [scene, setScene] = useState<GameScene | null>(null);
  const [ready, setReady] = useState(false);
  const [state, setState] = useState("");
  const input = lookInput(args);
  const key = JSON.stringify([preset, quality, input, force, maxPixelRatio, multisampling, msaaSamples]);
  const settings = useMemo<RendererSettingsInput>(
    () => ({ lookPreset: preset, quality, look: input, outlines: { force }, maxPixelRatio, multisampling, msaaSamples }),
    [key], // eslint-disable-line react-hooks/exhaustive-deps
  );


  const onReady = useCallback((s: GameScene) => {
    // The GPU bench reads the composer through it (Q3-GPU: which targets are bound, the chain's swaps).
    (window as { __lightingScene?: GameScene }).__lightingScene = s;
    setScene(s);
  }, []);

  useEffect(() => {
    if (!scene) return;
    const pose = viewPose(view, boundsFor(LIT[litStructure]), distance);
    scene.controls.controls.target.set(...pose.target);
    scene.camera.position.set(...pose.position);
    scene.camera.lookAt(...pose.target);
    scene.requestRender();
    let id = requestAnimationFrame(() => (id = requestAnimationFrame(() => setReady(true))));
    return () => cancelAnimationFrame(id);
  }, [scene, view, distance, litStructure]);

  useEffect(() => {
    if (!scene || !readout) return;
    // After the settings reach the scene (GameCanvas applies them in its own effect).
    const id = requestAnimationFrame(() =>
      setState(`quality ${scene.getQuality()} · passes ${scene.effects.getPassNames().join(" → ")} · faces ${scene.effects.getAntialiasing()}`),
    );
    return () => cancelAnimationFrame(id);
  }, [scene, readout, key]);

  useEffect(() => {
    scene?.setLitAreas(LIT[litStructure] ?? null);
  }, [scene, litStructure]);

  useEffect(() => {
    if (!scene || !redraw) return;
    let id = 0;
    const step = () => {
      scene.requestRender();
      id = requestAnimationFrame(step);
    };
    id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [scene, redraw]);

  return (
    <div className="relative h-full min-h-dvh w-full bg-board" data-ready={ready || undefined}>
      <GameCanvas
        tiles={tiles}
        availableSlots={highlights ? SLOTS : []}
        // Once the models are in: a ghost handed over before then has no model to draw.
        hover={highlights && ready ? GHOST : null}
        // The app's assets and its manifest (the base models, the variants, the tiles); Forest skins only when asked.
        skins={forest ? FOREST : NO_SKINS}
        manifest={SKINS_MANIFEST}
        basePath={APP_ASSETS}
        settings={settings}
        onReady={onReady}
        style={{ position: "absolute", inset: 0 }}
      />
      {readout && state && (
        <output className="absolute top-3 left-3 rounded-md bg-background/80 px-3 py-2 font-mono text-xs text-foreground" aria-live="off">
          {state}
        </output>
      )}
    </div>
  );
}
