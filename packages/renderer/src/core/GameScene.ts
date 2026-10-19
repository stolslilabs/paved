import * as THREE from "three";
import { AssetLoader } from "./AssetLoader";
import { TileRenderer, type LitTile } from "./TileRenderer";
import { NO_SKINS, type TileSkins } from "./skins";
import { CameraController, TALLEST_TILE_HEIGHT } from "./CameraController";
import { Effects, resolveFaceAntialiasing, type FaceAntialiasing } from "./Effects";
import { screenToGrid, cellCorner, isClick, createThrottled, type CellCorner } from "./interaction";
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
import type { PlacementSlot } from "./placement";
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
import { prefersReducedMotion } from "./placement";
import type { DropResult } from "./tile-drops";
// The day and night cycle is its own chunk: loaded only once the cycle is first on (`loadDayNight`).
import type * as DayNight from "./daynight";
import { lightDirection, resolveLook, resolveQuality, type LookSettings, type QualityTier } from "./look";
import {
  cameraDistanceLimits,
  capPixelRatio,
  coarseOrSmall,
  resolveMaxPixelRatio,
  resolveMultisampling,
  resolveRendererSettings,
  type PixelRatioDevice,
  type RendererSettings,
  type RendererSettingsInput,
} from "./settings";

const CLICK_THRESHOLD = 5;

const DIRECTIONAL_TARGET: [number, number, number] = [0, 0, 0];
/**
 * The key light's distance from its target: that of the former fixed position (35, 50, 65), so the shadow camera's
 * 1 to 100 depth range and its biases below hold at every direction of the look.
 */
const KEY_DISTANCE = Math.hypot(35, 50, 65);
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
    // Every frame is drawn into the composer's target (`Effects`), and the canvas only receives its full-screen final
    // pass: a multisampled canvas would antialias nothing and hold a 4-sample colour and depth buffer, 32 B a pixel
    // (33.8 MiB at 720 x 1480, measured in Q3-GPU). The faces' antialiasing is the composer's (`multisampling`).
    antialias: false,
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
  private readonly cameraListeners = new Set<() => void>();
  private needsRender = true;
  /** The shadow casters changed since the shadow map was last drawn. */
  private shadowsDirty = true;
  private isWebGPU = false;
  private disposed = false;
  private latestTiles: TileRenderData[] = [];
  /** The theme of each plan (`setSkins`), kept for the tile renderer `init` makes. */
  private skins: TileSkins = NO_SKINS;
  private renderProfile: RenderProfile = "play";
  private ambientLight: THREE.AmbientLight | null = null;
  private hemisphereLight: THREE.HemisphereLight | null = null;
  private directionalLight: THREE.DirectionalLight | null = null;
  /** The cooler fill (`LookSettings.fill`): no shadow. */
  private fillLight: THREE.DirectionalLight | null = null;
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

  /**
   * The pointer a tap may come from: where and which pointer went down. `multi` is set when a second pointer went down
   * before it came up (a two-finger pinch or tilt): that gesture places nothing, whatever its fingers' travel.
   */
  private pointerDownPos: { x: number; y: number; pointerId?: number; multi: boolean } | null = null;
  private onTileClickCallback: ((gridX: number, gridY: number) => void) | null = null;
  private onTileHoverCallback: ((gridX: number, gridY: number) => void) | null = null;
  private onHoverLeaveCallback: (() => void) | null = null;
  private boundInputHandler: ((event: SurfaceInputEvent) => void) | null = null;
  private surface: RenderSurfaceAdapter | null = null;
  private unbindResize: (() => void) | null = null;
  /** Stops following the device's reduced-motion setting (`matchMedia`). */
  private unbindReducedMotion: (() => void) | null = null;
  /** The day and night cycle (`daynight.ts`), once loaded; its load, started the first time the cycle is on. */
  private dayNight: typeof DayNight | null = null;
  private dayNightLoad: Promise<void> | null = null;
  /** The cycle's clock (`DayNightClock`), made when the cycle first draws. */
  private dayNightClock: DayNight.DayNightClock | null = null;
  /** Whether the cycle draws the board now: its lights, backdrop and night lights over the look's. */
  private dayNightOn = false;
  /** The cycle's point last drawn (`getDayNight`). */
  private dayNightPoint: DayNight.CyclePoint | null = null;

  constructor(dependencies: GameSceneDependencies = {}) {
    this.scene = new THREE.Scene();
    this.sceneGroup = new THREE.Group();
    this.scene.add(this.sceneGroup);
    this.assets = new AssetLoader();
    this.tiles = new TileRenderer(this.assets);
    // The tiles' labels come in idle slices once a highlight is on: each draws the board again.
    this.tiles.onLabelled(() => this.requestRender());
    this.effects = new Effects();
    // SMAA loads lazily: draw again once the chain has its pass.
    this.effects.setOnRebuilt(() => this.requestRender());

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
      manifest,
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

    // Set asset base path (and the host's manifest, when it gives one)
    if (basePath || manifest) {
      this.assets = new AssetLoader(basePath, manifest);
      this.tiles = new TileRenderer(this.assets);
      this.tiles.onLabelled(() => this.requestRender());
      this.tiles.setSkins(this.skins);
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
    // The composer's last pass tone-maps (`FinishPass`); three's own tone mapping only reaches `screenshot()`.
    this.renderer.toneMapping = THREE.AgXToneMapping;
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
      this.notifyCamera();
    });

    // Lighting
    this.setupLighting();
    this.applyPlacementSettings();
    this.followReducedMotion();

    // Post-processing
    // The capabilities and the look go to the effects before `init`, so the chain is built once, for the tier in effect
    // (set before a renderer, they only resolve the look).
    this.effectsCapabilities = effectsCapabilities;
    this.effects.setCapabilities(effectsCapabilities);
    this.effects.setLook(this.settings.look, this.getQuality());
    this.effects.init(this.renderer, this.scene, this.camera, this.renderProfile, this.faceAntialiasing(), this.settings.msaaSamples);
    this.applyLook();
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

  /**
   * Draws the last tiles given whose model (or plan-view image, or skin variant) has just come in, and the frame and
   * shadows with them; and the ghost, if its model was the one.
   */
  private drawLoadedTiles(): void {
    if (this.disposed) return;
    const hover = this.tiles.refreshHover();
    if (!this.tiles.updateTiles(this.latestTiles)) {
      if (hover) this.requestRender();
      return;
    }
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
    this.notifyCamera();
    // `multisampling: "auto"` follows the window: one shrunk to a small screen turns the faces' antialiasing on.
    this.effects.setAntialiasing(this.faceAntialiasing(), this.settings.msaaSamples);
    this.logAntialiasingPath();
    // `quality: "auto"` follows the window too.
    this.applyLook();
    this.requestRender();
  }

  private setupLighting(): void {
    this.ambientLight = new THREE.AmbientLight(0xffffff, 1);
    this.scene.add(this.ambientLight);

    this.hemisphereLight = new THREE.HemisphereLight(0xbfd8ff, 0x24351f, 0.4);
    this.scene.add(this.hemisphereLight);

    this.directionalLight = new THREE.DirectionalLight(0xffffff, 1);
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

    this.fillLight = new THREE.DirectionalLight(0xffffff, 0);
    this.fillLight.target = this.directionalTargetObject;
    this.scene.add(this.fillLight);
  }

  /** The quality tier in effect: `RendererSettings.quality`, or for "auto" the device's (`resolveQuality`). */
  getQuality(): QualityTier {
    return resolveQuality(this.settings.quality, coarseOrSmall(this.device()), this.effectsCapabilities);
  }

  /** The look as drawn: the settings' look at the tier in effect, what the capabilities forbid turned off. */
  getLook(): LookSettings {
    return resolveLook(this.settings.look, this.getQuality(), this.effectsCapabilities);
  }

  /**
   * Apply the settings' look (`look.ts`): the chain of effects at the tier in effect, the lights, the background and
   * fog, the slots' and ghost's highlights, the water and the feature highlight. A new key-light direction redraws the
   * shadow map.
   */
  private applyLook(): void {
    this.effects.setLook(this.settings.look, this.getQuality());
    const look = this.getLook();
    const profile = getLightingProfile(this.renderProfile);
    const play = getLightingProfile("play");

    if (this.renderer) this.renderer.toneMappingExposure = look.toneMapping.exposure;
    this.scene.background = new THREE.Color(look.background);
    this.scene.fog = look.fog.enabled
      ? new THREE.FogExp2(look.background, (look.fog.density * profile.fogDensity) / play.fogDensity)
      : null;

    if (this.ambientLight) this.ambientLight.intensity = look.sky.enabled ? look.sky.ambient : 0;
    if (this.hemisphereLight) {
      this.hemisphereLight.color.set(look.sky.skyColor);
      this.hemisphereLight.groundColor.set(look.sky.groundColor);
      this.hemisphereLight.intensity = look.sky.enabled ? look.sky.intensity : 0;
    }
    if (this.fillLight) {
      this.fillLight.color.set(look.fill.color);
      this.fillLight.intensity = look.fill.enabled ? look.fill.intensity : 0;
      this.fillLight.position.set(...lightDirection(look.fill.azimuth, look.fill.elevation)).multiplyScalar(KEY_DISTANCE);
      this.fillLight.visible = look.fill.enabled;
    }
    const key = this.directionalLight;
    if (key) {
      key.color.set(look.key.color);
      key.intensity = look.key.enabled ? look.key.intensity : 0;
      key.visible = look.key.enabled;
      const position = new THREE.Vector3(...lightDirection(look.key.azimuth, look.key.elevation))
        .multiplyScalar(KEY_DISTANCE)
        .add(new THREE.Vector3(...DIRECTIONAL_TARGET));
      if (!position.equals(key.position) || key.shadow.radius !== look.key.shadowSoftness) this.requestShadowUpdate();
      key.position.copy(position);
      key.shadow.radius = look.key.shadowSoftness;
    }
    this.tiles.setLook(look.highlights, look.water, look.featureHighlight);
    this.syncDayNight();
    this.requestRender();
  }

  /**
   * The day and night cycle (DAYNIGHT) over the look just applied: when it is on, its chunk loaded, it draws the backdrop,
   * the sun, the moon, the sky and the night lights; off, the look's own stay. Still (reduced motion, the Low tier) it
   * holds its first season's noon, even when frozen (`freezeAt`, a night included); else a frozen cycle holds that moment. The look's values were set just before: turning the
   * cycle off leaves them.
   */
  private syncDayNight(): void {
    const settings = this.settings.dayNight;
    if (!settings.enabled || !this.renderer) {
      if (this.dayNightOn) {
        this.dayNightOn = false;
        this.dayNightPoint = null;
        this.effects.setBackdrop(false);
        this.dayNight?.releaseDayNight(this.directionalLight);
        this.renderer?.setClearColor(0x000000, 1);
        this.tiles.setNightLights(false, settings.nightLightColor, settings.nightLightIntensity, settings.lights);
      }
      return;
    }
    if (!this.dayNight) {
      this.loadDayNight();
      return;
    }
    this.dayNightOn = true;
    // The scene is cleared to transparent: the finish pass lays the backdrop under what it leaves uncovered.
    this.scene.background = null;
    this.renderer.setClearColor(0x000000, 0);
    this.tiles.setNightLights(settings.nightLights && !this.dayNightStill(), settings.nightLightColor, settings.nightLightIntensity, settings.lights);
    const now = performance.now();
    this.dayNightClock ??= new this.dayNight.DayNightClock(now, this.dayNight.pageCycleTime(now, settings.cycleMs));
    this.applyDayNight(this.dayNightSeasons());
  }

  /** Loads the cycle's chunk once; the look is applied again when it is in (a failed load leaves the look's lights). */
  private loadDayNight(): void {
    this.dayNightLoad ??= import("./daynight").then(
      (module) => {
        this.dayNight = module;
        if (!this.disposed) this.applyLook();
      },
      (error: unknown) => console.warn("[renderer] the day and night cycle did not load, the look's lights stay:", error),
    );
  }

  /** A still cycle: reduced motion (the setting, or the device's for "auto") or the Low tier. */
  private dayNightStill(): boolean {
    const { reducedMotion } = this.settings.dayNight;
    return (reducedMotion === "auto" ? prefersReducedMotion() : reducedMotion) || this.getQuality() === "low";
  }

  /** The cycle's moment to draw, in seasons since a summer's dawn: frozen, still (the first season's noon) or running. */
  private dayNightSeasons(): number {
    return this.dayNight!.momentOf(this.settings.dayNight, this.dayNightClock!.time, this.dayNightStill());
  }

  /** Whether the cycle moves on its own (neither frozen nor still): the loop then draws it in steps (`frameMs`). */
  private dayNightRuns(): boolean {
    return this.dayNightOn && this.settings.dayNight.freezeAt === null && !this.dayNightStill();
  }

  /**
   * Draws the cycle at `seasons` (`dayNightFrame`): the key light (the sun, the shadows' light: a new direction redraws
   * the shadow map), the fill (the moon at night), the sky light and ambient, the fog, the backdrop and the night lights'
   * level. Only values change: no light, material or pass is made.
   */
  private applyDayNight(seasons: number): void {
    const look = this.getLook();
    this.dayNightPoint = this.dayNight!.drawDayNight(
      {
        key: look.key.enabled ? this.directionalLight : null,
        fill: look.fill.enabled ? this.fillLight : null,
        sky: look.sky.enabled ? this.hemisphereLight : null,
        ambient: look.sky.enabled ? this.ambientLight : null,
        fog: this.scene.fog,
        distance: KEY_DISTANCE,
        crossfade: this.dayNightRuns(),
        shadowMoved: () => this.requestShadowUpdate(),
        backdrop: (top, bottom) => this.effects.setBackdrop(true, top, bottom),
        lights: (level) => this.tiles.setNightLevel(level),
      },
      seasons,
      this.settings.dayNight.brightnessFloor,
    );
    this.requestRender();
  }

  /** Where the day and night cycle is (its season, phase and blend), or null while it does not draw the board. */
  getDayNight(): DayNight.CyclePoint | null {
    return this.dayNightOn ? this.dayNightPoint : null;
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
          const down = this.pointerDownPos;
          if (down && event.pointerId !== undefined && down.pointerId !== undefined && event.pointerId !== down.pointerId) {
            down.multi = true;
            return;
          }
          this.pointerDownPos = { x: event.x, y: event.y, pointerId: event.pointerId, multi: false };
        }
        return;
      }

      if (event.type === "pointercancel") {
        this.pointerDownPos = null;
        return;
      }

      if (event.type === "pointerup") {
        if ((event.button ?? 0) === 0 && this.pointerDownPos) {
          const up = { x: event.x, y: event.y };
          if (!this.pointerDownPos.multi && isClick(this.pointerDownPos, up, CLICK_THRESHOLD)) {
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

  /**
   * The theme of each plan (`TileSkins`, `skinsOf` for a chain's active set): the tiles of a skinned plan draw a variant of
   * it, one per tile by its hash, each variant loaded when a tile first needs it. A tile keeps its base model until its
   * variant is in; a theme or plan the manifest does not list, and a variant that fails to load, stay on the base model.
   */
  setSkins(skins: TileSkins): void {
    this.skins = skins;
    this.tiles.setSkins(skins);
    this.tiles.updateTiles(this.latestTiles);
    this.requestShadowUpdate();
    this.requestRender();
  }

  /** Set hover preview at grid position */
  setHoveredTile(state: HoverState | null): void {
    this.tiles.setHover(state);
    this.requestRender();
  }

  /**
   * The legal slots of the tile in hand on the board (grid coordinates), any rotation; `fits` false where the current
   * rotation does not fit (a dashed border; solid and brighter where it fits, the default).
   */
  setAvailableSlots(slots: ReadonlyArray<PlacementSlot>): void {
    this.tiles.setAvailableSlots(slots);
    this.requestRender();
  }

  /**
   * A placement confirmed (SLOTS): the effects at its cell turn green and fade out over the tile placed there. The same
   * confirm again does nothing; null removes it. `key` tells two confirms of the same cell apart.
   */
  setConfirmedTile(state: (HoverState & { key?: string | number }) | null): void {
    this.tiles.setConfirmed(state);
    this.requestRender();
  }

  /**
   * Drops a tile placed on the board (`TileRenderer.dropTile`): its voxels fall and land layer by layer, then its model is back.
   * Explicit, for the stories for now: the board does not call it. Resolves when the drop has started, or was skipped.
   */
  async dropTile(tile: { id: number | string; game_id?: number }): Promise<DropResult> {
    const result = await this.tiles.dropTile(`${tile.game_id ?? 1}-${tile.id}`);
    // The real model is hidden now: the cached shadow map still holds it, so it is drawn again with the next frame.
    if (result.status === "started" && !this.disposed) {
      this.requestShadowUpdate();
      this.requestRender();
    }
    return result;
  }

  /** Loads the drop's chunk and the grid of a drawn tile's model, so that its `dropTile` begins in the call: true when ready. */
  prepareDrop(tile: { id: number | string; game_id?: number }): Promise<boolean> {
    return this.tiles.prepareDrop(`${tile.game_id ?? 1}-${tile.id}`);
  }

  /** The placement visuals' settings and reduced motion, from the renderer's settings. */
  private applyPlacementSettings(): void {
    this.tiles.setVoxelDropSettings(this.settings.voxelDrop);
    this.tiles.setPlacementSettings(this.settings.placement, this.settings.outlines);
    const { reducedMotion } = this.settings.placement.motion;
    this.tiles.setReducedMotion(reducedMotion === "auto" ? prefersReducedMotion() : reducedMotion);
  }

  /** Follows the device's `prefers-reduced-motion` while the setting is "auto". */
  private followReducedMotion(): void {
    this.unbindReducedMotion?.();
    this.unbindReducedMotion = null;
    if (typeof matchMedia !== "function") return;
    try {
      const query = matchMedia("(prefers-reduced-motion: reduce)");
      const onChange = () => {
        this.applyPlacementSettings();
        this.syncDayNight();
        this.requestRender();
      };
      query.addEventListener?.("change", onChange);
      this.unbindReducedMotion = () => query.removeEventListener?.("change", onChange);
    } catch {
      // No media queries here: reduced motion stays as the settings say.
    }
  }

  /**
   * Light one structure across its tiles: each tile's areas (a mask, bit `area - 1`, as `StructureBoard.structures`
   * gives them), with the look's feature highlight; the rest of the board dimmed. Null turns it off.
   */
  setLitAreas(lit: Iterable<LitTile> | null): void {
    this.tiles.setLitAreas(lit);
    this.requestRender();
  }

  /** Switch between 3D voxel and 2D strategy rendering */
  setStrategyMode(on: boolean): void {
    this.tiles.setStrategyMode(on);
    this.tiles.updateTiles(this.latestTiles);
    this.requestShadowUpdate();
    this.requestRender();
  }

  /**
   * The top-right corner of a board cell's tile on screen (CSS px from the surface's top-left), at the tiles' top, for a
   * DOM overlay that follows the board. `visible` is false when the corner is off the surface or behind the camera.
   * Null before `init`.
   */
  projectCell(gridX: number, gridY: number): CellCorner | null {
    if (!this.surface || !this.camera) return null;
    this.camera.updateMatrixWorld();
    this.sceneGroup.updateMatrixWorld();
    return cellCorner({ x: gridX, y: gridY }, this.camera, this.sceneGroup.matrixWorld, this.surface.getSize(), TILE_SIZE, TALLEST_TILE_HEIGHT);
  }

  /**
   * `cb` is called whenever what `projectCell` returns may have changed: the camera moved (pan, zoom, orbit, damping), the
   * surface was resized, the compass turned. It forces no frame. Returns the unsubscribe.
   */
  onCameraChange(cb: () => void): () => void {
    this.cameraListeners.add(cb);
    return () => this.cameraListeners.delete(cb);
  }

  private notifyCamera(): void {
    for (const cb of this.cameraListeners) cb();
  }

  /** Set compass rotation for scene group */
  setCompassRotation(angle: number): void {
    this.sceneGroup.rotation.y = angle;
    this.notifyCamera();
    // The tile shader reads a tile's cell in the board's frame, not the world's (the lit structure).
    this.tiles.updateBoardFrame();
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
    // The profile scales the look's exposure (`Effects`) and its fog density against the play profile's.
    this.effects.setProfile(profile);
    this.applyLook();
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
    this.effects.setAntialiasing(this.faceAntialiasing(), this.settings.msaaSamples);
    this.logAntialiasingPath();
    this.applyLook();
    this.applyPlacementSettings();
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
   * multisamples (`capabilities.maxSamples`) `msaaSamples` on a GPU, SMAA on software WebGL or without multisampling.
   */
  private faceAntialiasing(): FaceAntialiasing {
    return resolveFaceAntialiasing(
      resolveMultisampling(this.settings.multisampling, this.device()),
      {
        maxSamples: this.renderer?.capabilities?.maxSamples ?? 0,
        software: this.webgl.software,
        supportsMultisampling: this.effectsCapabilities.supportsMultisampling,
      },
      this.settings.msaaSamples,
    );
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
          ? `${this.settings.msaaSamples} samples, ${maxSamples} available on ${this.webgl.reason}`
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
      this.tiles.setPlacementZoom(tilePx, openingTilePx);
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
      // The placement effects that move (a plate's change of state, the confirm's fade) draw while they do.
      const now = performance.now();
      const moved = this.tiles.update(now);
      if (moved.animating) this.needsRender = true;
      // A drop ended (the model is back) or casts: the shadows and a last frame, which `animating` no longer asks for.
      if (moved.shadow) {
        this.requestShadowUpdate();
        this.needsRender = true;
      }
      // The day and night cycle moves in steps of `frameMs`: each step draws a frame (`applyDayNight` requests it).
      if (this.dayNightRuns()) {
        const { speed, frameMs } = this.settings.dayNight;
        if (this.dayNightClock!.advance(now, speed, frameMs)) this.applyDayNight(this.dayNightSeasons());
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
    this.unbindReducedMotion?.();
    this.unbindReducedMotion = null;

    this.stop();
    this.tiles.dispose();
    this.effects.dispose();
    this.controls?.dispose();
    this.assets.dispose();
    this.directionalLight?.shadow.dispose();
    this.dayNight?.releaseDayNight(this.directionalLight);
    this.scene.clear();
    this.latestTiles = [];
    this.cameraListeners.clear();
    this.onTileClickCallback = null;
    this.onTileHoverCallback = null;
    this.onHoverLeaveCallback = null;
    this.boundInputHandler = null;
    this.pointerDownPos = null;
    this.ambientLight = null;
    this.hemisphereLight = null;
    this.directionalLight = null;
    this.fillLight = null;
    this.directionalTargetObject = null;
    this.dayNightOn = false;
    this.dayNightClock = null;
    this.dayNightPoint = null;

    if (this.renderer) {
      this.renderer.dispose();
      // dispose() frees three's GPU objects but not the context: Chrome keeps about 16
      // per page and drops the oldest, so release it explicitly.
      if (releaseContext) this.renderer.forceContextLoss();
    }
  }
}
