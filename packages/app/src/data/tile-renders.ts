import { useEffect, useMemo, useState } from "react";
import type { TileRenders } from "../components/elements/tile-render";
import { manifestBody } from "./renderer-manifest";

// The build-time renders of the tiles (THEMES-RENDERS, `scripts/render-tiles.ts`) and each theme's variant counts, from the
// one manifest read of the page (`manifestBody`): the theme pages show images, never a WebGL context per tile.

/** What the theme pages read of the manifest: the renders by theme id and plan key (or `cover`), the variants by theme id and plan key. */
interface Read {
  renders: Record<string, Record<string, string>>;
  variants: Record<string, Record<string, number>>;
}

const answers = new Map<string, Read | null>();

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** The manifest's `renders` and `themes` (as counts), or null: no manifest, or one without them. */
export function readRenders(body: unknown): Read | null {
  if (!record(body)) return null;
  const renders: Read["renders"] = {};
  if (record(body.renders)) {
    for (const [theme, keys] of Object.entries(body.renders)) {
      if (!record(keys)) continue;
      renders[theme] = Object.fromEntries(Object.entries(keys).filter((e): e is [string, string] => typeof e[1] === "string"));
    }
  }
  const variants: Read["variants"] = {};
  if (record(body.themes)) {
    for (const [theme, keys] of Object.entries(body.themes)) {
      if (!record(keys)) continue;
      variants[theme] = Object.fromEntries(Object.entries(keys).filter((e): e is [string, unknown[]] => Array.isArray(e[1])).map(([key, files]) => [key, files.length]));
    }
  }
  return { renders, variants };
}

/** For tests: forget what was read. */
export function resetTileRenders(): void {
  answers.clear();
}

/** The manifest at `base`, read once per page (shared with the board and the tile chips); a failed read is asked again on the next mount. */
function useRead(base: string | undefined): Read | null | undefined {
  const [, setRead] = useState(0);
  useEffect(() => {
    if (base == null || answers.has(base)) return;
    let live = true;
    manifestBody(base).then(
      (body) => {
        answers.set(base, readRenders(body));
        if (live) setRead((n) => n + 1);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [base]);
  return base != null ? answers.get(base) : undefined;
}

/**
 * Where the renders are under `base`: a theme's plan, or its `cover`, to its URL; null for one the manifest does not list,
 * without a manifest and before it is read (the cells draw the plan's chip, the cover the board's backdrop). Undefined
 * without a `base`.
 */
export function useTileRenders(base: string | undefined): TileRenders | undefined {
  const read = useRead(base);
  const renders = read?.renders;
  return useMemo(() => (base == null ? undefined : (theme: number, key: string) => (renders?.[String(theme)]?.[key] != null ? `${base}/${renders[String(theme)]![key]}` : null)), [base, renders]);
}

/** A theme's models per plan key (`themes` of the manifest), for "the board picks one per tile"; undefined until read. */
export function useThemeVariants(base: string | undefined, theme: number): Readonly<Record<string, number>> | undefined {
  return useRead(base)?.variants[String(theme)];
}
