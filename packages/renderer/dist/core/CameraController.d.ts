import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
export interface CameraConfig {
    position?: [number, number, number];
    zoom?: number;
    near?: number;
    far?: number;
    minDistance?: number;
    maxDistance?: number;
}
export declare class CameraController {
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    private compassRotation;
    constructor(canvas: HTMLCanvasElement, config?: CameraConfig);
    update(): void;
    resize(width: number, height: number): void;
    setCompassRotation(angle: number): void;
    getCompassRotation(): number;
    reset(): void;
    dispose(): void;
}
//# sourceMappingURL=CameraController.d.ts.map