import type {
  RenderSurfaceAdapter,
  SurfaceInputEvent,
  SurfaceSize,
} from "./types";

export interface NativeSurfaceHost {
  getSize(): SurfaceSize;
  getDevicePixelRatio(): number;
  onResize(cb: () => void): () => void;
  setInputHandler(handler: ((event: SurfaceInputEvent) => void) | null): void;
  getRenderTarget?(): unknown;
}

export class NativeSurfaceAdapter implements RenderSurfaceAdapter {
  private readonly host: NativeSurfaceHost;

  constructor(host: NativeSurfaceHost) {
    this.host = host;
  }

  getSize(): SurfaceSize {
    return this.host.getSize();
  }

  getDevicePixelRatio(): number {
    return this.host.getDevicePixelRatio();
  }

  onResize(cb: () => void): () => void {
    return this.host.onResize(cb);
  }

  bindInput(handler: (event: SurfaceInputEvent) => void): void {
    this.host.setInputHandler(handler);
  }

  unbindInput(): void {
    this.host.setInputHandler(null);
  }

  getRenderTarget(): unknown {
    return this.host.getRenderTarget?.();
  }
}
