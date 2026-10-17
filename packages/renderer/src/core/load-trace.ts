/**
 * The load trace (LOAD-FAST): `performance` marks and measures named `paved:<phase>` around each step of the board's load
 * (the manifest, each model's fetch and decode, the tile images, the edges, the labels, the first frame), read by a
 * capture's driver. Off unless the page sets `globalThis.__PAVED_LOAD_TRACE__ = true` before the scene loads: then each
 * call costs a flag read and nothing else. Method and figures: `docs/client/v2-architecture.md`, "Loading".
 */

const enabled = () => (globalThis as { __PAVED_LOAD_TRACE__?: boolean }).__PAVED_LOAD_TRACE__ === true;

/** The time now, for `traceMeasure`'s start (0 when the trace is off). */
export function traceStart(): number {
  return enabled() ? performance.now() : 0;
}

/** A point of the load (`paved:<name>`). */
export function traceMark(name: string): void {
  if (enabled()) performance.mark(`paved:${name}`);
}

/** A span of the load from `start` (`traceStart`) to now (`paved:<name>`). */
export function traceMeasure(name: string, start: number): void {
  if (enabled()) performance.measure(`paved:${name}`, { start, end: performance.now() });
}
