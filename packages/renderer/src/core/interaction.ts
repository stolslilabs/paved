import * as THREE from "three";
import type { HoverState } from "./types";

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
