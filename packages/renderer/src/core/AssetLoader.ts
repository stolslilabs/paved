import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { PlanType, getPlanKey } from "@paved/game-core";
import { afterFirstFrame, firstModels } from "./load-order";

/**
 * Where a host lists its renderer assets under content-hashed names: `<basePath>/manifest.json`, a plan key to its model's
 * path relative to `basePath` (`{ "models": { "ccccccccc": "models/ccccccccc.2bb7ca783c.glb" } }`). The app's build
 * writes it (`packages/app/vite/renderer-assets.ts`); a host without one (Storybook) serves `models/<plan>.glb`.
 */
export interface AssetManifest {
  models: Record<string, string>;
}

/** The plan keys of the 19 base models (`None` has none). */
const PLAN_KEYS = Object.values(PlanType)
  .filter((v) => v !== PlanType.None)
  .map(getPlanKey);

// meshopt decodes off the main thread where the browser gives workers (they start from an inline script, no fetch).
if (typeof Worker !== "undefined") MeshoptDecoder.useWorkers(2);

/** One manifest request per base path for the page's life (a failed one is asked again by the next loader). */
const manifests = new Map<string, Promise<AssetManifest | null>>();

function isManifest(value: unknown): value is AssetManifest {
  const models = (value as { models?: unknown } | null)?.models;
  return typeof models === "object" && models !== null && Object.values(models).every((v) => typeof v === "string");
}

/** The manifest at `<basePath>/manifest.json`, or null when there is none (not served, not JSON, not a manifest). */
export function loadManifest(basePath: string): Promise<AssetManifest | null> {
  let manifest = manifests.get(basePath);
  if (!manifest) {
    manifest = (async () => {
      try {
        // Revalidated on every load: the manifest is the one renderer file whose name does not change with its content.
        const response = await fetch(`${basePath}/manifest.json`, { cache: "no-cache" });
        if (!response.ok) return null;
        const value: unknown = await response.json();
        return isManifest(value) ? value : null;
      } catch {
        return null;
      }
    })();
    manifests.set(basePath, manifest);
    void manifest.then((m) => {
      if (!m) manifests.delete(basePath);
    });
  }
  return manifest;
}

/** A plan's model path relative to `basePath`: its hashed name when the manifest lists it, else `models/<plan>.glb`. */
export function modelPath(manifest: AssetManifest | null, key: string): string {
  return manifest?.models[key] ?? `models/${key}.glb`;
}

export class AssetLoader {
  private models: Map<string, THREE.Group> = new Map();
  private textures: Map<string, THREE.Texture> = new Map();
  private gltfLoader: GLTFLoader;
  private textureLoader: THREE.TextureLoader;
  private basePath: string;
  /** Created only when a model needs Draco decoding: the plain models never touch it. */
  private dracoLoader: DRACOLoader | null = null;
  /** A load per model key, started once (`ensureModel`). */
  private modelLoads: Map<string, Promise<void>> = new Map();
  private texturesLoad: Promise<void> | null = null;
  /** The plan keys the scene asked for before its first frame (`want`): `preloadAll` waits for these only. */
  private wanted: Set<string> = new Set();
  /** Whether the strategy (plan) view asked for its images before the first frame. */
  private wantTextures = false;
  /** Set once `preloadAll` has chosen what the first frame waits for: a later `want` loads at once. */
  private chosen = false;
  private disposed = false;

  constructor(basePath = "") {
    this.gltfLoader = new GLTFLoader();
    // The app's models are meshopt-compressed (`EXT_meshopt_compression`); the decoder ships in the bundle, self-hosted.
    this.gltfLoader.setMeshoptDecoder?.(MeshoptDecoder);
    this.textureLoader = new THREE.TextureLoader();
    this.basePath = basePath;
  }

  /**
   * The plan keys of the tiles the scene is about to draw, and whether it draws them in the plan view (strategy mode).
   * `getModel` and `getTexture` call it for what they do not have yet: the tiles `TileRenderer` was handed. Asked before
   * `preloadAll` has chosen, they are what it waits for; asked later, they load at once, unawaited.
   */
  want(keys: Iterable<string>, textures = false): void {
    for (const key of keys) {
      this.wanted.add(key);
      if (this.chosen) void this.ensureModel(key).catch(() => {});
    }
    if (textures && !this.wantTextures) {
      this.wantTextures = true;
      if (this.chosen) void this.preloadTextures().catch(() => {});
    }
  }

  /** Every model, awaited (a failure rejects). */
  async preloadModels(): Promise<void> {
    const manifest = await loadManifest(this.basePath);
    await Promise.all(PLAN_KEYS.map((key) => this.ensureModel(key, manifest)));
  }

  /** Loads (once) the model of a plan key; the stored model is what `getModel` copies. */
  private ensureModel(key: string, manifest?: AssetManifest | null): Promise<void> {
    let load = this.modelLoads.get(key);
    if (!load) {
      load = (async () => {
        const paths = manifest === undefined ? await loadManifest(this.basePath) : manifest;
        const gltf = await this.loadModel(`${this.basePath}/${modelPath(paths, key)}`);
        if (this.disposed) disposeModel(gltf.scene);
        else this.models.set(key, gltf.scene);
      })();
      this.modelLoads.set(key, load);
      // A failed load may be tried again (a later `want` or `preloadAll`).
      load.catch(() => {
        if (this.modelLoads.get(key) === load) this.modelLoads.delete(key);
      });
    }
    return load;
  }

  /**
   * Loads a model. A Draco-compressed one (`KHR_draco_mesh_compression`) is refused by a loader with no decoder: then the
   * decoder, self-hosted at `<basePath>/draco/`, is set up once and the model loaded again.
   */
  private async loadModel(url: string) {
    try {
      return await this.gltfLoader.loadAsync(url);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("DRACOLoader")) throw error;
      // The models load in parallel: the first refusal sets the decoder up, the others find it there.
      if (!this.dracoLoader) {
        this.dracoLoader = new DRACOLoader().setDecoderPath(`${this.basePath}/draco/`);
        this.gltfLoader.setDRACOLoader(this.dracoLoader);
      }
      return this.gltfLoader.loadAsync(url);
    }
  }

  /** Every plan's image for the plan view (strategy mode), loaded once (a failure may be tried again). */
  preloadTextures(): Promise<void> {
    if (!this.texturesLoad) {
      const load = Promise.all(
        PLAN_KEYS.map(async (key) => {
          const texture = await this.textureLoader.loadAsync(`${this.basePath}/assets/tiles/${key}.png`);
          if (this.disposed) texture.dispose();
          else this.textures.set(`tile-${key}`, texture);
        })
      ).then(() => {});
      this.texturesLoad = load;
      load.catch(() => {
        if (this.texturesLoad === load) this.texturesLoad = null;
      });
    }
    return this.texturesLoad;
  }

  /**
   * What the scene's first frame needs, awaited; the rest after that frame (`load-order.ts`). First: the models of the
   * tiles handed over (`want`) by the time the manifest is in, which is all of them when the scene mounts with its tiles
   * (`GameCanvas` hands them over in the same commit as `init`); every model when none was handed over. A failure there
   * rejects, so the scene does not start (the app shows its plan view). The plan view's images wait too when it asked for
   * them. A later failure only leaves that plan's tiles undrawn.
   */
  async preloadAll(): Promise<void> {
    const manifest = await loadManifest(this.basePath);
    const first = firstModels(PLAN_KEYS, this.wanted);
    this.chosen = true;
    await Promise.all([...first.map((key) => this.ensureModel(key, manifest)), this.wantTextures ? this.preloadTextures() : null]);
    afterFirstFrame(() => {
      if (this.disposed) return;
      const rest = PLAN_KEYS.filter((key) => !first.includes(key)).map((key) => this.ensureModel(key, manifest));
      Promise.all([...rest, this.preloadTextures()]).catch((error: unknown) => {
        if (!this.disposed) console.warn("[AssetLoader] an asset loaded after the first frame failed:", error);
      });
    });
  }

  /**
   * A copy of a model with its own materials. Its geometry is the loaded one, shared by every
   * copy and owned by the loader: read it, do not change or dispose it.
   */
  getModel(key: string): THREE.Group {
    const model = this.models.get(key);
    if (!model) {
      // The scene asks for its tiles' models as it draws them (`TileRenderer`): a model asked for before it is in is wanted.
      this.want([key]);
      throw new Error(`Model not found: ${key}`);
    }
    const clone = model.clone(true);
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (Array.isArray(child.material)) {
          child.material = child.material.map((m) => m.clone());
        } else {
          child.material = child.material.clone();
        }
      }
    });
    return clone;
  }

  getTexture(key: string): THREE.Texture {
    const texture = this.textures.get(key);
    if (!texture) {
      this.want([], true);
      throw new Error(`Texture not found: ${key}`);
    }
    return texture;
  }

  dispose(): void {
    this.disposed = true;
    this.models.forEach(disposeModel);
    this.textures.forEach((texture) => texture.dispose());
    this.models.clear();
    this.textures.clear();
    this.modelLoads.clear();
    this.texturesLoad = null;
    this.dracoLoader?.dispose();
    this.dracoLoader = null;
  }
}

function disposeModel(model: THREE.Object3D): void {
  model.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry?.dispose();
      if (Array.isArray(child.material)) {
        child.material.forEach(m => m.dispose());
      } else {
        child.material?.dispose();
      }
    }
  });
}
