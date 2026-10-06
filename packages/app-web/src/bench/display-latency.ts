/**
 * Time from an input event to the first presented frame that shows a new tile.
 *
 * "Shown" means: the render-loop tick that drew the scene with the new tile mesh in it has
 * ended (`renderedMs`), and the next requestAnimationFrame callback has started
 * (`presentedMs`, read with performance.now() when it runs): the frame drawn by that tick was
 * handed to the compositor at the end of its task, and the browser begins the next frame only
 * after that. The callback's own timestamp is not used: it is the vsync the frame was due at,
 * which is earlier than the end of the render when the frame overran. Both are measured from
 * the event's `timeStamp` (the time the browser received the input), on the same clock as
 * performance.now(). Scan-out on the panel adds up to one refresh interval, not measured.
 */
export interface DisplaySample {
  /** Index of the placement in its sequence. */
  index: number;
  /** Input to the handler that put the tile in the React state (click or confirm handler). */
  handledMs: number | null;
  /** Input to the end of the first render tick with the tile in the scene. */
  renderedMs: number;
  /** Input to the next requestAnimationFrame callback: the frame is presented. */
  presentedMs: number;
  /** Render ticks between the input and that frame (rendered or not). */
  ticks: number;
}

interface Pending {
  index: number;
  inputTs: number;
  handledTs: number | null;
  expectTiles: number;
  ticks: number;
}

export class DisplayLatency {
  readonly samples: DisplaySample[] = [];
  /** Placements whose tile did not appear within the timeout. */
  readonly misses: number[] = [];
  private pending: Pending | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  /** Wait for the scene to hold `expectTiles` tiles after the input received at `inputTs`. */
  arm(index: number, inputTs: number, expectTiles: number, timeoutMs = 5000): void {
    this.pending = { index, inputTs, handledTs: null, expectTiles, ticks: 0 };
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (this.pending?.index === index) {
        this.misses.push(index);
        this.pending = null;
      }
    }, timeoutMs);
  }

  /** The handler that commits the placement has run. */
  handled(): void {
    if (this.pending && this.pending.handledTs === null) this.pending.handledTs = performance.now();
  }

  get waiting(): boolean {
    return this.pending !== null;
  }

  /** Call at the end of every render-loop tick with the number of tile meshes in the scene. */
  afterTick(rendered: boolean, drawnTiles: number): void {
    const p = this.pending;
    if (!p) return;
    p.ticks++;
    if (!rendered || drawnTiles < p.expectTiles) return;
    const renderedTs = performance.now();
    this.pending = null;
    if (this.timer) clearTimeout(this.timer);
    requestAnimationFrame(() => {
      const presentedTs = performance.now();
      this.samples.push({
        index: p.index,
        handledMs: p.handledTs === null ? null : p.handledTs - p.inputTs,
        renderedMs: renderedTs - p.inputTs,
        presentedMs: presentedTs - p.inputTs,
        ticks: p.ticks,
      });
    });
  }
}
