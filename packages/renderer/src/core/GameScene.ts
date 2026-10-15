import * as THREE from "three";
import { AssetLoader } from "./AssetLoader";
import { TileRenderer } from "./TileRenderer";
import { CameraController } from "./CameraController";
import { Effects, resolveFaceAntialiasing, type FaceAntialiasing } from "./Effects";
import { screenToGrid, isClick, createThrottled } from "./interaction";
import type {
  RendererConfig,
  TileRenderData,
  HoverState,
  CameraMode,
  BoardBounds,
  RenderProfile,
  RenderSurfaceAdapter,
  SurfaceInputEvent,
  EffectsCapabilities,
} from "./types";
import { TILE_SIZE } from "./types";
import {
  getLightingProfile,
  getRenderProfileForCameraMode,
} from "./render-profiles";
import {
  detectSoftwareWebGL,
  openingTilePixels,
  outlinesAllowed,
  outlineStroke,
  tilePixels,
  type OutlineSettings,
  type OutlineStroke,
  type WebGLDetection,
} from "./outlines";
import {
  cameraDistanceLimits,
  capPixelRatio,
  resolveMaxPixelRatio,
  resolveMultisampling,
  resolveRendererSettings,
  type PixelRatioDevice,
  type RendererSettings,
  type RendererSettingsInput,
} from "./settings";

const CLICK_THRESHOLD = 5;

const DIRECTIONAL_POSITION: [number, number, number] = [35, 50, 65];
const DIRECTIONAL_TARGET: [number, number, number] = [0, 0, 0];
const SHADOW_MAP_SIZE = 2048;
const SHADOW_NEAR = 1;
const SHADOW_FAR = 100;
const SHADOW_FRUSTUM = 50;
/**
 * The shadow map's biases (R-VIS). Without them every lit face shadows itself in diagonal bands ("shadow acne"): a
 * 2048 map over the 100-unit frustum is about 0.05 world units a texel, the light meets the tops at about 56 degrees
 * and the sides at up to 67, so the stored depth of a texel misses the face it covers by up to about 0.1 unit. The
 * normal bias moves the lookup 0.1 unit out of the face (two texels, about 1.3 voxels: a tile is 40 voxels a side,
 * 0.075 unit each), and the depth bias, in the shadow camera's 1 to 100 depth range, adds about 0.1 unit along the
 * light. Measured on the 72-tile board (R-VIS captures): half these values leave faint bands.
 */
const SHADOW_NORMAL_BIAS = 0.1;
const SHADOW_BIAS = -0.001;

/**
 * Read-only measurement hook for the frame-time bench: it observes the render loop and
 * changes nothing about how a frame is rendered.
 */
export interface FrameObserver {
  /** Called right before a frame is rendered (not on idle ticks). */
  beforeRender?(): void;
  /** Called at the end of every loop tick with the CPU time the tick took. */
  afterTick?(info: { cpuMs: number; rendered: boolean }): void;
}

export interface GameSceneDependencies {
  createRenderer?: (surface: RenderSurfaceAdapter) => THREE.WebGLRenderer;
  createCameraController?: (surface: RenderSurfaceAdapter) => CameraController;
}

function createDefaultRenderer(surface: RenderSurfaceAdapter): THREE.WebGLRenderer {
  const renderTarget = surface.getRenderTarget?.();
  if (!renderTarget) {
    throw new Error("Render surface does not expose a render target");
  }

  return new THREE.WebGLRenderer({
    canvas: renderTarget as HTMLCanvasElement,
    antialias: true,
    alpha: false,
  });
}

function createDefaultCameraController(surface: RenderSurfaceAdapter): CameraController {
  const size = surface.getSize();

  return new CameraController({
    width: size.width,
    height: size.height,
    inputTarget: surface.getRenderTarget?.(),
  });
}

export class GameScene {
  scene: THREE.Scene;
  camera!: THREE.PerspectiveCamera;
  renderer!: THREE.WebGLRenderer;
  tiles: TileRenderer;
  controls!: CameraController;
  assets: AssetLoader;
  effects: Effects;

  private readonly dependencies: GameSceneDependencies;
  private sceneGroup: THREE.Group;
  private animationId: number | null = null;
  private frameObserver: FrameObserver | null = null;
  private needsRender = true;
  /** The shadow casters changed since the shadow map was last drawn. */
  private shadowsDirty = true;
  private isWebGPU = false;
  private disposed = false;
  private latestTiles: TileRenderData[] = [];
  private renderProfile: RenderProfile = "play";
  private ambientLight: THREE.AmbientLight | null = null;
  private hemisphereLight: THREE.HemisphereLight | null = null;
  private directionalLight: THREE.DirectionalLight | null = null;
  private directionalTargetObject: THREE.Object3D | null = null;
  private settings: RendererSettings = resolveRendererSettings();
  /** The tile size the outlines' stroke was last set for (NaN: set it on the next frame). */
  private outlineTilePx = Number.NaN;
  /** The pixel ratio and the opening tile size the outlines' stroke was last set for. */
  private outlinePixelRatio = Number.NaN;
  private outlineOpeningTilePx = Number.NaN;
  /** Software WebGL or not, found at `init`: outlines are off on software WebGL unless forced (`OutlineSettings.force`). */
  private webgl: WebGLDetection = { renderer: null, software: false, reason: "not initialised" };
  /** The outline path last logged, so it is logged once, and again only when it changes. */
  private loggedOutlinePath: string | null = null;
  /** What the caller said of the device's effects (`RendererConfig.effectsCapabilities`). */
  private effectsCapabilities: EffectsCapabilities = {};
  /** The face antialiasing path last logged, as for the outlines. */
  private loggedAntialiasingPath: string | null = null;
  /** The renderer's pixel ratio: device px per CSS px of the drawing buffer, the device's capped at `maxPixelRatio`. */
  private pixelRatio = 1;

  private pointerDownPos: { x: number; y: number } | null = null;
  private onTileClickCallback: ((gridX: number, gridY: number) => void) | null = null;
  private onTileHoverCallback: ((gridX: number, gridY: number) => void) | null = null;
  private onHoverLeaveCallback: (() => void) | null = null;
  private boundInputHandler: ((event: SurfaceInputEvent) => void) | null = null;
  private surface: RenderSurfaceAdapter | null = null;
  private unbindResize: (() => void) | null = null;

  constructor(dependencies: GameSceneDependencies = {}) {
    this.scene = new THREE.Scene();
    this.sceneGroup = new THREE.Group();
    this.scene.add(this.sceneGroup);
    this.assets = new AssetLoader();
    this.tiles = new TileRenderer(this.assets);
    this.effects = new Effects();

    this.sceneGroup.add(this.tiles.getGroup());

    this.dependencies = dependencies;
  }

  async init(config: RendererConfig): Promise<void> {
    const {
      surface,
      basePath,
      shadows = true,
      effectsCapabilities = {},
      settings,
    } = config;
    if (settings) this.settings = resolveRendererSettings(settings);

    this.disposed = false;

    // If init is called again on the same instance, detach old listeners first.
    if (this.surface) {
      this.surface.unbindInput();
      this.surface = null;
    }
    if (this.unbindResize) {
      this.unbindResize();
      this.unbindResize = null;
    }

    this.surface = surface;

    // Set asset base path
    if (basePath) {
      this.assets = new AssetLoader(basePath);
      this.tiles = new TileRenderer(this.assets);
      // Re-add to scene group
      this.sceneGroup.clear();
      this.sceneGroup.add(this.tiles.getGroup());
    }

    const rendererFactory = this.dependencies.createRenderer ?? createDefaultRenderer;
    this.renderer = rendererFactory(surface);

    const size = surface.getSize();
    this.pixelRatio = this.cappedPixelRatio();
    this.renderer.setPixelRatio(this.pixelRatio);
    // The canvas's CSS size is its container's (`GameCanvas` sets it to 100 %): `false` keeps three from pinning it in
    // px, which would stop it from following the container (R-VIS).
    this.renderer.setSize(size.width, size.height, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.webgl = detectSoftwareWebGL(this.renderer.getContext?.());
    this.logOutlinePath();
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;

    if (shadows) {
      this.renderer.shadowMap.enabled = true;
      // three 0.186 removed PCFSoftShadowMap and falls back to this, with a warning: five taps on a disk turned by a
      // per-pixel noise, whose dither shows wherever the depth test is unstable (the acne the biases above remove).
      this.renderer.shadowMap.type = THREE.PCFShadowMap;
      // The light and its shadow camera are fixed: the map changes only with the shadow
      // casters (the tiles), not with the view, so it is drawn only when they change.
      this.renderer.shadowMap.autoUpdate = false;
    }

    // Camera
    const cameraControllerFactory = this.dependencies.createCameraController ?? createDefaultCameraController;
    this.controls = cameraControllerFactory(surface);
    this.camera = this.controls.camera;
    this.applyCameraLimits();

    // Re-render when camera moves (orbit, pan, zoom)
    this.controls.controls.addEventListener("change", () => {
      this.requestRender();
    });

    // Lighting
    this.setupLighting();

    // Post-processing
    this.effectsCapabilities = effectsCapabilities;
    this.effects.init(this.renderer, this.scene, this.camera, this.renderProfile, this.faceAntialiasing());
    this.effects.setCapabilities(effectsCapabilities);
    this.logAntialiasingPath();

    // Follow the container's size and the screen's pixel ratio, from now on: a change while the models load counts too.
    this.unbindResize = surface.onResize(() => this.resize());

    // Preload assets
    await this.assets.preloadAll();
    // Disposed while the models were loading: bind nothing on a dead scene (`dispose` released the resize subscription).
    if (this.disposed) return;

    this.setupInteraction(surface);

    // Tiles handed over while the models were loading were drawn from nothing:
    // draw the last ones given now that they can be.
    this.updateTiles(this.latestTiles);
    // The models loaded after the first frame (`AssetLoader`): draw the tiles that waited for theirs as each comes in.
    this.assets.onLoaded(() => this.drawLoadedTiles());
  }

  /** Draws the last tiles given whose model (or plan-view image) has just come in, and the frame and shadows with them. */
  private drawLoadedTiles(): void {
    if (this.disposed || !this.tiles.updateTiles(this.latestTiles)) return;
    this.requestShadowUpdate();
    this.requestRender();
  }

  /**
   * The surface's pixel ratio, capped at `maxPixelRatio` (for `"auto"`, the cap of this device and of the window or
   * screen it is shown in, not of the surface's own size).
   */
  private cappedPixelRatio(): number {
    const cap = resolveMaxPixelRatio(this.settings.maxPixelRatio, this.device());
    return capPixelRatio(this.surface!.getDevicePixelRatio(), cap);
  }

  /** What the `"auto"` settings read of the device: its pointer, and the window's or screen's size. */
  private device(): PixelRatioDevice {
    const surface = this.surface;
    if (!surface) return { coarsePointer: false, width: 0, height: 0 };
    const { width, height } = surface.getViewportSize?.() ?? surface.getSize();
    return { coarsePointer: surface.hasCoarsePointer?.() ?? false, width, height };
  }

  /**
   * Fit the drawing buffer, the camera and the post-processing targets to the surface's size and pixel ratio now.
   * Called by the surface when its container is resized or the screen's pixel ratio changes (`onResize`).
   */
  resize(): void {
    if (!this.surface || !this.renderer) return;
    const { width, height } = this.surface.getSize();
    // A hidden container (0 x 0) keeps the last size: a zero aspect would break the camera.
    if (!(width > 0) || !(height > 0)) return;
    this.pixelRatio = this.cappedPixelRatio();
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(width, height, false);
    this.controls?.resize(width, height);
    this.effects.resize(width, height, this.pixelRatio);
    // `multisampling: "auto"` follows the window: one shrunk to a small screen turns the faces' antialiasing on.
    this.effects.setAntialiasing(this.faceAntialiasing());
    this.logAntialiasingPath();
    this.requestRender();
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
    this.directionalLight.shadow.bias = SHADOW_BIAS;
    this.directionalLight.shadow.normalBias = SHADOW_NORMAL_BIAS;

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

  private setupInteraction(surface: RenderSurfaceAdapter): void {
    const toNdc = (event: SurfaceInputEvent): { x: number; y: number } | null => {
      const size = surface.getSize();
      if (size.width <= 0 || size.height <= 0) {
        return null;
      }

      return {
        x: (event.x / size.width) * 2 - 1,
        y: -(event.y / size.height) * 2 + 1,
      };
    };

    const handlePointerMove = createThrottled((event: SurfaceInputEvent) => {
      const ndc = toNdc(event);
      if (!ndc) return;

      this.camera.updateMatrixWorld();
      const grid = screenToGrid(ndc, this.camera, this.sceneGroup.matrixWorld, 3);
      if (grid) {
        this.onTileHoverCallback?.(grid.x, grid.y);
      } else {
        this.onHoverLeaveCallback?.();
      }
    }, 50); // ~20fps throttle

    this.boundInputHandler = (event: SurfaceInputEvent) => {
      if (event.type === "pointerdown") {
        if ((event.button ?? 0) === 0) {
          this.pointerDownPos = { x: event.x, y: event.y };
        }
        return;
      }

      if (event.type === "pointerup") {
        if ((event.button ?? 0) === 0 && this.pointerDownPos) {
          const up = { x: event.x, y: event.y };
          if (isClick(this.pointerDownPos, up, CLICK_THRESHOLD)) {
            const ndc = toNdc(event);
            if (!ndc) {
              this.pointerDownPos = null;
              return;
            }

            // Ensure camera matrix is fresh (controls may have updated between frames)
            this.camera.updateMatrixWorld();
            const grid = screenToGrid(ndc, this.camera, this.sceneGroup.matrixWorld, 3);
            if (grid && this.onTileClickCallback) {
              this.onTileClickCallback(grid.x, grid.y);
            }
          }
          this.pointerDownPos = null;
        }
        return;
      }

      if (event.type === "pointermove") {
        handlePointerMove(event);
        return;
      }

      if (event.type === "pointerleave") {
        this.onHoverLeaveCallback?.();
      }
    };

    surface.bindInput(this.boundInputHandler);
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
    this.requestShadowUpdate();
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
    this.requestShadowUpdate();
    this.requestRender();
  }

  /** Set compass rotation for scene group */
  setCompassRotation(angle: number): void {
    this.sceneGroup.rotation.y = angle;
    this.requestShadowUpdate();
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

  /**
   * Replace the renderer's settings (`settings.ts`): fields `input` does not name take the defaults. The outlines
   * follow from the next frame, the camera's zoom limits and the face antialiasing at once.
   */
  setSettings(input: RendererSettingsInput): void {
    this.settings = resolveRendererSettings(input);
    this.outlineTilePx = Number.NaN;
    this.logOutlinePath();
    this.applyCameraLimits();
    this.effects.setAntialiasing(this.faceAntialiasing());
    this.logAntialiasingPath();
    // A new cap refits the drawing buffer and the composer's targets at once.
    if (this.surface && this.renderer && this.cappedPixelRatio() !== this.pixelRatio) this.resize();
    this.requestRender();
  }

  getSettings(): RendererSettings {
    return this.settings;
  }

  /**
   * The zoom as the outlines see it: the camera's distance to its target, the on-screen size of a tile there in CSS px,
   * and the outlines' stroke at that size (its width in device px).
   */
  getZoom(): { distance: number; tilePx: number; openingTilePx: number; outline: OutlineStroke } {
    const distance = this.cameraDistance();
    const tilePx = this.tilePx(distance);
    const openingTilePx = this.openingTilePx();
    return { distance, tilePx, openingTilePx, outline: outlineStroke(tilePx, this.outlineSettings(), this.pixelRatio, openingTilePx) };
  }

  /** What `init` found about the WebGL the scene draws with. */
  getWebGL(): WebGLDetection {
    return this.webgl;
  }

  /** The outline settings in effect: off on software WebGL unless forced on (`OutlineSettings.force`). */
  private outlineSettings(): OutlineSettings {
    const { outlines } = this.settings;
    return outlinesAllowed(outlines.force, this.webgl) ? outlines : { ...outlines, enabled: false };
  }

  /** Logs which outline path is taken, once, and again only when it changes. */
  private logOutlinePath(): void {
    // Before `init` the WebGL is not known yet: `init` logs it.
    if (!this.renderer) return;
    const { force, enabled } = this.settings.outlines;
    const on = enabled && outlinesAllowed(force, this.webgl);
    const why = !enabled ? "disabled by the settings" : force !== "auto" ? `forced ${force}` : this.webgl.reason;
    const path = `[renderer] outlines ${on ? "on" : "off"}: ${why}`;
    if (path === this.loggedOutlinePath) return;
    this.loggedOutlinePath = path;
    console.info(path);
  }

  /**
   * The face antialiasing for the settings on this device (`resolveFaceAntialiasing`): MSAA where the WebGL 2 context
   * multisamples (`capabilities.maxSamples`) on a GPU, SMAA on software WebGL or without multisampling.
   */
  private faceAntialiasing(): FaceAntialiasing {
    return resolveFaceAntialiasing(resolveMultisampling(this.settings.multisampling, this.device()), {
      maxSamples: this.renderer?.capabilities?.maxSamples ?? 0,
      software: this.webgl.software,
      supportsMultisampling: this.effectsCapabilities.supportsMultisampling,
    });
  }

  /** Logs which face antialiasing is taken, once, and again only when it changes. */
  private logAntialiasingPath(): void {
    if (!this.renderer) return;
    const mode = this.faceAntialiasing();
    const maxSamples = this.renderer.capabilities?.maxSamples ?? 0;
    const why =
      mode === "off"
        ? this.settings.multisampling === "auto"
          ? "auto, off on a fine pointer and a large screen"
          : "disabled by the settings"
        : mode === "msaa"
          ? `${maxSamples} samples available on ${this.webgl.reason}`
          : this.webgl.software
            ? this.webgl.reason
            : this.effectsCapabilities.supportsMultisampling === false
              ? "multisampling turned off by the effects capabilities"
              : `multisampling unavailable (${maxSamples} samples)`;
    const path = `[renderer] face antialiasing ${mode}: ${why}`;
    if (path === this.loggedAntialiasingPath) return;
    this.loggedAntialiasingPath = path;
    console.info(path);
  }

  private cameraDistance(): number {
    return this.camera && this.controls ? this.camera.position.distanceTo(this.controls.controls.target) : 0;
  }

  /** The tile size the board opens at on this viewport (S): it follows the viewport's height. */
  private openingTilePx(): number {
    const height = this.surface?.getSize().height ?? 0;
    return this.camera ? openingTilePixels(this.camera, height) : 0;
  }

  private tilePx(distance: number): number {
    const height = this.surface?.getSize().height ?? 0;
    return this.camera ? tilePixels(this.camera, distance, height) : 0;
  }

  private applyCameraLimits(): void {
    if (!this.controls) return;
    const { min, max } = cameraDistanceLimits(this.settings.camera);
    this.controls.controls.minDistance = min;
    this.controls.controls.maxDistance = max;
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

  /**
   * Redraw the shadow map with the next frame. Needed whenever a shadow caster is added,
   * removed or moved; tiles are the only casters (hover preview and slots cast none).
   */
  requestShadowUpdate(): void {
    this.shadowsDirty = true;
  }

  private renderFrame(): void {
    // The stroke changes only with the tile's on-screen size, the opening tile size (a resize), the pixel ratio or the
    // settings: a still camera does no outline work.
    const tilePx = this.tilePx(this.cameraDistance());
    const openingTilePx = this.openingTilePx();
    if (tilePx !== this.outlineTilePx || this.pixelRatio !== this.outlinePixelRatio || openingTilePx !== this.outlineOpeningTilePx) {
      this.outlineTilePx = tilePx;
      this.outlinePixelRatio = this.pixelRatio;
      this.outlineOpeningTilePx = openingTilePx;
      const outlines = this.outlineSettings();
      this.tiles.setOutlineStroke(outlineStroke(tilePx, outlines, this.pixelRatio, openingTilePx), outlines.color);
    }
    if (this.shadowsDirty) {
      this.renderer.shadowMap.needsUpdate = true;
      this.shadowsDirty = false;
    }
    this.effects.render();
  }

  /** Start the render loop */
  start(): void {
    const animate = () => {
      this.animationId = requestAnimationFrame(animate);
      const observer = this.frameObserver;
      const tickStart = observer ? performance.now() : 0;
      let rendered = false;

      // controls.update() returns true while damping is active
      const controlsChanged = this.controls.update();
      if (controlsChanged) {
        this.needsRender = true;
      }

      if (this.needsRender) {
        observer?.beforeRender?.();
        this.renderFrame();
        this.needsRender = false;
        rendered = true;
      }

      observer?.afterTick?.({ cpuMs: performance.now() - tickStart, rendered });
    };
    animate();
  }

  /** Attach (or detach with null) a read-only observer of the render loop. */
  setFrameObserver(observer: FrameObserver | null): void {
    this.frameObserver = observer;
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
    this.renderFrame();
  }

  /** Take a screenshot */
  screenshot(): string {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL("image/png");
  }

  /**
   * Cleanup all resources. Safe to call more than once.
   *
   * By default the WebGL context is released too, so the scene must own its surface: a
   * context belongs to its canvas, and a later scene on the same canvas would share the lost one.
   * Pass `releaseContext: false` when the surface's owner frees the context itself.
   */
  dispose({ releaseContext = true }: { releaseContext?: boolean } = {}): void {
    if (this.disposed) return;
    this.disposed = true;

    if (this.surface) {
      this.surface.unbindInput();
      this.surface = null;
    }

    if (this.unbindResize) {
      this.unbindResize();
      this.unbindResize = null;
    }

    this.stop();
    this.tiles.dispose();
    this.effects.dispose();
    this.controls?.dispose();
    this.assets.dispose();
    this.directionalLight?.shadow.dispose();
    this.scene.clear();
    this.latestTiles = [];
    this.onTileClickCallback = null;
    this.onTileHoverCallback = null;
    this.onHoverLeaveCallback = null;
    this.boundInputHandler = null;
    this.pointerDownPos = null;
    this.ambientLight = null;
    this.hemisphereLight = null;
    this.directionalLight = null;
    this.directionalTargetObject = null;

    if (this.renderer) {
      this.renderer.dispose();
      // dispose() frees three's GPU objects but not the context: Chrome keeps about 16
      // per page and drops the oldest, so release it explicitly.
      if (releaseContext) this.renderer.forceContextLoss();
    }
  }
}
