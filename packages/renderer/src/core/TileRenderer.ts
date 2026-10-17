import * as THREE from "three";
import { getPlanKey, Plan, PlanType, Orientation, OrientationType } from "@paved/game-core";
import type { AssetLoader } from "./AssetLoader";
import { buildEdgesGeometry } from "./edges";
import { applyOutlineStroke, createOutline, createOutlineMaterial, isOutline, type OutlineStroke } from "./outlines";
import { TILE_SIZE } from "./types";
import type { TileRenderData, HoverState } from "./types";
import { LOOK_PRESETS, type LookSettings } from "./look";
import { CENTER_CELL, NO_SKINS, skinRef, type TileSkins } from "./skins";
import { PlacementRenderer, type PlacementSettings, type PlacementSlot, type PlacementUpdate } from "./placement";
import type { OutlineFadeSettings } from "./outlines";
import { ABOVE_GROUND_VOXELS, FEATURE_CODE, GROUND_VOXELS } from "./feature-codes";
import { paletteOfModel, planKeyOfModel, planLayout } from "./feature-layout";
// The classifier is its own chunk: loaded only once a highlight is first on (`scheduleLabels`), never for a board that
// does not light anything.
import type * as Classifier from "./features";

/** Runs `task` when the main thread is idle (`requestIdleCallback`), or on the next task where there is none. */
function whenIdle(task: () => void): void {
  const idle = (globalThis as { requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number }).requestIdleCallback;
  if (idle) idle(task, { timeout: 250 });
  else setTimeout(task, 0);
}

// Material constants from TileTexture
const TILE_MIN_ROUGHNESS = 0.35;
const TILE_MAX_ROUGHNESS = 0.95;
const TILE_MIN_METALNESS = 0.02;
const TILE_MAX_METALNESS = 0.45;
const STRATEGY_THICKNESS = 0.1;

/**
 * The top of a tile's ground: every base model's ground is 0.4 of its 4 units high (its upward faces, most at 0.4), and
 * a model is scaled to the tile's size. The placeholder quad (`createPlaceholder`) lies there.
 */
export const PLACEHOLDER_HEIGHT = 0.4 * (TILE_SIZE / 4);

/** A tile's rotation about the vertical axis, by orientation: the model's, the plan view's image, the placeholder's. */
const ROTATION: Record<string, number> = {
  [OrientationType.North]: 0,
  [OrientationType.East]: -Math.PI / 2,
  [OrientationType.South]: Math.PI,
  [OrientationType.West]: Math.PI / 2,
};

/**
 * The water of the tile palettes: its texels are cyan-blue (blue above green above red, in linear colour: (0, 130, 167)
 * and (90, 157, 194) in sRGB, among others), the palette's roofs and banners are violet (green under red) and its
 * stone grey. The mask picks the first by hue and nothing else; `uWaterOn` at 0 turns it off. Its green-over-red ramp
 * starts at 1.75, so the dark slate-blues stay out: (64, 82, 115) at 1.65, the darkest of the three stone shades of
 * `wfffffffr`, and (70, 87, 136) at 1.56. The palest water, (102, 142, 167) at 2.04, is fully in. `water-mask.test.ts`
 * runs every entry of every palette through it.
 */
export const WATER_MASK_GLSL = /* glsl */ `
  float waterMask = uWaterOn
    * smoothstep(1.1, 1.2, diffuseColor.b / max(diffuseColor.g, 1e-4))
    * smoothstep(1.75, 1.95, diffuseColor.g / max(diffuseColor.r, 1e-4));
  diffuseColor.rgb *= mix(1.0, uWaterBrightness, waterMask);
`;

/**
 * The feature highlight (`LookSettings.featureHighlight`, FEATURE-HL): the voxels of the lit feature are tinted and glow,
 * the others are dimmed; `uFeatureOn` at 0 leaves every voxel as is. A fragment's label is its voxel column's, read per
 * fragment from the model's label map (`features.ts`, `packLabels`) at its place on the model's grid (`vGrid`), half a
 * voxel inward along its face's normal: a merged face over columns of two labels shows each on its own columns. A road
 * column is labelled from its ground (the road runs on under a bridge): its fragments above the ground's top
 * (`GROUND_VOXELS` + `ABOVE_GROUND_VOXELS`, `vGrid.y` in voxels above the model's bottom) are the bridge's, none. With a
 * structure lit (`uStructureOn`, `TileRenderer.setLitAreas`) a voxel is lit instead when its area is in its tile's mask,
 * read from the board's lit map at the tile's cell (`vCell`). It runs after the water mask, on the palette's colour.
 * Off (`uFeatureOn` 0, the default), it skips the whole block: the board pays no texture read and no label per fragment.
 * A pending tile's material is patched as its model's; the placeholder quad (a plan's image, no voxels to label) and the
 * ghost (the tile in hand, under its placement veil: `ghostMaterial`) are drawn as they are, neither lit nor dimmed.
 */
export const FEATURE_HIGHLIGHT_GLSL = /* glsl */ `
  float featureLit = 0.0;
  if (uFeatureOn > 0.5) {
    vec3 labelAt = vGrid - normalize(vGridNormal) * 0.5;
    ivec2 labelTexel = clamp(ivec2(floor(labelAt.xz)), ivec2(0), textureSize(uLabelMap, 0) - 1);
    int label = int(texelFetch(uLabelMap, labelTexel, 0).r * 255.0 + 0.5);
    int labelFeature = label / 16;
    int labelArea = label - labelFeature * 16;
    if (labelFeature == ${FEATURE_CODE.road} && vGrid.y > ${(GROUND_VOXELS + ABOVE_GROUND_VOXELS).toFixed(1)}) {
      labelFeature = 0;
      labelArea = 0;
    }
    featureLit = labelFeature == int(uFeature + 0.5) ? 1.0 : 0.0;
    if (uStructureOn > 0.5) {
      ivec2 litTexel = ivec2(floor(vCell - uLitRect.xy + 0.5));
      int litMask = 0;
      if (all(greaterThanEqual(litTexel, ivec2(0))) && all(lessThan(litTexel, ivec2(uLitRect.zw + 0.5)))) {
        litMask = int(texelFetch(uLitMap, litTexel, 0).r + 0.5);
      }
      featureLit = labelArea > 0 && ((litMask >> (labelArea - 1)) & 1) == 1 ? 1.0 : 0.0;
    }
    diffuseColor.rgb = mix(diffuseColor.rgb * uFeatureDim, mix(diffuseColor.rgb, uFeatureColor, uFeatureTint), featureLit);
  }
`;

/**
 * The look's parts the tiles draw: the water and the feature highlight (the highlights stay in the look for GLOW; the
 * slots are `PlacementRenderer`'s).
 */
export type TileLook = Pick<LookSettings, "highlights" | "water" | "featureHighlight">;

/**
 * A model geometry's labels as its materials read them (`FEATURE_HIGHLIGHT_GLSL`): the label map, one byte a column
 * (`packLabels`), and the matrix from the geometry's positions to the grid (a voxel a unit, x and z the map's, y up
 * from the model's bottom).
 */
interface LabelUniforms {
  uLabelMap: { value: THREE.DataTexture };
  uGridMatrix: { value: THREE.Matrix4 };
}

/**
 * The areas of a placed tile to light (`TileRenderer.setLitAreas`): its game and id, as `TileRenderData` names it, and a
 * mask of its areas, bit `area - 1` (the plan's own areas, A to I, as `StructureBoard.structures` gives them).
 */
export interface LitTile {
  gameId: number;
  id: number;
  areas: number;
}

export class TileRenderer {
  private group: THREE.Group;
  private tileGroup: THREE.Group; // placed tiles
  private emptyGroup: THREE.Group; // empty slots
  private previewGroup: THREE.Group; // hover preview
  /**
   * Each tile drawn, with the model it was drawn from (a plan key or a variant's path; null in the plan view, and for the
   * placeholder quad drawn while its model is on its way), and the plan and orientation it was drawn in.
   */
  private tileMeshes: Map<string, { mesh: THREE.Object3D; pending: boolean; model: string | null; plan: number; orientation: number }> = new Map();
  private assets: AssetLoader;
  private strategyMode = false;
  private squareSize = TILE_SIZE;
  private previewContainer: THREE.Group | null = null;
  private previewKey: string | null = null;
  /** The confirm's key (`setConfirmed`): the same confirm given again does not start over. */
  private confirmKey: string | null = null;
  /** The placement visuals: the grid, the slots (drawn in `emptyGroup`), the ghost's aura and veil, the confirm. */
  private placement: PlacementRenderer;
  /** The last hover given: drawn again when its model comes in (`refreshHover`). */
  private hoverState: HoverState | null = null;
  /** The theme of each plan (`setSkins`): its tiles draw a variant of it. */
  private skins: TileSkins = NO_SKINS;

  // Shared by every tile and owned here: tiles hold no geometry or material of their own.
  // The model of each plan type, or of each variant of a skin, with its tuned materials (its geometry is the loader's).
  private tileTypes: Map<string, THREE.Group> = new Map();
  private pendingMaterials: Map<THREE.Material, THREE.Material> = new Map();
  private pendingFallbackMaterial: THREE.Material | null = null;
  /** The ghost's copy of each tile material (`ghostMaterial`): the feature highlight held off. */
  private ghostMaterials: Map<THREE.Material, THREE.MeshStandardMaterial> = new Map();
  private edgeMaterial = createOutlineMaterial();
  private strategyGeometry: THREE.BoxGeometry | null = null;
  private strategySideMaterial: THREE.Material | null = null;
  private strategyTopMaterials: Map<string, THREE.MeshBasicMaterial> = new Map();
  /**
   * The placeholder quad (`createPlaceholder`): one flat square and its outline for every plan, and one material per plan
   * that shows the plan view's image (already loaded: no download of its own).
   */
  private placeholderGeometry: THREE.BufferGeometry | null = null;
  private placeholderOutline: THREE.Mesh | null = null;
  private placeholderTypes: Map<string, THREE.Mesh> = new Map();
  private look: TileLook = LOOK_PRESETS.mockup;
  /** The water's uniforms, shared by every patched tile material (`patchTileShader`): a look change sets them, no recompile. */
  private waterUniforms = {
    uWaterOn: { value: 1 },
    uWaterBrightness: { value: 1 },
    uWaterRoughness: { value: 1 },
  };
  /** The feature highlight's uniforms, shared as the water's (`FEATURE_HIGHLIGHT_GLSL`). */
  private featureUniforms = {
    uFeatureOn: { value: 0 },
    uFeature: { value: FEATURE_CODE.city },
    uFeatureColor: { value: new THREE.Color() },
    uFeatureTint: { value: 0 },
    uFeatureGlow: { value: 0 },
    uFeatureDim: { value: 1 },
  };
  /**
   * The structure's lit areas (`setLitAreas`): a board map, one texel per cell from `uLitRect.xy`, `uLitRect.zw` wide
   * and deep, each the mask of its tile's lit areas. Shared by every tile material, as the other uniforms: a tile finds
   * its cell from its own model matrix (`uFootprint`, per material), so no tile has state of its own.
   */
  private structureUniforms = {
    uStructureOn: { value: 0 },
    uLitMap: { value: emptyLitMap() },
    uLitRect: { value: new THREE.Vector4(0, 0, 0, 0) },
    uTileSize: { value: TILE_SIZE },
    // The inverse of the placed tiles' group's world matrix (`updateBoardFrame`): a tile's cell is read in the board's
    // frame, so a turned compass (`GameScene.setCompassRotation`) does not move the lit cells.
    uBoardInverse: { value: new THREE.Matrix4() },
  };
  /** The lit tiles' masks by tile key (`setLitAreas`); null when no structure is lit. */
  private litAreas: Map<string, number> | null = null;
  /** The grid cell of each tile given (`updateTiles`), by tile key: where the lit map puts its mask. */
  private tileCells: Map<string, [number, number]> = new Map();
  /** The lit map's content as last built: rebuilt only when it changes. */
  private litKey = "";
  /** Whether a highlight is on: the models drawn then are labelled (`labelFeatures`), each once. */
  private labelling = false;
  /** The classifier (`features.ts`), loaded the first time a model is to be labelled. */
  private classifier: Promise<typeof Classifier> | null = null;
  /** The models waiting for their labels, one labelled per idle slice (`scheduleLabels`). */
  private labelQueue: Array<[string, THREE.Group]> = [];
  /** Whether a slice is on its way. */
  private labelScheduled = false;
  /** Told after each model labelled (`onLabelled`): the scene draws again. */
  private labelledListener: (() => void) | null = null;
  /** Waiting for the queue to empty (`whenLabelled`). */
  private labelWaiters: Array<() => void> = [];
  private disposed = false;
  /** The labels of each model geometry drawn (`labelFeatures`), owned here: an empty map until it is labelled. */
  private labelMaps: Map<THREE.BufferGeometry, LabelUniforms> = new Map();
  /** The label map of a geometry not labelled yet: one empty column (the sampler is always bound). */
  private emptyLabelMap = labelMapTexture(new Uint8Array(1), 1);

  constructor(assets: AssetLoader) {
    this.assets = assets;
    this.group = new THREE.Group();
    this.tileGroup = new THREE.Group();
    this.emptyGroup = new THREE.Group();
    this.previewGroup = new THREE.Group();
    this.placement = new PlacementRenderer(this.emptyGroup);
    this.group.add(this.tileGroup, this.emptyGroup, this.previewGroup, this.placement.group);
  }

  getGroup(): THREE.Group {
    return this.group;
  }

  /**
   * The board's frame as the tile shader reads a tile's cell in it (`uBoardInverse`): the inverse of the placed tiles'
   * group's world matrix. The scene calls it when that group's parents move (the compass, `GameScene.setCompassRotation`).
   */
  updateBoardFrame(): void {
    this.tileGroup.updateWorldMatrix(true, false);
    this.structureUniforms.uBoardInverse.value.copy(this.tileGroup.matrixWorld).invert();
  }

  /** Draws the tiles given; true when it added or removed one (a tile whose model is not in yet is added later). */
  updateTiles(tiles: TileRenderData[]): boolean {
    const currentKeys = new Set<string>();
    let changed = false;

    for (const tile of tiles) {
      const key = `${tile.game_id}-${tile.id}`;
      currentKeys.add(key);
      this.tileCells.set(key, [tile.worldX, tile.worldZ]);

      const existing = this.tileMeshes.get(key);
      const pending = !!tile.pending;
      // A model not in yet keeps the model drawn (a variant until its base model comes, SKIN-BASE); with none drawn, the
      // placeholder quad (null) until one comes, so a tile is never empty.
      const model = this.strategyMode ? null : (this.modelOf(tile.plan, tile.x, tile.y, tile.game_id) ?? existing?.model ?? null);

      // Skip if already drawn as given: same pending state, model, plan and orientation (the hand's tile, `TileView`, is
      // one tile turned in place: its model stays, its orientation changes)
      const drawn = existing && existing.pending === pending && existing.model === model;
      if (drawn && existing.plan === tile.plan && existing.orientation === tile.orientation) continue;

      // Pending state, model, plan or orientation changed: the new mesh replaces the old one in this call, so no frame shows
      // the cell empty or both at once (a tile owns no geometry or material)
      const mesh = this.strategyMode
        ? this.createStrategyTile(tile)
        : model
          ? this.createVoxelTile(tile, model)
          : this.createPlaceholder(tile.plan, tile.orientation);

      if (mesh) {
        // Apply pending loading style
        if (pending) {
          mesh.traverse((child) => {
            if (child instanceof THREE.Mesh && !isOutline(child)) {
              child.material = this.pendingMaterial(child.material);
            }
          });
        }

        mesh.position.set(
          tile.worldX * this.squareSize,
          0,
          tile.worldZ * this.squareSize
        );
        // The new mesh in, then the old one out: the cell is never empty, and no frame is drawn between the two
        this.tileGroup.add(mesh);
        if (existing) this.tileGroup.remove(existing.mesh);
        this.tileMeshes.set(key, { mesh, pending, model, plan: tile.plan, orientation: tile.orientation });
        changed = true;
      }
    }

    // Remove tiles no longer present
    for (const [key, entry] of this.tileMeshes) {
      if (!currentKeys.has(key)) {
        this.tileGroup.remove(entry.mesh);
        this.tileMeshes.delete(key);
        changed = true;
      }
    }
    // The grid around the tiles given (built again only when their cells change).
    this.placement.setTileCells(tiles.map((t) => ({ x: t.worldX, y: t.worldZ })));
    for (const key of this.tileCells.keys()) if (!currentKeys.has(key)) this.tileCells.delete(key);
    this.buildLitMap();
    return changed;
  }

  /**
   * The model a tile of `plan` at the contracts' (x, y) of game `gameId` draws from: its plan key (the base model), or the
   * variant of its plan's skin (`setSkins`) that its hash picks. A variant not loaded yet is asked for, and the base model
   * drawn meanwhile when it is in (null when neither is: the tile draws its placeholder quad until one comes in). Null for
   * plan 0.
   */
  private modelOf(plan: number, x: number, y: number, gameId: number): string | null {
    const key = getPlanKey(Plan.from(plan).value);
    if (key === "00") return null;
    const skin = skinRef(this.skins, plan, x, y, gameId);
    const id = skin ? this.assets.skinModel(key, skin) : key;
    if (id !== null && this.assets.has(id)) return id;
    // Not in yet: asked for at once (a base model needed again when the skins go off, a variant), and the tile keeps what it
    // draws meanwhile (null), a variant or a base model, so it is never empty.
    if (id !== null) this.assets.want([id]);
    return id === null || id === key ? null : this.assets.has(key) ? key : null;
  }

  /**
   * The theme of each plan (`TileSkins`): a tile of a skinned plan draws the variant its hash picks, loaded when a tile
   * of it is first drawn. The caller draws the tiles again (`updateTiles`); the hover follows here.
   */
  setSkins(skins: TileSkins): void {
    this.skins = skins;
    this.assets.setSkins(skins);
    this.refreshHover();
  }

  /** Draws the last hover again if its model changed (a variant came in, the skins changed); true when it did. */
  refreshHover(): boolean {
    const before = this.previewKey;
    if (this.hoverState) this.setHover(this.hoverState);
    return this.previewKey !== before;
  }

  /** The pending (translucent, blue glow) variant of a tile material, one per source material. */
  private pendingMaterial(material: THREE.Material | THREE.Material[]): THREE.Material {
    if (material instanceof THREE.MeshStandardMaterial) {
      let pending = this.pendingMaterials.get(material);
      if (!pending) {
        const clone = material.clone();
        // `Material.copy` leaves the shader patch out: a pending tile has the water and dims or lights as the others.
        clone.onBeforeCompile = material.onBeforeCompile;
        clone.customProgramCacheKey = material.customProgramCacheKey;
        clone.transparent = true;
        clone.opacity = 0.55;
        clone.emissive = new THREE.Color(0x4488ff);
        clone.emissiveIntensity = 0.5;
        pending = clone;
        this.pendingMaterials.set(material, pending);
      }
      return pending;
    }
    this.pendingFallbackMaterial ??= new THREE.MeshStandardMaterial({
      color: 0xaaaaaa,
      transparent: true,
      opacity: 0.55,
      emissive: new THREE.Color(0x4488ff),
      emissiveIntensity: 0.5,
    });
    return this.pendingFallbackMaterial;
  }

  /** The model of a plan type or a skin's variant, its materials tuned once; tiles are clones that share them. */
  private tileType(key: string): THREE.Group {
    let model = this.tileTypes.get(key);
    if (model) return model;

    model = this.assets.getModel(key);
    const meshes: THREE.Mesh[] = [];
    model.traverse((child) => {
      if (child instanceof THREE.Mesh) meshes.push(child);
    });
    for (const child of meshes) {
      // Preserve emissive, set roughness
      if (child.material instanceof THREE.MeshStandardMaterial) {
        child.material.roughness = THREE.MathUtils.clamp(
          child.material.roughness,
          TILE_MIN_ROUGHNESS,
          TILE_MAX_ROUGHNESS,
        );
        child.material.metalness = THREE.MathUtils.clamp(
          child.material.metalness,
          TILE_MIN_METALNESS,
          TILE_MAX_METALNESS,
        );
        child.material.envMapIntensity = Math.max(child.material.envMapIntensity, 0.65);
        this.patchTileShader(child.material, child.geometry, this.labelUniformsOf(child.geometry));
      }
      child.castShadow = true;
      child.receiveShadow = true;

      // Outlines (toon-style), built once per type; their width follows the zoom (outlines.ts)
      child.add(createOutline(buildEdgesGeometry(child.geometry), this.edgeMaterial));
    }
    this.tileTypes.set(key, model);
    if (this.labelling) this.queueLabels(key, model);
    return model;
  }

  /** The label uniforms of a model geometry, made once (an empty map until `labelFeatures` fills it). */
  private labelUniformsOf(geometry: THREE.BufferGeometry): LabelUniforms {
    let uniforms = this.labelMaps.get(geometry);
    if (!uniforms) {
      uniforms = { uLabelMap: { value: this.emptyLabelMap }, uGridMatrix: { value: new THREE.Matrix4() } };
      this.labelMaps.set(geometry, uniforms);
    }
    return uniforms;
  }

  /**
   * Calls `listener` after each model labelled (`labelFeatures`, one per idle slice): the scene draws its tiles again
   * with their labels. One listener; null removes it.
   */
  onLabelled(listener: (() => void) | null): void {
    this.labelledListener = listener;
  }

  /** Resolves once every model asked for is labelled (or the classifier failed to load): for tests and captures. */
  whenLabelled(): Promise<void> {
    if (!this.labelQueue.length && !this.labelScheduled) return Promise.resolve();
    return new Promise((resolve) => this.labelWaiters.push(resolve));
  }

  /** A model to label, in its turn (`scheduleLabels`); one with no plan or no known palette is never labelled. */
  private queueLabels(key: string, model: THREE.Group): void {
    if (!planKeyOfModel(key) || !paletteOfModel(key)) return;
    this.labelQueue.push([key, model]);
    this.scheduleLabels();
  }

  /**
   * Labels the next model in the queue when the main thread is idle, one model a slice (about 6 to 18 ms each), the
   * classifier loaded first (its own chunk). A classifier that fails to load leaves every model unlabelled (nothing
   * lights), with a warning.
   */
  private scheduleLabels(): void {
    if (this.labelScheduled || this.disposed) return;
    if (!this.labelQueue.length) {
      for (const resolve of this.labelWaiters.splice(0)) resolve();
      return;
    }
    this.labelScheduled = true;
    this.classifier ??= import("./features");
    this.classifier.then(
      (classifier) =>
        whenIdle(() => {
          this.labelScheduled = false;
          if (this.disposed) return;
          const next = this.labelQueue.shift();
          if (next) {
            this.labelFeatures(classifier, ...next);
            this.labelledListener?.();
          }
          this.scheduleLabels();
        }),
      (error: unknown) => {
        console.warn("[TileRenderer] the feature classifier did not load, nothing is labelled:", error);
        this.labelScheduled = false;
        this.labelQueue = [];
        this.scheduleLabels();
      },
    );
  }

  /**
   * The label map of each of a model's meshes (`features.ts`), once per geometry: its columns' labels and the matrix from
   * the geometry to its grid, which every tile of the model reads, with its palette's classes (`paletteOfModel`). A model
   * id that names no plan, or a palette with no class table, is left unlabelled: its tiles never light.
   */
  private labelFeatures(classifier: typeof Classifier, key: string, model: THREE.Group): void {
    const plan = planKeyOfModel(key);
    const palette = paletteOfModel(key);
    if (!plan || !palette) return;
    const layout = planLayout(plan);
    model.updateMatrixWorld(true);
    const toRoot = model.matrixWorld.clone().invert();
    model.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || isOutline(child)) return;
      const uniforms = this.labelUniformsOf(child.geometry);
      if (uniforms.uLabelMap.value !== this.emptyLabelMap) return;
      const toModel = toRoot.clone().multiply(child.matrixWorld);
      const { columns, grid } = classifier.labelTileColumns(child.geometry, layout, toModel, classifier.PALETTE_CLASSES[palette]);
      uniforms.uLabelMap.value = labelMapTexture(classifier.packLabels(columns), columns.size);
      uniforms.uGridMatrix.value
        .makeScale(1 / grid.cell, 1 / grid.cell, 1 / grid.cell)
        .multiply(new THREE.Matrix4().makeTranslation(-grid.minX, -grid.minY, -grid.minZ))
        .multiply(toModel);
    });
  }

  /**
   * The tile shader: the water texels brighter and glossier (`LookSettings.water`), the mask (`WATER_MASK_GLSL`) after the
   * palette is read, the roughness after it is set; then the feature highlight (`FEATURE_HIGHLIGHT_GLSL`), from the
   * fragment's place on the model's grid (`uGridMatrix`, `uLabelMap`) and the tile's cell, from its model matrix and the
   * footprint's centre (`uFootprint`): those three are the geometry's own, the rest shared. Every patched material
   * compiles to one program.
   */
  private patchTileShader(material: THREE.MeshStandardMaterial, geometry: THREE.BufferGeometry, labels: LabelUniforms): void {
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const footprint = { value: geometry.boundingBox!.getCenter(new THREE.Vector3()) };
    const uniforms = { ...this.waterUniforms, ...this.featureUniforms, ...this.structureUniforms, ...labels, uFootprint: footprint };
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader.replace(
        "void main() {",
        [
          "uniform vec3 uFootprint;",
          "uniform float uTileSize;",
          "uniform mat4 uGridMatrix;",
          "uniform mat4 uBoardInverse;",
          "varying vec3 vGrid;",
          "varying vec3 vGridNormal;",
          "flat varying vec2 vCell;",
          "void main() {",
          "  vGrid = (uGridMatrix * vec4(position, 1.0)).xyz;",
          "  vGridNormal = mat3(uGridMatrix) * normal;",
          "  vCell = floor((uBoardInverse * modelMatrix * vec4(uFootprint, 1.0)).xz / uTileSize + 0.5);",
        ].join("\n"),
      );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "void main() {",
          [
            "uniform float uWaterOn;",
            "uniform float uWaterBrightness;",
            "uniform float uWaterRoughness;",
            "uniform float uFeatureOn;",
            "uniform float uFeature;",
            "uniform vec3 uFeatureColor;",
            "uniform float uFeatureTint;",
            "uniform float uFeatureGlow;",
            "uniform float uFeatureDim;",
            "uniform float uStructureOn;",
            "uniform sampler2D uLitMap;",
            "uniform vec4 uLitRect;",
            "uniform sampler2D uLabelMap;",
            "varying vec3 vGrid;",
            "varying vec3 vGridNormal;",
            "flat varying vec2 vCell;",
            "void main() {",
          ].join("\n"),
        )
        .replace("#include <map_fragment>", `#include <map_fragment>\n${WATER_MASK_GLSL}\n${FEATURE_HIGHLIGHT_GLSL}`)
        .replace(
          "#include <roughnessmap_fragment>",
          "#include <roughnessmap_fragment>\n  roughnessFactor = mix(roughnessFactor, uWaterRoughness, waterMask);",
        )
        .replace(
          "#include <emissivemap_fragment>",
          "#include <emissivemap_fragment>\n  totalEmissiveRadiance += uFeatureColor * uFeatureGlow * featureLit;",
        );
    };
    material.customProgramCacheKey = () => "paved-tile";
  }

  /**
   * The highlights' colours, the water and the feature highlight (`LookSettings`): shared materials and uniforms, nothing
   * rebuilt. Turning the feature highlight on labels the models drawn (and those drawn later), once each.
   */
  setLook(
    highlights: LookSettings["highlights"],
    water: LookSettings["water"],
    featureHighlight: LookSettings["featureHighlight"] = LOOK_PRESETS.mockup.featureHighlight,
  ): void {
    this.look = { highlights, water, featureHighlight };
    this.waterUniforms.uWaterOn.value = water.enabled ? 1 : 0;
    this.waterUniforms.uWaterBrightness.value = water.brightness;
    this.waterUniforms.uWaterRoughness.value = water.roughness;
    const features = this.featureUniforms;
    features.uFeature.value = FEATURE_CODE[featureHighlight.feature] ?? FEATURE_CODE.city;
    features.uFeatureColor.value.set(featureHighlight.color);
    features.uFeatureTint.value = featureHighlight.tint;
    features.uFeatureGlow.value = featureHighlight.glow;
    features.uFeatureDim.value = featureHighlight.dim;
    this.applyHighlight();
  }

  /**
   * Lights one structure across its tiles (FEATURE-HL): each tile's areas in `lit` are tinted and glow with the look's
   * feature highlight (`LookSettings.featureHighlight`: colour, tint, glow, dim; its `enabled` and `feature` do not
   * apply), the rest of the board dimmed. A tile not drawn yet is lit when it comes. Null goes back to the look's
   * feature highlight, or to no highlight. The voxels are labelled on the first call, as for the feature highlight.
   */
  setLitAreas(lit: Iterable<LitTile> | null): void {
    if (lit === null) this.litAreas = null;
    else {
      // A tile listed more than once (two structures that share it) lights the areas of each.
      this.litAreas = new Map();
      for (const { gameId, id, areas } of lit) this.litAreas.set(`${gameId}-${id}`, (this.litAreas.get(`${gameId}-${id}`) ?? 0) | areas);
    }
    this.applyHighlight();
    this.buildLitMap();
  }

  /**
   * The highlight's switches from the look and the lit structure; when one comes on, the models drawn are queued for
   * their labels (`scheduleLabels`): each lights when its turn comes.
   */
  private applyHighlight(): void {
    const on = this.look.featureHighlight.enabled || this.litAreas !== null;
    this.featureUniforms.uFeatureOn.value = on ? 1 : 0;
    this.structureUniforms.uStructureOn.value = this.litAreas !== null ? 1 : 0;
    if (on && !this.labelling) for (const [key, model] of this.tileTypes) this.queueLabels(key, model);
    this.labelling = on;
  }

  /**
   * The lit map (`structureUniforms`): the lit tiles' masks at their cells, over the smallest rectangle that holds them.
   * Built again only when the lit tiles, their masks or their cells change; a lit tile not given yet has no cell.
   */
  private buildLitMap(): void {
    const cells: [number, number, number][] = [];
    for (const [key, mask] of this.litAreas ?? []) {
      const cell = this.tileCells.get(key);
      if (cell && mask) cells.push([cell[0], cell[1], mask]);
    }
    const key = JSON.stringify(cells);
    if (key === this.litKey) return;
    this.litKey = key;
    const uniforms = this.structureUniforms;
    uniforms.uLitMap.value.dispose();
    if (!cells.length) {
      uniforms.uLitMap.value = emptyLitMap();
      uniforms.uLitRect.value.set(0, 0, 0, 0);
      return;
    }
    const [minX, minZ] = [Math.min(...cells.map((c) => c[0])), Math.min(...cells.map((c) => c[1]))];
    const width = Math.max(...cells.map((c) => c[0])) - minX + 1;
    const depth = Math.max(...cells.map((c) => c[1])) - minZ + 1;
    const data = new Float32Array(width * depth);
    for (const [x, z, mask] of cells) data[(z - minZ) * width + (x - minX)] = mask;
    uniforms.uLitMap.value = litMap(data, width, depth);
    uniforms.uLitRect.value.set(minX, minZ, width, depth);
  }

  private createVoxelTile(tile: TileRenderData, key: string): THREE.Object3D | null {
    return this.placedModel(key, tile.orientation);
  }

  /** A tile of model `key` turned to `orientation`, in a container at the cell's origin: shares the type's everything. */
  private placedModel(key: string, orientation: number): THREE.Object3D | null {
    try {
      // Shares the type's geometry, materials and edge outlines
      const model = this.tileType(key).clone();

      // Apply rotation based on orientation
      model.rotation.y = ROTATION[Orientation.from(orientation).value] ?? 0;

      // Scale model to fit tile size, then center at origin
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.z);
      if (maxDim > 0) {
        const scale = this.squareSize / maxDim;
        model.scale.setScalar(scale);
      }

      // Re-compute box after scaling, center XZ at origin, bottom at Y=0
      const scaledBox = new THREE.Box3().setFromObject(model);
      const center = scaledBox.getCenter(new THREE.Vector3());
      model.position.set(-center.x, -scaledBox.min.y, -center.z);

      // Wrap in container so grid positioning doesn't overwrite centering offset
      const container = new THREE.Group();
      container.add(model);
      return container;
    } catch {
      return null;
    }
  }

  private createStrategyTile(tile: TileRenderData): THREE.Object3D | null {
    const plan = Plan.from(tile.plan);
    const key = getPlanKey(plan.value);
    if (key === "00") return null;

    try {
      const texture = this.assets.getTexture(`tile-${key}`);

      // Rotate texture based on orientation
      const orientation = Orientation.from(tile.orientation);

      // One top material per plan type and orientation, shared by its tiles
      const topKey = `${key}-${orientation.value}`;
      let top = this.strategyTopMaterials.get(topKey);
      if (!top) {
        const clonedTexture = texture.clone();
        clonedTexture.center.set(0.5, 0.5);
        clonedTexture.rotation = ROTATION[orientation.value] ?? 0;
        clonedTexture.needsUpdate = true;
        top = new THREE.MeshBasicMaterial({ map: clonedTexture });
        this.strategyTopMaterials.set(topKey, top);
      }

      this.strategyGeometry ??= new THREE.BoxGeometry(this.squareSize, STRATEGY_THICKNESS, this.squareSize);
      const side = (this.strategySideMaterial ??= new THREE.MeshBasicMaterial({ color: 0x333333 }));

      // Top face has the tile texture, other faces are dark
      const materials = [
        side, // right
        side, // left
        top, // top
        side, // bottom
        side, // front
        side, // back
      ];

      const mesh = new THREE.Mesh(this.strategyGeometry, materials);
      return mesh;
    } catch {
      return null;
    }
  }

  /**
   * The placeholder of a tile whose model is not in yet (a variant or a base model on its way): the plan view's image of
   * its plan on a flat quad at the ground's top (`PLACEHOLDER_HEIGHT`), turned to its orientation, with its square's
   * outline. The image is the one the loader loads before the first frame (`AssetLoader.preloadAll`): nothing is
   * downloaded for it. Null when that image is not in either (it failed to load) or for plan 0.
   */
  private createPlaceholder(plan: number, orientation: number): THREE.Object3D | null {
    const type = this.placeholderType(plan);
    if (!type) return null;
    const quad = type.clone();
    quad.rotation.y = ROTATION[Orientation.from(orientation).value] ?? 0;
    quad.position.y = PLACEHOLDER_HEIGHT;
    const container = new THREE.Group();
    container.add(quad);
    container.userData.placeholder = true;
    return container;
  }

  /** The placeholder of a plan, made once: the shared quad and outline, the plan's own material. Tiles are clones. */
  private placeholderType(plan: number): THREE.Mesh | null {
    const key = getPlanKey(Plan.from(plan).value);
    if (key === "00") return null;
    let type = this.placeholderTypes.get(key);
    if (type) return type;
    // Peeked, not asked for: a missing image is the loader's to fetch again, and must not count as the plan view asking.
    const image = this.assets.peekTexture(`tile-${key}`);
    if (!image) return null;
    if (!this.placeholderGeometry) {
      // A flat square, its image's top edge to the north as on the plan view's tile (`createStrategyTile`)
      this.placeholderGeometry = new THREE.PlaneGeometry(this.squareSize, this.squareSize).rotateX(-Math.PI / 2);
      this.placeholderOutline = createOutline(buildEdgesGeometry(this.placeholderGeometry), this.edgeMaterial);
    }
    // Its own copy of the image to read it as sRGB, as the models' palettes are: the same picture, nothing fetched. The
    // plan view reads the loader's texture as is (no colour space), so a plan shown both ways is uploaded twice (256 px
    // each, TEX). One colour space for both is not possible: the plan view in sRGB differs by about 30 dE (it is drawn as is).
    const map = image.clone();
    map.colorSpace = THREE.SRGBColorSpace;
    map.needsUpdate = true;
    const material = new THREE.MeshStandardMaterial({ map, roughness: TILE_MAX_ROUGHNESS, metalness: TILE_MIN_METALNESS });
    type = new THREE.Mesh(this.placeholderGeometry, material);
    type.receiveShadow = true;
    type.add(this.placeholderOutline!.clone());
    this.placeholderTypes.set(key, type);
    return type;
  }

  /**
   * The ghost: the tile in hand drawn on a cell as the board would draw it (its model, or its placeholder quad while the
   * model loads), under a pale veil; `placed` adds the aura and the cell's solid border. `valid` false (its rotation does
   * not fit there) turns them red (`placementTone`). It shares the type's geometry and materials: nothing to dispose.
   */
  setHover(state: HoverState | null): void {
    this.hoverState = state;
    if (!state) {
      if (this.previewContainer) {
        this.previewGroup.remove(this.previewContainer);
        this.previewContainer = null;
      }
      this.previewKey = null;
      this.placement.clearGhost();
      return;
    }

    // The ghost draws the variant of the cell it hovers (`HoverState.cell`); without one, the board's centre of game 0 (the
    // hand's), so a skinned plan's base model is not asked for just for a ghost.
    const cell = state.cell ?? { x: CENTER_CELL, y: CENTER_CELL, gameId: 0 };
    const planModel = this.modelOf(state.planIndex, cell.x, cell.y, cell.gameId);
    // No model in yet: the placeholder quad meanwhile, as a placed tile's (`createPlaceholder`), when its image is in.
    const quad = planModel === null ? this.placeholderType(state.planIndex) : null;
    const placed = !!state.placed;
    const key = `${state.planIndex}-${state.orientation}-${state.valid ? 1 : 0}-${placed ? "placed" : "hover"}-${planModel ?? (quad ? "quad" : "none")}`;
    if (this.previewContainer && this.previewKey === key) {
      this.previewContainer.position.set(state.x * this.squareSize, 0, state.y * this.squareSize);
      this.placement.setGhostCell(placed ? { x: state.x, y: state.y } : null);
      return;
    }

    if (this.previewContainer) {
      this.previewGroup.remove(this.previewContainer);
      this.previewContainer = null;
    }
    this.previewKey = key;

    const model = this.ghostModel(state.planIndex, state.orientation, planModel);
    if (!model) {
      // No model and no image yet: no ghost (drawn when one comes in, `refreshHover`), and no aura or veil left at the
      // last ghost's cell.
      this.placement.clearGhost();
      if (planModel === null && !quad) return;
      this.previewKey = null;
      return;
    }
    const container = new THREE.Group();
    container.add(model);
    container.position.set(state.x * this.squareSize, 0, state.y * this.squareSize);
    this.placement.dressGhost(container, model, { x: state.x, y: state.y }, placed, state.valid, now());
    this.previewGroup.add(container);
    this.previewContainer = container;
  }

  /**
   * The ghost's model: the tile as the board draws it, from the shared type (or its placeholder quad), casting no shadow
   * (the shadow map is the placed tiles'), neither lit nor dimmed by the feature highlight (`ghostMaterial`). Null when
   * neither the model nor the image is in.
   */
  private ghostModel(plan: number, orientation: number, planModel: string | null): THREE.Object3D | null {
    const model = planModel !== null ? this.placedModel(planModel, orientation) : this.createPlaceholder(plan, orientation);
    model?.traverse((child) => {
      child.castShadow = false;
      if (child instanceof THREE.Mesh && !isOutline(child) && child.material instanceof THREE.MeshStandardMaterial) {
        child.material = this.ghostMaterial(child.material);
      }
    });
    return model;
  }

  /**
   * A tile material as the ghost draws it (FEATURE-HL with SLOTS): the type's own, with its water, but the feature
   * highlight held off (`uFeatureOn` 0), so the tile in hand is neither lit nor dimmed under its veil. One copy per type
   * material, owned here; the same program (`paved-tile`), so no recompile. A material with no tile patch (the
   * placeholder quad's) is the type's own.
   */
  private ghostMaterial(material: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
    const patch = material.onBeforeCompile;
    if (material.customProgramCacheKey() !== "paved-tile") return material;
    let ghost = this.ghostMaterials.get(material);
    if (!ghost) {
      ghost = material.clone();
      // `Material.copy` leaves the shader patch out: the ghost's runs it, then holds the highlight off.
      ghost.onBeforeCompile = (shader, renderer) => {
        patch.call(material, shader, renderer);
        shader.uniforms.uFeatureOn = GHOST_FEATURE_OFF;
      };
      ghost.customProgramCacheKey = material.customProgramCacheKey;
      this.ghostMaterials.set(material, ghost);
    }
    return ghost;
  }

  /**
   * The confirm of a placement (SLOTS): its veil and aura at the cell, turning green and fading out over the tile the
   * board now draws there. The same confirm given again changes nothing; null removes it. `key` tells two confirms apart
   * (a tile's id).
   */
  setConfirmed(state: (HoverState & { key?: string | number }) | null): void {
    const key = state ? `${state.key ?? ""}:${state.x},${state.y}:${state.planIndex}:${state.orientation}` : null;
    if (key === this.confirmKey) return;
    this.confirmKey = key;
    if (!state) {
      this.placement.startConfirm(null, null, now());
      return;
    }
    const cell = state.cell ?? { x: CENTER_CELL, y: CENTER_CELL, gameId: 0 };
    const model = this.ghostModel(state.planIndex, state.orientation, this.modelOf(state.planIndex, cell.x, cell.y, cell.gameId));
    const container = new THREE.Group();
    container.position.set(state.x * this.squareSize, 0, state.y * this.squareSize);
    // The model is the veil's shape only: the board draws the tile itself.
    this.placement.startConfirm(container, model, now());
  }

  /** The legal slots of the tile in hand (any rotation), with whether the current rotation fits each (`PlacementRenderer`). */
  setAvailableSlots(slots: ReadonlyArray<PlacementSlot>): void {
    this.placement.setSlots(slots);
  }

  /** The placement visuals' settings, and the outlines' fade they follow on zoom-out. */
  setPlacementSettings(settings: PlacementSettings, outlines: OutlineFadeSettings): void {
    this.placement.setSettings(settings, outlines);
  }

  /** Reduced motion for the placement visuals. */
  setReducedMotion(reduced: boolean): void {
    this.placement.setReducedMotion(reduced);
  }

  /** The zoom the placement lines follow (their fade and the dashes). */
  setPlacementZoom(tilePx: number, openingTilePx: number, pixelRatio: number): void {
    this.placement.setZoom(tilePx, openingTilePx, pixelRatio);
  }

  /** Moves the placement effects to `time` (ms); `animating` while one still moves. */
  update(time: number = now()): PlacementUpdate {
    return this.placement.update(time);
  }

  /** Width, opacity and colour of every tile's outlines (one shared material): `outlineStroke` of the current zoom. */
  setOutlineStroke(stroke: OutlineStroke, color?: string): void {
    applyOutlineStroke(this.edgeMaterial, stroke, color);
  }

  setStrategyMode(on: boolean): void {
    if (this.strategyMode === on) return;
    this.strategyMode = on;
    // Clear and re-render all tiles in new mode
    // Caller should call updateTiles() after this
    for (const [, entry] of this.tileMeshes) {
      this.tileGroup.remove(entry.mesh);
    }
    this.tileMeshes.clear();
  }

  dispose(): void {
    for (const [, entry] of this.tileMeshes) {
      this.tileGroup.remove(entry.mesh);
    }
    this.tileMeshes.clear();
    this.previewGroup.clear();
    this.emptyGroup.clear();
    this.previewContainer = null;
    this.previewKey = null;
    this.confirmKey = null;
    this.hoverState = null;
    this.placement.dispose();

    for (const model of this.tileTypes.values()) {
      model.traverse((child) => {
        if (isOutline(child)) (child as THREE.Mesh).geometry.dispose();
        else if (child instanceof THREE.Mesh) disposeMaterials(child.material);
      });
    }
    this.tileTypes.clear();
    this.pendingMaterials.forEach((material) => material.dispose());
    this.pendingMaterials.clear();
    this.pendingFallbackMaterial?.dispose();
    this.pendingFallbackMaterial = null;
    this.ghostMaterials.forEach((material) => material.dispose());
    this.ghostMaterials.clear();
    this.edgeMaterial.dispose();
    this.strategyGeometry?.dispose();
    this.strategyGeometry = null;
    this.strategySideMaterial?.dispose();
    this.strategySideMaterial = null;
    this.strategyTopMaterials.forEach((material) => {
      material.map?.dispose();
      material.dispose();
    });
    this.strategyTopMaterials.clear();
    this.placeholderTypes.forEach((type) => {
      const material = type.material as THREE.MeshStandardMaterial;
      material.map?.dispose();
      material.dispose();
    });
    this.placeholderTypes.clear();
    this.placeholderGeometry?.dispose();
    this.placeholderGeometry = null;
    this.placeholderOutline?.geometry.dispose();
    this.placeholderOutline = null;
    this.structureUniforms.uLitMap.value.dispose();
    for (const { uLabelMap } of this.labelMaps.values()) if (uLabelMap.value !== this.emptyLabelMap) uLabelMap.value.dispose();
    this.labelMaps.clear();
    this.emptyLabelMap.dispose();
    this.labelling = false;
    this.disposed = true;
    this.labelQueue = [];
    this.labelledListener = null;
    for (const resolve of this.labelWaiters.splice(0)) resolve();
    this.litAreas = null;
    this.tileCells.clear();
    this.litKey = "";
  }
}

/** A lit map (`TileRenderer.buildLitMap`): one float texel per cell, the cell's mask, read exactly (`texelFetch`). */
function litMap(data: Float32Array, width: number, depth: number): THREE.DataTexture {
  const texture = new THREE.DataTexture(data, width, depth, THREE.RedFormat, THREE.FloatType);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/** A model's label map (`packLabels`): one byte a column, `size` columns a side, read exactly (`texelFetch`). */
function labelMapTexture(data: Uint8Array, size: number): THREE.DataTexture {
  const texture = new THREE.DataTexture(data, size, size, THREE.RedFormat, THREE.UnsignedByteType);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}

/** The lit map with no lit tile: one empty texel (the sampler is always bound). */
function emptyLitMap(): THREE.DataTexture {
  return litMap(new Float32Array(1), 1, 1);
}

/** The ghost's feature switch (`TileRenderer.ghostMaterial`): always off. */
const GHOST_FEATURE_OFF = { value: 0 };

/** The time the placement effects run on, ms. */
function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function disposeMaterials(material: THREE.Material | THREE.Material[]): void {
  if (Array.isArray(material)) {
    material.forEach((m) => m.dispose());
  } else {
    material.dispose();
  }
}
