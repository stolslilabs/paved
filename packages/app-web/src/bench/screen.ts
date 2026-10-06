import type { GameScene } from "@paved/renderer";
import { TILE_SIZE } from "@paved/renderer";

/**
 * Page coordinates (CSS pixels) of the centre of a grid cell, where a pointer must go to
 * click it: the inverse of the renderer's screenToGrid for an unrotated board.
 */
export function cellToClient(scene: GameScene, worldX: number, worldZ: number): { x: number; y: number } | null {
  // Vector3.project by hand: app-web does not depend on three itself.
  scene.camera.updateMatrixWorld();
  const p = applyMatrix(scene.camera.projectionMatrix.elements, applyMatrix(scene.camera.matrixWorldInverse.elements, [worldX * TILE_SIZE, 0, worldZ * TILE_SIZE]));
  if (Math.abs(p[0]) > 1 || Math.abs(p[1]) > 1) return null;
  const rect = scene.renderer.domElement.getBoundingClientRect();
  return { x: rect.left + ((p[0] + 1) / 2) * rect.width, y: rect.top + ((1 - p[1]) / 2) * rect.height };
}

/** A column-major 4x4 matrix applied to a point, with the perspective divide (three's Vector3.applyMatrix4). */
function applyMatrix(e: ArrayLike<number>, [x, y, z]: number[]): number[] {
  const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15]);
  return [
    (e[0] * x + e[4] * y + e[8] * z + e[12]) * w,
    (e[1] * x + e[5] * y + e[9] * z + e[13]) * w,
    (e[2] * x + e[6] * y + e[10] * z + e[14]) * w,
  ];
}

/** Fixed top-down view over the centre of the board, close enough that every cell is a few dozen pixels wide. */
export function holdOverview(scene: GameScene, bounds: { minX: number; maxX: number; minZ: number; maxZ: number }, distance: number): void {
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;
  scene.controls.controls.target.set(cx, 0, cz);
  scene.camera.position.set(cx, distance * Math.cos(0.01), cz + distance * Math.sin(0.01));
}
