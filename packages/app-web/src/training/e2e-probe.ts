import type { GameScene } from "@paved/renderer";
import { cellToClient } from "../bench/screen";

/**
 * The seam of the Playwright battle test (`e2e/`). The test sets `window.__PAVED_E2E__ = {}` before the page loads; the game
 * page then hands it the scene's projection, so that a bot can click a board cell. Nothing defines it in production, and the
 * page reads nothing back from it.
 */
export interface E2eProbe {
  /** Page coordinates (CSS pixels) of the centre of the cell at the renderer's world cell (x, z); null when off screen. */
  target?: (worldX: number, worldZ: number) => { x: number; y: number } | null;
  /** Set when the scene is ready. */
  ready?: boolean;
  /** What the page offers now: the orientation it shows and the cells it highlights as valid (renderer world cells). */
  view?: { orientation: number; slots: Array<{ x: number; y: number }> };
}

type Host = { __PAVED_E2E__?: E2eProbe };

export function attachE2eProbe(scene: GameScene, host: Host = globalThis as Host): void {
  const probe = host.__PAVED_E2E__;
  if (!probe) return;
  probe.target = (x, z) => cellToClient(scene, x, z);
  probe.ready = true;
}

/** Publishes the orientation and the valid slots the page shows, after each render that changes them. */
export function publishE2eView(view: NonNullable<E2eProbe["view"]>, host: Host = globalThis as Host): void {
  const probe = host.__PAVED_E2E__;
  if (probe) probe.view = view;
}
