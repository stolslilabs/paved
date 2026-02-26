import type {
  RenderSurfaceAdapter,
  SurfaceInputEvent,
  SurfaceSize,
} from "./types";

export class WebSurfaceAdapter implements RenderSurfaceAdapter {
  private readonly canvas: HTMLCanvasElement;
  private resizeObserver: ResizeObserver | null = null;
  private inputHandler: ((event: SurfaceInputEvent) => void) | null = null;
  private boundPointerDown: ((event: PointerEvent) => void) | null = null;
  private boundPointerUp: ((event: PointerEvent) => void) | null = null;
  private boundPointerMove: ((event: PointerEvent) => void) | null = null;
  private boundPointerLeave: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
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

  onResize(cb: () => void): () => void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = new ResizeObserver(cb);
    this.resizeObserver.observe(this.canvas);

    return () => {
      if (!this.resizeObserver) return;
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    };
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

    this.canvas.addEventListener("pointerdown", this.boundPointerDown);
    this.canvas.addEventListener("pointerup", this.boundPointerUp);
    this.canvas.addEventListener("pointermove", this.boundPointerMove);
    this.canvas.addEventListener("pointerleave", this.boundPointerLeave);
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
    });
  }
}

export function createWebSurfaceAdapter(canvas: HTMLCanvasElement): WebSurfaceAdapter {
  return new WebSurfaceAdapter(canvas);
}
