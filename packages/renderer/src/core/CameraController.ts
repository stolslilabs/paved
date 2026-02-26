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

const DEFAULT_CONFIG: Required<CameraConfig> = {
  position: [0, 0, 0],
  zoom: 5,
  near: 1,
  far: 2000,
  minDistance: 5,
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

export class CameraController {
  private static readonly BOARD_MARGIN = 6;

  camera: THREE.PerspectiveCamera;
  controls: CameraInputAdapter;
  private compassRotation = 0;
  private mode: CameraMode = "play";
  private boardBounds: BoardBounds | null = null;

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
    // Start straight top-down (tiny Z offset avoids gimbal lock)
    this.camera.position.set(0, cfg.maxDistance * 0.8, 0.001);
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
      this.controls.rotateSpeed = 0.1;
      this.controls.minAzimuthAngle = 0;
      this.controls.maxAzimuthAngle = 0;
      this.controls.minPolarAngle = 0;
      this.controls.maxPolarAngle = Math.PI * 0.15;
      this.controls.touches = {
        ONE: THREE.TOUCH.PAN,
        TWO: THREE.TOUCH.DOLLY_PAN,
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

  reset(): void {
    this.controls.reset();
  }

  dispose(): void {
    this.controls.dispose();
  }
}
