import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { CameraMode, BoardBounds } from "./types";

export interface CameraConfig {
  position?: [number, number, number];
  zoom?: number;
  near?: number;
  far?: number;
  minDistance?: number;
  maxDistance?: number;
}

export interface CameraViewport {
  width: number;
  height: number;
  inputTarget?: unknown;
}

export interface CameraInputAdapter {
  target: THREE.Vector3;
  enableRotate: boolean;
  enablePan: boolean;
  enableDamping: boolean;
  zoomToCursor: boolean;
  zoomSpeed: number;
  panSpeed: number;
  rotateSpeed: number;
  minAzimuthAngle: number;
  maxAzimuthAngle: number;
  minPolarAngle: number;
  maxPolarAngle: number;
  minDistance: number;
  maxDistance: number;
  touches: {
    ONE: number;
    TWO: number;
  };
  mouseButtons: {
    LEFT: number;
    MIDDLE: number;
    RIGHT: number;
  };
  addEventListener(eventName: string, callback: () => void): void;
  update(): boolean;
  reset(): void;
  dispose(): void;
}

export type CameraInputAdapterFactory = (
  camera: THREE.PerspectiveCamera,
  inputTarget: unknown,
) => CameraInputAdapter;

/**
 * The camera's near plane, in world units: 5 rather than 1 (P4, `docs/client/v2-architecture.md` 5.2), for five
 * times the depth precision at any distance. The closest zoom (`CLOSEST_DISTANCE`) keeps the tallest tile beyond it.
 */
export const CAMERA_NEAR = 5;

/**
 * The tallest tile model's height in world units, a tile being 3 wide (`wfffffffr`: 3.5 of its 4-unit side).
 */
export const TALLEST_TILE_HEIGHT = 2.625;

/**
 * The tilt the play camera opens at, from straight down, in radians: 27 degrees (TILT-54, owner 2026-10-19: the former
 * steepest tilt). The player tilts from it up to straight down or down to `PLAY_MAX_POLAR_ANGLE`.
 */
export const PLAY_DEFAULT_POLAR_ANGLE = Math.PI * 0.15;

/** The steepest tilt of the play camera from straight down (`setMode("play")`), in radians: 54 degrees, twice the default. */
export const PLAY_MAX_POLAR_ANGLE = Math.PI * 0.3;

/**
 * The closest the camera comes to its target (the default `minDistance`): the near plane plus the tallest tile seen at
 * the play camera's steepest tilt, 5 + 2.625 / cos 54 degrees = 9.47, rounded up. Closer, the near plane would cut the
 * tops of tall tiles: the target distance alone (5 before P4) did not account for them (8 at the former 27 degrees).
 */
export const CLOSEST_DISTANCE = 10;

/**
 * How fast a drag tilts the play camera (OrbitControls' `rotateSpeed`): a drag over the surface's full height tilts
 * 2 PI x 0.2 = 72 degrees, so the 54 degree range takes about three quarters of it (0.1 before TILT-54, for 27 degrees).
 */
export const PLAY_ROTATE_SPEED = 0.2;

const DEFAULT_CONFIG: Required<CameraConfig> = {
  position: [0, 0, 0],
  zoom: 5,
  near: CAMERA_NEAR,
  far: 2000,
  minDistance: CLOSEST_DISTANCE,
  maxDistance: 300,
};

function createOrbitCameraInputAdapter(
  camera: THREE.PerspectiveCamera,
  inputTarget: unknown,
): CameraInputAdapter {
  if (!inputTarget) {
    throw new Error("Camera input target is required for OrbitControls");
  }

  return new OrbitControls(camera, inputTarget as HTMLElement) as unknown as CameraInputAdapter;
}

function normalizeViewport(input: CameraViewport | HTMLCanvasElement): CameraViewport {
  if ("clientWidth" in input && "clientHeight" in input) {
    return {
      width: input.clientWidth,
      height: input.clientHeight,
      inputTarget: input,
    };
  }

  return input;
}

/** The camera opens at this share of its farthest distance (`DEFAULT_CONFIG.maxDistance`): 240 of 300. */
export const OPENING_DISTANCE_FACTOR = 0.8;
/** The distance the camera opens at, from its target (at `PLAY_DEFAULT_POLAR_ANGLE`). */
export const OPENING_DISTANCE = DEFAULT_CONFIG.maxDistance * OPENING_DISTANCE_FACTOR;

/**
 * The camera's offset from its target at `distance`, tilted `polar` radians from straight down towards +z (the azimuth
 * the play camera is locked to). Straight down keeps a tiny z offset, which avoids the gimbal lock.
 */
export function tiltedOffset(distance: number, polar: number): THREE.Vector3 {
  return new THREE.Vector3(0, distance * Math.cos(polar), Math.max(distance * Math.sin(polar), 0.001));
}

export class CameraController {
  private static readonly BOARD_MARGIN = 6;

  camera: THREE.PerspectiveCamera;
  controls: CameraInputAdapter;
  private compassRotation = 0;
  private mode: CameraMode = "play";
  private boardBounds: BoardBounds | null = null;
  /** The last frame given (`frame`): `reset()` comes back to it. */
  private framed: { target: THREE.Vector3; distance: number } | null = null;
  /** A drag, pinch or wheel under way (`start` to `end` of the controls). */
  private interacting = false;
  private moved = false;

  constructor(
    viewportOrCanvas: CameraViewport | HTMLCanvasElement,
    config: CameraConfig = {},
    createInputAdapter: CameraInputAdapterFactory = createOrbitCameraInputAdapter,
  ) {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const viewport = normalizeViewport(viewportOrCanvas);

    this.camera = new THREE.PerspectiveCamera(
      50,
      viewport.width / viewport.height,
      cfg.near,
      cfg.far
    );
    // Open at the default tilt; OrbitControls saves this position, so `reset()` comes back to it.
    this.camera.position.copy(tiltedOffset(cfg.maxDistance * OPENING_DISTANCE_FACTOR, PLAY_DEFAULT_POLAR_ANGLE));
    this.camera.lookAt(0, 0, 0);
    this.camera.zoom = cfg.zoom;
    this.camera.updateProjectionMatrix();

    this.controls = createInputAdapter(this.camera, viewport.inputTarget);
    this.controls.enableRotate = true;
    this.controls.enablePan = true;
    this.controls.enableDamping = true;
    this.controls.zoomToCursor = true;
    this.controls.zoomSpeed = 0.8;

    this.controls.minDistance = cfg.minDistance;
    this.controls.maxDistance = cfg.maxDistance;

    // Mouse mapping
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.ROTATE,
    };

    this.setMode("play");

    // The player moved the camera: a change of the view between a press (or wheel) and its end. A tap that moves nothing
    // does not count, nor does a frame set by code (`frame`), so a resize can frame the board again until the player moves.
    this.controls.addEventListener("start", () => {
      this.interacting = true;
    });
    this.controls.addEventListener("change", () => {
      if (this.interacting) this.moved = true;
    });
    this.controls.addEventListener("end", () => {
      this.interacting = false;
    });
  }

  /** Whether the player moved the camera since it was last framed (`frame` with `byPlayer` unset clears it). */
  get userMoved(): boolean {
    return this.moved;
  }

  /**
   * Look at `target` (on the ground) from `distance`, at the play tilt (CAMERA-FIT, #678): the opening frame, a resize's or
   * the re-centre's. `reset()` comes back to it. It clears `userMoved`.
   */
  frame(target: { x: number; z: number }, distance: number): void {
    const center = new THREE.Vector3(target.x, 0, target.z);
    this.framed = { target: center.clone(), distance };
    this.moved = false;
    this.controls.target.copy(center);
    this.camera.position.copy(center).add(tiltedOffset(distance, PLAY_DEFAULT_POLAR_ANGLE));
    this.camera.lookAt(center);
  }

  update(): boolean {
    const changed = this.controls.update();
    if (this.mode !== "play" || !this.boardBounds) {
      return changed;
    }

    const minX = this.boardBounds.minX - CameraController.BOARD_MARGIN;
    const maxX = this.boardBounds.maxX + CameraController.BOARD_MARGIN;
    const minZ = this.boardBounds.minZ - CameraController.BOARD_MARGIN;
    const maxZ = this.boardBounds.maxZ + CameraController.BOARD_MARGIN;

    const nextX = THREE.MathUtils.clamp(this.controls.target.x, minX, maxX);
    const nextZ = THREE.MathUtils.clamp(this.controls.target.z, minZ, maxZ);
    const clamped = nextX !== this.controls.target.x || nextZ !== this.controls.target.z;

    if (clamped) {
      this.controls.target.x = nextX;
      this.controls.target.z = nextZ;
    }

    return changed || clamped;
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  setCompassRotation(angle: number): void {
    this.compassRotation = angle;
  }

  getCompassRotation(): number {
    return this.compassRotation;
  }

  setMode(mode: CameraMode): void {
    this.mode = mode;
    if (mode === "play") {
      this.controls.panSpeed = 0.8;
      this.controls.rotateSpeed = PLAY_ROTATE_SPEED;
      this.controls.minAzimuthAngle = 0;
      this.controls.maxAzimuthAngle = 0;
      this.controls.minPolarAngle = 0;
      this.controls.maxPolarAngle = PLAY_MAX_POLAR_ANGLE;
      // One finger pans; two fingers pinch to zoom and, dragged up or down, tilt: the azimuth is locked, so the rotation
      // is only a tilt (TILT-54). Their midpoint moving sideways does nothing.
      this.controls.touches = {
        ONE: THREE.TOUCH.PAN,
        TWO: THREE.TOUCH.DOLLY_ROTATE,
      };
      return;
    }

    this.controls.panSpeed = 1;
    this.controls.rotateSpeed = 0.35;
    this.controls.minAzimuthAngle = -Infinity;
    this.controls.maxAzimuthAngle = Infinity;
    this.controls.minPolarAngle = 0;
    this.controls.maxPolarAngle = Math.PI * 0.42;
    this.controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };
  }

  getMode(): CameraMode {
    return this.mode;
  }

  setBoardBounds(bounds: BoardBounds | null): void {
    this.boardBounds = bounds;
  }

  focusBounds(bounds: BoardBounds | null): void {
    this.setBoardBounds(bounds);
    if (!bounds) {
      this.controls.target.set(0, 0, 0);
      return;
    }

    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerZ = (bounds.minZ + bounds.maxZ) / 2;
    const offset = new THREE.Vector3().subVectors(this.camera.position, this.controls.target);
    this.controls.target.set(centerX, 0, centerZ);
    this.camera.position.set(
      centerX + offset.x,
      this.camera.position.y,
      centerZ + offset.z
    );
    this.camera.lookAt(this.controls.target);
  }

  /** Back to the last frame (`frame`), or to the opening position when the board was never framed. */
  reset(): void {
    if (this.framed) {
      this.frame(this.framed.target, this.framed.distance);
      return;
    }
    this.controls.reset();
  }

  dispose(): void {
    this.controls.dispose();
  }
}
