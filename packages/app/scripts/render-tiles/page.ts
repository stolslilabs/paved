/**
 * The page `scripts/render-tiles.ts` drives (THEMES-RENDERS): one `GameScene`, the board's own renderer, look and models,
 * drawing one tile (or a few, for a theme's cover; a whole board, for a Story background) per call, captured to WebP. Served by the script's Vite server with the
 * app's `public/` and its manifest (`vite/renderer-assets.ts`); never part of the app's build.
 */
import { GameScene, createWebSurfaceAdapter, type AssetManifest, type TileRenderData } from "@paved/renderer";
import { PlanType, getPlanKey } from "@paved/game-core";
import { fillBoard, type BoardTile } from "./board";

/** The contracts' board centre: the renders' tiles sit around it, as a board's do. */
const CENTER = 2_147_483_647;
const BASE = "/renderer-assets";
/** The plan numbers by key (`PlanType`'s index), as the tiles take them. */
const PLAN_OF = new Map(Object.values(PlanType).map((p, i) => [p === PlanType.None ? "" : getPlanKey(p), i]));

/** One render: a theme (0 the base models), its tiles by offset from the centre, the output size and the framing. */
export interface RenderSpec {
  theme: number;
  tiles: { key: string; dx: number; dy: number; orientation: number }[];
  width: number;
  height: number;
  /** The camera's zoom at the fixed distance: larger frames tighter. */
  zoom: number;
  /** Straight above the tiles, north up (the deck sheet's top-down renders, #606); at `POLAR` and `AZIMUTH` otherwise. */
  top?: boolean;
  /** A whole board instead of `tiles`: `columns` x `rows` fitting tiles around the starter (`fillBoard`), from `seed`, `forest` its bias to the woods, `city` to the cities. */
  board?: { columns: number; rows: number; seed: number; forest?: number; city?: number };
  /** The camera's angles in degrees, off the vertical and around (unset: `POLAR` and `AZIMUTH`). */
  polar?: number;
  azimuth?: number;
  /** The outlines (on by default, as the tile renders); off, the faces of neighbouring tiles meet with no dark line. */
  outlines?: boolean;
  /**
   * One tile drawn off its cell (the Tutorial's puzzle): the tile at `cell` lifted `height` units, moved `dx`, `dz` cells and
   * turned `yaw` degrees (the tile stack's `lift` and `yaw`), its cell's plate under it, its shadow falling there.
   */
  lift?: { cell: { dx: number; dy: number }; height: number; dx: number; dz: number; yaw: number };
  /**
   * The depth of field (Story backgrounds, #721), on the captured image, here only (never in the renderer or the app): the
   * row `focus` (a share of the height from the top) sharp over `sharp` of the height, the blur growing from there to
   * `far` CSS px at the top edge and `near` at the bottom one, as a lens focused on the middle rows of a board seen low.
   */
  depthOfField?: { focus: number; sharp: number; far: number; near: number };
  /**
   * The light of one moment of the day and night cycle, held (the battle logs' backgrounds, #857: an attack's warm, a
   * defence's cool): the seasons since a summer's dawn, as `DayNightSettings.freezeAt`. Unset: the look's fixed lights.
   */
  dayNight?: number;
}

/** Drawn at twice the output, then averaged down: the faces' edges come out smooth whatever the GPU's MSAA. */
const SUPERSAMPLE = 2;
/** The camera: 40 units from its target, 40° off the vertical, turned 35° around it. */
const DISTANCE = 40;
const POLAR = (40 * Math.PI) / 180;
const AZIMUTH = (35 * Math.PI) / 180;
/** Drawn this much wider and higher on each side (a share of the output) when blurred: the blur reads no edge, then is cropped. */
const BLUR_MARGIN = 0.08;
/** The depth of field's blurred copies, in CSS px of the output: each row mixes the two around its own blur. */
const BLUR_STEPS = [0, 1, 2, 3.5, 5.5, 8, 11];

const stage = document.getElementById("stage")!;
const canvas = document.createElement("canvas");
canvas.style.display = "block";
canvas.style.width = "100%";
canvas.style.height = "100%";
stage.appendChild(canvas);

let scene: GameScene | null = null;
let manifest: AssetManifest | null = null;

const frame = () => new Promise<void>((done) => requestAnimationFrame(() => done()));

/** The manifest with each theme's first variant only: the representative one the render shows, whatever a tile's hash. */
function firstVariants(full: AssetManifest): AssetManifest {
  const themes = Object.fromEntries(
    Object.entries(full.themes ?? {}).map(([theme, plans]) => [theme, Object.fromEntries(Object.entries(plans).map(([key, files]) => [key, files.slice(0, 1)]))]),
  );
  return { ...full, themes };
}

/**
 * The board's look at its best tier, outlines forced on or off whatever the GPU, one pixel per CSS px (the supersample is the
 * stage's size), and the cycle held at `dayNight` when set (moving, so a held night keeps its window lights).
 */
const settingsOf = (outlines: boolean, dayNight?: number) =>
  ({
    maxPixelRatio: 1,
    quality: "high",
    multisampling: true,
    outlines: { force: outlines ? "on" : "off" },
    ...(dayNight != null && { dayNight: { enabled: true, freezeAt: dayNight, seed: 1, reducedMotion: false } }),
  }) as const;
/** The settings last set (`settingsOf`'s arguments): a render that asks for others sets them again. */
let applied = JSON.stringify([true, undefined]);

async function setup(): Promise<{ renderer: string | null; software: boolean; manifest: AssetManifest }> {
  manifest = (await (await fetch(`${BASE}/manifest.json`)).json()) as AssetManifest;
  scene = new GameScene();
  await scene.init({
    surface: createWebSurfaceAdapter(canvas),
    basePath: BASE,
    manifest: firstVariants(manifest),
    settings: settingsOf(true),
  });
  scene.setCameraMode("showcase");
  scene.start();
  const webgl = scene.getWebGL();
  return { renderer: webgl.renderer, software: webgl.software, manifest };
}

/** The tiles a render draws: its own, or its whole board's. */
const tilesOf = (spec: RenderSpec): BoardTile[] => (spec.board ? fillBoard(spec.board.columns, spec.board.rows, spec.board.seed, spec.board.forest, spec.board.city) : spec.tiles);

/** The model ids the render waits for: a variant's path (a skinned plan the manifest lists) or the plan's base model. */
function modelIds(spec: RenderSpec, tiles: readonly BoardTile[]): string[] {
  return [...new Set(tiles.map(({ key }) => (spec.theme ? (firstVariants(manifest!).themes?.[String(spec.theme)]?.[key]?.[0] ?? key) : key)))];
}

const degrees = (value: number | undefined, fallback: number) => (value == null ? fallback : (value * Math.PI) / 180);

/**
 * The depth of field on `source` (the scene drawn `margin` px wider on each side than `width` x `height`, at the supersample):
 * `BLUR_STEPS` blurred copies, each row taking the mix of the two copies around its own blur, then cropped to the output.
 */
function depthOfField(source: CanvasImageSource, spec: RenderSpec, margin: number): HTMLCanvasElement {
  const dof = spec.depthOfField!;
  const width = (spec.width + 2 * margin) * SUPERSAMPLE;
  const height = (spec.height + 2 * margin) * SUPERSAMPLE;
  const canvas = (w: number, h: number) => Object.assign(document.createElement("canvas"), { width: w, height: h });
  const result = canvas(width, height);
  const out = result.getContext("2d")!;
  out.drawImage(source, 0, 0, width, height);
  // A row's blur in output px: none within the sharp band around the focus, then growing (eased) to the edge's.
  const blurAt = (row: number): number => {
    const y = (row / SUPERSAMPLE - margin) / spec.height;
    const away = y < dof.focus ? dof.focus - y : y - dof.focus;
    const span = (y < dof.focus ? dof.focus : 1 - dof.focus) - dof.sharp / 2;
    const t = Math.min(1, Math.max(0, (away - dof.sharp / 2) / span));
    return (y < dof.focus ? dof.far : dof.near) * t * t * (3 - 2 * t);
  };
  for (let step = 1; step < BLUR_STEPS.length; step++) {
    const [low, high] = [BLUR_STEPS[step - 1]!, BLUR_STEPS[step]!];
    const layer = canvas(width, height);
    const context = layer.getContext("2d")!;
    context.filter = `blur(${high * SUPERSAMPLE}px)`;
    context.drawImage(source, 0, 0, width, height);
    context.filter = "none";
    // Kept where the row's blur passes `low`, wholly from `high` on: a vertical mask, one gradient stop per few rows.
    const mask = context.createLinearGradient(0, 0, 0, height);
    for (let row = 0; row <= height; row += 8) mask.addColorStop(row / height, `rgba(0,0,0,${Math.min(1, Math.max(0, (blurAt(row) - low) / (high - low)))})`);
    context.globalCompositeOperation = "destination-in";
    context.fillStyle = mask;
    context.fillRect(0, 0, width, height);
    out.drawImage(layer, 0, 0);
  }
  return result;
}

async function render(spec: RenderSpec): Promise<{ webp: string; models: string[] }> {
  if (!scene) throw new Error("render-tiles: setup first");
  // A blurred render is drawn with a margin, so its blur near the edges reads the board there, not the page.
  const margin = spec.depthOfField ? Math.round(BLUR_MARGIN * Math.max(spec.width, spec.height)) : 0;
  stage.style.width = `${(spec.width + 2 * margin) * SUPERSAMPLE}px`;
  stage.style.height = `${(spec.height + 2 * margin) * SUPERSAMPLE}px`;
  const outlines = spec.outlines ?? true;
  const wanted = JSON.stringify([outlines, spec.dayNight]);
  if (wanted !== applied) {
    scene.setSettings(settingsOf(outlines, spec.dayNight));
    applied = wanted;
  }
  const drawn = tilesOf(spec);
  const skins = spec.theme ? Object.fromEntries(drawn.map(({ key }) => [key, spec.theme])) : {};
  scene.setSkins(skins);
  const up = spec.lift;
  const tiles: TileRenderData[] = drawn.map((t, i) => {
    const off = up && t.dx === up.cell.dx && t.dy === up.cell.dy ? up : null;
    return {
      game_id: 0,
      id: i + 1,
      player_id: "0x0",
      plan: PLAN_OF.get(t.key)!,
      orientation: t.orientation,
      x: CENTER + t.dx,
      y: CENTER - t.dy,
      worldX: t.dx + (off?.dx ?? 0),
      worldZ: t.dy + (off?.dz ?? 0),
      ...(off && { lift: off.height, yaw: (off.yaw * Math.PI) / 180 }),
    };
  });
  if (up && !drawn.some((t) => t.dx === up.cell.dx && t.dy === up.cell.dy)) throw new Error("render-tiles: no tile on the lifted cell");
  scene.updateTiles(tiles);
  // The lifted tile's cell shows its plate, as a slot of the tile in hand does.
  scene.setAvailableSlots(up ? [{ x: up.cell.dx, y: up.cell.dy }] : []);
  const models = modelIds(spec, drawn);
  for (let waited = 0; !models.every((id) => scene!.assets.has(id)); waited += 50) {
    if (waited > 60_000) throw new Error(`render-tiles: ${models.filter((id) => !scene!.assets.has(id)).join(", ")} did not load`);
    await new Promise((done) => setTimeout(done, 50));
  }
  // The cycle's chunk loads on its first use: its light draws once it is in.
  for (let waited = 0; spec.dayNight != null && !scene.getDayNight(); waited += 50) {
    if (waited > 60_000) throw new Error("render-tiles: the day and night cycle did not load");
    scene.requestRender();
    await new Promise((done) => setTimeout(done, 50));
  }
  // The tiles' centre, then the camera on its fixed sphere around it.
  scene.focusBoard();
  const target = scene.controls.controls.target;
  const { camera } = scene;
  const polar = degrees(spec.polar, POLAR);
  const azimuth = degrees(spec.azimuth, AZIMUTH);
  if (spec.top) {
    // Looking straight down, "up" on the image is the board's north (-z): a top-down render turns as a tile chip does.
    camera.up.set(0, 0, -1);
    camera.position.set(target.x, DISTANCE, target.z);
  } else {
    camera.up.set(0, 1, 0);
    camera.position.set(
      target.x + DISTANCE * Math.sin(polar) * Math.sin(azimuth),
      DISTANCE * Math.cos(polar),
      target.z + DISTANCE * Math.sin(polar) * Math.cos(azimuth),
    );
  }
  // The margin widens the view: the zoom grows with it, so the output keeps its framing.
  camera.zoom = (spec.zoom * (spec.height + 2 * margin)) / spec.height;
  camera.updateProjectionMatrix();
  camera.lookAt(target);
  scene.requestShadowUpdate();
  // The resize, the models' upload and the shadow map settle over a few frames; a plate eases in over a few hundred ms
  // (`placement.ts`), so its frames run before the capture.
  for (let i = 0; i < (up || spec.dayNight != null ? 40 : 6); i++) await frame();
  scene.render();
  // Read in the same task as the draw: the drawing buffer is not kept after it is shown.
  const source = spec.depthOfField ? depthOfField(scene.renderer.domElement, spec, margin) : scene.renderer.domElement;
  const out = document.createElement("canvas");
  out.width = spec.width;
  out.height = spec.height;
  const context = out.getContext("2d")!;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  const crop = margin * SUPERSAMPLE;
  context.drawImage(source, crop, crop, spec.width * SUPERSAMPLE, spec.height * SUPERSAMPLE, 0, 0, spec.width, spec.height);
  return { webp: out.toDataURL("image/webp", 0.86), models: models.map((id) => (id.includes("/") ? id : (manifest!.models?.[id] ?? id))) };
}

(window as unknown as { paved: unknown }).paved = { setup, render };
