import type { LayoutTile } from "@paved/game-core";
import type { RandomLayoutAnswer, RandomLayoutRequest } from "./random-layout-protocol";

// The editor's die (#803): a random compact village, built by game-core's `randomLayout` in a Web Worker so the screen never
// waits on it. One build at a time: a new one, or `cancel`, terminates the worker at work (its answer never comes), and the
// next build starts a fresh one. A worker that fails rejects; nothing falls back to the main thread. Where Web Workers are
// missing there is no runner, and the die is hidden.

export interface RandomLayoutRunner {
  /** Builds a layout; a build at work is cancelled first. Rejects when the worker fails; never settles once cancelled. */
  run(stock: readonly number[], slots: number, seed: number): Promise<LayoutTile[]>;
  /** Stops the build at work, if any: its promise never settles. */
  cancel(): void;
}

/** What the runner needs of a worker (a test passes a fake). */
export type WorkerLike = Pick<Worker, "postMessage" | "terminate" | "onmessage" | "onerror">;

/** A runner over workers made by `spawn`, one alive at a time, or null when `spawn` is null (no Web Workers). */
export function workerRunner(spawn: (() => WorkerLike) | null): RandomLayoutRunner | null {
  if (!spawn) return null;
  let worker: WorkerLike | null = null;
  let busy = false;
  let next = 0;
  const cancel = () => {
    if (busy && worker) {
      worker.terminate();
      worker = null;
    }
    busy = false;
  };
  return {
    run(stock, slots, seed) {
      cancel();
      const id = ++next;
      return new Promise<LayoutTile[]>((resolve, reject) => {
        let w: WorkerLike;
        try {
          w = worker ??= spawn();
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
          return;
        }
        busy = true;
        w.onmessage = (e: MessageEvent<RandomLayoutAnswer>) => {
          if (e.data.id !== id) return;
          busy = false;
          if ("error" in e.data) reject(new Error(e.data.error));
          else resolve(e.data.tiles);
        };
        w.onerror = (e) => {
          e.preventDefault?.();
          // The worker is broken: the next build starts another.
          w.terminate();
          if (worker === w) worker = null;
          busy = false;
          reject(new Error(e.message || "The worker failed"));
        };
        w.postMessage({ id, stock: [...stock], slots, seed } satisfies RandomLayoutRequest);
      });
    },
    cancel,
  };
}

/** The browser's runner: the die's worker in its own chunk, or null where Web Workers are missing. */
export const browserRandomLayoutRunner = (): RandomLayoutRunner | null =>
  workerRunner(typeof Worker === "undefined" ? null : () => new Worker(new URL("./random-layout.worker.ts", import.meta.url), { type: "module" }));

/** A new seed for each press. */
export const freshSeed = (): number => Math.floor(Math.random() * 0x1_0000_0000) >>> 0;
