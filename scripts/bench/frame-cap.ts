/**
 * 60 Hz frame cadence of the throttled profile, injected before any page script
 * (Playwright addInitScript).
 *
 * A Chrome window cannot choose the refresh rate of its display, so the bench caps the
 * cadence of requestAnimationFrame instead: callbacks are held until at least one frame
 * interval (minus 2 ms of vsync jitter) has passed since the last delivered frame, and then
 * all run in that frame, with that frame's timestamp. On a 120 Hz display every second
 * vsync is delivered (16.7 ms); a frame that overruns waits for the next vsync after it, as
 * on a 60 Hz display it would wait for the next one of those. Every consumer of
 * requestAnimationFrame is capped alike: the game's render loop, OrbitControls, the bench.
 *
 * Self-contained: Playwright sends its source text to the page.
 */
export function capFrameRate(fps: number): void {
  const interval = 1000 / fps;
  const jitter = 2;
  const native = window.requestAnimationFrame.bind(window);
  let queue = new Map<number, FrameRequestCallback>();
  let nextId = 1;
  let last = -Infinity;
  let scheduled = false;

  const tick = (ts: number) => {
    scheduled = false;
    if (queue.size === 0) return;
    if (ts - last < interval - jitter) {
      scheduled = true;
      native(tick);
      return;
    }
    last = ts;
    const run = queue;
    queue = new Map();
    for (const cb of run.values()) {
      try {
        cb(ts);
      } catch (e) {
        reportError(e);
      }
    }
  };

  window.requestAnimationFrame = (cb: FrameRequestCallback): number => {
    const id = nextId++;
    queue.set(id, cb);
    if (!scheduled) {
      scheduled = true;
      native(tick);
    }
    return id;
  };
  window.cancelAnimationFrame = (id: number): void => {
    queue.delete(id);
  };
}
