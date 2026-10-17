import { useCallback, useEffect, useMemo, useState } from "react";
import { GameCanvas } from "@paved/renderer/react";
import type { AssetManifest, GameScene, TileRenderData } from "@paved/renderer";
import { getPlanKey, Plan } from "@paved/game-core";
import { APP_ASSETS, APP_MANIFEST, SOURCE_ASSETS } from "../../mocks/assets";

/** How a tile is drawn: the plan view's tile, or the placeholder quad of a tile whose model has not come. */
export type TileView = "plan" | "quad";
/** Which images the renderer is given: the 1680 px originals (the host's manifest lists none), or the app's 256 px copies. */
export type TileImages = "original" | "resized";

export interface TilesBoardProps {
  view: TileView;
  images: TileImages;
}

/** The app's models and resized copies as its build's manifest lists them (`APP_MANIFEST`: `models`, `tiles`). */
const RESIZED: AssetManifest = { models: APP_MANIFEST.models, tiles: APP_MANIFEST.tiles };
/** No tiles listed: the loader asks for `assets/tiles/<plan>.png`, the originals (as before TEX), at `SOURCE_ASSETS`. */
const ORIGINAL: AssetManifest = { models: {} };

/** The 19 plans, one tile each, on a 5 x 4 board. */
const COLUMNS = 5;
const tiles: TileRenderData[] = Array.from({ length: 19 }, (_, i) => ({
  game_id: 1,
  id: i + 1,
  player_id: "0x0",
  plan: i + 1,
  orientation: 1,
  x: 0,
  y: 0,
  worldX: (i % COLUMNS) - 2,
  worldZ: Math.floor(i / COLUMNS) - 2,
}));

/** What the GPU holds for the tile images, as the story reads it (`gpuTextures`). */
export interface TextureReadout {
  /** `renderer.info.memory.textures`: every texture three has uploaded, the models' palettes and render targets included. */
  uploaded: number;
  /** The distinct images the tile materials draw with (one per source and colour space, as three uploads them). */
  images: Array<{ width: number; height: number; colorSpace: string; mipmaps: boolean; bytes: number }>;
  /** The sum of `images`' bytes: width x height x 4, times 4/3 with mipmaps. */
  bytes: number;
}

/** The part of a three texture the readout reads (the story does not import three). */
interface MapLike {
  image?: { width?: number; height?: number };
  source: { uuid: string };
  colorSpace: string;
  generateMipmaps: boolean;
  minFilter: number;
}

/** The images the scene's materials draw with, each counted once per source and colour space (three uploads one GL texture for each). */
export function gpuTextures(scene: GameScene): TextureReadout {
  const seen = new Map<string, TextureReadout["images"][number]>();
  scene.scene.traverse((object) => {
    const { material } = object as { material?: { map?: MapLike | null } | Array<{ map?: MapLike | null }> };
    for (const m of Array.isArray(material) ? material : material ? [material] : []) {
      const map = m.map;
      const data = map?.image;
      if (!map || !data?.width || !data.height) continue;
      // three's NearestFilter and LinearFilter (1003, 1006) read no mipmaps; every other minification filter does.
      const mipmaps = map.generateMipmaps && map.minFilter !== 1003 && map.minFilter !== 1006;
      seen.set(`${map.source.uuid}|${map.colorSpace}`, {
        width: data.width,
        height: data.height,
        colorSpace: map.colorSpace || "none",
        mipmaps,
        bytes: Math.round(data.width * data.height * 4 * (mipmaps ? 4 / 3 : 1)),
      });
    }
  });
  const images = [...seen.values()];
  return { uploaded: scene.renderer.info.memory.textures, images, bytes: images.reduce((sum, t) => sum + t.bytes, 0) };
}

/** The one model the board opens with (plan 1's): the first frame waits for it, so the hold below lets it through. */
const OPENING = `/models/${getPlanKey(Plan.from(1).value)}.glb`;

/** The other models never come in the `quad` view: their requests are held, so their tiles keep their placeholder quads. */
function holdModels(): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.endsWith(".glb") && !url.endsWith(OPENING)) await new Promise(() => {});
    return original(input, init);
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

/**
 * The 19 plans on a board, each in `view` and from `images` (TEX): the plan view's tiles, or the placeholder quads (the
 * board opens with plan 1 only; the other 18 are placed once it is drawn, and their models never come, as on a link
 * that is down). `data-ready` is set when the frames after that are drawn; the readout is `gpuTextures`.
 */
export function TilesBoard({ view, images }: TilesBoardProps) {
  const [scene, setScene] = useState<GameScene | null>(null);
  const [placed, setPlaced] = useState(false);
  const [readout, setReadout] = useState<TextureReadout | null>(null);
  const shown = view === "quad" && !placed ? tiles.slice(0, 1) : tiles;
  const manifest = useMemo(() => (images === "resized" ? RESIZED : ORIGINAL), [images]);
  const onReady = useCallback((s: GameScene) => setScene(s), []);

  useEffect(() => (view === "quad" ? holdModels() : undefined), [view]);

  useEffect(() => {
    if (!scene) return;
    setPlaced(true);
    let frames = 0;
    let id = 0;
    const wait = () => {
      if (++frames < 12) id = requestAnimationFrame(wait);
      else setReadout(gpuTextures(scene));
    };
    id = requestAnimationFrame(wait);
    return () => cancelAnimationFrame(id);
  }, [scene]);

  return (
    <div className="relative h-full min-h-dvh w-full bg-board" data-ready={readout ? "" : undefined} data-bytes={readout?.bytes} data-uploaded={readout?.uploaded}>
      <GameCanvas tiles={shown} strategyMode={view === "plan"} manifest={manifest} basePath={images === "resized" ? APP_ASSETS : SOURCE_ASSETS} onReady={onReady} style={{ position: "absolute", inset: 0 }} />
      {readout && (
        <output className="absolute top-3 left-3 rounded-md bg-background/80 px-3 py-2 font-mono text-xs text-foreground" aria-live="off">
          {view} view, {images} images: {readout.images.length} images on the GPU, {(readout.bytes / 1e6).toFixed(2)} MB; three holds {readout.uploaded} textures
        </output>
      )}
    </div>
  );
}

