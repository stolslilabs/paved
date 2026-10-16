import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { PlanType, getPlanKey } from "@paved/game-core";
import { afterFirstFrame, firstModels } from "./load-order";
import { NO_SKINS, variantIndex, type SkinRef, type TileSkins } from "./skins";

/**
 * Where a host lists its renderer assets under content-hashed names: `<basePath>/manifest.json`, a plan key to its model's
 * path relative to `basePath` (`{ "models": { "ccccccccc": "models/ccccccccc.2bb7ca783c.glb" } }`), and each theme's
 * variants by its id on chain, then plan key, in variant order (`{ "themes": { "1": { "ccccccccc": ["models/forest/..."] } } }`),
 * and the resized tile images by size in pixels, then plan key (`{ "tiles": { "256": { "ccccccccc": "tiles/ccccccccc.256.<hash>.png" } } }`).
 * The app's build writes it (`packages/app/vite/renderer-assets.ts`); a host without one (Storybook) serves
 * `models/<plan>.glb`, and draws no skin unless it hands the loader a manifest of its own.
 */
export interface AssetManifest {
  models: Record<string, string>;
  themes?: Record<string, Record<string, string[]>>;
  tiles?: Record<string, Record<string, string>>;
}

/**
 * The side, in pixels, of the tile images the renderer draws, the placeholder quad's and the plan view's: one size serves
 * both (the plan view at 256 and at 512 px differs by a mean 0.02 to 0.06 dE and 1.6 dE at most, at every zoom, `docs/client/v2-architecture.md`, 4.2).
 */
export const TILE_IMAGE_SIZE = 256;

/** The plan keys of the 19 base models (`None` has none). */
const PLAN_KEYS = Object.values(PlanType)
  .filter((v) => v !== PlanType.None)
  .map(getPlanKey);

/** One manifest request per base path for the page's life; a failed one (after its retries) is asked again by the next loader. */
const manifests = new Map<string, Promise<AssetManifest | null>>();

/** The waits before the manifest's second and third tries, after a network error or a server error. */
export const MANIFEST_RETRY_MS = [250, 1000];

function isManifest(value: unknown): value is AssetManifest {
  const { models, themes, tiles } = (value as { models?: unknown; themes?: unknown; tiles?: unknown } | null) ?? {};
  const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
  const paths = (v: unknown) => Array.isArray(v) && v.every((p) => typeof p === "string");
  return (
    record(models) &&
    Object.values(models).every((v) => typeof v === "string") &&
    (themes === undefined || (record(themes) && Object.values(themes).every((t) => record(t) && Object.values(t).every(paths)))) &&
    (tiles === undefined || (record(tiles) && Object.values(tiles).every((t) => record(t) && Object.values(t).every((v) => typeof v === "string"))))
  );
}

/**
 * The manifest at `<basePath>/manifest.json`, or null when the host has none: a 404, a body that is not a manifest, or a
 * base path with no host to ask (not a URL from this page). A network error or a server error is tried again
 * (`MANIFEST_RETRY_MS`), then rejects, so the scene does not start (the app shows its plan view) rather than ask for plain
 * names the app's build does not ship.
 */
export function loadManifest(basePath: string): Promise<AssetManifest | null> {
  let manifest = manifests.get(basePath);
  if (!manifest) {
    manifest = fetchManifest(basePath);
    manifests.set(basePath, manifest);
    manifest.catch(() => {
      if (manifests.get(basePath) === manifest) manifests.delete(basePath);
    });
  }
  return manifest;
}

async function fetchManifest(basePath: string): Promise<AssetManifest | null> {
  let url: string;
  try {
    url = new URL(`${basePath}/manifest.json`, (globalThis as { location?: { href: string } }).location?.href).href;
  } catch {
    return null;
  }
  for (let attempt = 0; ; attempt++) {
    let response: Response | null = null;
    let failure: unknown = null;
    try {
      // Revalidated on every load: the manifest is the one renderer file whose name does not change with its content.
      response = await fetch(url, { cache: "no-cache" });
    } catch (error) {
      failure = error;
    }
    if (response && (response.ok || response.status === 404)) {
      if (!response.ok) return null;
      try {
        const value: unknown = await response.json();
        return isManifest(value) ? value : null;
      } catch {
        return null;
      }
    }
    if (attempt >= MANIFEST_RETRY_MS.length) {
      throw failure ?? new Error(`AssetLoader: ${url} answered ${response!.status}`);
    }
    await new Promise((done) => setTimeout(done, MANIFEST_RETRY_MS[attempt]));
  }
}

/**
 * A model's path relative to `basePath`. A model id is a plan key (its base model: its hashed name when the manifest lists
 * it, else `models/<plan>.glb`) or a variant's path from the manifest's `themes` (it has a `/`), loaded as is.
 */
export function modelPath(manifest: AssetManifest | null, key: string): string {
  if (isVariant(key)) return key;
  return manifest?.models[key] ?? `models/${key}.glb`;
}

/**
 * A plan's tile image, relative to `basePath`: the manifest's copy at `TILE_IMAGE_SIZE`, else the original
 * `assets/tiles/<plan>.png`, what a host without a manifest (or one listing no tiles) serves.
 */
export function tilePath(manifest: AssetManifest | null, key: string): string {
  return manifest?.tiles?.[String(TILE_IMAGE_SIZE)]?.[key] ?? `assets/tiles/${key}.png`;
}

/** Whether a model id names a theme's variant (a path) rather than a plan's base model (a plan key). */
const isVariant = (id: string) => id.includes("/");

/**
 * The model a tile of plan `key` draws with skin `skin`: the variant of the skin's theme its hash picks among those the
 * manifest lists (`variantIndex`), or the plan's base model (`key`) when the manifest lists no variant of that theme
 * and plan (a theme not out yet, a host with no manifest).
 */
export function skinModelPath(manifest: AssetManifest | null, key: string, skin: SkinRef | null): string {
  const variants = skin ? manifest?.themes?.[String(skin.theme)]?.[key] : undefined;
  return variants?.length ? variants[variantIndex(skin!.hash, variants.length)]! : key;
}

let workersStarted = false;

/** meshopt decodes off the main thread where the browser gives workers (started from an inline script, no fetch), once. */
function startDecoderWorkers(): void {
  if (workersStarted || typeof Worker === "undefined") return;
  workersStarted = true;
  MeshoptDecoder.useWorkers(2);
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
  /** Told when a model or the plan view's images come in (`onLoaded`). */
  private loadedListener: (() => void) | null = null;
  /** The manifest once read (null: the host has none); undefined until then. */
  private manifest: AssetManifest | null | undefined;
  /** Given by the host (`RendererConfig.manifest`): read instead of `<basePath>/manifest.json`. */
  private hostManifest: AssetManifest | undefined;
  /** The skins asked for before the manifest was in (`skinModel`): `preloadAll` resolves and waits for them. */
  private wantedSkins: Array<{ key: string; skin: SkinRef }> = [];
  /** The variants that failed to load: their tiles draw the base model from then on. */
  private failedVariants: Set<string> = new Set();
  /** The plan key of each variant resolved (`resolveSkin`): the base model its tiles fall back to. */
  private variantPlans: Map<string, string> = new Map();
  /** The theme of each plan (`setSkins`): a plan with a variant in the manifest does not load its base model unasked. */
  private skins: TileSkins = NO_SKINS;

  constructor(basePath = "", manifest?: AssetManifest) {
    startDecoderWorkers();
    this.gltfLoader = new GLTFLoader();
    // The app's models are meshopt-compressed (`EXT_meshopt_compression`); the decoder ships in the bundle, self-hosted.
    this.gltfLoader.setMeshoptDecoder?.(MeshoptDecoder);
    this.textureLoader = new THREE.TextureLoader();
    this.basePath = basePath;
    this.hostManifest = manifest;
    if (manifest) this.manifest = manifest;
  }

  /** The manifest: the host's, else `<basePath>/manifest.json` (`loadManifest`); kept once read. */
  private async readManifest(): Promise<AssetManifest | null> {
    const manifest = this.hostManifest ?? (await loadManifest(this.basePath));
    this.manifest = manifest;
    return manifest;
  }

  /**
   * The model id a tile of plan `key` draws with `skin` (`skinModelPath`): the base model's key, a variant's path, or the
   * base again for a variant that failed to load. Null while the manifest is not read yet, for a skinned tile: the skin is
   * then remembered and `preloadAll` waits for its variant with the first models. Nothing loads here: the scene asks for
   * what it draws (`want`, `getModel`).
   */
  skinModel(key: string, skin: SkinRef | null): string | null {
    if (!skin) return key;
    if (this.manifest === undefined) {
      this.wantedSkins.push({ key, skin });
      return null;
    }
    const id = this.resolveSkin(this.manifest, key, skin);
    return this.failedVariants.has(id) ? key : id;
  }

  /**
   * The theme of each plan, as the scene draws it. The base model of a plan whose skin is known and listed by the manifest
   * is a fallback (no skin read, a variant that fails, theme 0): it loads only when a tile asks for it (`want`, `getModel`)
   * or the variant fails, never with the models loaded for the rest of the board (`preloadAll`).
   */
  setSkins(skins: TileSkins): void {
    this.skins = skins;
  }

  /** Whether the base model of plan `key` is left to be asked for: its skin is known and the manifest lists its variants. */
  private skipsBase(key: string, manifest: AssetManifest | null): boolean {
    const theme = this.skins[key];
    if (!theme || !manifest?.themes?.[String(theme)]?.[key]?.length) return false;
    for (const [variant, plan] of this.variantPlans) if (plan === key && this.failedVariants.has(variant)) return false;
    return true;
  }

  /** `skinModelPath`, remembering the variant's plan for its fallback. */
  private resolveSkin(manifest: AssetManifest | null, key: string, skin: SkinRef): string {
    const id = skinModelPath(manifest, key, skin);
    if (id !== key) this.variantPlans.set(id, key);
    return id;
  }

  /** Whether a model (a plan key or a variant's path) is loaded: `getModel` would answer it. */
  has(id: string): boolean {
    return this.models.has(id);
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

  /**
   * Calls `listener` each time a model, or the set of plan-view images, comes in: the scene draws then the tiles that
   * waited for it (`GameScene` listens once its first frame is drawn). One listener; null removes it.
   */
  onLoaded(listener: (() => void) | null): void {
    this.loadedListener = listener;
  }

  /** Every model, awaited (a failure rejects). */
  async preloadModels(): Promise<void> {
    const manifest = await this.readManifest();
    await Promise.all(PLAN_KEYS.map((key) => this.ensureModel(key, manifest)));
  }

  /**
   * Loads (once) the model of a plan key or a variant's path; the stored model is what `getModel` copies. A variant that
   * fails is not tried again: its tiles draw the base model (`skinModel`), which this loads, and the scene is told.
   */
  private ensureModel(key: string, manifest?: AssetManifest | null): Promise<void> {
    let load = this.modelLoads.get(key);
    if (!load) {
      load = (async () => {
        const paths = manifest === undefined ? await this.readManifest() : manifest;
        const gltf = await this.loadModel(`${this.basePath}/${modelPath(paths, key)}`);
        if (this.disposed) disposeModel(gltf.scene);
        else {
          this.models.set(key, gltf.scene);
          this.loadedListener?.();
        }
      })();
      if (isVariant(key)) {
        load = load.catch(async (error: unknown) => {
          if (this.disposed) return;
          console.warn(`[AssetLoader] the variant ${key} did not load, its tiles draw the base model:`, error);
          this.failedVariants.add(key);
          const base = this.variantPlans.get(key);
          if (base) await this.ensureModel(base).catch(() => {});
          this.loadedListener?.();
        });
      }
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

  /**
   * Every plan's image for the plan view (strategy mode) and the placeholder quad, loaded once, at `TILE_IMAGE_SIZE` (the
   * manifest's copy). A failure may be tried again: the next try asks only for the images not in yet.
   */
  preloadTextures(): Promise<void> {
    if (!this.texturesLoad) {
      const load = Promise.all(
        PLAN_KEYS.filter((key) => !this.textures.has(`tile-${key}`)).map(async (key) => {
          const manifest = await this.readManifest();
          const texture = await this.textureLoader.loadAsync(`${this.basePath}/${tilePath(manifest, key)}`);
          if (this.disposed) texture.dispose();
          else this.textures.set(`tile-${key}`, texture);
        })
      ).then(() => {
        if (!this.disposed) this.loadedListener?.();
      });
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
   * rejects, so the scene does not start (the app shows its plan view). The plan view's 19 images wait too, always: they
   * are the placeholder a tile draws while its model is on its way (`TileRenderer`), so a tile placed after the first
   * frame is never empty. Their failure rejects only when the plan view asked for them; otherwise it is logged, and tried
   * again after the first frame. A later failure only leaves that plan's tiles undrawn.
   */
  async preloadAll(): Promise<void> {
    const manifest = await this.readManifest();
    // The skins asked for before the manifest was in: their variants (or base models) join the first models.
    for (const { key, skin } of this.wantedSkins.splice(0)) this.wanted.add(this.resolveSkin(manifest, key, skin));
    const variants = [...this.wanted].filter(isVariant);
    // The base models of the plans whose skin is known are not loaded with the others: tiles ask for one when they need it.
    const bases = PLAN_KEYS.filter((key) => !this.skipsBase(key, manifest));
    // A board drawn in variants only still waits for no base model it does not draw.
    const first = PLAN_KEYS.some((key) => this.wanted.has(key))
      ? firstModels(PLAN_KEYS, this.wanted)
      : variants.length
        ? []
        : bases;
    this.chosen = true;
    // A variant that fails loads its base model instead (`ensureModel`), which the first frame then waits for.
    await Promise.all([
      ...first.map((key) => this.ensureModel(key, manifest)),
      ...variants.map((path) => this.ensureModel(path, manifest)),
      this.wantTextures
        ? this.preloadTextures()
        : this.preloadTextures().catch((error: unknown) => {
            if (!this.disposed) console.warn("[AssetLoader] the tile images did not load, a tile waits for its model:", error);
          }),
    ]);
    afterFirstFrame(() => {
      if (this.disposed) return;
      // A skin that came in meanwhile spares its plans' base models too.
      const rest = PLAN_KEYS.filter((key) => !first.includes(key) && !this.skipsBase(key, manifest)).map((key) =>
        this.ensureModel(key, manifest)
      );
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

  /**
   * A plan's image if it is in, else null, asking for nothing: the placeholder quad (`TileRenderer`) reads it this way, so
   * that it never counts as the plan view asking (whose image failure stops the scene, `preloadAll`).
   */
  peekTexture(key: string): THREE.Texture | null {
    return this.textures.get(key) ?? null;
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
    this.loadedListener = null;
    this.models.forEach(disposeModel);
    this.textures.forEach((texture) => texture.dispose());
    this.models.clear();
    this.textures.clear();
    this.modelLoads.clear();
    this.wantedSkins = [];
    this.failedVariants.clear();
    this.variantPlans.clear();
    this.skins = NO_SKINS;
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
