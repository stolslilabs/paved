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
 * The play camera's tilt from straight down, in radians: 27 degrees (TILT-54, owner 2026-10-19). It is locked there
 * (CAMERA-TILT-LOCK, #719): the player pans and zooms, no gesture tilts or turns the camera.
 */
export const PLAY_DEFAULT_POLAR_ANGLE = Math.PI * 0.15;

/**
 * The closest the camera comes to its target (the default `minDistance`): 10, kept from the former 54 degree maximum
 * tilt (5 + 2.625 / cos 54 degrees = 9.47, rounded up; #719 keeps it). At the locked 27 degrees the near plane plus the
 * tallest tile needs 8, so the tops of tall tiles stay clear of the near plane.
 */
export const CLOSEST_DISTANCE = 10;

/** The Camera mode's tilt (#875, owner 2026-10-28): from 15 degrees off straight down... */
export const FREE_MIN_POLAR_ANGLE = Math.PI / 12;
/** ...to 85 degrees, the camera looking almost along the ground. */
export const FREE_MAX_POLAR_ANGLE = (Math.PI * 17) / 36;

/** Leaving the Camera mode, the tilt and the turn ease back to the play view's over this long, ms (#875's proposal). */
export const FREE_RETURN_MS = 600;

/**
 * The closest the camera may come to its target at a tilt of `polar` from straight down (#875's low angles), for a frustum of
 * half vertical angle `halfFov`: the nearest point of the tallest tiles' tops the frustum shows (along its lower edge) stays
 * beyond the near plane. The camera's height must pass the tops by `CAMERA_NEAR` times the sine of the lower edge's angle
 * below the horizon (over the cosine of `halfFov`, a depth along the view): 8.2 at the play tilt, under `CLOSEST_DISTANCE`, and
 * about 40 at 85 degrees with the default camera.
 */
export function closestDistanceAt(polar: number, halfFov: number): number {
  const below = Math.PI / 2 - polar;
  const height = TALLEST_TILE_HEIGHT + (CAMERA_NEAR * Math.sin(Math.min(below + halfFov, Math.PI / 2))) / Math.cos(halfFov);
  return height / Math.max(Math.sin(below), 1e-3);
}

/** Scratch values of the per-tick steps (`keepClear`, `getAngles`): nothing allocated while the camera is still. */
const OFFSET = new THREE.Vector3();
const SPHERICAL = new THREE.Spherical();

/** Ease in and out (cubic): the return's curve, 0 to 1. */
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

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
  /** The frame for the viewport of now (`setFrameSource`): `reset()` asks it first, so a resize since the last frame counts. */
  private frameSource: (() => { target: { x: number; z: number }; distance: number } | null) | null = null;
  /** The return from the Camera mode under way (`setMode("play")` after `"free"`): its start, ms, and the angles it left from. */
  private returning: { start: number | null; polar: number; azimuth: number } | null = null;
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
    this.controls.enablePan = true;
    this.controls.enableDamping = true;
    this.controls.zoomToCursor = true;
    this.controls.zoomSpeed = 0.8;

    this.controls.minDistance = cfg.minDistance;
    this.controls.maxDistance = cfg.maxDistance;

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
    // Drop what a drag left to damp (OrbitControls' pan, turn and zoom deltas): one update without damping spends and
    // clears them, so they do not carry the view off the frame afterwards.
    const damping = this.controls.enableDamping;
    this.controls.enableDamping = false;
    this.controls.update();
    this.controls.enableDamping = damping;
    // A frame is the play view: a return from the Camera mode under way ends there.
    this.endReturn();
    const center = new THREE.Vector3(target.x, 0, target.z);
    this.framed = { target: center.clone(), distance };
    this.moved = false;
    this.controls.target.copy(center);
    this.camera.position.copy(center).add(tiltedOffset(distance, PLAY_DEFAULT_POLAR_ANGLE));
    this.camera.lookAt(center);
  }

  /**
   * Where `reset()` goes, computed when it is called (the scene's frame for its current size and settings); a null answer
   * falls back to the last frame given.
   */
  setFrameSource(source: (() => { target: { x: number; z: number }; distance: number } | null) | null): void {
    this.frameSource = source;
  }

  /** One step of the controls (the damping's glide), the Camera mode's return and closest zoom, and the board's bounds. */
  update(now: number = performance.now()): boolean {
    let changed = this.controls.update();
    if (this.returning) {
      this.stepReturn(now);
      changed = true;
    }
    if (this.mode === "free" && this.keepClear()) changed = true;
    if (this.mode === "showcase" || !this.boardBounds) {
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

  /** The camera's tilt from straight down and its turn about the vertical (OrbitControls' azimuth: 0 looks towards -z). */
  getAngles(): { polar: number; azimuth: number } {
    const s = SPHERICAL.setFromVector3(OFFSET.subVectors(this.camera.position, this.controls.target));
    return { polar: s.phi, azimuth: s.theta };
  }

  /**
   * The Camera mode's closest zoom for the tilt of now (`closestDistanceAt`, at least the controls' own): a camera closer than it
   * moves out along its view at once, after the controls' step. True when it moved.
   */
  private keepClear(): boolean {
    const halfFov = Math.atan(Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) / this.camera.zoom);
    const min = Math.min(Math.max(this.controls.minDistance, closestDistanceAt(this.getAngles().polar, halfFov)), this.controls.maxDistance);
    const offset = OFFSET.subVectors(this.camera.position, this.controls.target);
    if (offset.length() >= min - 1e-6) return false;
    this.camera.position.copy(this.controls.target).add(offset.setLength(min));
    return true;
  }

  /**
   * Turn the camera to `polar` from straight down and `azimuth` around its target, at its distance, within its mode's bounds (the
   * play view's locks, the Camera mode's 15 to 85 degrees). A return under way ends. It counts as a move (`userMoved`): a resize
   * does not frame the board again over it.
   */
  setAngles(polar: number, azimuth: number): void {
    this.endReturn();
    this.moved = true;
    const c = this.controls;
    this.placeAt(THREE.MathUtils.clamp(polar, c.minPolarAngle, c.maxPolarAngle), THREE.MathUtils.clamp(azimuth, c.minAzimuthAngle, c.maxAzimuthAngle));
  }

  /** The return's step at `now`: the tilt and the turn eased from where they were to the play view's, the target and distance kept. */
  private stepReturn(now: number): void {
    const back = this.returning!;
    back.start ??= now;
    const t = Math.min(1, Math.max(0, (now - back.start) / FREE_RETURN_MS));
    const e = easeInOut(t);
    // The shorter way round to the play view's turn (0).
    const turn = Math.atan2(Math.sin(-back.azimuth), Math.cos(-back.azimuth));
    this.placeAt(THREE.MathUtils.lerp(back.polar, PLAY_DEFAULT_POLAR_ANGLE, e), back.azimuth + turn * e);
    if (t >= 1) this.endReturn();
  }

  /** The camera at `polar` and `azimuth` around its target, at its distance of now. */
  private placeAt(polar: number, azimuth: number): void {
    const distance = this.camera.position.distanceTo(this.controls.target);
    const offset = new THREE.Vector3().setFromSpherical(new THREE.Spherical(distance, polar, azimuth));
    this.camera.position.copy(this.controls.target).add(offset);
    this.camera.lookAt(this.controls.target);
  }

  /** The return done (or cut): the play view's locks. */
  private endReturn(): void {
    if (!this.returning) return;
    this.returning = null;
    this.lockPlayAngles();
  }

  private lockPlayAngles(): void {
    this.controls.minAzimuthAngle = 0;
    this.controls.maxAzimuthAngle = 0;
    this.controls.minPolarAngle = PLAY_DEFAULT_POLAR_ANGLE;
    this.controls.maxPolarAngle = PLAY_DEFAULT_POLAR_ANGLE;
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

  /**
   * The camera's mode. `play` locks the tilt and the turn (#719); coming from `free` (the Camera mode, #875), they ease back to
   * the play view's over `FREE_RETURN_MS` first (the target and the distance kept), or at once with `animate` false (reduced
   * motion). `free` frees the turn and the tilt between `FREE_MIN_POLAR_ANGLE` and `FREE_MAX_POLAR_ANGLE`, from where the camera
   * is: entering moves nothing, each drag glides out with the damping.
   */
  setMode(mode: CameraMode, { animate = true }: { animate?: boolean } = {}): void {
    const from = this.mode;
    this.mode = mode;
    if (mode === "play") {
      this.controls.panSpeed = 0.8;
      // The tilt and the azimuth are locked (#719): the camera only pans and zooms.
      this.controls.enableRotate = false;
      // The left and the right button pan, the middle one (and the wheel) zooms.
      this.controls.mouseButtons = {
        LEFT: THREE.MOUSE.PAN,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      };
      // One finger pans; two fingers pinch to zoom and their midpoint pans.
      this.controls.touches = {
        ONE: THREE.TOUCH.PAN,
        TWO: THREE.TOUCH.DOLLY_PAN,
      };
      if (from === "free") {
        const { polar, azimuth } = this.getAngles();
        // Open while it eases (the controls would clamp the camera to the locks at once); the next update starts the clock.
        this.controls.minAzimuthAngle = -Infinity;
        this.controls.maxAzimuthAngle = Infinity;
        this.controls.minPolarAngle = 0;
        this.controls.maxPolarAngle = Math.PI / 2;
        this.returning = { start: null, polar, azimuth };
        if (!animate) {
          this.placeAt(PLAY_DEFAULT_POLAR_ANGLE, 0);
          this.endReturn();
        }
        return;
      }
      if (!this.returning) this.lockPlayAngles();
      return;
    }

    // Leaving play mid-return: the camera stays where the return had it, and the new mode's bounds hold from there.
    this.returning = null;
    this.controls.enableRotate = true;
    this.controls.minAzimuthAngle = -Infinity;
    this.controls.maxAzimuthAngle = Infinity;
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.ROTATE,
    };
    // One finger turns and tilts; two fingers pinch to zoom and their midpoint pans.
    this.controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };
    if (mode === "free") {
      this.controls.panSpeed = 0.8;
      this.controls.rotateSpeed = 0.5;
      this.controls.minPolarAngle = FREE_MIN_POLAR_ANGLE;
      this.controls.maxPolarAngle = FREE_MAX_POLAR_ANGLE;
      return;
    }
    this.controls.panSpeed = 1;
    this.controls.rotateSpeed = 0.35;
    this.controls.minPolarAngle = 0;
    this.controls.maxPolarAngle = Math.PI * 0.42;
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

  /** Back to the frame of now (`setFrameSource`), else the last frame (`frame`), else the opening position. */
  reset(): void {
    const frame = this.frameSource?.() ?? this.framed;
    if (frame) {
      this.frame(frame.target, frame.distance);
      return;
    }
    this.controls.reset();
  }

  dispose(): void {
    this.controls.dispose();
  }
}
