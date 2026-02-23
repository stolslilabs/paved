import * as THREE from "three";
import { getPlanKey, Plan, Orientation, OrientationType } from "@paved/game-core";
const TILE_SIZE = 3;
// Material constants from TileTexture
const TILE_ROUGHNESS = 1;
const TILE_ANISOTROPY = 160;
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
    group;
    tileGroup; // placed tiles
    emptyGroup; // empty slots
    previewGroup; // hover preview
    tileMeshes = new Map();
    assets;
    strategyMode = false;
    squareSize = TILE_SIZE;
    constructor(assets) {
        this.assets = assets;
        this.group = new THREE.Group();
        this.tileGroup = new THREE.Group();
        this.emptyGroup = new THREE.Group();
        this.previewGroup = new THREE.Group();
        this.group.add(this.tileGroup, this.emptyGroup, this.previewGroup);
    }
    getGroup() {
        return this.group;
    }
    updateTiles(tiles) {
        const currentKeys = new Set();
        for (const tile of tiles) {
            const key = `${tile.game_id}-${tile.id}`;
            currentKeys.add(key);
            if (this.tileMeshes.has(key))
                continue;
            const mesh = this.strategyMode
                ? this.createStrategyTile(tile)
                : this.createVoxelTile(tile);
            if (mesh) {
                mesh.position.set(tile.worldX * this.squareSize, 0, tile.worldZ * this.squareSize);
                this.tileGroup.add(mesh);
                this.tileMeshes.set(key, mesh);
            }
        }
        // Remove tiles no longer present
        for (const [key, mesh] of this.tileMeshes) {
            if (!currentKeys.has(key)) {
                this.tileGroup.remove(mesh);
                this.disposeMesh(mesh);
                this.tileMeshes.delete(key);
            }
        }
    }
    createVoxelTile(tile) {
        const plan = Plan.from(tile.plan);
        const key = getPlanKey(plan.value);
        if (key === "00")
            return null;
        try {
            const model = this.assets.getModel(key);
            // Apply rotation based on orientation
            const orientation = Orientation.from(tile.orientation);
            const rotationMap = {
                [OrientationType.North]: 0,
                [OrientationType.East]: -Math.PI / 2,
                [OrientationType.South]: Math.PI,
                [OrientationType.West]: Math.PI / 2,
            };
            model.rotation.y = rotationMap[orientation.value] ?? 0;
            // Process materials and add edges
            model.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    // Preserve emissive, set roughness and anisotropy
                    if (child.material instanceof THREE.MeshStandardMaterial) {
                        child.material = child.material.clone();
                        child.material.roughness = TILE_ROUGHNESS;
                        // Note: anisotropy requires anisotrpoy extension support
                    }
                    child.castShadow = true;
                    child.receiveShadow = true;
                    // Add edge outlines (toon-style)
                    const edges = new THREE.EdgesGeometry(child.geometry);
                    const lineMaterial = new THREE.LineBasicMaterial({ color: EDGE_COLOR });
                    const wireframe = new THREE.LineSegments(edges, lineMaterial);
                    wireframe.position.z += 0.001;
                    child.add(wireframe);
                }
            });
            // Center and scale model to fit tile size
            const box = new THREE.Box3().setFromObject(model);
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.z);
            if (maxDim > 0) {
                const scale = this.squareSize / maxDim;
                model.scale.setScalar(scale);
            }
            return model;
        }
        catch {
            return null;
        }
    }
    createStrategyTile(tile) {
        const plan = Plan.from(tile.plan);
        const key = getPlanKey(plan.value);
        if (key === "00")
            return null;
        try {
            const texture = this.assets.getTexture(`tile-${key}`);
            // Rotate texture based on orientation
            const orientation = Orientation.from(tile.orientation);
            const rotationMap = {
                [OrientationType.North]: 0,
                [OrientationType.East]: -Math.PI / 2,
                [OrientationType.South]: Math.PI,
                [OrientationType.West]: Math.PI / 2,
            };
            const clonedTexture = texture.clone();
            clonedTexture.center.set(0.5, 0.5);
            clonedTexture.rotation = rotationMap[orientation.value] ?? 0;
            clonedTexture.needsUpdate = true;
            const geometry = new THREE.BoxGeometry(this.squareSize, STRATEGY_THICKNESS, this.squareSize);
            // Top face has the tile texture, other faces are dark
            const materials = [
                new THREE.MeshBasicMaterial({ color: 0x333333 }), // right
                new THREE.MeshBasicMaterial({ color: 0x333333 }), // left
                new THREE.MeshBasicMaterial({ map: clonedTexture }), // top
                new THREE.MeshBasicMaterial({ color: 0x333333 }), // bottom
                new THREE.MeshBasicMaterial({ color: 0x333333 }), // front
                new THREE.MeshBasicMaterial({ color: 0x333333 }), // back
            ];
            const mesh = new THREE.Mesh(geometry, materials);
            return mesh;
        }
        catch {
            return null;
        }
    }
    setHover(state) {
        // Clear previous preview
        while (this.previewGroup.children.length > 0) {
            const child = this.previewGroup.children[0];
            this.previewGroup.remove(child);
            this.disposeMesh(child);
        }
        if (!state)
            return;
        // Create preview mesh
        const plan = Plan.from(state.planIndex);
        const key = getPlanKey(plan.value);
        if (key === "00")
            return;
        try {
            const model = this.assets.getModel(key);
            const orientation = Orientation.from(state.orientation);
            const rotationMap = {
                [OrientationType.North]: 0,
                [OrientationType.East]: -Math.PI / 2,
                [OrientationType.South]: Math.PI,
                [OrientationType.West]: Math.PI / 2,
            };
            model.rotation.y = rotationMap[orientation.value] ?? 0;
            // Make transparent for preview
            model.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    child.material = new THREE.MeshStandardMaterial({
                        color: state.valid && state.idle ? 0x00ff00 : state.valid ? 0xff0000 : 0xffa500,
                        transparent: true,
                        opacity: state.valid && state.idle ? VALID_IDLE_OPACITY : state.valid ? VALID_OPACITY : INVALID_OPACITY,
                    });
                }
            });
            // Center and scale
            const box = new THREE.Box3().setFromObject(model);
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.z);
            if (maxDim > 0) {
                const scale = this.squareSize / maxDim;
                model.scale.setScalar(scale);
            }
            model.position.set(state.x * this.squareSize, 0, state.y * this.squareSize);
            this.previewGroup.add(model);
        }
        catch {
            // Model not available
        }
    }
    setStrategyMode(on) {
        if (this.strategyMode === on)
            return;
        this.strategyMode = on;
        // Clear and re-render all tiles in new mode
        // Caller should call updateTiles() after this
        for (const [key, mesh] of this.tileMeshes) {
            this.tileGroup.remove(mesh);
            this.disposeMesh(mesh);
        }
        this.tileMeshes.clear();
    }
    disposeMesh(obj) {
        obj.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.geometry?.dispose();
                if (Array.isArray(child.material)) {
                    child.material.forEach(m => m.dispose());
                }
                else {
                    child.material?.dispose();
                }
            }
        });
    }
    dispose() {
        for (const [, mesh] of this.tileMeshes) {
            this.disposeMesh(mesh);
        }
        this.tileMeshes.clear();
        while (this.previewGroup.children.length > 0) {
            const child = this.previewGroup.children[0];
            this.previewGroup.remove(child);
            this.disposeMesh(child);
        }
    }
}
//# sourceMappingURL=TileRenderer.js.map