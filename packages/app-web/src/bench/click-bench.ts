import type { GameScene, TileRenderData } from "@paved/renderer";
import type { BenchBoard } from "./board";
import { DisplayLatency } from "./display-latency";
import type { DisplaySample } from "./display-latency";
import { drawnTiles, pageInfo, measureRefresh } from "./run-bench";
import { cellToClient, holdOverview } from "./screen";

/** Distance of the fixed camera of the click bench: every cell of both boards and their placements is on screen, about 65 px wide. */
export const CLICK_DISTANCE = 280;

export interface ClickResult {
  mode: "click";
  tileCount: number;
  refreshMs: number;
  placements: number;
  samples: DisplaySample[];
  misses: number[];
  page: ReturnType<typeof pageInfo>;
}

declare global {
  interface Window {
    /** Driven by scripts/bench/run.ts: `target(i)` gives where to click, `result` when done. */
    __benchClick?: ClickBench;
  }
}

/**
 * Click-to-display bench: the driver clicks the cell of placement `i` with a real pointer
 * (Playwright mouse on the canvas); the click handler puts the tile in the React state the way
 * Game.tsx puts its optimistic tile (pending), and the latency runs from the pointerup event
 * (the click is recognised on pointerup) to the first presented frame that shows the tile.
 * The chain call is bypassed: this is the local cost alone.
 */
export class ClickBench {
  readonly latency = new DisplayLatency();
  next = 0;
  refreshMs = NaN;
  ready = false;

  constructor(
    private readonly scene: GameScene,
    private readonly board: BenchBoard,
    private readonly place: (tile: TileRenderData) => void,
  ) {}

  async start(): Promise<void> {
    holdOverview(this.scene, this.board.bounds, CLICK_DISTANCE);
    this.scene.setFrameObserver({
      afterTick: ({ rendered }) => this.latency.afterTick(rendered, drawnTiles(this.scene)),
    });
    window.addEventListener(
      "pointerup",
      (e) => {
        if (this.next >= this.board.placements.length) return;
        this.latency.arm(this.next, e.timeStamp, this.board.tiles.length + this.next + 1);
      },
      { capture: true },
    );
    this.refreshMs = await measureRefresh();
    this.ready = true;
  }

  /** Page coordinates of the cell of placement `i`, or null when it is off screen. */
  target(i: number): { x: number; y: number } | null {
    const t = this.board.placements[i];
    return t ? cellToClient(this.scene, t.worldX, t.worldZ) : null;
  }

  /** onTileClick of the canvas: place the expected tile if the click landed on its cell. */
  onTileClick(gridX: number, gridY: number): void {
    const t = this.board.placements[this.next];
    if (!t || t.worldX !== gridX || t.worldZ !== gridY) return;
    this.next++;
    this.place({ ...t, pending: true });
    this.latency.handled();
  }

  get result(): ClickResult {
    return {
      mode: "click",
      tileCount: this.board.tiles.length,
      refreshMs: this.refreshMs,
      placements: this.board.placements.length,
      samples: this.latency.samples,
      misses: this.latency.misses,
      page: pageInfo(this.scene),
    };
  }
}
