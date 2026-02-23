import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { PlanType, getPlanKey } from "@paved/game-core";
export class AssetLoader {
    models = new Map();
    textures = new Map();
    gltfLoader;
    textureLoader;
    basePath;
    constructor(basePath = "") {
        this.gltfLoader = new GLTFLoader();
        this.textureLoader = new THREE.TextureLoader();
        this.basePath = basePath;
    }
    async preloadModels() {
        const planTypes = Object.values(PlanType).filter(v => v !== PlanType.None);
        await Promise.all(planTypes.map(async (plan) => {
            const key = getPlanKey(plan);
            const gltf = await this.gltfLoader.loadAsync(`${this.basePath}/models/${key}.glb`);
            this.models.set(key, gltf.scene);
        }));
    }
    async preloadTextures() {
        const planTypes = Object.values(PlanType).filter(v => v !== PlanType.None);
        await Promise.all(planTypes.map(async (plan) => {
            const key = getPlanKey(plan);
            const texture = await this.textureLoader.loadAsync(`${this.basePath}/assets/tiles/${key}.png`);
            this.textures.set(`tile-${key}`, texture);
        }));
    }
    async preloadAll() {
        await Promise.all([this.preloadModels(), this.preloadTextures()]);
    }
    getModel(key) {
        const model = this.models.get(key);
        if (!model)
            throw new Error(`Model not found: ${key}`);
        return model.clone();
    }
    getTexture(key) {
        const texture = this.textures.get(key);
        if (!texture)
            throw new Error(`Texture not found: ${key}`);
        return texture;
    }
    dispose() {
        this.models.forEach((model) => {
            model.traverse((child) => {
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
        });
        this.textures.forEach((texture) => texture.dispose());
        this.models.clear();
        this.textures.clear();
    }
}
//# sourceMappingURL=AssetLoader.js.map