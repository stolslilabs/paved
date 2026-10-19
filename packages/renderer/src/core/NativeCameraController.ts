import * as THREE from "three";
import { CLOSEST_DISTANCE, PLAY_DEFAULT_POLAR_ANGLE, PLAY_MAX_POLAR_ANGLE, PLAY_ROTATE_SPEED, tiltedOffset } from "./CameraController";
import type { BoardBounds, CameraMode } from "./types";

export interface NativeCameraControllerConfig {
  minDistance?: number;
  maxDistance?: number;
  initialDistance?: number;
  /** The tilt from straight down it opens at, in radians; kept within 0 and `PLAY_MAX_POLAR_ANGLE`. */
  initialPolarAngle?: number;
}

// The web controller's tilt (`CameraController`): opens at 27 degrees, from straight down to 54. The closest zoom is the
// web's too, so the near plane does not cut the tallest tile at the steepest tilt.
const DEFAULT_CONFIG: Required<NativeCameraControllerConfig> = {
  minDistance: CLOSEST_DISTANCE,
  maxDistance: 300,
  initialDistance: 24,
  initialPolarAngle: PLAY_DEFAULT_POLAR_ANGLE,
};

export class NativeCameraController {
  private static readonly BOARD_MARGIN = 6;

  readonly target = new THREE.Vector3(0, 0, 0);

  private readonly minDistance: number;
  private readonly maxDistance: number;
  private distance: number;
  private polarAngle: number;
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
    this.polarAngle = THREE.MathUtils.clamp(resolved.initialPolarAngle, 0, PLAY_MAX_POLAR_ANGLE);
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

  /**
   * Tilts by a vertical drag of `dy` px on a surface `heightPx` high, as OrbitControls does on the web: a drag down
   * tilts towards straight down, within 0 and `PLAY_MAX_POLAR_ANGLE`.
   */
  applyTilt(dy: number, heightPx: number): void {
    if (heightPx <= 0) return;

    this.polarAngle = THREE.MathUtils.clamp(
      this.polarAngle - (2 * Math.PI * PLAY_ROTATE_SPEED * dy) / heightPx,
      0,
      PLAY_MAX_POLAR_ANGLE,
    );
  }

  getDistance(): number {
    return this.distance;
  }

  /** The tilt from straight down, in radians. */
  getPolarAngle(): number {
    return this.polarAngle;
  }

  /** Where the camera stands: the target plus the tilted offset at the distance. */
  getPosition(): THREE.Vector3 {
    return tiltedOffset(this.distance, this.polarAngle).add(this.target);
  }
}
