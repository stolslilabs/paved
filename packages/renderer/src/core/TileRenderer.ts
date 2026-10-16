import * as THREE from "three";
import { getPlanKey, Plan, PlanType, Orientation, OrientationType } from "@paved/game-core";
import type { AssetLoader } from "./AssetLoader";
import { buildEdgesGeometry } from "./edges";
import { applyOutlineStroke, createOutline, createOutlineMaterial, isOutline, type OutlineStroke } from "./outlines";
import { TILE_SIZE } from "./types";
import type { TileRenderData, HoverState } from "./types";
import { LOOK_PRESETS, type LookSettings } from "./look";
import { CENTER_CELL, NO_SKINS, skinRef, type TileSkins } from "./skins";

// Material constants from TileTexture
const TILE_MIN_ROUGHNESS = 0.35;
const TILE_MAX_ROUGHNESS = 0.95;
const TILE_MIN_METALNESS = 0.02;
const TILE_MAX_METALNESS = 0.45;
const STRATEGY_THICKNESS = 0.1;

// Validity overlay colors & opacities
const VALID_IDLE_COLOR = 0x00ff00; // green
const VALID_IDLE_OPACITY = 0.5;
const VALID_COLOR = 0xff0000; // red
const VALID_OPACITY = 0.2;
const INVALID_COLOR = 0xffa500; // orange
const INVALID_OPACITY = 0.4;
const HOVER_COLOR = 0xadd8e6; // light blue
const HOVER_OPACITY = 0.004;
const INVALID_GHOST_COLOR = 0xff3b30;

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
 * The empty slot's outline: a square band just inside the tile's edge (a tile is `TILE_SIZE`, half 1.5), from 1.30 to
 * 1.42 of half-width. `RingGeometry` with 4 segments is a square standing on a corner: its radius is the half-width
 * times the square root of 2.
 */
const SLOT_INNER = 1.3 * Math.SQRT2;
const SLOT_OUTER = 1.42 * Math.SQRT2;

/**
 * The water of the tile palettes: its texels are cyan-blue (blue above green above red, in linear colour: (0, 130, 167)
 * and (90, 157, 194) in sRGB, among others), the palette's roofs and banners are violet (green under red) and its
 * stone grey. The mask picks the first by hue and nothing else; `uWaterOn` at 0 turns it off.
 */
export const WATER_MASK_GLSL = /* glsl */ `
  float waterMask = uWaterOn
    * smoothstep(1.1, 1.2, diffuseColor.b / max(diffuseColor.g, 1e-4))
    * smoothstep(1.5, 1.7, diffuseColor.g / max(diffuseColor.r, 1e-4));
  diffuseColor.rgb *= mix(1.0, uWaterBrightness, waterMask);
`;

/** The look's parts the tiles draw: the slots' and ghost's highlights, and the water. */
export type TileLook = Pick<LookSettings, "highlights" | "water">;

export class TileRenderer {
  private group: THREE.Group;
  private tileGroup: THREE.Group; // placed tiles
  private emptyGroup: THREE.Group; // empty slots
  private previewGroup: THREE.Group; // hover preview
  /**
   * Each tile drawn, with the model it was drawn from (a plan key or a variant's path; null in the plan view, and for the
   * placeholder quad drawn while its model is on its way).
   */
  private tileMeshes: Map<string, { mesh: THREE.Object3D; pending: boolean; model: string | null }> = new Map();
  private assets: AssetLoader;
  private strategyMode = false;
  private squareSize = TILE_SIZE;
  private previewContainer: THREE.Group | null = null;
  private previewKey: string | null = null;
  private previewValid = false;
  /** The last hover given: drawn again when its model comes in (`refreshHover`). */
  private hoverState: HoverState | null = null;
  /** The theme of each plan (`setSkins`): its tiles draw a variant of it. */
  private skins: TileSkins = NO_SKINS;

  // Shared by every tile and owned here: tiles hold no geometry or material of their own.
  // The model of each plan type, or of each variant of a skin, with its tuned materials (its geometry is the loader's).
  private tileTypes: Map<string, THREE.Group> = new Map();
  private pendingMaterials: Map<THREE.Material, THREE.Material> = new Map();
  private pendingFallbackMaterial: THREE.Material | null = null;
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
  private slotGeometry: THREE.BufferGeometry | null = null;
  private slotMaterial: THREE.MeshBasicMaterial | null = null;
  private look: TileLook = LOOK_PRESETS.mockup;
  /** The water's uniforms, shared by every patched tile material (`patchWater`): a look change sets them, no recompile. */
  private waterUniforms = {
    uWaterOn: { value: 1 },
    uWaterBrightness: { value: 1 },
    uWaterRoughness: { value: 1 },
  };

  constructor(assets: AssetLoader) {
    this.assets = assets;
    this.group = new THREE.Group();
    this.tileGroup = new THREE.Group();
    this.emptyGroup = new THREE.Group();
    this.previewGroup = new THREE.Group();
    this.group.add(this.tileGroup, this.emptyGroup, this.previewGroup);
  }

  getGroup(): THREE.Group {
    return this.group;
  }

  /** Draws the tiles given; true when it added or removed one (a tile whose model is not in yet is added later). */
  updateTiles(tiles: TileRenderData[]): boolean {
    const currentKeys = new Set<string>();
    let changed = false;

    for (const tile of tiles) {
      const key = `${tile.game_id}-${tile.id}`;
      currentKeys.add(key);

      const existing = this.tileMeshes.get(key);
      const pending = !!tile.pending;
      // A model not in yet keeps the model drawn (a variant until its base model comes, SKIN-BASE); with none drawn, the
      // placeholder quad (null) until one comes, so a tile is never empty.
      const model = this.strategyMode ? null : (this.modelOf(tile.plan, tile.x, tile.y, tile.game_id) ?? existing?.model ?? null);

      // Skip if already rendered with same pending state and model
      if (existing && existing.pending === pending && existing.model === model) continue;

      // Pending state or model changed: the new mesh replaces the old one in this call, so no frame shows the cell empty
      // or both at once (a tile owns no geometry or material)
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
        this.tileMeshes.set(key, { mesh, pending, model });
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
        this.patchWater(child.material);
      }
      child.castShadow = true;
      child.receiveShadow = true;

      // Outlines (toon-style), built once per type; their width follows the zoom (outlines.ts)
      child.add(createOutline(buildEdgesGeometry(child.geometry), this.edgeMaterial));
    }
    this.tileTypes.set(key, model);
    return model;
  }

  /**
   * The water texels of a tile material brighter and glossier (`LookSettings.water`): the mask (`WATER_MASK_GLSL`) after
   * the palette is read, the roughness after it is set. Every patched material compiles to one program.
   */
  private patchWater(material: THREE.MeshStandardMaterial): void {
    const uniforms = this.waterUniforms;
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.fragmentShader = shader.fragmentShader
        .replace("void main() {", "uniform float uWaterOn;\nuniform float uWaterBrightness;\nuniform float uWaterRoughness;\nvoid main() {")
        .replace("#include <map_fragment>", `#include <map_fragment>\n${WATER_MASK_GLSL}`)
        .replace(
          "#include <roughnessmap_fragment>",
          "#include <roughnessmap_fragment>\n  roughnessFactor = mix(roughnessFactor, uWaterRoughness, waterMask);",
        );
    };
    material.customProgramCacheKey = () => "paved-tile-water";
  }

  /** The highlights' colours and the water (`LookSettings`): shared materials and uniforms, nothing rebuilt. */
  setLook(highlights: LookSettings["highlights"], water: LookSettings["water"]): void {
    this.look = { highlights, water };
    this.waterUniforms.uWaterOn.value = water.enabled ? 1 : 0;
    this.waterUniforms.uWaterBrightness.value = water.brightness;
    this.waterUniforms.uWaterRoughness.value = water.roughness;
    this.slotMaterial?.color.copy(slotColor(highlights));
    if (this.previewContainer && this.previewKey) {
      // The ghost's tint is set when it is made: make it again with the new one.
      const container = this.previewContainer;
      container.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial && this.previewValid) {
          child.material.emissive.set(highlights.ghostColor);
          child.material.emissiveIntensity = highlights.ghostIntensity;
        }
      });
    }
  }

  private createVoxelTile(tile: TileRenderData, key: string): THREE.Object3D | null {
    try {
      // Shares the type's geometry, materials and edge outlines
      const model = this.tileType(key).clone();

      // Apply rotation based on orientation
      model.rotation.y = ROTATION[Orientation.from(tile.orientation).value] ?? 0;

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
    const image = this.assets.peekTexture(`quad-${key}`);
    if (!image) return null;
    if (!this.placeholderGeometry) {
      // A flat square, its image's top edge to the north as on the plan view's tile (`createStrategyTile`)
      this.placeholderGeometry = new THREE.PlaneGeometry(this.squareSize, this.squareSize).rotateX(-Math.PI / 2);
      this.placeholderOutline = createOutline(buildEdgesGeometry(this.placeholderGeometry), this.edgeMaterial);
    }
    // Its own copy of the image to read it as sRGB, as the models' palettes are: the same picture, nothing fetched. The
    // plan view reads the loader's texture as is (no colour space), so a plan shown both ways is uploaded twice.
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

  setHover(state: HoverState | null): void {
    this.hoverState = state;
    if (!state) {
      if (this.previewContainer) {
        this.previewGroup.remove(this.previewContainer);
        this.disposePreview(this.previewContainer);
        this.previewContainer = null;
      }
      this.previewKey = null;
      return;
    }

    // The ghost draws the variant of the cell it hovers (`HoverState.cell`); without one, the board's centre of game 0 (the
    // hand's), so a skinned plan's base model is not asked for just for a ghost.
    const cell = state.cell ?? { x: CENTER_CELL, y: CENTER_CELL, gameId: 0 };
    const planModel = this.modelOf(state.planIndex, cell.x, cell.y, cell.gameId);
    // No model in yet: the placeholder quad meanwhile, as a placed tile's (`createPlaceholder`), when its image is in.
    const quad = planModel === null ? this.placeholderType(state.planIndex) : null;
    const key = `${state.planIndex}-${state.orientation}-${state.valid ? 1 : 0}-${planModel ?? (quad ? "quad" : "none")}`;
    if (this.previewContainer && this.previewKey === key) {
      this.previewContainer.position.set(
        state.x * this.squareSize,
        0,
        state.y * this.squareSize
      );
      return;
    }

    if (this.previewContainer) {
      this.previewGroup.remove(this.previewContainer);
      this.disposePreview(this.previewContainer);
      this.previewContainer = null;
    }
    this.previewKey = key;

    // Create preview mesh
    if (planModel === null && !quad) return;

    try {
      // The model's materials are its own copies (its geometry is shared, see AssetLoader); the quad's its own copy of
      // its plan's (the image and the quad shared), with no outline, as the ghost's model has none.
      const model =
        planModel !== null
          ? this.assets.getModel(planModel)
          : new THREE.Mesh(quad!.geometry, (quad!.material as THREE.Material).clone());
      model.rotation.y = ROTATION[Orientation.from(state.orientation).value] ?? 0;

      // Tint the ghost: its own materials, with the look's gold glow where it fits (red where it does not)
      const { ghostColor, ghostIntensity } = this.look.highlights;
      const tintColor = new THREE.Color(state.valid ? ghostColor : INVALID_GHOST_COLOR);
      this.previewValid = state.valid;
      model.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          if (child.material instanceof THREE.MeshStandardMaterial) {
            child.material.transparent = true;
            child.material.opacity = 0.75;
            child.material.emissive = tintColor;
            child.material.emissiveIntensity = ghostIntensity;
          } else {
            disposeMaterials(child.material);
            child.material = new THREE.MeshStandardMaterial({
              color: 0xffffff,
              transparent: true,
              opacity: 0.75,
              emissive: tintColor,
              emissiveIntensity: ghostIntensity,
            });
          }
        }
      });

      if (planModel === null) {
        // The quad is the tile's size already: at the ground's top
        model.position.y = PLACEHOLDER_HEIGHT;
      } else {
        // Scale to fit tile size, then center
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
      }

      // Wrap in container for grid positioning
      const container = new THREE.Group();
      container.add(model);
      container.position.set(
        state.x * this.squareSize,
        0,
        state.y * this.squareSize
      );
      this.previewGroup.add(container);
      this.previewContainer = container;
    } catch {
      // Model not available
      this.previewKey = null;
    }
  }

  /** Show subtle ground indicators at valid placement positions */
  setAvailableSlots(slots: Array<{ x: number; y: number }>): void {
    // Clear previous indicators
    this.emptyGroup.clear();

    if (slots.length === 0) return;

    // Shared geometry and material for all indicators
    if (!this.slotGeometry) {
      this.slotGeometry = new THREE.RingGeometry(SLOT_INNER, SLOT_OUTER, 4);
      this.slotGeometry.rotateX(-Math.PI / 2); // lay flat on ground
      this.slotGeometry.rotateY(Math.PI / 4); // rotate 45° so the sides follow the tile's
    }
    // Emissive gold, brighter than 1 in linear colour so the bloom picks it out; no fog, so it glows at every distance.
    this.slotMaterial ??= new THREE.MeshBasicMaterial({
      color: slotColor(this.look.highlights),
      side: THREE.DoubleSide,
      depthWrite: false,
      fog: false,
    });

    for (const slot of slots) {
      const mesh = new THREE.Mesh(this.slotGeometry, this.slotMaterial);
      mesh.position.set(
        slot.x * this.squareSize,
        0.05, // just above ground to avoid z-fighting
        slot.y * this.squareSize,
      );
      this.emptyGroup.add(mesh);
    }
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

  /** The preview owns its materials, not its geometry (the loader's). */
  private disposePreview(obj: THREE.Object3D): void {
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        disposeMaterials(child.material);
      }
    });
  }

  dispose(): void {
    for (const [, entry] of this.tileMeshes) {
      this.tileGroup.remove(entry.mesh);
    }
    this.tileMeshes.clear();
    if (this.previewContainer) {
      this.disposePreview(this.previewContainer);
    }
    this.previewGroup.clear();
    this.emptyGroup.clear();
    this.previewContainer = null;
    this.previewKey = null;
    this.hoverState = null;

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
    this.slotGeometry?.dispose();
    this.slotGeometry = null;
    this.slotMaterial?.dispose();
    this.slotMaterial = null;
  }
}

/** The slots' colour: the look's gold at its intensity (above 1 in linear colour: it blooms). */
function slotColor(highlights: LookSettings["highlights"]): THREE.Color {
  return new THREE.Color(highlights.slotColor).multiplyScalar(highlights.slotIntensity);
}

function disposeMaterials(material: THREE.Material | THREE.Material[]): void {
  if (Array.isArray(material)) {
    material.forEach((m) => m.dispose());
  } else {
    material.dispose();
  }
}
