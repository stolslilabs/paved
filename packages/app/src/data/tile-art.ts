import { useEffect, useMemo, useState } from "react";
import type { TileArt } from "../components/elements/tile-chip";
import { manifestBody, resetManifestBodies } from "./renderer-manifest";

/** The side, in pixels, of the tile copy the chips draw: the one the renderer draws (`TILE_IMAGE_SIZE`), so both share one cache entry. */
const CHIP_IMAGE_SIZE = "256";

type Tiles = Record<string, string>;

/**
 * The reads in flight, one per base path: `<artBase>/manifest.json` resolved to the 256 px copies by plan key
 * (`{ "ccccccccc": "tiles/ccccccccc.256.<hash>.png" }`), or to null: no manifest (a 404, a body that is not one, a base
 * path with no host), or a failed read. A failed read is dropped, so the next hook that mounts asks again.
 */
const reads = new Map<string, Promise<Tiles | null>>();
/** The reads that ended with an answer (a manifest or none), kept beside `reads` so a hook mounted later has it at once. */
const answers = new Map<string, Tiles | null>();

/** Whether `value` is a map of plan key to path (a manifest's `tiles[size]`). */
const isTiles = (value: unknown): value is Tiles =>
  typeof value === "object" && value !== null && !Array.isArray(value) && Object.values(value).every((v) => typeof v === "string");

async function read(artBase: string): Promise<Tiles | null> {
  // The one manifest request of the page, shared with the board's renderer (`renderer-manifest.ts`).
  const tiles = ((await manifestBody(artBase)) as { tiles?: Record<string, unknown> } | null)?.tiles?.[CHIP_IMAGE_SIZE];
  return isTiles(tiles) ? tiles : null;
}

/** The 256 px copies the manifest at `artBase` lists, read once; a failed read resolves to null and is not kept. */
export function loadTileArt(artBase: string): Promise<Tiles | null> {
  let tiles = reads.get(artBase);
  if (!tiles) {
    const attempt: Promise<Tiles | null> = read(artBase).then(
      (found) => {
        answers.set(artBase, found);
        return found;
      },
      () => {
        if (reads.get(artBase) === attempt) reads.delete(artBase);
        return null;
      },
    );
    tiles = attempt;
    reads.set(artBase, tiles);
  }
  return tiles;
}

/** For tests: forget what was read. */
export function resetTileArt(): void {
  reads.clear();
  answers.clear();
  resetManifestBodies();
}

/**
 * Where the tile chips find their image under `artBase`: the 256 px copy the manifest lists (the file the board draws, one
 * cache entry for both). A plan the manifest does not list, no manifest, a failed read, and the time before the read ends
 * give null, so the chip draws the plan's nine areas: never a request for a file the build does not ship, never blank.
 * Without an `artBase` there is nothing to read: undefined. A read that ended earlier is answered at once, in the first render.
 */
export function useTileArt(artBase: string | undefined): TileArt | undefined {
  const [, setRead] = useState(0);
  useEffect(() => {
    if (artBase == null || answers.has(artBase)) return;
    let live = true;
    void loadTileArt(artBase).then(() => live && setRead((n) => n + 1));
    return () => {
      live = false;
    };
  }, [artBase]);
  const tiles = artBase != null ? answers.get(artBase) : undefined;
  return useMemo(() => (artBase == null ? undefined : (key: string) => (tiles?.[key] != null ? `${artBase}/${tiles[key]}` : null)), [artBase, tiles]);
}
