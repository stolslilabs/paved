import { randomLayout } from "@paved/game-core";
import type { RandomLayoutRunner } from "../lib/random-layout-runner";

// The die's fakes (#803) for the stories and the render tests, where no worker runs (jsdom has none): the same generator on
// the main thread after a delay, a build that never ends, one that fails. The app itself only ever builds in the worker.

/**
 * game-core's `randomLayout` on the main thread, `delayMs` after the press; a new press or a cancel drops the one at work. Its
 * clock never moves (the steps alone stop the tries), so a seed gives the same village however loaded the machine.
 */
export function mainThreadRandomizer(delayMs = 0): RandomLayoutRunner {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  return {
    run(stock, slots, seed) {
      cancel();
      return new Promise((resolve) => {
        timer = setTimeout(() => {
          timer = null;
          resolve({ tiles: randomLayout(stock, slots, seed, STILL).tiles });
        }, delayMs);
      });
    },
    cancel,
    dispose: cancel,
  };
}

/** The generator's default budget on a clock that never moves: the stories and tests' villages never depend on the load. */
export const STILL = { now: () => 0 } as const;

/** A build that never ends: the die stays busy (then "Still building…"). */
export const PENDING_RANDOMIZER: RandomLayoutRunner = { run: () => new Promise(() => {}), cancel: () => {}, dispose: () => {} };

/** A worker that fails: the die's message, the draft kept. */
export const FAILING_RANDOMIZER: RandomLayoutRunner = { run: () => Promise.reject(new Error("Worker: script error")), cancel: () => {}, dispose: () => {} };

/** The seeds of the presses, in turn (the same village on each load of a story). */
export function seedsOf(...seeds: number[]): () => number {
  let n = 0;
  return () => seeds[n++ % seeds.length]!;
}
