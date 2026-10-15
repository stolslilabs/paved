/**
 * The order the board's assets load in (ASSET-WEIGHT): what the first frame draws first, the rest after that frame, so
 * the first view downloads only the models it shows.
 */

/**
 * The model keys the first frame waits for: the plans of the tiles the scene was handed (`wanted`), in `all`'s order; all
 * of them when it was handed none (a scene whose tiles come later then finds every model there, as before).
 */
export function firstModels(all: readonly string[], wanted: ReadonlySet<string>): string[] {
  const first = all.filter((key) => wanted.has(key));
  return first.length ? first : [...all];
}

/**
 * Runs `run` after the scene's first frame: the scene draws that frame as soon as its init resolves (`GameCanvas` starts
 * its loop then), so the next animation frame is past it, and an idle callback (or a timeout where there is none, or with
 * no animation frames at all) leaves that frame's work alone.
 */
export function afterFirstFrame(run: () => void): void {
  const g = globalThis as {
    requestAnimationFrame?: (cb: () => void) => number;
    requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number;
  };
  const idle = () => (g.requestIdleCallback ? g.requestIdleCallback(run, { timeout: 500 }) : setTimeout(run, 0));
  if (g.requestAnimationFrame) g.requestAnimationFrame(idle);
  else idle();
}
