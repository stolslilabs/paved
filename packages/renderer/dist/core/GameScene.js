import * as THREE from "three";
import { AssetLoader } from "./AssetLoader";
import { TileRenderer } from "./TileRenderer";
import { CharRenderer } from "./CharRenderer";
import { CameraController } from "./CameraController";
import { Effects } from "./Effects";
// Lighting constants from Lighting.tsx
const AMBIENT_INTENSITY = 4;
const DIRECTIONAL_INTENSITY = 10;
const DIRECTIONAL_POSITION = [35, 50, 65];
const DIRECTIONAL_TARGET = [-25.5, -40.5, 0];
const SHADOW_MAP_SIZE = 4096;
const SHADOW_NEAR = 1;
const SHADOW_FAR = 100;
const SHADOW_FRUSTUM = 50;
export class GameScene {
    scene;
    camera;
    renderer;
    tiles;
    characters;
    controls;
    assets;
    effects;
    sceneGroup;
    animationId = null;
    needsRender = true;
    isWebGPU = false;
    constructor() {
        this.scene = new THREE.Scene();
        this.sceneGroup = new THREE.Group();
        this.scene.add(this.sceneGroup);
        this.assets = new AssetLoader();
        this.tiles = new TileRenderer(this.assets);
        this.characters = new CharRenderer();
        this.effects = new Effects();
        this.sceneGroup.add(this.tiles.getGroup());
        this.sceneGroup.add(this.characters.getGroup());
    }
    async init(config) {
        const { canvas, basePath, pixelRatio = [0.5, 1], shadows = true } = config;
        // Set asset base path
        if (basePath) {
            this.assets = new AssetLoader(basePath);
            this.tiles = new TileRenderer(this.assets);
            // Re-add to scene group
            this.sceneGroup.clear();
            this.sceneGroup.add(this.tiles.getGroup());
            this.sceneGroup.add(this.characters.getGroup());
        }
        // Create WebGL renderer (WebGPU support to be added when Three.js stabilizes the API)
        this.renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: true,
            alpha: false,
        });
        const dpr = Math.min(Math.max(window.devicePixelRatio, pixelRatio[0]), pixelRatio[1]);
        this.renderer.setPixelRatio(dpr);
        this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
        if (shadows) {
            this.renderer.shadowMap.enabled = true;
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        }
        // Camera
        this.controls = new CameraController(canvas);
        this.camera = this.controls.camera;
        // Lighting
        this.setupLighting();
        // Post-processing
        this.effects.init(this.renderer, this.scene, this.camera);
        // Preload assets
        await this.assets.preloadAll();
        // Handle resize
        const resizeObserver = new ResizeObserver(() => {
            const w = canvas.clientWidth;
            const h = canvas.clientHeight;
            this.renderer.setSize(w, h);
            this.controls.resize(w, h);
            this.effects.resize(w, h);
            this.requestRender();
        });
        resizeObserver.observe(canvas);
    }
    setupLighting() {
        // Ambient light
        const ambient = new THREE.AmbientLight(0xffffff, AMBIENT_INTENSITY);
        this.scene.add(ambient);
        // Directional light (sun)
        const directional = new THREE.DirectionalLight(0xffffff, DIRECTIONAL_INTENSITY);
        directional.position.set(...DIRECTIONAL_POSITION);
        directional.castShadow = true;
        // Shadow configuration
        directional.shadow.mapSize.width = SHADOW_MAP_SIZE;
        directional.shadow.mapSize.height = SHADOW_MAP_SIZE;
        directional.shadow.camera.near = SHADOW_NEAR;
        directional.shadow.camera.far = SHADOW_FAR;
        directional.shadow.camera.left = -SHADOW_FRUSTUM;
        directional.shadow.camera.right = SHADOW_FRUSTUM;
        directional.shadow.camera.top = SHADOW_FRUSTUM;
        directional.shadow.camera.bottom = -SHADOW_FRUSTUM;
        // Target
        const target = new THREE.Object3D();
        target.position.set(...DIRECTIONAL_TARGET);
        this.scene.add(target);
        directional.target = target;
        this.scene.add(directional);
    }
    /** Update placed tiles */
    updateTiles(tiles) {
        this.tiles.updateTiles(tiles);
        this.requestRender();
    }
    /** Update character meshes */
    updateCharacters(chars) {
        this.characters.updateCharacters(chars);
        this.requestRender();
    }
    /** Set hover preview at grid position */
    setHoveredTile(state) {
        this.tiles.setHover(state);
        this.requestRender();
    }
    /** Switch between 3D voxel and 2D strategy rendering */
    setStrategyMode(on) {
        this.tiles.setStrategyMode(on);
        this.requestRender();
    }
    /** Set compass rotation for scene group */
    setCompassRotation(angle) {
        this.sceneGroup.rotation.y = angle;
        this.requestRender();
    }
    /** Request a re-render (demand mode — only renders when state changes) */
    requestRender() {
        this.needsRender = true;
    }
    /** Start the render loop */
    start() {
        const animate = () => {
            this.animationId = requestAnimationFrame(animate);
            this.controls.update();
            if (this.needsRender) {
                this.characters.updateBillboards(this.camera);
                this.effects.render();
                this.needsRender = false;
            }
        };
        animate();
    }
    /** Stop the render loop */
    stop() {
        if (this.animationId !== null) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }
    /** Render a single frame */
    render() {
        this.characters.updateBillboards(this.camera);
        this.effects.render();
    }
    /** Take a screenshot */
    screenshot() {
        this.renderer.render(this.scene, this.camera);
        return this.renderer.domElement.toDataURL("image/png");
    }
    /** Cleanup all resources */
    dispose() {
        this.stop();
        this.tiles.dispose();
        this.characters.dispose();
        this.effects.dispose();
        this.controls.dispose();
        this.assets.dispose();
        this.renderer.dispose();
    }
}
//# sourceMappingURL=GameScene.js.map