import * as THREE from "three";
import { AssetLoader } from "./AssetLoader";
import { TileRenderer, type LitTile } from "./TileRenderer";
import type { ClosedStructure, ClosedStructuresOptions } from "./closed-structures";
import { NO_SKINS, type TileSkins } from "./skins";
import { CameraController, CLOSEST_DISTANCE, OPENING_DISTANCE, TALLEST_TILE_HEIGHT } from "./CameraController";
import { frameFloorFor, frameInsetsFor, type CameraFit, type CellExtent } from "./camera-fit-settings";
import { Effects, resolveFaceAntialiasing, type FaceAntialiasing } from "./Effects";
import { screenToGrid, cellCorner, createThrottled, PointerTap, type CellCorner, type TilePressListener } from "./interaction";
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
import type { PlacementSettings, PlacementSlot } from "./placement";
import { SquareGridRenderer, backdropLight, backdropShown, gridLineUniforms, highlightShown, type SurfaceLight } from "./square-grid";
import type { Overlay } from "./overlay-pass";
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
import { AmbientLoop } from "./ambient-loop";
import { ambientAllowed, type CloudShadowSettings } from "./ambient-settings";
// The cloud shadows are their own chunk: loaded only once the ambient effects are first on with the clouds (`syncAmbient`).
import type * as Clouds from "./cloud-shadows";
// The fog of war is its own chunk too: loaded only once it is first on with a reveal (`syncFog`).
import type * as Fog from "./fog-of-war";
import { fogMode, type FogCell } from "./fog-of-war-settings";
// The weather is its own chunk too: loaded only once it first shows (`syncWeather`).
import type * as WeatherChunk from "./weather";
// The chimney smoke too (CHIMNEY-SMOKE-2, #770): loaded the first time a board scene can draw it (`syncSmoke`).
import type * as SmokeChunk from "./chimney-smoke";
// The first-person walk (V4-WALK-1, #876) too: loaded on the first walk (`startWalk`).
import type * as WalkChunk from "./walk";
import { resolveWalkSettings, type WalkControl, type WalkSettingsInput, type WalkState } from "./walk-settings";
import { weatherCloudFactor, weatherMode, type WeatherMode } from "./weather-settings";
import { DAY_PHASE_AT } from "./daynight-settings";

/** What the weather sees with the day and night cycle off: the look's fixed lights, a summer's noon (the wheel's summer day). */
const CYCLE_OFF_POINT = { season: "summer", position: DAY_PHASE_AT.day } as const;
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
  /** Makes the renderer; `transparent` is `RendererSettings.transparent` (a canvas with alpha). */
  createRenderer?: (surface: RenderSurfaceAdapter, transparent?: boolean) => THREE.WebGLRenderer;
  createCameraController?: (surface: RenderSurfaceAdapter) => CameraController;
}

function createDefaultRenderer(surface: RenderSurfaceAdapter, transparent = false): THREE.WebGLRenderer {
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
    // Over the page (`RendererSettings.transparent`): the canvas keeps the scene's alpha, premultiplied as the finish pass writes it.
    alpha: transparent,
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
  /** The camera was framed on placed tiles (not only the starter's floor of an empty board): later tiles refit only with `followBoard`. */
  private framedTiles = false;
  /** The frame settings the camera was last framed with: a change frames it again (`setSettings`). */
  private fitSettingsKey = "";
  /** Whether the frame was on (`cameraFit.enabled`) at the last `fitCamera`: turning it on or off moves the camera at once. */
  private fitEnabled: boolean | null = null;
  /** The fit's chunk (`camera-fit.ts`, a chunk of its own), once loaded; the camera opens at its fixed distance without it. */
  private fitModule: typeof import("./camera-fit") | null = null;
  private fitLoad: Promise<void> | null = null;
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

  /** The board's taps and presses (`PointerTap`): a two-finger pinch places nothing, whatever its fingers' travel. */
  private pointerTap: PointerTap | null = null;
  private onTileClickCallback: ((gridX: number, gridY: number) => void) | null = null;
  private onTilePressCallback: TilePressListener | null = null;
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
  /** The cycle's moment last drawn, in seasons (`applyDayNight`): the square grid's backdrop reads its sun there. */
  private dayNightDrawnAt = 0;
  /**
   * The one ambient loop (`ambient-loop.ts`): every ambient effect moves on its time uniform, stepped from this scene's render
   * loop at its capped rate, paused while the tab is hidden or the board covered (`setCovered`), off with the effects.
   */
  readonly ambient = new AmbientLoop();
  /** The cloud shadows (`cloud-shadows.ts`, #573), once their chunk is in; its load, started the first time they are on. */
  private clouds: Clouds.CloudShadows | null = null;
  private cloudsLoad: Promise<void> | null = null;
  /** The cycle's night level last drawn (0 by day, or with the cycle off): the clouds' share on the moon's light. */
  private nightLevel = 0;
  /** The fog of war (`fog-of-war.ts`, FOG-EVERYWHERE), once its chunk is in; its load, started the first time it is on. */
  private fog: Fog.FogOfWar | null = null;
  private fogLoad: Promise<void> | null = null;
  /** The clear cells the board gave (`setFogReveal`) and the cells they lift from; null: no reveal, no fog. */
  private fogReveal: { cells: ReadonlyArray<FogCell>; origin: ReadonlyArray<FogCell> } | null = null;
  /** The weather (`weather.ts`, #607, #658), once its chunk is in; its load, started the first time it shows. */
  private weather: WeatherChunk.Weather | null = null;
  /** The chimney smoke (`chimney-smoke.ts`, #770), once its chunk is in; its load; the placed tiles it last placed (`syncSmokeTiles`). */
  private smoke: SmokeChunk.ChimneySmoke | null = null;
  private smokeLoad: Promise<void> | null = null;
  private smokeTiles = "";
  private weatherLoad: Promise<void> | null = null;
  /**
   * The square grid (SQUARE-GRID, `square-grid.ts`): the violet backdrop in the landscape's place and the highlight in the
   * plates', in the board's group, moving on the ambient loop; with the backdrop off, its lines are the landscape ground's
   * (`syncFog`).
   */
  readonly squareGrid = new SquareGridRenderer(this.ambient.time);
  /** The square grid's place on the ambient loop while it is on (its backdrop, motes and pulse move there). */
  private unregisterSquareGrid: (() => void) | null = null;
  /**
   * What is drawn untouched by the look's tone map and grade (`overlay-pass.ts`): the square grid's highlight over the scene and
   * its backdrop under it, each in a group that turns with the board's (`setCompassRotation`). Given to the effects while they
   * show (`overlayKey`: what was given).
   */
  private readonly overlayRoot = new THREE.Group();
  private readonly underlayRoot = new THREE.Group();
  private readonly overlayScene = new THREE.Scene();
  private readonly underlayScene = new THREE.Scene();
  private overlayKey = "off";
  /** The look's own lights, as the square grid's backdrop measures the light of the moment against them (`syncGridLight`). */
  private lookLights: SurfaceLight[] = [];
  /** The first-person walk under way (`startWalk`), from its descent to the end of its lift back; its chunk's load. */
  private walkSession: WalkChunk.WalkSession | null = null;
  private walkLoad: Promise<typeof WalkChunk> | null = null;
  /** Counts the walks asked and cancelled: a `stopWalk` while one loads cancels it (its `startWalk` resolves null). */
  private walkTicket = 0;

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
    this.overlayRoot.add(this.squareGrid.overlay);
    this.overlayScene.add(this.overlayRoot);
    this.underlayRoot.add(this.squareGrid.group);
    this.underlayScene.add(this.underlayRoot);
    // The logo's font came in: its texture is drawn again.
    this.squareGrid.onChange = () => this.requestRender();

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
    // The fit's chunk loads along the models, so the first frame is framed (no jump from the fixed opening).
    const fitLoad = this.settings.cameraFit.enabled ? this.loadCameraFit() : null;

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
    // The ambient loop stops while the tab is hidden.
    this.ambient.followVisibility();

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
    this.renderer = rendererFactory(surface, this.settings.transparent);
    // Over the page: cleared to transparent, every frame (the finish pass keeps the alpha when it lays no backdrop).
    if (this.settings.transparent) this.renderer.setClearColor(0x000000, 0);

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
    // `reset()` frames the board for the size and settings of the moment, not those of the last frame.
    this.webCamera()?.setFrameSource(() => this.openingFrame());
    // The opening frame (CAMERA-FIT): the tiles given so far, or the starter's floor until they come.
    this.fitCamera();

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
    // Over the page, the finish pass writes premultiplied colour (the board's chain is unchanged).
    if (this.settings.transparent) this.effects.setTransparent(true);
    this.effects.setLook(this.settings.look, this.getQuality());
    this.effects.init(this.renderer, this.scene, this.camera, this.renderProfile, this.faceAntialiasing(), this.settings.msaaSamples);
    this.applyLook();
    this.logAntialiasingPath();

    // Follow the container's size and the screen's pixel ratio, from now on: a change while the models load counts too.
    this.unbindResize = surface.onResize(() => this.resize());

    // Preload assets
    await this.assets.preloadAll();
    await fitLoad;
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
    this.syncSmokeTiles();
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
    // A resize or a turn of the screen frames the board again, as long as the player has not moved the camera.
    if (!this.webCamera()?.userMoved) this.fitCamera();
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
    // The square grid's backdrop draws no mist on the Low tier and software WebGL, where a CPU draws every pixel of its noise
    // (SwiftShader: the backdrop's draw 2.3 times as long with it).
    if (this.squareGrid.setLowPower(this.getQuality() === "low" || this.webgl.software)) this.requestRender();
    this.applyClosingSettings();
    const look = this.getLook();
    const profile = getLightingProfile(this.renderProfile);
    const play = getLightingProfile("play");

    if (this.renderer) this.renderer.toneMappingExposure = look.toneMapping.exposure;
    // Over the page: no background and no fog toward it (the page is the background).
    this.scene.background = this.settings.transparent ? null : new THREE.Color(look.background);
    this.scene.fog = look.fog.enabled && !this.settings.transparent
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
    // The look's lights, before the cycle draws over them: the backdrop's reference.
    this.lookLights = this.sceneLights();
    this.syncDayNight();
    this.applyUnderlayBackground();
    this.syncGridLight();
    this.syncAmbient();
    this.syncFog();
    this.requestRender();
  }

  /**
   * The ambient effects (AMBIENT, #572): on when the settings say so, but not on the Low tier or under reduced motion
   * (`ambientAllowed`). Off, the loop stops. An effect is a chunk of its own that registers on `ambient` (`AmbientLoop`): the
   * cloud shadows (#573) load the first time they are on; off, they leave the light as it was (their chunk stays).
   */
  private syncAmbient(): void {
    const settings = this.settings.ambient;
    const on = ambientAllowed(settings, this.getQuality(), prefersReducedMotion()) && !!this.renderer;
    this.ambient.setRate(settings.fps);
    this.ambient.setEnabled(on);
    const clouds = this.clouds;
    if (clouds) {
      clouds.setSettings(this.cloudSettings());
      clouds.setActive(on && settings.clouds.enabled);
    } else if (on && settings.clouds.enabled) {
      this.loadClouds();
    }
    this.syncWeather();
    this.syncSmoke();
    this.requestRender();
  }

  /**
   * The clear cells of the fog of war (FOG-EVERYWHERE, #648), in the grid: the board's tiles and free slots (`boardReveal`), in
   * every mode (#739). A cell added lifts from the side of `origin` (the tile just placed). Null: no fog (a tile's preview). The fog shows only with
   * `RendererSettings.fog` on.
   */
  setFogReveal(cells: ReadonlyArray<FogCell> | null, origin: ReadonlyArray<FogCell> = []): void {
    this.fogReveal = cells ? { cells, origin } : null;
    this.syncFog();
  }

  /**
   * The fog of war: on with the settings and a reveal, its chunk loaded the first time; its mode from the tier, the ambient
   * effects and reduced motion (`fogMode`: it stays on at every tier, still where the effects cannot move it); off, hidden.
   */
  private syncFog(): void {
    const settings = this.settings.fog;
    const reveal = this.fogReveal;
    // The square grid's backdrop takes the fog's and its landscape's place.
    const on = settings.enabled && !backdropShown(this.settings.squareGrid) && !!reveal && !!this.renderer;
    const fog = this.fog;
    if (!fog) {
      if (on) this.loadFog();
      return;
    }
    fog.setSettings(settings);
    fog.setGrid(gridLineUniforms(this.settings.squareGrid));
    fog.setMode(on ? fogMode(settings, this.settings.ambient, this.getQuality(), prefersReducedMotion()) : "off");
    if (reveal) fog.setRevealed(reveal.cells, reveal.origin);
    fog.setCycle(this.getDayNight());
    this.requestRender();
  }

  /** Loads the fog's chunk once, in the board's group (it turns with the compass), on the ambient loop. */
  private loadFog(): void {
    this.fogLoad ??= import("./fog-of-war").then(
      (module) => {
        if (this.disposed) return;
        const fog = new module.FogOfWar(this.ambient.time, this.settings.fog);
        fog.onChange = () => this.requestRender();
        this.fog = fog;
        this.tiles.getGroup().add(fog.object);
        this.ambient.register(fog);
        this.syncFog();
      },
      (error: unknown) => console.warn("[renderer] the fog of war did not load, the board stays clear:", error),
    );
  }

  /** The fog of war now (`FogOfWar.stats`), or null before its chunk is in: the bench and the stories' readout. */
  getFog(): ReturnType<Fog.FogOfWar["stats"]> | null {
    return this.fog?.stats() ?? null;
  }

  /** The cloud shadows' settings, with autumn's more clouds while the weather shows (`weatherCloudFactor`). */
  private cloudSettings(): CloudShadowSettings {
    const clouds = this.settings.ambient.clouds;
    const factor = this.weatherModeNow() !== "off" ? weatherCloudFactor(this.settings.weather, "autumn") : 1;
    if (factor === 1) return clouds;
    return { ...clouds, seasonCoverage: { ...clouds.seasonCoverage, autumn: clouds.seasonCoverage.autumn * factor } };
  }

  /**
   * The weather's mode (`weatherMode`): off with the weather or the ambient effects off ("Ambient effects"), or on the Low tier;
   * still under reduced motion (nothing falls: the grade, the brightness and the snow on the tops only); else moving, on the
   * ambient loop. With the day and night cycle off it shows too: that board is summer's day (`CYCLE_OFF_POINT`).
   */
  private weatherModeNow(): WeatherMode {
    if (!this.renderer) return "off";
    return weatherMode(this.settings.weather, this.settings.ambient, this.getQuality(), prefersReducedMotion());
  }

  /**
   * The weather (WEATHER-WIRE, #658) in every board: its chunk loads the first time it shows, then it follows the settings, the
   * clouds' wind, its mode and the cycle's point (`syncWeatherCycle`: the wheel's season, auto or fixed, by day and at night).
   */
  private syncWeather(): void {
    const mode = this.weatherModeNow();
    const weather = this.weather;
    if (!weather) {
      if (mode !== "off") this.loadWeather();
      return;
    }
    weather.setSettings(this.settings.weather);
    weather.setWind(this.settings.ambient.clouds.windDirection, this.settings.ambient.clouds.windSpeed);
    this.syncWeatherCycle();
    weather.setMode(mode);
  }

  /**
   * The cycle's point to the weather: its season and daylight. With the cycle off in the settings, the look's own fixed lights are
   * the wheel's summer day (`wheelDayNight`: summer with Day and night off), so summer's noon; with the cycle on but not drawn yet
   * (its chunk on its way), none, so its first season shows at once rather than fading in from summer.
   */
  private syncWeatherCycle(): void {
    this.weather?.setCycle(this.getDayNight() ?? (this.settings.dayNight.enabled ? null : CYCLE_OFF_POINT));
  }

  /** Loads the weather's chunk once, adds it to the scene and registers it on the loop (a failed load leaves the board as it is). */
  private loadWeather(): void {
    this.weatherLoad ??= import("./weather").then(
      (module) => {
        if (this.disposed) return;
        const weather = new module.Weather(this.ambient.time, this.tiles.snowUniforms, this.settings.weather);
        weather.onChange = () => this.requestRender();
        this.weather = weather;
        this.scene.add(weather.object);
        this.ambient.register(weather);
        this.syncWeather();
      },
      (error: unknown) => console.warn("[renderer] the weather did not load, the board stays as it is:", error),
    );
  }

  /** The weather now (`Weather.stats`), or null before its chunk is in: the stories' readout and the tests. */
  getWeather(): WeatherChunk.WeatherStats | null {
    return this.weather?.stats() ?? null;
  }

  /**
   * Whether the chimney smoke can be drawn (`RendererSettings.smoke`, an ambient effect): on with its setting, the ambient effects on,
   * not on the Low tier and not under reduced motion (`ambientAllowed`). Off, the placed tiles keep their white voxels (#770).
   */
  private smokeModeNow(): SmokeChunk.SmokeStats["mode"] {
    if (!this.renderer || !this.settings.smoke.enabled) return "off";
    return ambientAllowed(this.settings.ambient, this.getQuality(), prefersReducedMotion()) ? "moving" : "off";
  }

  /**
   * The chimney smoke (CHIMNEY-SMOKE-2, #770) in the scenes that turn it on (the app's boards): its chunk loads the first time it can
   * be drawn, then it follows the settings, the clouds' wind, its mode and the cycle's season (`syncSmokeCycle`). While it can be
   * drawn (every season: summer has neither smoke nor white voxels), the placed tiles draw their types' smoke-free twins; while it
   * cannot, the loader's, white voxels and all.
   */
  private syncSmoke(): void {
    const mode = this.smokeModeNow();
    const smoke = this.smoke;
    if (!smoke) {
      if (mode !== "off") this.loadSmoke();
      return;
    }
    smoke.setSettings(this.settings.smoke);
    smoke.setWind(this.settings.ambient.clouds.windDirection, this.settings.ambient.clouds.windSpeed);
    this.syncSmokeCycle();
    smoke.setMode(mode);
    if (this.tiles.setSmokeHidden(smoke.hidesVoxels())) this.requestShadowUpdate();
    this.syncSmokeTiles(smoke.needsTiles);
    smoke.needsTiles = false;
    this.requestRender();
  }

  /** The cycle's season to the smoke, as the weather's (`syncWeatherCycle`); with the cycle on but not drawn yet, nothing (no fade from summer). */
  private syncSmokeCycle(): void {
    const point = this.getDayNight() ?? (this.settings.dayNight.enabled ? null : CYCLE_OFF_POINT);
    if (point) this.smoke?.setCycle(point);
  }

  /**
   * The placed tiles to the smoke, when they changed (a tile placed, a model in, a drop landed, a tile moved in place: its lift,
   * size or cell, `TileRenderer.place`, which keeps its mesh): each new type's chimneys found and its twins handed to the tile
   * renderer (once a type), then the mouths placed.
   */
  private syncSmokeTiles(force = false): void {
    const smoke = this.smoke;
    if (!smoke || this.disposed) return;
    const sources = this.tiles.smokeSources();
    const placed = (o: THREE.Object3D | null) => (o ? [...o.position.toArray(), ...o.quaternion.toArray(), ...o.scale.toArray()].join(",") : "");
    const signature = sources.map((s) => `${s.id}:${s.tile.uuid}:${placed(s.tile.parent)}`).join("|");
    if (!force && signature === this.smokeTiles) return;
    this.smokeTiles = signature;
    let swapped = false;
    for (const source of sources) {
      if (smoke.has(source.key)) continue;
      smoke.prepare(source.key, source.type);
      const free = smoke.freeOf(source.key);
      if (free && this.tiles.setSmokeFree(source.key, free)) swapped = true;
    }
    smoke.setTiles(sources, this.tiles.getGroup());
    if (swapped) this.requestShadowUpdate();
    this.requestRender();
  }

  /** Loads the smoke's chunk once, in the board's group (it turns with the compass), on the ambient loop. */
  private loadSmoke(): void {
    this.smokeLoad ??= import("./chimney-smoke").then(
      (module) => {
        if (this.disposed) return;
        const smoke = new module.ChimneySmoke(this.ambient.time, this.settings.smoke);
        this.smoke = smoke;
        this.tiles.getGroup().add(smoke.object);
        this.ambient.register(smoke);
        this.syncSmoke();
      },
      (error: unknown) => console.warn("[renderer] the chimney smoke did not load, the tiles keep their white voxels:", error),
    );
  }

  /** The chimney smoke now (`ChimneySmoke.stats`), or null before its chunk is in: the stories' readout and the tests. */
  getSmoke(): SmokeChunk.SmokeStats | null {
    return this.smoke?.stats() ?? null;
  }

  /** Loads the cloud shadows' chunk once and registers them on the loop (a failed load leaves the board as it is). */
  private loadClouds(): void {
    this.cloudsLoad ??= import("./cloud-shadows").then(
      (module) => {
        if (this.disposed) return;
        const clouds = new module.CloudShadows(this.tiles.cloudUniforms, this.cloudSettings());
        clouds.onChange = () => this.requestRender();
        this.clouds = clouds;
        this.syncCloudLight();
        this.scene.add(clouds.object);
        this.ambient.register(clouds);
        this.syncAmbient();
      },
      (error: unknown) => console.warn("[renderer] the cloud shadows did not load, the board stays still:", error),
    );
  }

  /**
   * What the clouds can dim (`CloudShadows.setLight`): with the cycle drawing the board, its season, how up its sun is (0 at
   * night: the clouds then step no frame unless they dim the moon) and its night level; with the cycle off, the look's sun.
   */
  private syncCloudLight(): void {
    // The fog dims with the cycle as well (its moonlit blue at night).
    this.fog?.setCycle(this.getDayNight());
    const clouds = this.clouds;
    if (!clouds) return;
    const point = this.getDayNight();
    clouds.setSeason(point?.season ?? null);
    const sun = point && this.dayNight ? this.dayNight.sunAt(point.season, point.position).up : 1;
    clouds.setLight(sun, point ? this.nightLevel : 0);
  }

  /** The cloud shadows now (`CloudShadows.stats`), or null before their chunk is in: the stories' readout. */
  getClouds(): ReturnType<Clouds.CloudShadows["stats"]> | null {
    return this.clouds?.stats() ?? null;
  }

  /**
   * The board is covered (a full-screen sheet, the score panel over it) or not: covered, the ambient loop stops, and the board
   * draws nothing more until something on it changes.
   */
  setCovered(covered: boolean): void {
    this.ambient.setPaused("covered", covered);
  }

  /** The ambient loop now: whether it runs, its rate and the steps it took. */
  getAmbient(): { running: boolean; fps: number; steps: number } {
    return { running: this.ambient.running, fps: this.ambient.getRate(), steps: this.ambient.steps };
  }

  /**
   * The day and night cycle (DAYNIGHT) over the look just applied: when it is on, its chunk loaded, it draws the backdrop,
   * the sun, the moon, the sky and the night lights; off, the look's own stay. Still (reduced motion, the Low tier) it
   * holds its first season's noon, even when frozen (`freezeAt`, a night included); else a frozen cycle holds that moment. The look's values were set just before: turning the
   * cycle off leaves them.
   */
  private syncDayNight(): void {
    const settings = this.settings.dayNight;
    // Over the page, the cycle's backdrop would cover it: the look's lights stay.
    if (!settings.enabled || this.settings.transparent || !this.renderer) {
      if (this.dayNightOn) {
        this.dayNightOn = false;
        this.dayNightPoint = null;
        this.effects.setBackdrop(false);
        this.dayNight?.releaseDayNight(this.directionalLight);
        this.renderer?.setClearColor(0x000000, 1);
        this.applyUnderlayBackground();
        this.tiles.setNightLights(false, settings.nightLightColor, settings.windowLight);
        this.nightLevel = 0;
        this.syncCloudLight();
      }
      this.syncWeather();
      this.syncSmoke();
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
    this.tiles.setNightLights(settings.nightLights && !this.dayNightStill(), settings.nightLightColor, settings.windowLight);
    const now = performance.now();
    this.dayNightClock ??= new this.dayNight.DayNightClock(now, this.dayNight.pageCycleTime(now, settings.cycleMs));
    this.applyDayNight(this.dayNightSeasons());
  }

  /**
   * The lights an upward surface of the board takes now (`SurfaceLight`): the ambient, the sky light (its sky colour), the key and
   * the fill (by their direction). A light turned off gives none. With the cycle's `sun`, the key is the whole sun: while the
   * cycle runs, the key light holds only its share of it (the rest is its twin's, `drawDayNight`'s crossfade).
   */
  private sceneLights(sun?: { direction: [number, number, number]; intensity: number }): SurfaceLight[] {
    const out: SurfaceLight[] = [];
    const target = this.directionalTargetObject?.position ?? new THREE.Vector3();
    if (this.ambientLight?.visible) out.push({ color: this.ambientLight.color.clone(), intensity: this.ambientLight.intensity });
    if (this.hemisphereLight?.visible) out.push({ color: this.hemisphereLight.color.clone(), intensity: this.hemisphereLight.intensity });
    for (const light of [this.directionalLight, this.fillLight]) {
      if (!light?.visible) continue;
      const whole = sun && light === this.directionalLight;
      out.push({
        color: light.color.clone(),
        intensity: whole ? sun.intensity : light.intensity,
        direction: whole ? new THREE.Vector3(...sun.direction) : light.position.clone().sub(target),
      });
    }
    return out;
  }

  /**
   * The square grid's backdrop as bright as the board is now (the time of day: `backdropLight` against the look's lights), its
   * veil in the season's hue while the cycle draws (its day's ground colour, steady through the day and the night:
   * `seasonGroundAt`). A frame when it changed.
   */
  private syncGridLight(): void {
    if (!backdropShown(this.settings.squareGrid)) return;
    const frame = this.dayNightOn && this.dayNight ? this.dayNight.dayNightFrame(this.dayNightDrawnAt, this.settings.dayNight.brightnessFloor) : null;
    const ground = frame && new THREE.Color().setRGB(...this.dayNight!.seasonGroundAt(frame.point), THREE.LinearSRGBColorSpace);
    if (this.squareGrid.setLight(backdropLight(this.sceneLights(frame?.sun), this.lookLights), ground)) this.requestRender();
  }

  /**
   * While the square grid's backdrop shows, the scene is cleared to nothing and draws no background or distance fog: the finish
   * pass lays the backdrop under what the scene leaves uncovered (`overlay-pass.ts`), and Realms' world map has no distance fog.
   */
  private applyUnderlayBackground(): void {
    if (!backdropShown(this.settings.squareGrid)) return;
    this.scene.background = null;
    this.scene.fog = null;
    this.renderer?.setClearColor(0x000000, 0);
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
    this.dayNightDrawnAt = seasons;
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
        lights: (level) => {
          this.tiles.setNightLevel(level);
          this.nightLevel = level;
        },
      },
      seasons,
      this.settings.dayNight.brightnessFloor,
    );
    this.syncCloudLight();
    this.syncGridLight();
    this.syncWeatherCycle();
    this.syncSmokeCycle();
    this.requestRender();
  }

  /** Where the day and night cycle is (its season, phase and blend), or null while it does not draw the board. */
  getDayNight(): DayNight.CyclePoint | null {
    return this.dayNightOn ? this.dayNightPoint : null;
  }

  /**
   * The grid cell under a point of the surface (its own pixels, from its top left), as a tap there would name it; null off the
   * ground or before `init`. A drag that ends over the board (a village's reward tile) finds its cell with it.
   */
  gridAt(point: { x: number; y: number }): { x: number; y: number } | null {
    const size = this.surface?.getSize();
    if (!size || size.width <= 0 || size.height <= 0 || !this.camera) return null;
    this.camera.updateMatrixWorld();
    return screenToGrid({ x: (point.x / size.width) * 2 - 1, y: -(point.y / size.height) * 2 + 1 }, this.camera, this.sceneGroup.matrixWorld, 3);
  }

  private setupInteraction(surface: RenderSurfaceAdapter): void {
    const toNdc = (event: { x: number; y: number }): { x: number; y: number } | null => {
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

    const toGrid = (point: { x: number; y: number }): { x: number; y: number } | null => {
      const ndc = toNdc(point);
      if (!ndc) return null;
      // Ensure camera matrix is fresh (controls may have updated between frames)
      this.camera.updateMatrixWorld();
      return screenToGrid(ndc, this.camera, this.sceneGroup.matrixWorld, 3);
    };
    this.pointerTap = new PointerTap(
      {
        toGrid,
        onPress: (x, y, phase) => this.onTilePressCallback?.(x, y, phase),
        onClick: (x, y) => this.onTileClickCallback?.(x, y),
      },
      CLICK_THRESHOLD,
    );

    this.boundInputHandler = (event: SurfaceInputEvent) => {
      // While walking the board takes no tap or hover: a click locks the mouse for the look (the host's).
      if (this.walkSession) return;
      this.pointerTap?.handle(event);

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

  /**
   * A press on a cell, from the down (TILE-HOLD, #630): `down`, then `released` or `cancelled` (`PointerTap`). The board holds
   * the placed tile with it; returning true on `released` (the hold acted) keeps the click that would follow from firing.
   */
  onTilePress(cb: TilePressListener | null): void {
    this.onTilePressCallback = cb;
  }

  onTileHover(cb: ((gridX: number, gridY: number) => void) | null): void {
    this.onTileHoverCallback = cb;
  }

  onHoverLeave(cb: (() => void) | null): void {
    this.onHoverLeaveCallback = cb;
  }

  /**
   * Every plan's tile image is in (the plan view's, and the placeholder quads'): `init` waits for the models of the tiles
   * handed over but lets the scene start without an image that failed, which is tried again after the first frame. This
   * asks for the missing images again after each failure (`attempts` tries in all, `retryMs` doubling between them), and
   * resolves once all are in, or rejects with the last failure (or when the scene is disposed). A host's ready signal
   * (#761) waits for it after `onReady`.
   */
  async tileImagesReady({ attempts = 4, retryMs = 500 }: { attempts?: number; retryMs?: number } = {}): Promise<void> {
    for (let attempt = 1; ; attempt++) {
      try {
        await this.assets.preloadTextures();
      } catch (error) {
        if (this.disposed || attempt >= attempts) throw error;
        await new Promise((done) => setTimeout(done, retryMs * 2 ** (attempt - 1)));
        continue;
      }
      if (this.disposed) throw new Error("GameScene: disposed before its tile images were in");
      return;
    }
  }

  /** Update placed tiles */
  updateTiles(tiles: TileRenderData[]): void {
    this.latestTiles = tiles.slice();
    this.tiles.updateTiles(tiles);
    this.syncSmokeTiles();
    // The backdrop is in colour near the placed tiles.
    this.squareGrid.setTileCells(tiles.map((t) => ({ x: t.worldX, y: t.worldZ })));
    if (this.controls) {
      this.controls.setBoardBounds(this.computeBoardBounds());
      // The first tiles open the frame on them; later ones only with `followBoard`, while the player has not moved.
      const follow = this.settings.cameraFit.followBoard && !this.webCamera()?.userMoved;
      if (tiles.length > 0 && (!this.framedTiles || follow)) this.fitCamera();
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
    this.syncSmokeTiles();
    this.requestShadowUpdate();
    this.requestRender();
  }

  /** Set hover preview at grid position */
  setHoveredTile(state: HoverState | null): void {
    this.tiles.setHover(state);
    this.squareGrid.setGhost(state && { x: state.x, y: state.y, placed: !!state.placed });
    this.requestRender();
  }

  /**
   * The legal slots of the tile in hand on the board (grid coordinates), any rotation; `fits` false where the current
   * rotation does not fit (a dashed border; solid and brighter where it fits, the default).
   */
  setAvailableSlots(slots: ReadonlyArray<PlacementSlot>): void {
    this.tiles.setAvailableSlots(slots);
    this.squareGrid.setSlots(slots);
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
   * Explicit, never at a first load: the app calls it when the session accepts a move (PLACE-POLISH, #568). Resolves when
   * the drop has started, or was skipped.
   */
  async dropTile(tile: { id: number | string; game_id?: number }): Promise<DropResult> {
    const result = await this.tiles.dropTile(`${tile.game_id ?? 1}-${tile.id}`);
    // The real model is hidden now: the cached shadow map still holds it, so it is drawn again with the next frame.
    if (result.status === "started" && !this.disposed) {
      this.requestShadowUpdate();
      this.requestRender();
      // Its chimneys smoke once it has landed (`smokeSources` leaves a tile out mid-drop): none over the falling voxels.
      if (this.smoke) {
        this.syncSmokeTiles();
        void result.finished.then(() => this.syncSmokeTiles());
      }
    }
    return result;
  }

  /** Loads the drop's chunk and the grid of a drawn tile's model, so that its `dropTile` begins in the call: true when ready. */
  prepareDrop(tile: { id: number | string; game_id?: number }): Promise<boolean> {
    return this.tiles.prepareDrop(`${tile.game_id ?? 1}-${tile.id}`);
  }

  /**
   * Loads the drop's chunk and the grid of the model the tile in hand will draw at its cell (`state.cell`), before it is on
   * the board: the app calls it once the tile is placed (pre-validated), so that the drop at the confirm begins at once.
   */
  prepareDropAt(state: HoverState): Promise<boolean> {
    return this.tiles.prepareDropAt(state);
  }

  /** The placement visuals' settings and reduced motion, from the renderer's settings; the square grid's with them. */
  private applyPlacementSettings(): void {
    this.tiles.setVoxelDropSettings(this.settings.voxelDrop);
    this.tiles.setPlacementSettings(this.placementSettings(), this.settings.outlines);
    const { reducedMotion } = this.settings.placement.motion;
    const reduced = reducedMotion === "auto" ? prefersReducedMotion() : reducedMotion;
    this.tiles.setReducedMotion(reduced);
    this.applyClosingSettings();
    this.squareGrid.setSettings(this.settings.squareGrid);
    this.squareGrid.setReducedMotion(reduced);
    // On the ambient loop only while it is on: off, the loop has nothing of it to step.
    this.unregisterSquareGrid?.();
    this.unregisterSquareGrid = this.settings.squareGrid.enabled ? this.ambient.register(this.squareGrid) : null;
    // Its highlight is drawn as given over the graded scene, its backdrop under it with Realms' tone map, while they show.
    const grid = this.settings.squareGrid;
    const over = highlightShown(grid);
    const under = backdropShown(grid);
    const key = over || under ? `${over}|${under}|${grid.backdrop.exposure}` : "off";
    if (key !== this.overlayKey) {
      this.overlayKey = key;
      const overlay: Overlay = { scene: over ? this.overlayScene : null, depth: this.squareGrid.overlayDepth, underlay: under ? this.underlayScene : null, underlayExposure: grid.backdrop.exposure };
      this.effects.setOverlay(over || under ? overlay : null);
    }
  }

  /** The placement settings as drawn: no plate while the square grid's highlight takes their place (`SquareGridSettings.highlight`). */
  private placementSettings(): PlacementSettings {
    const { placement, squareGrid } = this.settings;
    if (!highlightShown(squareGrid)) return placement;
    return { ...placement, plates: { ...placement.plates, enabled: false } };
  }

  /** What the square grid draws now (`SquareGridRenderer.stats`): the stories' readout and the tests. */
  getSquareGrid(): ReturnType<SquareGridRenderer["stats"]> {
    return this.squareGrid.stats();
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
        this.syncAmbient();
        // The fog stands still under reduced motion: a lift under way ends at once.
        this.syncFog();
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

  /**
   * The closed structures (CLOSE-SHINE, #722): every structure closed so far, each with a stable id and its areas on its tiles
   * (a mask per tile, bit `area - 1`, as `setLitAreas` takes them). One that appears after the first call pulses bright yellow
   * (staggered as the closing feed's lines), then a band of light sweeps across it every few seconds for the rest of the game,
   * on its own clock; the first call's (a board loaded mid-game) shine at once, with no pulse. `options.pulse` overrides that.
   * The rest of the board is not dimmed. Frames are drawn only while a pulse or a sweep runs (`TileRenderer.update`).
   */
  setClosedStructures(structures: readonly ClosedStructure[], options?: ClosedStructuresOptions): void {
    this.tiles.setClosedStructures(structures, options);
    this.requestRender();
  }

  /**
   * The closed structures' settings (`RendererSettings.closing`), with reduced motion as the placement reads it (the confirm's
   * rule: a short pulse) and low power (the Low tier, software WebGL: no shine, as the ambient effects).
   */
  private applyClosingSettings(): void {
    const { reducedMotion } = this.settings.placement.motion;
    const reduced = reducedMotion === "auto" ? prefersReducedMotion() : reducedMotion;
    this.tiles.setClosingSettings(this.settings.closing, reduced, this.getQuality() === "low" || this.webgl.software);
  }

  /** The closed structures' layer, read only: how many, a structure's pulse and sweep at a time (the stories, the tests). */
  getClosedStructures(): TileRenderer["closedLayer"] {
    return this.tiles.closedLayer;
  }

  /** Switch between 3D voxel and 2D strategy rendering */
  setStrategyMode(on: boolean): void {
    this.tiles.setStrategyMode(on);
    this.tiles.updateTiles(this.latestTiles);
    this.syncSmokeTiles();
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
    this.overlayRoot.rotation.y = angle;
    this.underlayRoot.rotation.y = angle;
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
    // New frame settings (the story's floor, insets) apply at once while the player has not moved the camera. Turning the
    // frame on or off applies at once whatever the player did: on, the board's frame; off, today's opening.
    if (JSON.stringify(this.settings.cameraFit) !== this.fitSettingsKey) {
      if (this.fitEnabled !== null && this.settings.cameraFit.enabled !== this.fitEnabled) this.resetCamera();
      else if (!this.webCamera()?.userMoved) this.fitCamera();
    }
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
    // While walking every tile is close: the outlines are drawn as at the closest zoom.
    if (this.walkSession) return CLOSEST_DISTANCE;
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

  /**
   * The frame of the board on this surface (CAMERA-FIT, #678, `computeCameraFit`): the tiles and their ring of free slots,
   * at least `floorCells` square and its margin (`FRAME_FLOORS` by width for `"auto"`), in the screen less the HUD, never farther than `OPENING_DISTANCE` (nor the zoom limits).
   * Null before `init`.
   */
  getCameraFit(): CameraFit | null {
    if (!this.surface || !this.camera || !this.fitModule) return null;
    const { width, height } = this.surface.getSize();
    const fit = this.settings.cameraFit;
    const { min, max } = cameraDistanceLimits(this.settings.camera);
    return this.fitModule.computeCameraFit({
      cells: this.cellExtent(),
      width,
      height,
      fov: this.camera.fov,
      zoom: this.camera.zoom,
      insets: fit.insets === "auto" ? frameInsetsFor(width) : fit.insets,
      floorCells: fit.floorCells === "auto" ? frameFloorFor(width).cells : fit.floorCells,
      marginCells: fit.marginCells === "auto" ? frameFloorFor(width).margin : fit.marginCells,
      ring: fit.ring,
      minDistance: min,
      maxDistance: Math.min(OPENING_DISTANCE, max),
    });
  }

  /** Frames the board again (the re-centre action), whether or not the player moved the camera; resizes follow it again. */
  recenter(): void {
    this.fitCamera(true);
  }

  /**
   * Where the camera opens now, in play mode: the board's frame with `cameraFit` on, else today's opening, `OPENING_DISTANCE`
   * over the starter (within the zoom limits). Null in another mode or on a hidden surface.
   */
  private openingFrame(): { target: { x: number; z: number }; distance: number } | null {
    const controls = this.webCamera();
    if (!controls || !this.surface || controls.getMode() !== "play") return null;
    const { width, height } = this.surface.getSize();
    if (!(width > 0) || !(height > 0)) return null;
    if (this.settings.cameraFit.enabled) return this.getCameraFit();
    return { target: { x: 0, z: 0 }, distance: Math.min(OPENING_DISTANCE, cameraDistanceLimits(this.settings.camera).max) };
  }

  /** Back to where the camera opens now (`openingFrame`, through `CameraController.reset`). */
  private resetCamera(): void {
    const controls = this.webCamera();
    if (!controls || this.walkSession) return;
    this.fitSettingsKey = JSON.stringify(this.settings.cameraFit);
    this.fitEnabled = this.settings.cameraFit.enabled;
    // Turned on in a scene that opened with the frame off: its chunk is not in yet; it frames once loaded.
    if (this.settings.cameraFit.enabled && !this.fitModule) {
      void this.loadCameraFit(true);
      return;
    }
    controls.reset();
    this.framedTiles = this.settings.cameraFit.enabled && this.latestTiles.length > 0;
    this.notifyCamera();
    this.requestRender();
  }

  /** The web controller (`CameraController`), the one that frames; null before `init` or for another controller. */
  private webCamera(): CameraController | null {
    return this.controls instanceof CameraController ? this.controls : null;
  }

  /** Puts the camera on the board's frame (`getCameraFit`), in play mode with the frame on (or `force`d by `recenter`). */
  private fitCamera(force = false): void {
    const controls = this.webCamera();
    // While walking the camera is the walker's: the frame waits for the way back.
    if (!controls || !this.surface || this.walkSession) return;
    const { width, height } = this.surface.getSize();
    this.fitSettingsKey = JSON.stringify(this.settings.cameraFit);
    this.fitEnabled = this.settings.cameraFit.enabled;
    if (!(width > 0) || !(height > 0)) return;
    if (!force && (!this.settings.cameraFit.enabled || controls.getMode() !== "play")) return;
    if (!this.fitModule) {
      void this.loadCameraFit(force);
      return;
    }
    const fit = this.getCameraFit();
    if (!fit) return;
    controls.frame(fit.target, fit.distance);
    this.framedTiles = this.latestTiles.length > 0;
    this.notifyCamera();
    this.requestRender();
  }

  /**
   * Loads the fit's chunk once, then frames the board: at once if `force`d (the re-centre), else while the player has not
   * moved the camera. A failed load leaves the camera at its fixed opening.
   */
  private loadCameraFit(force = false): Promise<void> {
    this.fitLoad ??= import("./camera-fit").then(
      (module) => {
        this.fitModule = module;
      },
      (error: unknown) => console.warn("[renderer] the camera fit did not load, the camera opens at its fixed distance:", error),
    );
    return this.fitLoad.then(() => {
      if (this.disposed || !this.fitModule) return;
      if (force || !this.webCamera()?.userMoved) this.fitCamera(force);
    });
  }

  /** The placed tiles' extent in cells, null on an empty board. */
  private cellExtent(): CellExtent | null {
    if (this.latestTiles.length === 0) return null;
    const extent = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
    for (const tile of this.latestTiles) {
      extent.minX = Math.min(extent.minX, tile.worldX);
      extent.maxX = Math.max(extent.maxX, tile.worldX);
      extent.minZ = Math.min(extent.minZ, tile.worldZ);
      extent.maxZ = Math.max(extent.maxZ, tile.worldZ);
    }
    return extent;
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

  /**
   * Starts a first-person walk (V4-WALK-1, #876): loads its chunk, builds the walk's ground from the tiles drawn on their models
   * (the roads and the cities' ground, every solid voxel), and drops the walker on the road nearest the point the screen's centre
   * looks at, the camera easing down from its view (a cut under reduced motion). The orbit controls stand still until the walk
   * has eased back (`stopWalk`). Resolves with what drives it, or null when the board has no ground to walk on, the scene is not
   * ready, a walk is already under way, or `stopWalk` was called while it loaded.
   */
  async startWalk(input: WalkSettingsInput = {}): Promise<WalkControl | null> {
    if (this.walkSession || !this.camera || !this.controls || !this.surface) return null;
    const ticket = ++this.walkTicket;
    this.walkLoad ??= import("./walk");
    const chunk = await this.walkLoad;
    if (this.disposed || this.walkSession || !this.camera || ticket !== this.walkTicket) return null;
    const began = performance.now();
    const board = this.tiles.getGroup();
    const map = chunk.boardWalkMap(board, this.tiles.smokeSources());
    if (!map) return null;
    const buildMs = performance.now() - began;
    const session = chunk.WalkSession.start(
      { camera: this.camera, board, map, settings: resolveWalkSettings(input), near: this.screenCentreOnBoard(), reducedMotion: prefersReducedMotion(), now: performance.now() },
      buildMs,
    );
    if (!session) return null;
    this.walkSession = session;
    this.controls.controls.enabled = false;
    this.requestRender();
    return session;
  }

  /**
   * Eases back from the walk to the view it came from (a cut under reduced motion); resolves once the orbit controls are back.
   * While a walk still loads, cancels it.
   */
  stopWalk(): Promise<void> {
    const session = this.walkSession;
    this.walkTicket++;
    if (!session) return Promise.resolve();
    session.setReducedMotion(prefersReducedMotion());
    const left = session.leave(performance.now());
    this.requestRender();
    return left;
  }

  /** Changes the walk's settings under way (the stories' controls); nothing without a walk. */
  setWalkSettings(input: WalkSettingsInput): void {
    this.walkSession?.setSettings(resolveWalkSettings(input));
    this.camera?.updateProjectionMatrix();
    this.requestRender();
  }

  /** The walk's state, or null with none under way. */
  getWalk(): WalkState | null {
    return this.walkSession?.state() ?? null;
  }

  /** The walk has eased back: the orbit controls take the camera again, where it was. */
  private endWalk(): void {
    this.walkSession = null;
    if (this.controls) {
      this.controls.controls.enabled = true;
      this.controls.controls.update();
    }
    this.outlineTilePx = Number.NaN;
    this.notifyCamera();
    this.requestRender();
  }

  /** Where the screen's centre looks at the ground, in the board's frame (the tiles' group); the board's centre if it looks at none. */
  private screenCentreOnBoard(): { x: number; z: number } {
    const board = this.tiles.getGroup();
    board.updateMatrixWorld(true);
    this.camera.updateMatrixWorld();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = ray.ray.intersectPlane(ground, new THREE.Vector3());
    if (!hit) return { x: 0, z: 0 };
    const local = board.worldToLocal(hit);
    return { x: local.x, z: local.z };
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

  /**
   * The pulse's phase at `now` (0 to 1): the pending tile's while one pulses, else a clock of the same period, so the square grid's
   * highlight breathes with the tile placed. Null with no period.
   */
  private pulsePhase(now: number): number | null {
    const phase = this.tiles.pulsePhase?.(now);
    if (phase !== undefined && phase !== null) return phase;
    const ms = this.settings.placement.tints.pendingPulseMs;
    return ms > 0 ? (now % ms) / ms : null;
  }

  /** Start the render loop */
  start(): void {
    const animate = () => {
      this.animationId = requestAnimationFrame(animate);
      const observer = this.frameObserver;
      const tickStart = observer ? performance.now() : 0;
      let rendered = false;

      const now = performance.now();
      if (this.walkSession) {
        // The walker holds the camera: a frame while it moves, eases or turns, none while it stands still.
        if (this.walkSession.update(now)) this.needsRender = true;
        if (this.walkSession.done) this.endWalk();
      } else if (this.controls.update()) {
        // controls.update() returns true while damping is active
        this.needsRender = true;
      }
      // The placement effects that move (a plate's change of state, the confirm's fade) draw while they do.
      const moved = this.tiles.update(now);
      if (moved.animating) this.needsRender = true;
      // The square grid's roll-in and dim; its pulse on the pending tile's clock, so the two breathe together.
      if (this.squareGrid.update(now, this.pulsePhase(now))) this.needsRender = true;
      // A drop ended (the model is back) or casts: the shadows and a last frame, which `animating` no longer asks for.
      if (moved.shadow) {
        this.requestShadowUpdate();
        this.needsRender = true;
        // A landed tile's chimneys start to smoke (`smokeSources` leaves a tile out mid-drop).
        this.syncSmokeTiles();
      }
      // The ambient effects move on the one ambient loop, at its capped rate: a step that moves something draws a frame.
      if (this.ambient.tick(now)) this.needsRender = true;
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
    this.squareGrid.dispose();
    this.effects.dispose();
    this.controls?.dispose();
    this.assets.dispose();
    this.directionalLight?.shadow.dispose();
    this.dayNight?.releaseDayNight(this.directionalLight);
    this.ambient.dispose();
    this.clouds?.dispose();
    this.clouds = null;
    this.cloudsLoad = null;
    this.fog?.dispose();
    this.fog = null;
    this.fogLoad = null;
    this.weather?.dispose();
    this.weather = null;
    this.weatherLoad = null;
    // After the tiles: they are off the twins the smoke disposes.
    this.smoke?.dispose();
    this.smoke = null;
    this.smokeLoad = null;
    this.walkSession = null;
    this.scene.clear();
    this.latestTiles = [];
    this.cameraListeners.clear();
    this.onTileClickCallback = null;
    this.onTilePressCallback = null;
    this.onTileHoverCallback = null;
    this.onHoverLeaveCallback = null;
    this.boundInputHandler = null;
    this.pointerTap = null;
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
