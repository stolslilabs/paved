import * as THREE from "three";
import { AssetLoader } from "./AssetLoader";
import { TileRenderer } from "./TileRenderer";
import { CharRenderer } from "./CharRenderer";
import { CameraController } from "./CameraController";
import { Effects } from "./Effects";
import { screenToGrid, isClick, createThrottled } from "./interaction";
import type {
  RendererConfig,
  TileRenderData,
  CharacterRenderData,
  HoverState,
  CameraMode,
  BoardBounds,
  RenderProfile,
} from "./types";
import { TILE_SIZE } from "./types";
import {
  getLightingProfile,
  getRenderProfileForCameraMode,
} from "./render-profiles";

const CLICK_THRESHOLD = 5;

const DIRECTIONAL_POSITION: [number, number, number] = [35, 50, 65];
const DIRECTIONAL_TARGET: [number, number, number] = [0, 0, 0];
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
  private latestTiles: TileRenderData[] = [];
  private renderProfile: RenderProfile = "play";
  private ambientLight: THREE.AmbientLight | null = null;
  private hemisphereLight: THREE.HemisphereLight | null = null;
  private directionalLight: THREE.DirectionalLight | null = null;
  private directionalTargetObject: THREE.Object3D | null = null;

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
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;

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
    this.effects.init(this.renderer, this.scene, this.camera, this.renderProfile);

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
    this.ambientLight = new THREE.AmbientLight(0xffffff, 1);
    this.scene.add(this.ambientLight);

    this.hemisphereLight = new THREE.HemisphereLight(0xbfd8ff, 0x24351f, 0.4);
    this.scene.add(this.hemisphereLight);

    this.directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    this.directionalLight.position.set(...DIRECTIONAL_POSITION);
    this.directionalLight.castShadow = true;
    this.directionalLight.shadow.mapSize.width = SHADOW_MAP_SIZE;
    this.directionalLight.shadow.mapSize.height = SHADOW_MAP_SIZE;
    this.directionalLight.shadow.camera.near = SHADOW_NEAR;
    this.directionalLight.shadow.camera.far = SHADOW_FAR;
    this.directionalLight.shadow.camera.left = -SHADOW_FRUSTUM;
    this.directionalLight.shadow.camera.right = SHADOW_FRUSTUM;
    this.directionalLight.shadow.camera.top = SHADOW_FRUSTUM;
    this.directionalLight.shadow.camera.bottom = -SHADOW_FRUSTUM;

    this.directionalTargetObject = new THREE.Object3D();
    this.directionalTargetObject.position.set(...DIRECTIONAL_TARGET);
    this.scene.add(this.directionalTargetObject);
    this.directionalLight.target = this.directionalTargetObject;
    this.scene.add(this.directionalLight);

    this.applyLightingProfile(this.renderProfile);
  }

  private applyLightingProfile(profileName: RenderProfile): void {
    const profile = getLightingProfile(profileName);
    if (this.renderer) {
      this.renderer.toneMappingExposure = profile.exposure;
    }
    this.scene.background = new THREE.Color(profile.backgroundColor);
    this.scene.fog = new THREE.FogExp2(profile.fogColor, profile.fogDensity);

    if (this.ambientLight) {
      this.ambientLight.intensity = profile.ambientIntensity;
    }
    if (this.hemisphereLight) {
      this.hemisphereLight.intensity = profile.hemisphereSkyIntensity;
      this.hemisphereLight.groundColor.setRGB(
        0.16 * profile.hemisphereGroundIntensity,
        0.24 * profile.hemisphereGroundIntensity,
        0.13 * profile.hemisphereGroundIntensity,
      );
    }
    if (this.directionalLight) {
      this.directionalLight.intensity = profile.directionalIntensity;
    }
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
    this.latestTiles = tiles.slice();
    this.tiles.updateTiles(tiles);
    if (this.controls) {
      this.controls.setBoardBounds(this.computeBoardBounds());
    }
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
    this.tiles.updateTiles(this.latestTiles);
    this.requestRender();
  }

  /** Set compass rotation for scene group */
  setCompassRotation(angle: number): void {
    this.sceneGroup.rotation.y = angle;
    this.requestRender();
  }

  /** Set camera mode profile (play/showcase) */
  setCameraMode(mode: CameraMode): void {
    if (!this.controls) return;
    this.controls.setMode(mode);
    this.setRenderProfile(getRenderProfileForCameraMode(mode));
    this.requestRender();
  }

  setRenderProfile(profile: RenderProfile): void {
    this.renderProfile = profile;
    this.applyLightingProfile(profile);
    this.effects.setProfile(profile);
    this.requestRender();
  }

  focusBoard(): void {
    if (!this.controls) return;
    this.controls.focusBounds(this.computeBoardBounds());
    this.requestRender();
  }

  private computeBoardBounds(): BoardBounds | null {
    if (this.latestTiles.length === 0) return null;

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    for (const tile of this.latestTiles) {
      const worldX = tile.worldX * TILE_SIZE;
      const worldZ = tile.worldZ * TILE_SIZE;
      minX = Math.min(minX, worldX);
      maxX = Math.max(maxX, worldX);
      minZ = Math.min(minZ, worldZ);
      maxZ = Math.max(maxZ, worldZ);
    }

    return { minX, maxX, minZ, maxZ };
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
