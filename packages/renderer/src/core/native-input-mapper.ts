export interface NativePointerEvent {
  pointerId: number;
  x: number;
  y: number;
}

export type NativeMappedEvent =
  | { type: "click"; x: number; y: number }
  | { type: "pan"; dx: number; dy: number }
  | { type: "pinch"; scale: number };

export interface NativeInputMapperConfig {
  clickThreshold?: number;
}

interface PointerState {
  startX: number;
  startY: number;
  x: number;
  y: number;
}

const DEFAULT_CONFIG: Required<NativeInputMapperConfig> = {
  clickThreshold: 5,
};

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

export class NativeInputMapper {
  private readonly config: Required<NativeInputMapperConfig>;
  private readonly pointers = new Map<number, PointerState>();
  private dragDetected = false;
  private lastPinchDistance: number | null = null;

  constructor(config: NativeInputMapperConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  handleStart(event: NativePointerEvent): NativeMappedEvent[] {
    this.pointers.set(event.pointerId, {
      startX: event.x,
      startY: event.y,
      x: event.x,
      y: event.y,
    });

    if (this.pointers.size >= 2) {
      this.dragDetected = true;
      this.lastPinchDistance = this.getPinchDistance();
    }

    return [];
  }

  handleMove(event: NativePointerEvent): NativeMappedEvent[] {
    const pointer = this.pointers.get(event.pointerId);
    if (!pointer) return [];

    const previous = { x: pointer.x, y: pointer.y };
    pointer.x = event.x;
    pointer.y = event.y;

    if (this.pointers.size >= 2) {
      const nextDistance = this.getPinchDistance();
      if (!nextDistance || !this.lastPinchDistance || this.lastPinchDistance === 0) {
        this.lastPinchDistance = nextDistance;
        return [];
      }

      const scale = nextDistance / this.lastPinchDistance;
      this.lastPinchDistance = nextDistance;
      return [{ type: "pinch", scale }];
    }

    const start = { x: pointer.startX, y: pointer.startY };
    if (distance(start, pointer) > this.config.clickThreshold) {
      this.dragDetected = true;
      return [{ type: "pan", dx: pointer.x - previous.x, dy: pointer.y - previous.y }];
    }

    return [];
  }

  handleEnd(event: NativePointerEvent): NativeMappedEvent[] {
    const pointer = this.pointers.get(event.pointerId);
    if (!pointer) return [];

    pointer.x = event.x;
    pointer.y = event.y;

    const isTap = !this.dragDetected && distance(
      { x: pointer.startX, y: pointer.startY },
      { x: pointer.x, y: pointer.y },
    ) <= this.config.clickThreshold;

    this.pointers.delete(event.pointerId);

    if (this.pointers.size < 2) {
      this.lastPinchDistance = null;
    }

    if (this.pointers.size === 0) {
      const shouldEmitClick = isTap;
      this.dragDetected = false;
      return shouldEmitClick ? [{ type: "click", x: event.x, y: event.y }] : [];
    }

    return [];
  }

  reset(): void {
    this.pointers.clear();
    this.dragDetected = false;
    this.lastPinchDistance = null;
  }

  private getPinchDistance(): number | null {
    const values = Array.from(this.pointers.values());
    if (values.length < 2) return null;

    return distance(values[0], values[1]);
  }
}
