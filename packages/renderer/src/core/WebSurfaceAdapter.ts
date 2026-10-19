import type {
  RenderSurfaceAdapter,
  SurfaceInputEvent,
  SurfaceSize,
} from "./types";

export class WebSurfaceAdapter implements RenderSurfaceAdapter {
  private readonly canvas: HTMLCanvasElement;
  private stopResize: (() => void) | null = null;
  private inputHandler: ((event: SurfaceInputEvent) => void) | null = null;
  private boundPointerDown: ((event: PointerEvent) => void) | null = null;
  private boundPointerUp: ((event: PointerEvent) => void) | null = null;
  private boundPointerMove: ((event: PointerEvent) => void) | null = null;
  private boundPointerLeave: (() => void) | null = null;
  private boundPointerCancel: ((event: PointerEvent) => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    // The canvas fills its container: `GameScene` sizes only the drawing buffer (`setSize(w, h, false)`), so the CSS
    // size is set here, for every consumer (`GameCanvas`, `useScene`), and the container's size is what `onResize`
    // observes.
    canvas.style.width = "100%";
    canvas.style.height = "100%";
  }

  getSize(): SurfaceSize {
    return {
      width: this.canvas.clientWidth,
      height: this.canvas.clientHeight,
    };
  }

  getDevicePixelRatio(): number {
    return window.devicePixelRatio;
  }

  /** The window's layout viewport: a docked board panel or devtools do not make the screen small. */
  getViewportSize(): SurfaceSize {
    return { width: window.innerWidth, height: window.innerHeight };
  }

  hasCoarsePointer(): boolean {
    return typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
  }

  /**
   * Calls `cb` when the canvas's container changes size, when the window does (the small-screen test of
   * `maxPixelRatio: "auto"` reads the window), and when the device pixel ratio changes (the window moved to another
   * screen, the page zoomed). The container is observed, not the canvas: the canvas fills it (CSS 100 %), and a
   * canvas whose CSS size was ever pinned in px would never report a change. Returns the unsubscribe.
   */
  onResize(cb: () => void): () => void {
    this.stopResize?.();
    const observer = new ResizeObserver(() => cb());
    observer.observe(this.canvas.parentElement ?? this.canvas);

    // `(resolution: <dpr>dppx)` stops matching when the ratio changes: re-arm on the new ratio each time.
    let query: MediaQueryList | null = null;
    const onRatio = () => {
      armRatio();
      cb();
    };
    const armRatio = () => {
      query?.removeEventListener("change", onRatio);
      query = typeof window.matchMedia === "function" ? window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`) : null;
      query?.addEventListener("change", onRatio);
    };
    armRatio();
    const onWindow = () => cb();
    window.addEventListener?.("resize", onWindow);

    const stop = () => {
      observer.disconnect();
      window.removeEventListener?.("resize", onWindow);
      query?.removeEventListener("change", onRatio);
      query = null;
      if (this.stopResize === stop) this.stopResize = null;
    };
    this.stopResize = stop;
    return stop;
  }

  bindInput(handler: (event: SurfaceInputEvent) => void): void {
    this.unbindInput();
    this.inputHandler = handler;

    this.boundPointerDown = (event: PointerEvent) => {
      this.emit("pointerdown", event);
    };
    this.boundPointerUp = (event: PointerEvent) => {
      this.emit("pointerup", event);
    };
    this.boundPointerMove = (event: PointerEvent) => {
      this.emit("pointermove", event);
    };
    this.boundPointerLeave = () => {
      this.inputHandler?.({ type: "pointerleave", x: 0, y: 0 });
    };
    this.boundPointerCancel = (event: PointerEvent) => {
      this.emit("pointercancel", event);
    };

    this.canvas.addEventListener("pointerdown", this.boundPointerDown);
    this.canvas.addEventListener("pointerup", this.boundPointerUp);
    this.canvas.addEventListener("pointermove", this.boundPointerMove);
    this.canvas.addEventListener("pointerleave", this.boundPointerLeave);
    this.canvas.addEventListener("pointercancel", this.boundPointerCancel);
  }

  unbindInput(): void {
    if (this.boundPointerDown) {
      this.canvas.removeEventListener("pointerdown", this.boundPointerDown);
      this.boundPointerDown = null;
    }
    if (this.boundPointerUp) {
      this.canvas.removeEventListener("pointerup", this.boundPointerUp);
      this.boundPointerUp = null;
    }
    if (this.boundPointerMove) {
      this.canvas.removeEventListener("pointermove", this.boundPointerMove);
      this.boundPointerMove = null;
    }
    if (this.boundPointerLeave) {
      this.canvas.removeEventListener("pointerleave", this.boundPointerLeave);
      this.boundPointerLeave = null;
    }
    if (this.boundPointerCancel) {
      this.canvas.removeEventListener("pointercancel", this.boundPointerCancel);
      this.boundPointerCancel = null;
    }
    this.inputHandler = null;
  }

  getRenderTarget(): unknown {
    return this.canvas;
  }

  private emit(type: SurfaceInputEvent["type"], event: PointerEvent): void {
    if (!this.inputHandler) return;

    const rect = this.canvas.getBoundingClientRect();
    this.inputHandler({
      type,
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      button: event.button,
      pointerId: event.pointerId,
    });
  }
}

export function createWebSurfaceAdapter(canvas: HTMLCanvasElement): WebSurfaceAdapter {
  return new WebSurfaceAdapter(canvas);
}
