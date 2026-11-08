// PvP v2's end screen's chunk (`pvp-v2-end.tsx`), loaded ahead by the attack's last tile (RANKED-SCAN-TIMING, #1067) and kept
// once in: the result page renders it straight, with no Suspense fallback in between, when it is already here.

type EndModule = typeof import("./pvp-v2-end");

let loaded: EndModule | null = null;

/** Loads the end's chunk, once (the browser fetches a module once). */
export const loadPvpV2End = (): Promise<EndModule> => import("./pvp-v2-end").then((m) => (loaded = m));

/** The end's chunk when it is already in, else null. */
export const loadedPvpV2End = (): EndModule | null => loaded;
