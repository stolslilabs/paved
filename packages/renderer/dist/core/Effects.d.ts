import * as THREE from "three";
export interface EffectsConfig {
    bloom?: {
        threshold?: number;
        strength?: number;
        radius?: number;
    };
    vignette?: {
        offset?: number;
        darkness?: number;
    };
}
export declare class Effects {
    private composer;
    private config;
    constructor(config?: EffectsConfig);
    init(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void;
    render(): void;
    resize(width: number, height: number): void;
    dispose(): void;
}
//# sourceMappingURL=Effects.d.ts.map