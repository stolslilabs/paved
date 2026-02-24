import * as THREE from "three";
import { AssetLoader } from "./AssetLoader";
import { TileRenderer } from "./TileRenderer";
import { CharRenderer } from "./CharRenderer";
import { CameraController } from "./CameraController";
import { Effects } from "./Effects";
import { screenToGrid, isClick, createThrottled } from "./interaction";
import type { RendererConfig, TileRenderData, CharacterRenderData, HoverState } from "./types";

const CLICK_THRESHOLD = 5;

// Lighting constants from Lighting.tsx
const AMBIENT_INTENSITY = 4;
const DIRECTIONAL_INTENSITY = 10;
const DIRECTIONAL_POSITION: [number, number, number] = [35, 50, 65];
const DIRECTIONAL_TARGET: [number, number, number] = [-25.5, -40.5, 0];
const SHADOW_MAP_SIZE = 2048;
const SHADOW_NEAR = 1;
const SHADOW_FAR = 100;
const SHADOW_FRUSTUM = 50;

export class GameScene {
  scene: THREE.Scene;
  camera!: THREE.PerspectiveCamera;
  renderer!: THREE.WebGLRenderer;
  tiles: TileRenderer;
  characters: CharRenderer;
  controls!: CameraController;
  assets: AssetLoader;
  effects: Effects;

  private sceneGroup: THREE.Group;
  private animationId: number | null = null;
  private needsRender = true;
  private isWebGPU = false;

  private pointerDownPos: { x: number; y: number } | null = null;
  private onTileClickCallback: ((gridX: number, gridY: number) => void) | null = null;
  private onTileHoverCallback: ((gridX: number, gridY: number) => void) | null = null;
  private onHoverLeaveCallback: (() => void) | null = null;
  private boundPointerDown: ((e: PointerEvent) => void) | null = null;
  private boundPointerUp: ((e: PointerEvent) => void) | null = null;
  private boundPointerMove: ((e: PointerEvent) => void) | null = null;
  private boundPointerLeave: (() => void) | null = null;
  private interactionCanvas: HTMLCanvasElement | null = null;
  private resizeObserver: ResizeObserver | null = null;

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

  async init(config: RendererConfig): Promise<void> {
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

    const dpr = Math.min(
      Math.max(window.devicePixelRatio, pixelRatio[0]),
      pixelRatio[1]
    );
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);

    if (shadows) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    // Camera
    this.controls = new CameraController(canvas);
    this.camera = this.controls.camera;

    // Re-render when camera moves (orbit, pan, zoom)
    this.controls.controls.addEventListener("change", () => {
      this.requestRender();
    });

    // Lighting
    this.setupLighting();

    // Post-processing
    this.effects.init(this.renderer, this.scene, this.camera);

    // Preload assets
    await this.assets.preloadAll();

    // Handle resize
    this.resizeObserver = new ResizeObserver(() => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      this.renderer.setSize(w, h);
      this.controls.resize(w, h);
      this.effects.resize(w, h);
      this.requestRender();
    });
    this.resizeObserver.observe(canvas);

    this.setupInteraction(canvas);
  }

  private setupLighting(): void {
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

  private setupInteraction(canvas: HTMLCanvasElement): void {
    this.interactionCanvas = canvas;

    this.boundPointerDown = (e: PointerEvent) => {
      if (e.button === 0) {
        this.pointerDownPos = { x: e.clientX, y: e.clientY };
      }
    };

    this.boundPointerUp = (e: PointerEvent) => {
      if (e.button === 0 && this.pointerDownPos) {
        const up = { x: e.clientX, y: e.clientY };
        if (isClick(this.pointerDownPos, up, CLICK_THRESHOLD)) {
          const rect = canvas.getBoundingClientRect();
          const ndc = {
            x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
            y: -((e.clientY - rect.top) / rect.height) * 2 + 1,
          };
          // Ensure camera matrix is fresh (OrbitControls may have updated between frames)
          this.camera.updateMatrixWorld();
          const grid = screenToGrid(ndc, this.camera, this.sceneGroup.matrixWorld, 3);
          if (grid && this.onTileClickCallback) {
            this.onTileClickCallback(grid.x, grid.y);
          }
        }
        this.pointerDownPos = null;
      }
    };

    this.boundPointerMove = createThrottled((e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const ndc = {
        x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
        y: -((e.clientY - rect.top) / rect.height) * 2 + 1,
      };
      this.camera.updateMatrixWorld();
      const grid = screenToGrid(ndc, this.camera, this.sceneGroup.matrixWorld, 3);
      if (grid) {
        this.onTileHoverCallback?.(grid.x, grid.y);
      } else {
        this.onHoverLeaveCallback?.();
      }
    }, 50); // ~20fps throttle

    this.boundPointerLeave = () => {
      this.onHoverLeaveCallback?.();
    };

    canvas.addEventListener("pointerdown", this.boundPointerDown);
    canvas.addEventListener("pointerup", this.boundPointerUp);
    canvas.addEventListener("pointermove", this.boundPointerMove);
    canvas.addEventListener("pointerleave", this.boundPointerLeave);
  }

  onTileClick(cb: ((gridX: number, gridY: number) => void) | null): void {
    this.onTileClickCallback = cb;
  }

  onTileHover(cb: ((gridX: number, gridY: number) => void) | null): void {
    this.onTileHoverCallback = cb;
  }

  onHoverLeave(cb: (() => void) | null): void {
    this.onHoverLeaveCallback = cb;
  }

  /** Update placed tiles */
  updateTiles(tiles: TileRenderData[]): void {
    this.tiles.updateTiles(tiles);
    this.requestRender();
  }

  /** Update character meshes */
  updateCharacters(chars: CharacterRenderData[]): void {
    this.characters.updateCharacters(chars);
    this.requestRender();
  }

  /** Set hover preview at grid position */
  setHoveredTile(state: HoverState | null): void {
    this.tiles.setHover(state);
    this.requestRender();
  }

  /** Show available placement slots on the board */
  setAvailableSlots(slots: Array<{ x: number; y: number }>): void {
    this.tiles.setAvailableSlots(slots);
    this.requestRender();
  }

  /** Switch between 3D voxel and 2D strategy rendering */
  setStrategyMode(on: boolean): void {
    this.tiles.setStrategyMode(on);
    this.requestRender();
  }

  /** Set compass rotation for scene group */
  setCompassRotation(angle: number): void {
    this.sceneGroup.rotation.y = angle;
    this.requestRender();
  }

  /** Request a re-render (demand mode — only renders when state changes) */
  requestRender(): void {
    this.needsRender = true;
  }

  /** Start the render loop */
  start(): void {
    const animate = () => {
      this.animationId = requestAnimationFrame(animate);

      // OrbitControls.update() returns true while damping is active
      const controlsChanged = this.controls.update();
      if (controlsChanged) {
        this.needsRender = true;
      }

      if (this.needsRender) {
        this.characters.updateBillboards(this.camera);
        this.effects.render();
        this.needsRender = false;
      }
    };
    animate();
  }

  /** Stop the render loop */
  stop(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  /** Render a single frame */
  render(): void {
    this.characters.updateBillboards(this.camera);
    this.effects.render();
  }

  /** Take a screenshot */
  screenshot(): string {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL("image/png");
  }

  /** Cleanup all resources */
  dispose(): void {
    // Remove interaction listeners
    if (this.interactionCanvas) {
      if (this.boundPointerDown) this.interactionCanvas.removeEventListener("pointerdown", this.boundPointerDown);
      if (this.boundPointerUp) this.interactionCanvas.removeEventListener("pointerup", this.boundPointerUp);
      if (this.boundPointerMove) this.interactionCanvas.removeEventListener("pointermove", this.boundPointerMove);
      if (this.boundPointerLeave) this.interactionCanvas.removeEventListener("pointerleave", this.boundPointerLeave);
      this.interactionCanvas = null;
    }

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    this.stop();
    this.tiles.dispose();
    this.characters.dispose();
    this.effects.dispose();
    this.controls.dispose();
    this.assets.dispose();
    this.renderer.dispose();
  }
}
