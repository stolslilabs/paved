import * as THREE from "three";
import type { BoardBounds, CameraMode } from "./types";

export interface NativeCameraControllerConfig {
  minDistance?: number;
  maxDistance?: number;
  initialDistance?: number;
}

const DEFAULT_CONFIG: Required<NativeCameraControllerConfig> = {
  minDistance: 5,
  maxDistance: 300,
  initialDistance: 24,
};

export class NativeCameraController {
  private static readonly BOARD_MARGIN = 6;

  readonly target = new THREE.Vector3(0, 0, 0);

  private readonly minDistance: number;
  private readonly maxDistance: number;
  private distance: number;
  private mode: CameraMode = "play";
  private boardBounds: BoardBounds | null = null;

  constructor(config: NativeCameraControllerConfig = {}) {
    const resolved = { ...DEFAULT_CONFIG, ...config };
    this.minDistance = resolved.minDistance;
    this.maxDistance = resolved.maxDistance;
    this.distance = THREE.MathUtils.clamp(
      resolved.initialDistance,
      this.minDistance,
      this.maxDistance,
    );
  }

  setMode(mode: CameraMode): void {
    this.mode = mode;
  }

  getMode(): CameraMode {
    return this.mode;
  }

  setBoardBounds(bounds: BoardBounds | null): void {
    this.boardBounds = bounds;
  }

  applyPan(dx: number, dy: number): void {
    this.target.x += dx;
    this.target.z += dy;

    if (this.mode !== "play" || !this.boardBounds) {
      return;
    }

    const minX = this.boardBounds.minX - NativeCameraController.BOARD_MARGIN;
    const maxX = this.boardBounds.maxX + NativeCameraController.BOARD_MARGIN;
    const minZ = this.boardBounds.minZ - NativeCameraController.BOARD_MARGIN;
    const maxZ = this.boardBounds.maxZ + NativeCameraController.BOARD_MARGIN;

    this.target.x = THREE.MathUtils.clamp(this.target.x, minX, maxX);
    this.target.z = THREE.MathUtils.clamp(this.target.z, minZ, maxZ);
  }

  applyPinch(scale: number): void {
    if (scale <= 0) return;

    this.distance = THREE.MathUtils.clamp(
      this.distance / scale,
      this.minDistance,
      this.maxDistance,
    );
  }

  getDistance(): number {
    return this.distance;
  }
}
