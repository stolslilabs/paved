import * as THREE from "three";
import type { HoverState, SurfaceInputEvent } from "./types";

const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // y = 0

/**
 * Create a throttled version of a function.
 * Fires immediately on first call, then suppresses calls within the interval.
 * A trailing call fires after the interval with the latest args.
 */
export function createThrottled<T extends (...args: any[]) => void>(
  fn: T,
  intervalMs: number,
): (...args: Parameters<T>) => void {
  let lastCallTime = 0;
  let trailingTimeout: ReturnType<typeof setTimeout> | null = null;
  let trailingArgs: Parameters<T> | null = null;

  return (...args: Parameters<T>) => {
    const now = Date.now();

    if (now - lastCallTime >= intervalMs) {
      lastCallTime = now;
      fn(...args);
    } else {
      trailingArgs = args;
      if (trailingTimeout === null) {
        trailingTimeout = setTimeout(() => {
          lastCallTime = Date.now();
          trailingTimeout = null;
          if (trailingArgs) {
            fn(...trailingArgs);
            trailingArgs = null;
          }
        }, intervalMs - (now - lastCallTime));
      }
    }
  };
}

/**
 * Convert NDC screen coordinates to grid coordinates via raycasting to the y=0 ground plane.
 *
 * @param ndc - Normalized device coordinates (-1 to 1)
 * @param camera - The scene camera
 * @param sceneGroupMatrix - World matrix of the scene group (handles compass rotation)
 * @param tileSize - World units per grid cell (default 3)
 * @returns Grid coordinates relative to board center (0,0), or null if ray doesn't hit ground
 */
export function screenToGrid(
  ndc: { x: number; y: number },
  camera: THREE.Camera,
  sceneGroupMatrix: THREE.Matrix4,
  tileSize: number,
): { x: number; y: number } | null {
  raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);

  const intersection = new THREE.Vector3();
  const hit = raycaster.ray.intersectPlane(groundPlane, intersection);
  if (!hit) return null;

  // Transform hit point from world space into scene group local space
  // (compensates for compass rotation)
  const invMatrix = new THREE.Matrix4().copy(sceneGroupMatrix).invert();
  intersection.applyMatrix4(invMatrix);

  // Use `|| 0` to normalize -0 to +0
  const gridX = Math.round(intersection.x / tileSize) || 0;
  const gridY = Math.round(intersection.z / tileSize) || 0;

  return { x: gridX, y: gridY };
}

/**
 * Determine if a pointer down→up sequence was a click (not a drag/pan).
 *
 * @param down - Pointer position at pointerdown
 * @param up - Pointer position at pointerup
 * @param threshold - Max pixel distance to count as a click
 */
export function isClick(
  down: { x: number; y: number },
  up: { x: number; y: number },
  threshold: number,
): boolean {
  const dx = up.x - down.x;
  const dy = up.y - down.y;
  return Math.sqrt(dx * dx + dy * dy) <= threshold;
}

/**
 * Compute a HoverState for the tile preview overlay.
 * Returns null if there's no position or no tile to preview.
 *
 * @param gridPos - Grid position (relative to center), or null
 * @param tilePlan - Tile plan index (0 = no tile in hand)
 * @param orientation - Current orientation (1-4)
 */
export function computeHoverState(
  gridPos: { x: number; y: number } | null,
  tilePlan: number,
  orientation: number,
): HoverState | null {
  if (!gridPos || tilePlan === 0) return null;
  return {
    x: gridPos.x,
    y: gridPos.y,
    valid: true,   // v1: assume valid, contract validates
    idle: true,    // v1: assume idle, contract validates
    planIndex: tilePlan,
    orientation,
  };
}

/** A board cell's top-right corner on screen, in CSS px from the surface's top-left (`cellCorner`). */
export interface CellCorner {
  x: number;
  y: number;
  /** The corner is in front of the camera and inside the surface. */
  visible: boolean;
}

/**
 * The inverse of `screenToGrid`: the screen position of the top-right corner of a grid cell's tile, at `height` world
 * units above the ground. The corner is the one of the cell's four top corners that lies furthest up and to the right on
 * screen, so it stays the top-right one whatever the compass turn or the camera's orbit.
 *
 * @param camera - Its matrices must be current (`updateMatrixWorld`)
 * @param sceneGroupMatrix - The compass rotation's world matrix
 * @param size - The surface's size in CSS px
 */
export function cellCorner(
  cell: { x: number; y: number },
  camera: THREE.Camera,
  sceneGroupMatrix: THREE.Matrix4,
  size: { width: number; height: number },
  tileSize: number,
  height: number,
): CellCorner {
  const half = tileSize / 2;
  let best: CellCorner | null = null;
  for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    const point = new THREE.Vector3(cell.x * tileSize + dx * half, height, cell.y * tileSize + dz * half).applyMatrix4(sceneGroupMatrix);
    const behind = new THREE.Vector3().copy(point).applyMatrix4(camera.matrixWorldInverse).z >= 0;
    const ndc = point.project(camera);
    const corner: CellCorner = {
      x: ((ndc.x + 1) / 2) * size.width,
      y: ((1 - ndc.y) / 2) * size.height,
      visible: !behind && Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1,
    };
    if (!best || corner.x - corner.y > best.x - best.y) best = corner;
  }
  return best!;
}

/**
 * Where a press on a board cell is (TILE-HOLD, #630): `down` when the pointer goes down on the cell, then exactly one of
 * `released` (let go, wherever) or `cancelled` (it moved past the click threshold, a second pointer went down, another button
 * was pressed, it left the surface or the browser took it). A press that ends `cancelled` never clicks.
 */
export type TilePressPhase = "down" | "released" | "cancelled";

/**
 * A press's listener. On `released`, returning true says the press acted (a completed hold): no click follows it, so a held
 * tile is never chosen again on the let go.
 */
export type TilePressListener = (gridX: number, gridY: number, phase: TilePressPhase) => boolean | void;

export interface PointerTapHandlers {
  /** The cell under a surface point, or null off the ground. */
  toGrid(point: { x: number; y: number }): { x: number; y: number } | null;
  onPress?(gridX: number, gridY: number, phase: TilePressPhase): boolean | void;
  onClick?(gridX: number, gridY: number): void;
}

/**
 * The board's taps and presses from the surface's pointer events, with the left button or one finger only. A click is a down
 * and up of one pointer within `threshold` px with no second pointer down between (a pinch or the two-finger tilt places
 * nothing). A press is reported from the down, so a hold can start under the finger; it never stands in the camera's way:
 * any move past the threshold, a second pointer, another button, the pointer leaving or a browser cancel ends it `cancelled`,
 * and the camera pans, pinches or tilts as it would without it.
 */
export class PointerTap {
  /**
   * The pointer a tap may come from: where and which pointer went down. `multi` is set when a second pointer went down
   * before it came up; `press` is the cell a press was reported on, until it ends.
   */
  private down: { x: number; y: number; pointerId?: number; multi: boolean; press: { x: number; y: number } | null } | null = null;

  constructor(
    private readonly handlers: PointerTapHandlers,
    private readonly threshold: number,
  ) {}

  handle(event: SurfaceInputEvent): void {
    switch (event.type) {
      case "pointerdown":
        return this.pointerDown(event);
      case "pointermove":
        if (this.down?.press && this.samePointer(event) && !isClick(this.down, event, this.threshold)) this.endPress("cancelled");
        return;
      case "pointerup":
        return this.pointerUp(event);
      case "pointercancel":
        this.endPress("cancelled");
        this.down = null;
        return;
      case "pointerleave":
        this.endPress("cancelled");
        return;
    }
  }

  private samePointer(event: SurfaceInputEvent): boolean {
    return event.pointerId === undefined || this.down?.pointerId === undefined || event.pointerId === this.down.pointerId;
  }

  private pointerDown(event: SurfaceInputEvent): void {
    // The right button tilts and the middle one pans: neither taps, and either ends a press under way.
    if ((event.button ?? 0) !== 0) {
      this.endPress("cancelled");
      return;
    }
    const down = this.down;
    if (down && event.pointerId !== undefined && down.pointerId !== undefined && event.pointerId !== down.pointerId) {
      down.multi = true;
      this.endPress("cancelled");
      return;
    }
    // A press still open (a lost up): it ends before the new one.
    this.endPress("cancelled");
    const cell = this.handlers.onPress ? this.handlers.toGrid(event) : null;
    this.down = { x: event.x, y: event.y, pointerId: event.pointerId, multi: false, press: cell };
    if (cell) this.handlers.onPress?.(cell.x, cell.y, "down");
  }

  private pointerUp(event: SurfaceInputEvent): void {
    const down = this.down;
    if ((event.button ?? 0) !== 0 || !down) return;
    const acted = this.endPress("released");
    this.down = null;
    if (acted || down.multi || !isClick(down, event, this.threshold)) return;
    const cell = this.handlers.toGrid(event);
    if (cell) this.handlers.onClick?.(cell.x, cell.y);
  }

  /** Ends the press under way, if any, with `phase`; true when its listener says it acted. */
  private endPress(phase: "released" | "cancelled"): boolean {
    const press = this.down?.press;
    if (!press) return false;
    this.down!.press = null;
    return this.handlers.onPress?.(press.x, press.y, phase) === true;
  }
}
