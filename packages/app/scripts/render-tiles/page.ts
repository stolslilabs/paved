/**
 * The page `scripts/render-tiles.ts` drives (THEMES-RENDERS): one `GameScene`, the board's own renderer, look and models,
 * drawing one tile (or a few, for a theme's cover) per call, captured to WebP. Served by the script's Vite server with the
 * app's `public/` and its manifest (`vite/renderer-assets.ts`); never part of the app's build.
 */
import { GameScene, createWebSurfaceAdapter, type AssetManifest, type TileRenderData } from "@paved/renderer";
import { PlanType, getPlanKey } from "@paved/game-core";

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
}

/** Drawn at twice the output, then averaged down: the faces' edges come out smooth whatever the GPU's MSAA. */
const SUPERSAMPLE = 2;
/** The camera: 40 units from its target, 40° off the vertical, turned 35° around it. */
const DISTANCE = 40;
const POLAR = (40 * Math.PI) / 180;
const AZIMUTH = (35 * Math.PI) / 180;

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

async function setup(): Promise<{ renderer: string | null; software: boolean; manifest: AssetManifest }> {
  manifest = (await (await fetch(`${BASE}/manifest.json`)).json()) as AssetManifest;
  scene = new GameScene();
  await scene.init({
    surface: createWebSurfaceAdapter(canvas),
    basePath: BASE,
    manifest: firstVariants(manifest),
    // The board's look at its best tier, outlines on whatever the GPU, one pixel per CSS px (the supersample is the stage's size).
    settings: { maxPixelRatio: 1, quality: "high", multisampling: true, outlines: { force: "on" } },
  });
  scene.setCameraMode("showcase");
  scene.start();
  const webgl = scene.getWebGL();
  return { renderer: webgl.renderer, software: webgl.software, manifest };
}

/** The model ids the render waits for: a variant's path (a skinned plan the manifest lists) or the plan's base model. */
function modelIds(spec: RenderSpec): string[] {
  return spec.tiles.map(({ key }) => (spec.theme ? (firstVariants(manifest!).themes?.[String(spec.theme)]?.[key]?.[0] ?? key) : key));
}

async function render(spec: RenderSpec): Promise<{ webp: string; models: string[] }> {
  if (!scene) throw new Error("render-tiles: setup first");
  stage.style.width = `${spec.width * SUPERSAMPLE}px`;
  stage.style.height = `${spec.height * SUPERSAMPLE}px`;
  const skins = spec.theme ? Object.fromEntries(spec.tiles.map(({ key }) => [key, spec.theme])) : {};
  scene.setSkins(skins);
  const tiles: TileRenderData[] = spec.tiles.map((t, i) => ({
    game_id: 0,
    id: i + 1,
    player_id: "0x0",
    plan: PLAN_OF.get(t.key)!,
    orientation: t.orientation,
    x: CENTER + t.dx,
    y: CENTER - t.dy,
    worldX: t.dx,
    worldZ: t.dy,
  }));
  scene.updateTiles(tiles);
  const models = modelIds(spec);
  for (let waited = 0; !models.every((id) => scene!.assets.has(id)); waited += 50) {
    if (waited > 30_000) throw new Error(`render-tiles: ${models.filter((id) => !scene!.assets.has(id)).join(", ")} did not load`);
    await new Promise((done) => setTimeout(done, 50));
  }
  // The tiles' centre, then the camera on its fixed sphere around it.
  scene.focusBoard();
  const target = scene.controls.controls.target;
  const { camera } = scene;
  if (spec.top) {
    // Looking straight down, "up" on the image is the board's north (-z): a top-down render turns as a tile chip does.
    camera.up.set(0, 0, -1);
    camera.position.set(target.x, DISTANCE, target.z);
  } else {
    camera.up.set(0, 1, 0);
    camera.position.set(
      target.x + DISTANCE * Math.sin(POLAR) * Math.sin(AZIMUTH),
      DISTANCE * Math.cos(POLAR),
      target.z + DISTANCE * Math.sin(POLAR) * Math.cos(AZIMUTH),
    );
  }
  camera.zoom = spec.zoom;
  camera.updateProjectionMatrix();
  camera.lookAt(target);
  scene.requestShadowUpdate();
  // The resize, the models' upload and the shadow map settle over a few frames.
  for (let i = 0; i < 6; i++) await frame();
  scene.render();
  // Read in the same task as the draw: the drawing buffer is not kept after it is shown.
  const out = document.createElement("canvas");
  out.width = spec.width;
  out.height = spec.height;
  const context = out.getContext("2d")!;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(scene.renderer.domElement, 0, 0, spec.width, spec.height);
  return { webp: out.toDataURL("image/webp", 0.86), models: models.map((id) => (id.includes("/") ? id : (manifest!.models?.[id] ?? id))) };
}

(window as unknown as { paved: unknown }).paved = { setup, render };
