// The voxel drop of a placed tile (VOXEL-DROP, #512): which tile drops, the hand-over from the real model to the falling voxels
// and back. Small and eager; the mesh and its shader (`voxel-drop.ts`) load as a chunk on the first drop.
import * as THREE from "three";
import { isOutline } from "./outlines";
import { DEFAULT_VOXEL_DROP_SETTINGS, type VoxelDropSettings } from "./voxel-drop-settings";
import type { VoxelCache, VoxelGrid } from "./voxelizer";
import type { VoxelDrop } from "./voxel-drop";

/** What a started drop reports: the numbers the stories read out. */
export interface DropInfo {
  /** Solid voxels of the model, and the ones in the ground slab. */
  voxels: number;
  slabVoxels: number;
  /** Instances drawn and the triangles they make. */
  instances: number;
  triangles: number;
  /** The drop's duration at speed 1, and how long it plays at the settings' speed, ms. */
  durationMs: number;
  playMs: number;
  /** The voxelizer's build time for the model, ms (0 when the grid was already built). */
  buildMs: number;
}

/** `load-failed`: the drop's chunk did not download (offline, a new deploy); the next drop tries again. */
export type DropSkip = "reduced-motion" | "no-tile" | "no-model" | "no-voxels" | "load-failed" | "disposed";

/** `finished` settles when the last voxel has landed and the real model is back (or the drop was cut short by a change of the tile). */
export type DropResult =
  | { status: "started"; info: DropInfo; finished: Promise<void> }
  | { status: "skipped"; reason: DropSkip };

/** What the drops need of the tile renderer. */
export interface DropHost {
  /** A drawn tile's container and the model it draws, or undefined. */
  tile(key: string): { container: THREE.Object3D; model: string | null } | undefined;
  /** The shared model of a type (its mesh in the loader's frame). */
  type(model: string): THREE.Object3D;
  /** The voxels that fall for a model, from its grid: all of them, or fewer (the smoke's left out where the placed tile hides them). */
  grid?(model: string, grid: VoxelGrid): VoxelGrid;
}

interface Active {
  drop: VoxelDrop;
  container: THREE.Object3D;
  model: THREE.Object3D;
  done: () => void;
}

/** The first mesh of a model that is not an outline. */
function meshOf(root: THREE.Object3D): THREE.Mesh | null {
  let found: THREE.Mesh | null = null;
  root.traverse((child) => {
    if (!found && (child as THREE.Mesh).isMesh && !isOutline(child)) found = child as THREE.Mesh;
  });
  return found;
}

export class TileDrops {
  private readonly active = new Map<string, Active>();
  private chunk: Promise<typeof import("./voxel-drop")> | null = null;
  private loaded: typeof import("./voxel-drop") | null = null;
  private cache: VoxelCache | null = null;
  private settings: VoxelDropSettings = DEFAULT_VOXEL_DROP_SETTINGS;
  private reduced = false;
  private disposed = false;
  /** A drop ended since the last `update`: the real model is back, so the shadow map is stale. */
  private swapped = false;

  /** The chunk failed at the last try: `start` reports it as `load-failed` rather than `no-voxels`. */
  private failed = false;

  /** `load` fetches the drop's chunk (`voxel-drop.ts`); a test hands one that fails. */
  constructor(
    private readonly host: DropHost,
    private readonly load: () => Promise<typeof import("./voxel-drop")> = () => import("./voxel-drop"),
  ) {}

  setSettings(settings: VoxelDropSettings): void {
    this.settings = settings;
  }

  setReducedMotion(reduced: boolean): void {
    this.reduced = reduced;
  }

  /** The source of a model's grid: the type's mesh, its loader frame given by the matrix. */
  private typeMesh(model: string): THREE.Mesh | null {
    const type = this.host.type(model);
    type.updateMatrixWorld(true);
    const mesh = meshOf(type);
    return mesh && mesh.material instanceof THREE.MeshStandardMaterial ? mesh : null;
  }

  /**
   * Loads what a drop of tile `key` needs (the chunk, and the grid of its model) so that `start` begins in the same call: the
   * first drop would otherwise show the real model for the frames the chunk takes. True when it is ready.
   */
  async prepare(key: string): Promise<boolean> {
    const tile = this.host.tile(key);
    return tile?.model ? this.prepareModel(tile.model) : false;
  }

  /**
   * Loads the chunk and the grid of `model` before any tile draws it: the board prepares the drop of a tile still in hand
   * (placed, not confirmed), whose model is known but whose tile is not on the board yet. True when it is ready.
   */
  async prepareModel(model: string): Promise<boolean> {
    if (this.disposed) return false;
    const mesh = this.typeMesh(model);
    if (!mesh) return false;
    this.chunk ??= this.load();
    let chunk: typeof import("./voxel-drop");
    try {
      chunk = await this.chunk;
      this.failed = false;
    } catch (error) {
      // A failed download is never kept: the next drop or prepare asks for the chunk again. The drop is optional, so the
      // caller only learns it was skipped (and confirms the move without it).
      this.chunk = null;
      this.failed = true;
      console.warn("[renderer] the voxel drop's chunk did not load; the tile lands without its drop", error);
      return false;
    }
    if (this.disposed) return false;
    this.loaded = chunk;
    this.cache ??= new chunk.VoxelCache();
    return !!(await this.cache.request(model, { geometry: mesh.geometry, toModel: mesh.matrixWorld }));
  }

  /**
   * Drops tile `key`: its model is hidden and its voxels fall; the model comes back when the last one lands. Begins in this call
   * when the chunk and the grid are ready (`prepare`, or an earlier drop of the model), else once they are.
   */
  start(key: string): Promise<DropResult> {
    const tile = this.host.tile(key);
    if (!tile) return Promise.resolve({ status: "skipped", reason: "no-tile" });
    if (!tile.model) return Promise.resolve({ status: "skipped", reason: "no-model" });
    if (this.reduced) return Promise.resolve({ status: "skipped", reason: "reduced-motion" });
    const known = this.cache?.peek(tile.model);
    if (this.loaded && known) return Promise.resolve(this.begin(key, tile, known));
    return this.prepare(key).then((ready) => {
      if (this.disposed) return { status: "skipped", reason: "disposed" } as const;
      const grid = ready && tile.model ? this.cache?.peek(tile.model) : null;
      return grid ? this.begin(key, tile, grid) : ({ status: "skipped", reason: this.failed ? "load-failed" : "no-voxels" } as const);
    });
  }

  private begin(key: string, expected: { container: THREE.Object3D; model: string | null }, grid: VoxelGrid): DropResult {
    // The tile may have changed while the chunk and the grid were coming: the same container, still drawing the same model.
    const tile = this.host.tile(key);
    if (!tile || tile.container !== expected.container || tile.model !== expected.model) return { status: "skipped", reason: "no-tile" };
    const chunk = this.loaded;
    const typeMesh = tile.model ? this.typeMesh(tile.model) : null;
    const model = tile.container.children[0];
    const placed = model && meshOf(model);
    if (!chunk || !typeMesh || !placed || !tile.model) return { status: "skipped", reason: "no-model" };
    this.end(key);
    grid = this.host.grid?.(tile.model, grid) ?? grid;

    const { container } = tile;
    container.updateMatrixWorld(true);
    // The grid's frame (the type model's mesh) to the container's: the placed mesh's matrix, undoing the type's own.
    const toContainer = new THREE.Matrix4().copy(container.matrixWorld).invert().multiply(placed.matrixWorld).multiply(typeMesh.matrixWorld.clone().invert());
    const drop = new chunk.VoxelDrop(grid, typeMesh.material as THREE.MeshStandardMaterial, toContainer, this.settings);

    // The drop in and the model out in this one call: no frame has the cell empty or shows both.
    container.add(drop.object);
    model.visible = false;
    let done!: () => void;
    const finished = new Promise<void>((resolve) => (done = resolve));
    this.active.set(key, { drop, container, model, done });
    return {
      status: "started",
      finished,
      info: {
        voxels: grid.count,
        slabVoxels: grid.slabCount,
        instances: drop.instances,
        triangles: drop.triangles,
        durationMs: drop.durationMs,
        playMs: drop.playMs,
        buildMs: grid.buildMs,
      },
    };
  }

  /** Ends the drop of a tile at once: the voxels go, the model comes back. */
  end(key: string): void {
    const active = this.active.get(key);
    if (!active) return;
    this.active.delete(key);
    active.drop.dispose();
    active.model.visible = true;
    this.swapped = true;
    active.done();
  }

  /** Whether the tile is mid-drop (its model hidden). */
  has(key: string): boolean {
    return this.active.has(key);
  }

  /**
   * Moves the drops to `time` (ms). `animating`: a drop still runs, so the scene draws the next frame. `shadow`: the shadow map
   * is stale (a drop that casts runs, or a model has just come back).
   */
  update(time: number): { animating: boolean; shadow: boolean } {
    let shadow = this.swapped;
    this.swapped = false;
    for (const [key, active] of [...this.active]) {
      if (this.settings.shadows) shadow = true;
      if (!active.drop.update(time)) {
        this.end(key);
        shadow = true;
      }
    }
    this.swapped = false;
    return { animating: this.active.size > 0, shadow };
  }

  /** Ends every drop and lets go of the grids and the chunk's state. */
  dispose(): void {
    for (const key of [...this.active.keys()]) this.end(key);
    this.cache?.clear();
    this.cache = null;
    this.loaded = null;
    this.disposed = true;
  }
}
