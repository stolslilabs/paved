import { useEffect, useState } from "react";

/** The side, in pixels, of the tile copy the chips draw: the one the renderer draws (`TILE_IMAGE_SIZE`), so both share one cache entry. */
const CHIP_IMAGE_SIZE = "256";

type Tiles = Record<string, string>;

/**
 * One read of `<artBase>/manifest.json` per base path for the page's life, resolved to the 256 px copies by plan key
 * (`{ "ccccccccc": "tiles/ccccccccc.256.<hash>.png" }`), or to null: no manifest (a 404, a body that is not one, a base
 * path with no host), or a failed read. A failed read is asked again by the next chip that mounts.
 */
const reads = new Map<string, Promise<Tiles | null>>();

/** Whether `value` is a map of plan key to path (a manifest's `tiles[size]`). */
const isTiles = (value: unknown): value is Tiles =>
  typeof value === "object" && value !== null && !Array.isArray(value) && Object.values(value).every((v) => typeof v === "string");

async function read(artBase: string): Promise<Tiles | null> {
  try {
    const url = new URL(`${artBase}/manifest.json`, (globalThis as { location?: { href: string } }).location?.href).href;
    // Revalidated, as the renderer's loader does: the manifest is the one file whose name does not change with its content.
    const response = await fetch(url, { cache: "no-cache" });
    if (!response.ok) return response.status === 404 ? null : Promise.reject(new Error(String(response.status)));
    const tiles = ((await response.json()) as { tiles?: Record<string, unknown> } | null)?.tiles?.[CHIP_IMAGE_SIZE];
    return isTiles(tiles) ? tiles : null;
  } catch (error) {
    // A body that is not JSON is no manifest (a dev server's index.html for an unknown path); a network error is retried later.
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

/** The 256 px copies the manifest at `artBase` lists, read once; a failed read resolves to null and is not kept. */
export function loadTileArt(artBase: string): Promise<Tiles | null> {
  let tiles = reads.get(artBase);
  if (!tiles) {
    const attempt = read(artBase).catch(() => {
      if (reads.get(artBase) === attempt) reads.delete(artBase);
      return null;
    });
    tiles = attempt;
    reads.set(artBase, tiles);
  }
  return tiles;
}

/** For tests: forget what was read. */
export function resetTileArt(): void {
  reads.clear();
}

export type TileArt =
  /** The manifest is still being read. */
  | { status: "loading" }
  /** The image of a plan key, relative to `artBase`: the manifest's 256 px copy, else the original `assets/tiles/<key>.png`. */
  | { status: "ready"; path: (key: string) => string };

const original = (key: string) => `assets/tiles/${key}.png`;

/**
 * Where the tile chips find their image under `artBase`: the 256 px copy the manifest lists (the file the board draws, one
 * cache entry for both), and today's original path for a plan the manifest does not list, or when there is no manifest or the
 * read failed, so a chip is never blank. `loading` until the first read ends, so the chip does not fetch the original first.
 * Without an `artBase` there is nothing to read: ready, with the original path.
 */
export function useTileArt(artBase: string | undefined): TileArt {
  const [done, setDone] = useState<{ artBase: string; tiles: Tiles | null } | null>(null);
  useEffect(() => {
    if (artBase == null) return;
    let live = true;
    void loadTileArt(artBase).then((tiles) => live && setDone({ artBase, tiles }));
    return () => {
      live = false;
    };
  }, [artBase]);
  if (artBase != null && done?.artBase !== artBase) return { status: "loading" };
  const tiles = done?.tiles ?? null;
  return { status: "ready", path: (key) => tiles?.[key] ?? original(key) };
}
