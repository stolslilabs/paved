import {
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  Color,
  DataTexture,
  DirectionalLight,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshLambertMaterial,
  NearestFilter,
  OrthographicCamera,
  RGBAFormat,
  SRGBColorSpace,
  Scene,
  WebGLRenderer,
} from "three";
import { drawBackground } from "./avatar-backgrounds";
import { type Avatar, avatarKey } from "./avatar-format";
import { FACES, HEAD, type VoxelHead, buildHead, faceGrids } from "./avatar-model";

/**
 * The avatar's rendering (AVATAR-LOOK, #626), a chunk of its own (`loadAvatarRender`): the head as a three.js object in either
 * look, the still images the menus show (one shared WebGL context, each avatar and size rendered once and cached as an image),
 * and the live 3D preview the creator turns. The menus never hold a live context per avatar: browsers cap them (about 16 in
 * Chrome), and the board needs one.
 */

/** "voxel": every voxel drawn (the proposal); "grid": a cube painted with 8 x 8 face grids and a hat layer, Minecraft's own. */
export type AvatarStyle = "voxel" | "grid";
export const AVATAR_STYLES: readonly AvatarStyle[] = ["voxel", "grid"];

/** The three-quarter view: the head turned this far (radians) and seen from this far above (radians). */
export const ICON_YAW = -0.62;
export const ICON_PITCH = 0.36;
/** Half the height the camera frames, in voxels, and where it aims above the head's centre: room for a hat, the head ~60 % of the circle. */
const FRAME_HALF = 8.8;
const FRAME_TARGET_Y = 0.9;

/** Each direction's quad: the normal and its four corners in a unit cube, counter-clockwise seen from outside. */
const QUADS: readonly { n: [number, number, number]; c: [number, number, number][] }[] = [
  { n: [1, 0, 0], c: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
  { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { n: [0, 1, 0], c: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]] },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { n: [0, 0, -1], c: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] },
];

/**
 * The voxels as one geometry: a quad for each voxel face that no other voxel covers, coloured per vertex (in linear colour, as
 * three's working space wants). One draw for the whole head.
 */
export function voxelGeometry(head: VoxelHead): BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const colours: number[] = [];
  const indices: number[] = [];
  const colour = new Color();
  for (const [x, y, z, hex] of head.voxels()) {
    colour.setHex(hex, SRGBColorSpace);
    for (const { n, c } of QUADS) {
      if (head.has(x + n[0], y + n[1], z + n[2])) continue;
      const base = positions.length / 3;
      for (const [cx, cy, cz] of c) {
        positions.push(x + cx, y + cy, z + cz);
        normals.push(...n);
        colours.push(colour.r, colour.g, colour.b);
      }
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colours, 3));
  geometry.setIndex(indices);
  return geometry;
}

/** An 8 x 8 texture of a face grid (rows from the top), nearest-filtered; `undefined` pixels are clear. */
function gridTexture(pixels: readonly (number | undefined)[]): DataTexture {
  const data = new Uint8Array(HEAD * HEAD * 4);
  pixels.forEach((hex, i) => {
    // A DataTexture's first row is the bottom one.
    const row = HEAD - 1 - Math.floor(i / HEAD);
    const at = (row * HEAD + (i % HEAD)) * 4;
    if (hex === undefined) return;
    data[at] = (hex >> 16) & 0xff;
    data[at + 1] = (hex >> 8) & 0xff;
    data[at + 2] = hex & 0xff;
    data[at + 3] = 255;
  });
  const texture = new DataTexture(data, HEAD, HEAD, RGBAFormat);
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/** The size of the grid look's hat layer against the head: Minecraft's 9/8. */
const HAT_LAYER = 9 / 8;

/** The head in a look, centred on the origin, and what disposes it (its geometries, materials and textures are its own). */
export interface AvatarObject {
  object: Group;
  /** How many draws it takes: 1 for the voxel look, up to 12 for the grid look (a face each). */
  draws: number;
  dispose(): void;
}

export function buildAvatarObject(avatar: Avatar, style: AvatarStyle = "voxel"): AvatarObject {
  const head = buildHead(avatar);
  const object = new Group();
  const owned: { dispose(): void }[] = [];
  let draws = 0;
  if (style === "voxel") {
    const geometry = voxelGeometry(head);
    const material = new MeshLambertMaterial({ vertexColors: true });
    const mesh = new Mesh(geometry, material);
    mesh.position.set(-HEAD / 2, -HEAD / 2, -HEAD / 2);
    object.add(mesh);
    owned.push(geometry, material);
    draws = 1;
  } else {
    const grids = FACES.map((face) => faceGrids(head, face));
    const inner = grids.map(({ surface }) => {
      const map = gridTexture(surface);
      owned.push(map);
      return new MeshLambertMaterial({ map });
    });
    const outer = grids.map(({ outer: pixels }) => {
      const any = pixels.some((p) => p !== undefined);
      const map = any ? gridTexture(pixels) : null;
      if (map) owned.push(map);
      // A face with nothing around it draws nothing (and costs no draw).
      return new MeshLambertMaterial({ map, alphaTest: 0.5, visible: any });
    });
    owned.push(...inner, ...outer);
    const box = new BoxGeometry(HEAD, HEAD, HEAD);
    const hat = new BoxGeometry(HEAD * HAT_LAYER, HEAD * HAT_LAYER, HEAD * HAT_LAYER);
    owned.push(box, hat);
    object.add(new Mesh(box, inner), new Mesh(hat, outer));
    draws = inner.length + outer.filter((m) => m.visible).length;
  }
  return {
    object,
    draws,
    dispose: () => {
      for (const item of owned) item.dispose();
      object.clear();
    },
  };
}

/** The stage both renders share: the lights and the three-quarter camera. Lights are fixed; the head turns. */
export function createStage(): { scene: Scene; camera: OrthographicCamera; pivot: Group } {
  const scene = new Scene();
  const pivot = new Group();
  pivot.rotation.y = ICON_YAW;
  scene.add(pivot);
  scene.add(new AmbientLight(0xffffff, 1.55));
  const key = new DirectionalLight(0xffffff, 1.5);
  key.position.set(-3, 8, 6);
  scene.add(key);
  const camera = new OrthographicCamera(-FRAME_HALF, FRAME_HALF, FRAME_HALF, -FRAME_HALF, 1, 200);
  const distance = 60;
  camera.position.set(0, FRAME_TARGET_Y + Math.sin(ICON_PITCH) * distance, Math.cos(ICON_PITCH) * distance);
  camera.lookAt(0, FRAME_TARGET_Y, 0);
  return { scene, camera, pivot };
}

/** A background as an image of `px` x `px` (a data URL), for a live preview to stand on. */
export function backgroundUrl(id: number, px: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = px;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  drawBackground(ctx, id, px);
  return canvas.toDataURL("image/png");
}

export interface AvatarStillOptions {
  /** The image's size in CSS px: 40, 64 and 128 in the menus. */
  size: number;
  /** Device px per CSS px; the device's own by default, at most 3. */
  pixelRatio?: number;
  style?: AvatarStyle;
  /** Draw the background behind the head (the default); off, the head on a clear image. */
  background?: boolean;
}

export interface AvatarStillStats {
  /** Stills rendered, and asks answered from the cache. */
  renders: number;
  hits: number;
  /** Contexts created (one at a time; released after `idleMs` without a render). */
  contexts: number;
  /** The milliseconds a context took to create, all told. */
  contextMs: number;
  /** A render's milliseconds (building the head, drawing it, reading it into an image): the last, the total, the worst. */
  lastMs: number;
  totalMs: number;
  maxMs: number;
  /** The cached images now. */
  cached: number;
}

export interface AvatarStillsOptions {
  /** How long the context lives without a render before it is released. */
  idleMs?: number;
  /** How many images the cache keeps (the oldest asked goes first). */
  maxEntries?: number;
  /** Tests: the renderer, the 2D canvas and the clock. */
  createRenderer?: () => WebGLRenderer;
  createCanvas?: (px: number) => HTMLCanvasElement;
  now?: () => number;
}

const defaultCanvas = (px: number): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = px;
  return canvas;
};

/**
 * The menus' avatar images: each avatar, size and look rendered once into an image (a PNG data URL) and kept. One WebGL context
 * serves every render; it is created on the first and released once no render came for `idleMs`, so a page of avatars holds
 * at most one context, and none at rest.
 */
export class AvatarStills {
  private renderer: WebGLRenderer | null = null;
  private stage: ReturnType<typeof createStage> | null = null;
  private readonly cache = new Map<string, string>();
  private idle: ReturnType<typeof setTimeout> | null = null;
  private readonly stats_: AvatarStillStats = { renders: 0, hits: 0, contexts: 0, contextMs: 0, lastMs: 0, totalMs: 0, maxMs: 0, cached: 0 };
  private readonly idleMs: number;
  private readonly maxEntries: number;
  private readonly createRenderer: () => WebGLRenderer;
  private readonly createCanvas: (px: number) => HTMLCanvasElement;
  private readonly now: () => number;

  constructor(options: AvatarStillsOptions = {}) {
    this.idleMs = options.idleMs ?? 2_000;
    this.maxEntries = options.maxEntries ?? 256;
    this.createRenderer = options.createRenderer ?? (() => new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: false }));
    this.createCanvas = options.createCanvas ?? defaultCanvas;
    this.now = options.now ?? (() => performance.now());
  }

  /** The image's side in device px. */
  static pixels({ size, pixelRatio }: AvatarStillOptions): number {
    const ratio = pixelRatio ?? (typeof window === "undefined" ? 1 : window.devicePixelRatio || 1);
    return Math.max(1, Math.round(size * Math.min(3, ratio)));
  }

  /** The image already rendered for these, if any (no render). */
  peek(avatar: Avatar, options: AvatarStillOptions): string | undefined {
    return this.cache.get(this.keyOf(avatar, options));
  }

  /** The avatar's image: from the cache, else rendered now (synchronously) and kept. */
  get(avatar: Avatar, options: AvatarStillOptions): string {
    const key = this.keyOf(avatar, options);
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      this.stats_.hits++;
      // The most recently asked goes last: the cache drops from the front.
      this.cache.delete(key);
      this.cache.set(key, cached);
      return cached;
    }
    const url = this.render(avatar, options);
    this.cache.set(key, url);
    while (this.cache.size > this.maxEntries) this.cache.delete(this.cache.keys().next().value as string);
    this.stats_.cached = this.cache.size;
    return url;
  }

  stats(): AvatarStillStats {
    return { ...this.stats_, cached: this.cache.size };
  }

  /** Whether a context is held now. */
  get live(): boolean {
    return this.renderer !== null;
  }

  /** Releases the context (the cache stays). */
  release(): void {
    if (this.idle) clearTimeout(this.idle);
    this.idle = null;
    if (!this.renderer) return;
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer = null;
    this.stage = null;
  }

  /** Releases the context and forgets every image. */
  dispose(): void {
    this.release();
    this.cache.clear();
  }

  private keyOf(avatar: Avatar, options: AvatarStillOptions): string {
    return `${avatarKey(avatar)}:${AvatarStills.pixels(options)}:${options.style ?? "voxel"}:${options.background === false ? 0 : 1}`;
  }

  private render(avatar: Avatar, options: AvatarStillOptions): string {
    const start = this.now();
    if (!this.renderer) {
      this.renderer = this.createRenderer();
      this.renderer.setPixelRatio(1);
      this.stage = createStage();
      this.stats_.contexts++;
      this.stats_.contextMs += this.now() - start;
    }
    const renderer = this.renderer;
    const { scene, camera, pivot } = this.stage!;
    const px = AvatarStills.pixels(options);
    renderer.setSize(px, px, false);
    const built = buildAvatarObject(avatar, options.style);
    pivot.add(built.object);
    renderer.setClearColor(0x000000, 0);
    renderer.render(scene, camera);
    // Read in the same task as the draw: the drawing buffer is not kept (`preserveDrawingBuffer` off).
    const canvas = this.createCanvas(px);
    const ctx = canvas.getContext("2d");
    if (ctx) {
      if (options.background !== false) drawBackground(ctx, avatar.background, px);
      ctx.drawImage(renderer.domElement, 0, 0, px, px);
    }
    const url = canvas.toDataURL("image/png");
    pivot.remove(built.object);
    built.dispose();
    const ms = this.now() - start;
    this.stats_.renders++;
    this.stats_.lastMs = ms;
    this.stats_.totalMs += ms;
    this.stats_.maxMs = Math.max(this.stats_.maxMs, ms);
    if (this.idle) clearTimeout(this.idle);
    this.idle = setTimeout(() => this.release(), this.idleMs);
    return url;
  }
}

/** The page's one still renderer: every avatar image of the menus goes through it. */
export const avatarStills = new AvatarStills();

export interface AvatarPreviewOptions {
  style?: AvatarStyle;
  /** Turn on its own (off under reduced motion, `autoTurn` notwithstanding). */
  autoTurn?: boolean;
  /** Radians a second. */
  turnSpeed?: number;
  /** Device px per CSS px; the device's own by default, at most 2. */
  pixelRatio?: number;
}

/** The radians a CSS px of drag turns the head. */
const DRAG_RADIANS = 0.012;

/**
 * The creator's live 3D preview: one WebGL canvas filling `container`, the head in three quarters, turned by a drag (or a
 * swipe), and turning on its own when asked. It draws on demand: a frame per change, and a loop only while it turns.
 * `dispose` releases its context.
 */
export class AvatarPreview {
  readonly canvas: HTMLCanvasElement;
  private readonly renderer: WebGLRenderer;
  private readonly stage = createStage();
  private built: AvatarObject | null = null;
  private avatar: Avatar;
  private style: AvatarStyle;
  private autoTurn: boolean;
  private readonly turnSpeed: number;
  private yaw = ICON_YAW;
  private frame = 0;
  private lastTime = 0;
  private dragging: { id: number; x: number } | null = null;
  private readonly resizeObserver: ResizeObserver | null;
  private readonly reducedMotion: MediaQueryList | null;
  private disposed = false;
  /** Frames drawn, for the stories' figures. */
  frames = 0;

  constructor(
    private readonly container: HTMLElement,
    avatar: Avatar,
    options: AvatarPreviewOptions = {},
  ) {
    this.avatar = avatar;
    this.style = options.style ?? "voxel";
    this.autoTurn = options.autoTurn ?? true;
    this.turnSpeed = options.turnSpeed ?? 0.8;
    this.canvas = document.createElement("canvas");
    this.canvas.style.cssText = "display:block;width:100%;height:100%;touch-action:none;cursor:grab";
    container.appendChild(this.canvas);
    this.renderer = new WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, options.pixelRatio ?? window.devicePixelRatio ?? 1));
    this.renderer.setClearColor(0x000000, 0);
    this.reducedMotion = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    this.resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(() => this.resize()) : null;
    this.resizeObserver?.observe(container);
    this.canvas.addEventListener("pointerdown", this.onDown);
    this.canvas.addEventListener("pointermove", this.onMove);
    this.canvas.addEventListener("pointerup", this.onUp);
    this.canvas.addEventListener("pointercancel", this.onUp);
    this.rebuild();
    this.resize();
  }

  setAvatar(avatar: Avatar): void {
    this.avatar = avatar;
    this.rebuild();
  }

  setStyle(style: AvatarStyle): void {
    this.style = style;
    this.rebuild();
  }

  setAutoTurn(on: boolean): void {
    this.autoTurn = on;
    this.request();
  }

  /** Turns the head to a yaw (radians; the icon's is `ICON_YAW`). */
  setYaw(yaw: number): void {
    this.yaw = yaw;
    this.request();
  }

  /** The draws of the head now. */
  get draws(): number {
    return this.built?.draws ?? 0;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resizeObserver?.disconnect();
    this.canvas.removeEventListener("pointerdown", this.onDown);
    this.canvas.removeEventListener("pointermove", this.onMove);
    this.canvas.removeEventListener("pointerup", this.onUp);
    this.canvas.removeEventListener("pointercancel", this.onUp);
    this.built?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }

  private get turning(): boolean {
    return this.autoTurn && !this.dragging && !this.reducedMotion?.matches;
  }

  private rebuild() {
    if (this.disposed) return;
    if (this.built) {
      this.stage.pivot.remove(this.built.object);
      this.built.dispose();
    }
    this.built = buildAvatarObject(this.avatar, this.style);
    this.stage.pivot.add(this.built.object);
    this.request();
  }

  private resize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    const camera = this.stage.camera;
    camera.left = -FRAME_HALF * aspect;
    camera.right = FRAME_HALF * aspect;
    camera.updateProjectionMatrix();
    this.request();
  }

  /** Asks for a frame (one, or the loop while it turns). */
  private request() {
    if (this.disposed || this.frame) return;
    this.lastTime = performance.now();
    this.frame = requestAnimationFrame(this.tick);
  }

  private readonly tick = (time: number) => {
    this.frame = 0;
    if (this.turning) this.yaw += (Math.min(100, time - this.lastTime) / 1000) * this.turnSpeed;
    this.lastTime = time;
    this.stage.pivot.rotation.y = this.yaw;
    this.renderer.render(this.stage.scene, this.stage.camera);
    this.frames++;
    if (this.turning) this.frame = requestAnimationFrame(this.tick);
  };

  private readonly onDown = (event: PointerEvent) => {
    this.dragging = { id: event.pointerId, x: event.clientX };
    this.canvas.setPointerCapture?.(event.pointerId);
    this.canvas.style.cursor = "grabbing";
  };

  private readonly onMove = (event: PointerEvent) => {
    if (!this.dragging || event.pointerId !== this.dragging.id) return;
    this.yaw += (event.clientX - this.dragging.x) * DRAG_RADIANS;
    this.dragging.x = event.clientX;
    this.request();
  };

  private readonly onUp = (event: PointerEvent) => {
    if (!this.dragging || event.pointerId !== this.dragging.id) return;
    this.dragging = null;
    this.canvas.style.cursor = "grab";
    this.request();
  };
}
