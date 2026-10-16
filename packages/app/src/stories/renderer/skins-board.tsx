import { useCallback, useEffect, useMemo, useState } from "react";
import { GameCanvas } from "@paved/renderer/react";
import { NO_SKINS, type AssetManifest, type GameScene, type TileSkins } from "@paved/renderer";
import { getPlanKey, Plan } from "@paved/game-core";
import { toRenderTiles } from "../../components/containers/board-viewport";
import { RENDERER_ASSETS } from "../../mocks/assets";
import { BOARD_72 } from "../../mocks/board";

/** Which plans the story's player has Forest active on. */
export type SkinSet = "none" | "some" | "all";

export interface SkinsBoardProps {
  /** None (the base models), half the plans (every other plan number), or all 19. */
  forest: SkinSet;
  /** Show how many Forest variant files the page has downloaded. */
  readout?: boolean;
}

/**
 * The Forest variants as the app's manifest lists them (`themes["1"]`): Storybook serves the app's `public/` (where the
 * compressed models are) but no `manifest.json`, so the story names the files from the folder, in variant order, and hands
 * the renderer that manifest (`GameCanvas`'s `manifest`). The glob reads the names only: no model is imported or bundled.
 */
const FOREST_FILES = Object.keys(import.meta.glob("../../../public/renderer-assets/models/forest/*.glb", { query: "?url" }));
export const SKINS_MANIFEST: AssetManifest = (() => {
  const plans: Record<string, Array<[number, string]>> = {};
  for (const file of FOREST_FILES) {
    const match = /\/([a-z]{9})_HF_(\d+)\.[0-9a-f]{10}\.glb$/.exec(file);
    if (match) (plans[match[1]!] ??= []).push([Number(match[2]), `models/forest/${file.slice(file.lastIndexOf("/") + 1)}`]);
  }
  const forest = Object.fromEntries(Object.entries(plans).map(([key, v]) => [key, v.sort((a, b) => a[0] - b[0]).map(([, path]) => path)]));
  // No base model listed: Storybook serves the base models under their plain names (`models/<plan>.glb`).
  return { models: {}, themes: { "1": forest } };
})();

const tiles = toRenderTiles(BOARD_72.tiles, 1);

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
export function SkinsBoard({ forest, readout = true }: SkinsBoardProps) {
  const [scene, setScene] = useState<GameScene | null>(null);
  const [ready, setReady] = useState(false);
  const [fetched, setFetched] = useState(0);
  const skins = useMemo(() => skinsFor(forest), [forest]);
  const onReady = useCallback((s: GameScene) => setScene(s), []);

  useEffect(() => {
    if (!scene) return;
    let id = requestAnimationFrame(() => (id = requestAnimationFrame(() => setReady(true))));
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
      <GameCanvas tiles={tiles} skins={skins} manifest={SKINS_MANIFEST} basePath={RENDERER_ASSETS} onReady={onReady} style={{ position: "absolute", inset: 0 }} />
      {readout && (
        <output className="absolute top-3 left-3 rounded-md bg-background/80 px-3 py-2 font-mono text-xs text-foreground" aria-live="off">
          Forest variants fetched: {fetched} of {FOREST_FILES.length}
        </output>
      )}
    </div>
  );
}
