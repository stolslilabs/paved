import * as THREE from "three";
import { getPlanKey, Plan, PlanType, Orientation, OrientationType } from "@paved/game-core";
import type { AssetLoader } from "./AssetLoader";
import { TILE_SIZE } from "./types";
import type { TileRenderData, HoverState } from "./types";

// Material constants from TileTexture
const TILE_MIN_ROUGHNESS = 0.35;
const TILE_MAX_ROUGHNESS = 0.95;
const TILE_MIN_METALNESS = 0.02;
const TILE_MAX_METALNESS = 0.45;
const EDGE_COLOR = 0x000000;
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

export class TileRenderer {
  private group: THREE.Group;
  private tileGroup: THREE.Group; // placed tiles
  private emptyGroup: THREE.Group; // empty slots
  private previewGroup: THREE.Group; // hover preview
  private tileMeshes: Map<string, { mesh: THREE.Object3D; pending: boolean }> = new Map();
  private assets: AssetLoader;
  private strategyMode = false;
  private squareSize = TILE_SIZE;
  private previewContainer: THREE.Group | null = null;
  private previewKey: string | null = null;

  // Shared by every tile and owned here: tiles hold no geometry or material of their own.
  // The model of each plan type, with its tuned materials (its geometry is the loader's).
  private tileTypes: Map<string, THREE.Group> = new Map();
  private pendingMaterials: Map<THREE.Material, THREE.Material> = new Map();
  private pendingFallbackMaterial: THREE.Material | null = null;
  private edgeMaterial = new THREE.LineBasicMaterial({ color: EDGE_COLOR });
  private strategyGeometry: THREE.BoxGeometry | null = null;
  private strategySideMaterial: THREE.Material | null = null;
  private strategyTopMaterials: Map<string, THREE.MeshBasicMaterial> = new Map();
  private slotGeometry: THREE.BufferGeometry | null = null;
  private slotMaterial: THREE.Material | null = null;

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

  updateTiles(tiles: TileRenderData[]): void {
    const currentKeys = new Set<string>();

    for (const tile of tiles) {
      const key = `${tile.game_id}-${tile.id}`;
      currentKeys.add(key);

      const existing = this.tileMeshes.get(key);
      const pending = !!tile.pending;

      // Skip if already rendered with same pending state
      if (existing && existing.pending === pending) continue;

      // Pending state changed — remove old mesh to recreate
      if (existing) {
        this.tileGroup.remove(existing.mesh);
        this.disposeTile(existing.mesh);
        this.tileMeshes.delete(key);
      }

      const mesh = this.strategyMode
        ? this.createStrategyTile(tile)
        : this.createVoxelTile(tile);

      if (mesh) {
        // Apply pending loading style
        if (pending) {
          mesh.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.material = this.pendingMaterial(child.material);
            }
          });
        }

        mesh.position.set(
          tile.worldX * this.squareSize,
          0,
          tile.worldZ * this.squareSize
        );
        this.tileGroup.add(mesh);
        this.tileMeshes.set(key, { mesh, pending });
      }
    }

    // Remove tiles no longer present
    for (const [key, entry] of this.tileMeshes) {
      if (!currentKeys.has(key)) {
        this.tileGroup.remove(entry.mesh);
        this.disposeTile(entry.mesh);
        this.tileMeshes.delete(key);
      }
    }
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

  /** The model of a plan type, its materials tuned once; tiles are clones that share them. */
  private tileType(key: string): THREE.Group {
    let model = this.tileTypes.get(key);
    if (model) return model;

    model = this.assets.getModel(key);
    model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
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
        }
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    this.tileTypes.set(key, model);
    return model;
  }

  private createVoxelTile(tile: TileRenderData): THREE.Object3D | null {
    const plan = Plan.from(tile.plan);
    const key = getPlanKey(plan.value);
    if (key === "00") return null;

    try {
      // Shares the type's geometry and materials
      const model = this.tileType(key).clone();

      // Apply rotation based on orientation
      const orientation = Orientation.from(tile.orientation);
      const rotationMap: Record<string, number> = {
        [OrientationType.North]: 0,
        [OrientationType.East]: -Math.PI / 2,
        [OrientationType.South]: Math.PI,
        [OrientationType.West]: Math.PI / 2,
      };
      model.rotation.y = rotationMap[orientation.value] ?? 0;

      // Add edge outlines (toon-style)
      model.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const edges = new THREE.EdgesGeometry(child.geometry);
          const wireframe = new THREE.LineSegments(edges, this.edgeMaterial);
          wireframe.position.z += 0.001;
          child.add(wireframe);
        }
      });

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
      const rotationMap: Record<string, number> = {
        [OrientationType.North]: 0,
        [OrientationType.East]: -Math.PI / 2,
        [OrientationType.South]: Math.PI,
        [OrientationType.West]: Math.PI / 2,
      };

      // One top material per plan type and orientation, shared by its tiles
      const topKey = `${key}-${orientation.value}`;
      let top = this.strategyTopMaterials.get(topKey);
      if (!top) {
        const clonedTexture = texture.clone();
        clonedTexture.center.set(0.5, 0.5);
        clonedTexture.rotation = rotationMap[orientation.value] ?? 0;
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

  setHover(state: HoverState | null): void {
    if (!state) {
      if (this.previewContainer) {
        this.previewGroup.remove(this.previewContainer);
        this.disposePreview(this.previewContainer);
        this.previewContainer = null;
      }
      this.previewKey = null;
      return;
    }

    const key = `${state.planIndex}-${state.orientation}-${state.valid ? 1 : 0}`;
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
    const plan = Plan.from(state.planIndex);
    const planKey = getPlanKey(plan.value);
    if (planKey === "00") return;

    try {
      const model = this.assets.getModel(planKey);

      const orientation = Orientation.from(state.orientation);
      const rotationMap: Record<string, number> = {
        [OrientationType.North]: 0,
        [OrientationType.East]: -Math.PI / 2,
        [OrientationType.South]: Math.PI,
        [OrientationType.West]: Math.PI / 2,
      };
      model.rotation.y = rotationMap[orientation.value] ?? 0;

      // Tint preview: keep original materials visible with a green/red emissive glow
      const tintColor = new THREE.Color(state.valid ? 0x00ff00 : 0xff0000);
      // The model's materials are its own copies (its geometry is shared, see AssetLoader)
      model.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          if (child.material instanceof THREE.MeshStandardMaterial) {
            child.material.transparent = true;
            child.material.opacity = 0.75;
            child.material.emissive = tintColor;
            child.material.emissiveIntensity = 0.4;
          } else {
            disposeMaterials(child.material);
            child.material = new THREE.MeshStandardMaterial({
              color: 0xffffff,
              transparent: true,
              opacity: 0.75,
              emissive: tintColor,
              emissiveIntensity: 0.4,
            });
          }
        }
      });

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
      this.slotGeometry = new THREE.RingGeometry(0.8, 1.2, 4);
      this.slotGeometry.rotateX(-Math.PI / 2); // lay flat on ground
      this.slotGeometry.rotateY(Math.PI / 4); // rotate 45° so corners point N/S/E/W
    }
    this.slotMaterial ??= new THREE.MeshBasicMaterial({
      color: 0x44cc66,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
      depthWrite: false,
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

  setStrategyMode(on: boolean): void {
    if (this.strategyMode === on) return;
    this.strategyMode = on;
    // Clear and re-render all tiles in new mode
    // Caller should call updateTiles() after this
    for (const [, entry] of this.tileMeshes) {
      this.tileGroup.remove(entry.mesh);
      this.disposeTile(entry.mesh);
    }
    this.tileMeshes.clear();
  }

  /** A tile owns only its edge outlines; its geometry and materials are shared. */
  private disposeTile(obj: THREE.Object3D): void {
    obj.traverse((child) => {
      if (child instanceof THREE.LineSegments) {
        child.geometry?.dispose();
      }
    });
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
      this.disposeTile(entry.mesh);
    }
    this.tileMeshes.clear();
    if (this.previewContainer) {
      this.disposePreview(this.previewContainer);
    }
    this.previewGroup.clear();
    this.emptyGroup.clear();
    this.previewContainer = null;
    this.previewKey = null;

    for (const model of this.tileTypes.values()) {
      model.traverse((child) => {
        if (child instanceof THREE.Mesh) disposeMaterials(child.material);
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
    this.slotGeometry?.dispose();
    this.slotGeometry = null;
    this.slotMaterial?.dispose();
    this.slotMaterial = null;
  }
}

function disposeMaterials(material: THREE.Material | THREE.Material[]): void {
  if (Array.isArray(material)) {
    material.forEach((m) => m.dispose());
  } else {
    material.dispose();
  }
}
