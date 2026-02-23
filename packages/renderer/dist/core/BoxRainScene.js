import * as THREE from "three";
import { AssetLoader } from "./AssetLoader";
import { PlanType, getPlanKey } from "@paved/game-core";
const BOX_COUNT = 100;
const FALL_SPEED = 0.01;
const RESET_Y = -20;
const INITIAL_Y_MIN = 10;
const INITIAL_Y_MAX = 30;
const SPREAD_X = 10;
const SPREAD_Z_MIN = -10;
const SPREAD_Z_MAX = 30;
const BOX_SCALE = 0.1;
const SCENE_SCALE = 0.2;
export class BoxRainScene {
    scene;
    camera;
    renderer;
    boxes = [];
    assets;
    animationId = null;
    constructor() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
        this.camera.position.set(0, 5, 15);
        this.camera.lookAt(0, 0, 0);
        this.renderer = null;
        this.assets = new AssetLoader();
    }
    async init(canvas, basePath = "") {
        this.assets = new AssetLoader(basePath);
        this.renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: true,
            alpha: true,
        });
        this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        // Lighting
        const ambient = new THREE.AmbientLight(0xffffff, 1);
        this.scene.add(ambient);
        const directional = new THREE.DirectionalLight(0xffffff, 5);
        directional.position.set(0, 10, 0);
        directional.castShadow = true;
        this.scene.add(directional);
        const point = new THREE.PointLight(0xffffff, 1);
        point.position.set(10, 10, 10);
        this.scene.add(point);
        // Load models
        await this.assets.preloadModels();
        // Create boxes
        const planTypes = Object.values(PlanType).filter(v => v !== PlanType.None);
        for (let i = 0; i < BOX_COUNT; i++) {
            const planType = planTypes[Math.floor(Math.random() * planTypes.length)];
            const key = getPlanKey(planType);
            try {
                const model = this.assets.getModel(key);
                model.scale.setScalar(BOX_SCALE);
                model.position.set((Math.random() - 0.5) * SPREAD_X * 2, INITIAL_Y_MIN + Math.random() * (INITIAL_Y_MAX - INITIAL_Y_MIN), SPREAD_Z_MIN + Math.random() * (SPREAD_Z_MAX - SPREAD_Z_MIN));
                model.rotation.set(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2);
                this.scene.add(model);
                this.boxes.push(model);
            }
            catch {
                // Skip if model not available
            }
        }
        this.scene.scale.setScalar(SCENE_SCALE);
    }
    start() {
        const animate = () => {
            this.animationId = requestAnimationFrame(animate);
            for (const box of this.boxes) {
                box.position.y -= FALL_SPEED;
                if (box.position.y < RESET_Y) {
                    box.position.y = INITIAL_Y_MAX;
                    box.position.x = (Math.random() - 0.5) * SPREAD_X * 2;
                    box.position.z = SPREAD_Z_MIN + Math.random() * (SPREAD_Z_MAX - SPREAD_Z_MIN);
                }
            }
            this.renderer.render(this.scene, this.camera);
        };
        animate();
    }
    stop() {
        if (this.animationId !== null) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }
    resize(width, height) {
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }
    dispose() {
        this.stop();
        this.boxes.forEach((box) => {
            box.traverse((child) => {
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
        this.boxes = [];
        this.assets.dispose();
        this.renderer.dispose();
    }
}
//# sourceMappingURL=BoxRainScene.js.map