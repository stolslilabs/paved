import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
const DEFAULT_CONFIG = {
    position: [0, 0, 0],
    zoom: 5,
    near: 1,
    far: 2000,
    minDistance: 5,
    maxDistance: 30,
};
export class CameraController {
    camera;
    controls;
    compassRotation = 0;
    constructor(canvas, config = {}) {
        const cfg = { ...DEFAULT_CONFIG, ...config };
        this.camera = new THREE.PerspectiveCamera(50, canvas.clientWidth / canvas.clientHeight, cfg.near, cfg.far);
        this.camera.position.set(0, cfg.maxDistance * 0.8, 0.1);
        this.camera.zoom = cfg.zoom;
        this.camera.updateProjectionMatrix();
        this.controls = new OrbitControls(this.camera, canvas);
        this.controls.enableRotate = true;
        this.controls.enablePan = true;
        this.controls.enableDamping = true;
        this.controls.zoomToCursor = true;
        this.controls.panSpeed = 0.8;
        this.controls.rotateSpeed = 0.1;
        this.controls.zoomSpeed = 0.8;
        // Lock azimuth (no horizontal orbit — top-down view)
        this.controls.minAzimuthAngle = 0;
        this.controls.maxAzimuthAngle = 0;
        // Polar angle: ~90° to 180° (nearly top-down to straight-down)
        this.controls.minPolarAngle = (101 * Math.PI) / 200;
        this.controls.maxPolarAngle = Math.PI;
        this.controls.minDistance = cfg.minDistance;
        this.controls.maxDistance = cfg.maxDistance;
        // Touch mapping
        this.controls.touches = {
            ONE: THREE.TOUCH.PAN,
            TWO: THREE.TOUCH.DOLLY_PAN,
        };
        // Mouse mapping
        this.controls.mouseButtons = {
            LEFT: THREE.MOUSE.PAN,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.ROTATE,
        };
    }
    update() {
        this.controls.update();
    }
    resize(width, height) {
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
    }
    setCompassRotation(angle) {
        this.compassRotation = angle;
    }
    getCompassRotation() {
        return this.compassRotation;
    }
    reset() {
        this.controls.reset();
    }
    dispose() {
        this.controls.dispose();
    }
}
//# sourceMappingURL=CameraController.js.map