import * as THREE from "three";
export declare class AssetLoader {
    private models;
    private textures;
    private gltfLoader;
    private textureLoader;
    private basePath;
    constructor(basePath?: string);
    preloadModels(): Promise<void>;
    preloadTextures(): Promise<void>;
    preloadAll(): Promise<void>;
    getModel(key: string): THREE.Group;
    getTexture(key: string): THREE.Texture;
    dispose(): void;
}
//# sourceMappingURL=AssetLoader.d.ts.map