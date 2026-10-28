import * as THREE from "three";
import { voxelize, type VoxelGrid } from "./voxelizer";
import { PALETTE_CLASSES, labelTileColumns } from "./features";
import { paletteOfModel, planKeyOfModel, planLayout } from "./feature-layout";
import { isOutline } from "./outlines";
import { WALK_GROUND, buildWalkMap, type WalkLabels, type WalkMap, type WalkTile } from "./walk-map";
import { Walker, findStart } from "./walker";
import type { WalkControl, WalkSettings, WalkState, WalkVector } from "./walk-settings";

/**
 * The first-person walk (V4-WALK-1, #876), a chunk of its own: `GameScene.startWalk` loads it on the first walk. It builds the
 * walk's ground from the placed tiles (`walk-map.ts`), drops the walker on the road nearest the point the screen's centre looks
 * at, eases the camera down from the orbit view to the walker's eye, moves the walker by the host's inputs (`WalkControl`), and
 * eases back to the view it came from on the way out. The camera's field of view and near plane are the walk's while it walks.
 */

/** A placed tile drawn on its model (`TileRenderer.smokeSources`): its model id, and its model's clone on the board. */
export interface WalkSource {
  readonly key: string;
  readonly tile: THREE.Object3D;
}

/** Per geometry: its voxel grid and its labels (null: none), built once (a type's tiles share their geometry). */
const grids = new WeakMap<THREE.BufferGeometry, VoxelGrid | null>();
const labelsOf = new WeakMap<THREE.BufferGeometry, WalkLabels | null>();

/** A model's labels in its frame, or null when its plan or palette is unknown (its ground is not walkable). */
function modelLabels(key: string, geometry: THREE.BufferGeometry, toModel: THREE.Matrix4): WalkLabels | null {
  const plan = planKeyOfModel(key);
  const palette = paletteOfModel(key);
  if (!plan || !palette) return null;
  const { columns, grid } = labelTileColumns(geometry, planLayout(plan), toModel, PALETTE_CLASSES[palette]);
  return { size: columns.size, feature: columns.feature, minX: grid.minX, minZ: grid.minZ, cell: grid.cell };
}

/** The walk's ground of the tiles given, on `board` (the tiles' group: its frame is the board's). */
export function boardWalkMap(board: THREE.Object3D, sources: readonly WalkSource[]): WalkMap | null {
  board.updateMatrixWorld(true);
  const toBoard = board.matrixWorld.clone().invert();
  const tiles: WalkTile[] = [];
  for (const { key, tile } of sources) {
    const fromRoot = tile.matrixWorld.clone().invert();
    const tileToBoard = toBoard.clone().multiply(tile.matrixWorld);
    tile.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || isOutline(child)) return;
      const geometry = child.geometry as THREE.BufferGeometry;
      const toModel = fromRoot.clone().multiply(child.matrixWorld);
      if (!grids.has(geometry)) grids.set(geometry, voxelize({ geometry, toModel }, { name: key }));
      if (!labelsOf.has(geometry)) labelsOf.set(geometry, modelLabels(key, geometry, toModel));
      const grid = grids.get(geometry);
      if (grid) tiles.push({ grid, labels: labelsOf.get(geometry) ?? null, toBoard: tileToBoard.elements });
    });
  }
  return buildWalkMap(tiles);
}

/** An ease in and out (cubic), 0 to 1. */
const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** The camera's pose: where it is, where it looks, its field of view. */
interface Pose {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  fov: number;
}

const EULER = new THREE.Euler(0, 0, 0, "YXZ");
const LOOK = new THREE.Quaternion();
const BOARD_TURN = new THREE.Quaternion();
const SCRATCH = new THREE.Vector3();

export interface WalkSessionOptions {
  camera: THREE.PerspectiveCamera;
  /** The tiles' group: the walk's ground and the walker are in its frame. */
  board: THREE.Object3D;
  map: WalkMap;
  settings: WalkSettings;
  /** Where to start, in the board's frame (world units): the walker drops on the road nearest it. */
  near: { x: number; z: number };
  reducedMotion: boolean;
  /** `performance.now()` of the start. */
  now: number;
}

export class WalkSession implements WalkControl {
  private readonly camera: THREE.PerspectiveCamera;
  private readonly board: THREE.Object3D;
  private readonly map: WalkMap;
  private settings: WalkSettings;
  private readonly walker: Walker;
  private readonly from: Pose & { near: number };
  private reducedMotion: boolean;
  private phase: WalkState["phase"] = "entering";
  /** When the ease under way started, and the pose it started from. */
  private easeStart: number;
  private easeFrom: Pose;
  private lastNow: number;
  private move: WalkVector = { x: 0, y: 0 };
  private lookRate: WalkVector = { x: 0, y: 0 };
  private onLeft: (() => void) | null = null;
  /** The walk has eased back: the host gives the camera back to its controls. */
  done = false;
  readonly buildMs: number;

  private constructor(options: WalkSessionOptions, walker: Walker, buildMs: number) {
    const { camera, board, map, settings, reducedMotion, now } = options;
    this.camera = camera;
    this.board = board;
    this.map = map;
    this.settings = settings;
    this.walker = walker;
    this.reducedMotion = reducedMotion;
    this.buildMs = buildMs;
    this.from = { position: camera.position.clone(), quaternion: camera.quaternion.clone(), fov: camera.fov, near: camera.near };
    this.easeFrom = { position: this.from.position, quaternion: this.from.quaternion, fov: this.from.fov };
    this.easeStart = now;
    this.lastNow = now;
    // Lowered for the whole walk, the descent included: what comes close is never cut.
    camera.near = settings.near;
    camera.updateProjectionMatrix();
  }

  /** A walk on `map` from the road nearest `near`, or null when the board has no ground the walker fits on. */
  static start(options: WalkSessionOptions, buildMs = 0): WalkSession | null {
    const { map, settings, camera, board } = options;
    const x = (options.near.x - map.minX) / map.voxel;
    const z = (options.near.z - map.minZ) / map.voxel;
    const place = findStart(map, settings, x, z);
    if (!place) return null;
    // Facing the way the orbit camera looked, on the board.
    board.updateMatrixWorld(true);
    const forward = camera.getWorldDirection(new THREE.Vector3()).transformDirection(board.matrixWorld.clone().invert());
    const yaw = Math.hypot(forward.x, forward.z) > 1e-6 ? Math.atan2(-forward.x, -forward.z) : 0;
    return new WalkSession(options, new Walker(map, settings, place, yaw), buildMs);
  }

  setMove(move: WalkVector): void {
    this.move = { x: move.x, y: move.y };
  }

  setLookRate(rate: WalkVector): void {
    this.lookRate = { x: rate.x, y: rate.y };
  }

  look(dxPx: number, dyPx: number): void {
    if (this.phase !== "walking") return;
    const k = this.settings.mouseRadiansPerPx;
    this.walker.turn(dxPx * k, -dyPx * k);
  }

  setSettings(settings: WalkSettings): void {
    this.settings = settings;
    this.walker.setSettings(settings);
    this.camera.near = settings.near;
  }

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
  }

  state(): WalkState {
    const { map, walker } = this;
    return {
      phase: this.phase,
      x: map.minX + walker.x * map.voxel,
      z: map.minZ + walker.z * map.voxel,
      floor: walker.feet * map.voxel,
      yaw: walker.yaw,
      pitch: walker.pitch,
      ground: walker.ground() === WALK_GROUND.road ? "road" : "city",
      buildMs: this.buildMs,
      walkable: map.walkable,
    };
  }

  /** Eases back to the view the walk came from; resolves once there (`done`). */
  leave(now: number): Promise<void> {
    if (this.done) return Promise.resolve();
    if (this.phase !== "leaving") {
      this.phase = "leaving";
      this.easeStart = now;
      this.easeFrom = { position: this.camera.position.clone(), quaternion: this.camera.quaternion.clone(), fov: this.camera.fov };
    }
    return new Promise((resolve) => {
      const previous = this.onLeft;
      this.onLeft = () => {
        previous?.();
        resolve();
      };
    });
  }

  /** One frame at `now`: the walker moves and the camera follows. True when the camera moved (a frame to draw). */
  update(now: number): boolean {
    if (this.done) return false;
    const dt = Math.min(0.1, Math.max(0, (now - this.lastNow) / 1000));
    this.lastNow = now;
    const duration = this.reducedMotion ? 0 : this.settings.easeMs;
    const t = duration > 0 ? Math.min(1, (now - this.easeStart) / duration) : 1;

    if (this.phase === "leaving") {
      this.blend(this.easeFrom, this.from, ease(t));
      if (t >= 1) this.finish();
      return true;
    }
    if (this.phase === "entering") {
      this.blend(this.easeFrom, this.eyePose(), ease(t));
      if (t >= 1) this.phase = "walking";
      return true;
    }
    const walked = this.walker.step(dt, this.move, this.lookRate, this.reducedMotion);
    const moving = walked > 0 || this.walker.settling || this.lookRate.x !== 0 || this.lookRate.y !== 0;
    if (!moving) return false;
    this.apply(this.eyePose());
    return true;
  }

  /** The walker's eye as a camera pose, in the world. */
  private eyePose(): Pose {
    const { map } = this;
    const eye = this.walker.eye();
    const position = new THREE.Vector3(map.minX + eye.x * map.voxel, eye.y * map.voxel, map.minZ + eye.z * map.voxel).applyMatrix4(this.board.matrixWorld);
    this.board.getWorldQuaternion(BOARD_TURN);
    EULER.set(this.walker.pitch, this.walker.yaw, 0);
    const quaternion = BOARD_TURN.clone().multiply(LOOK.setFromEuler(EULER));
    return { position, quaternion, fov: this.settings.fov };
  }

  private blend(a: Pose, b: Pose, t: number): void {
    this.camera.position.copy(SCRATCH.copy(a.position).lerp(b.position, t));
    this.camera.quaternion.copy(a.quaternion).slerp(b.quaternion, t);
    this.camera.fov = a.fov + (b.fov - a.fov) * t;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
  }

  private apply(pose: Pose): void {
    this.blend(pose, pose, 1);
  }

  /** Back at the view it came from: its pose, field of view and near plane. */
  private finish(): void {
    this.camera.position.copy(this.from.position);
    this.camera.quaternion.copy(this.from.quaternion);
    this.camera.fov = this.from.fov;
    this.camera.near = this.from.near;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    this.done = true;
    const done = this.onLeft;
    this.onLeft = null;
    done?.();
  }
}
