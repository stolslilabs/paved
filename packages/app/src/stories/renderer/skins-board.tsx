import { useCallback, useEffect, useMemo, useState } from "react";
import { GameCanvas } from "@paved/renderer/react";
import { NO_SKINS, variantHash, variantIndex, type AssetManifest, type GameScene, type TileSkins } from "@paved/renderer";
import { getPlanKey, Plan } from "@paved/game-core";
import { toRenderTiles } from "../../components/containers/board-viewport";
import { APP_ASSETS } from "../../mocks/assets";
import { BOARD_72 } from "../../mocks/board";

/** Which plans the story's player has Forest active on. */
export type SkinSet = "none" | "some" | "all";

export interface SkinsBoardProps {
  /** None (the base models), half the plans (every other plan number), or all 19. */
  forest: SkinSet;
  /** Show how many Forest variant files the page has downloaded. */
  readout?: boolean;
  /**
   * Hold every model response this long (ms; 0: none), as a slow link would. The board then opens with all but its last
   * tiles, places those once it is drawn, and hovers a ghost: they draw their plan's image on a flat quad (Q-POLISH-R)
   * until their models come.
   */
  delayModels?: number;
}

/**
 * The base models and the Forest variants as the app's manifest lists them (`models`, `tiles`, `themes["1"]`): Storybook serves the
 * app's `public/` (where the compressed models are) at `APP_ASSETS` but no `manifest.json`, so the story names the files from
 * the folder, in variant order, and hands the renderer that manifest (`GameCanvas`'s `manifest`). The globs read the names
 * only: no model is imported or bundled.
 */
const TILE_FILES = Object.keys(import.meta.glob("../../../public/renderer-assets/tiles/*.png", { query: "?url" }));
const BASE_FILES = Object.keys(import.meta.glob("../../../public/renderer-assets/models/*.glb", { query: "?url" }));
const FOREST_FILES = Object.keys(import.meta.glob("../../../public/renderer-assets/models/forest/*.glb", { query: "?url" }));
export const SKINS_MANIFEST: AssetManifest = (() => {
  const plans: Record<string, Array<[number, string]>> = {};
  for (const file of FOREST_FILES) {
    const match = /\/([a-z]{9})_HF_(\d+)\.[0-9a-f]{10}\.glb$/.exec(file);
    if (match) (plans[match[1]!] ??= []).push([Number(match[2]), `models/forest/${file.slice(file.lastIndexOf("/") + 1)}`]);
  }
  const forest = Object.fromEntries(Object.entries(plans).map(([key, v]) => [key, v.sort((a, b) => a[0] - b[0]).map(([, path]) => path)]));
  const models: Record<string, string> = {};
  for (const file of BASE_FILES) {
    const match = /\/([a-z]{9})\.[0-9a-f]{10}\.glb$/.exec(file);
    if (match) models[match[1]!] = `models/${file.slice(file.lastIndexOf("/") + 1)}`;
  }
  // The 256 px tile images, as the app's build lists them: the app ships no original (`assets/tiles/`) to ask for.
  const tiles: Record<string, Record<string, string>> = {};
  for (const file of TILE_FILES) {
    const match = /\/([a-z]{9})\.(\d+)\.[0-9a-f]{10}\.png$/.exec(file);
    if (match) (tiles[match[2]!] ??= {})[match[1]!] = `tiles/${file.slice(file.lastIndexOf("/") + 1)}`;
  }
  return { models, tiles, themes: { "1": forest } };
})();

const tiles = toRenderTiles(BOARD_72.tiles, 1);

/** The tiles placed after the board is drawn when the models are delayed: the recorded board's last ones. */
const LATE_TILES = 12;

/** The Forest variant a tile of `plan` at the contracts' (x, y) of game 1 draws (the renderer's own pick). */
const forestVariant = (plan: number, x: number, y: number) => {
  const variants = SKINS_MANIFEST.themes!["1"]![getPlanKey(Plan.from(plan).value)] ?? [];
  return variants[variantIndex(variantHash(plan, x, y, 1), variants.length)];
};

/**
 * The ghost: on a free cell beside the first late tile, with the first plan (in plan order) whose Forest variant there is
 * not one the opening board loads, so that it waits for its model (with Forest on all plans) and shows the quad.
 */
const GHOST = (() => {
  const taken = new Set(tiles.map((t) => `${t.worldX},${t.worldZ}`));
  const opening = new Set(tiles.slice(0, -LATE_TILES).map((t) => forestVariant(t.plan, t.x, t.y)));
  const near = tiles[tiles.length - LATE_TILES]!;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]] as const) {
    const x = near.worldX + dx;
    const z = near.worldZ + dz;
    if (taken.has(`${x},${z}`)) continue;
    const cell = { x: near.x + dx, y: near.y - dz, gameId: 1 };
    for (let plan = 1; plan <= 19; plan++) {
      if (!opening.has(forestVariant(plan, cell.x, cell.y))) return { x, y: z, valid: true, idle: true, planIndex: plan, orientation: 1, cell };
    }
  }
  return null;
})();

/** The models' delay the page's `fetch` applies (`delayModels`): a story's stand-in for a slow link, nothing more. */
let modelDelay = 0;
let realFetch: typeof fetch | null = null;
function delayModelFetches(ms: number): () => void {
  modelDelay = ms;
  if (!realFetch) {
    const original = globalThis.fetch;
    realFetch = original;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await original(input, init);
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (modelDelay > 0 && url.endsWith(".glb")) await new Promise((done) => setTimeout(done, modelDelay));
      return response;
    }) as typeof fetch;
  }
  return () => {
    modelDelay = 0;
    if (realFetch) globalThis.fetch = realFetch;
    realFetch = null;
  };
}

/** The skin map of a set: Forest (theme 1) on every plan, on every other plan number, or none. */
export function skinsFor(set: SkinSet): TileSkins {
  if (set === "none") return NO_SKINS;
  const skins: Record<string, number> = {};
  for (let plan = 1; plan <= 19; plan++) if (set === "all" || plan % 2 === 1) skins[getPlanKey(Plan.from(plan).value)] = 1;
  return skins;
}

/** The Forest variant files this page has fetched so far (the browser's resource timings). */
const forestFetched = () => new Set(performance.getEntriesByType("resource").map((e) => e.name).filter((n) => n.includes("/models/forest/"))).size;

/**
 * The recorded 72-tile board (game 1) with Forest on none, half or all of its plans: each skinned tile draws the variant
 * its cell's hash picks, loaded when a tile first needs it. `data-ready` is set once the board is drawn.
 */
export function SkinsBoard({ forest, readout = true, delayModels = 0 }: SkinsBoardProps) {
  const [scene, setScene] = useState<GameScene | null>(null);
  const [ready, setReady] = useState(false);
  // Delayed: the last tiles come after the board is drawn, as placements do, and their models after `delayModels`.
  const [placed, setPlaced] = useState(false);
  const shown = delayModels > 0 && !placed ? tiles.slice(0, -LATE_TILES) : tiles;
  const [fetched, setFetched] = useState(0);
  const skins = useMemo(() => skinsFor(forest), [forest]);
  const onReady = useCallback((s: GameScene) => setScene(s), []);

  // From the board's first draw on (the canvas's effects run first): the models of the tiles placed after it are held.
  useEffect(() => (delayModels > 0 ? delayModelFetches(delayModels) : undefined), [delayModels]);

  useEffect(() => {
    if (!scene) return;
    let id = requestAnimationFrame(() => (id = requestAnimationFrame(() => {
      setPlaced(true);
      setReady(true);
    })));
    return () => cancelAnimationFrame(id);
  }, [scene]);

  useEffect(() => {
    if (!readout) return;
    // The count moves while variants come in; a story's readout, not the renderer's work.
    const id = setInterval(() => setFetched(forestFetched()), 500);
    return () => clearInterval(id);
  }, [readout]);

  return (
    <div className="relative h-full min-h-dvh w-full bg-board" data-ready={ready || undefined}>
      <GameCanvas tiles={shown} hover={delayModels > 0 && placed ? GHOST : null} skins={skins} manifest={SKINS_MANIFEST} basePath={APP_ASSETS} onReady={onReady} style={{ position: "absolute", inset: 0 }} />
      {readout && (
        <output className="absolute top-3 left-3 rounded-md bg-background/80 px-3 py-2 font-mono text-xs text-foreground" aria-live="off">
          Forest variants fetched: {fetched} of {FOREST_FILES.length}
        </output>
      )}
    </div>
  );
}
