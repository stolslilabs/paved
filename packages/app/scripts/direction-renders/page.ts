/**
 * The page `scripts/direction-renders.ts` drives (#537, PR 1b): the images of Direction/D, E and F, drawn from Paved's own assets.
 *
 * - Boards: the bench's recorded boards (`game-core/bench/fixtures`, 38 and 72 tiles) or a few tiles, through the board's own
 *   `GameScene` (its look, its models, the Forest variants), on a charcoal backdrop. A keyed render turns the backdrop to
 *   transparency: a flood fill from the edges over the pixels near the backdrop's colour, so a dark crevice inside a tile stays.
 * - The voxel wordmark: the letters of `assets/banner.svg` read on their own block grid (each block of the banner is a voxel
 *   here), extruded and drawn with three.js as stone blocks with grass on their tops.
 *
 * Served by the script's Vite server with the app's `public/` and manifest; never part of the app's build or of the Storybook.
 */
import * as THREE from "three";
import { GameScene, createWebSurfaceAdapter, type AssetManifest, type HoverState, type PlacementSlot, type TileRenderData } from "@paved/renderer";
import { PlanType, getPlanKey } from "@paved/game-core";
import board38 from "../../../game-core/bench/fixtures/board-38.json";
import board72 from "../../../game-core/bench/fixtures/board-72.json";
import placements38 from "../../../game-core/bench/fixtures/placements-38.json";
import banner from "../../../../assets/banner.svg?raw";

const CENTER = 2_147_483_647;
const BASE = "/renderer-assets";
const TILE_SIZE = 3;
const PLAN_OF = new Map(Object.values(PlanType).map((p, i) => [p === PlanType.None ? "" : getPlanKey(p), i]));
const KEY_OF = new Map([...PLAN_OF].map(([key, plan]) => [plan, key]));
/** The backdrop the boards are drawn on: a neutral grey the look's tone map (ACES) darkens to the charcoal of the directions' pages. */
const CHARCOAL = "#2e2b27";
const SUPERSAMPLE = 2;

interface FixtureTile {
  id: number;
  plan: number;
  orientation: number;
  x: number;
  y: number;
}

export interface BoardSpec {
  kind: "board";
  /** A recorded board, or the `tiles` given. */
  board: "38" | "72" | "tiles";
  tiles?: { key: string; dx: number; dy: number; orientation: number }[];
  /** 0: the base models; 1: Forest. */
  theme: number;
  width: number;
  height: number;
  zoom: number;
  /** Degrees off the vertical, and around the target. */
  polar: number;
  azimuth: number;
  /** The camera's target, in tiles from the board's centre (east, south). */
  offset?: [number, number];
  /** The empty slots around the board and the tile in hand as a ghost on one of them. */
  hand?: boolean;
  /** The backdrop turned to transparency. */
  keyed?: boolean;
}

export interface WordmarkSpec {
  kind: "wordmark";
  width: number;
  height: number;
}

const canvas = document.createElement("canvas");
canvas.style.display = "block";
canvas.style.width = "100%";
canvas.style.height = "100%";
const stage = document.getElementById("stage")!;
stage.appendChild(canvas);

let scene: GameScene | null = null;
const frame = () => new Promise<void>((done) => requestAnimationFrame(() => done()));
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

async function setup(): Promise<{ software: boolean }> {
  const manifest = (await (await fetch(`${BASE}/manifest.json`)).json()) as AssetManifest;
  scene = new GameScene();
  await scene.init({
    surface: createWebSurfaceAdapter(canvas),
    basePath: BASE,
    manifest,
    settings: {
      maxPixelRatio: 1,
      quality: "high",
      multisampling: true,
      outlines: { force: "on" },
      // The board's own look (the mockup preset) on charcoal: no fog or vignette, so the backdrop is one flat colour to key.
      look: { background: CHARCOAL, fog: { enabled: false }, vignette: { enabled: false } },
    },
  });
  scene.setCameraMode("showcase");
  scene.start();
  return { software: scene.getWebGL().software };
}

const fromFixture = (t: FixtureTile, i: number): TileRenderData => ({
  game_id: 1,
  id: t.id ?? i + 1,
  player_id: "0x0",
  plan: t.plan,
  orientation: t.orientation,
  x: t.x,
  y: t.y,
  worldX: t.x - CENTER,
  worldZ: CENTER - t.y,
});

function tilesOf(spec: BoardSpec): TileRenderData[] {
  if (spec.board === "38") return (board38 as { tiles: FixtureTile[] }).tiles.map(fromFixture);
  if (spec.board === "72") return (board72 as { tiles: FixtureTile[] }).tiles.map(fromFixture);
  return (spec.tiles ?? []).map((t, i) => fromFixture({ id: i + 1, plan: PLAN_OF.get(t.key)!, orientation: t.orientation, x: CENTER + t.dx, y: CENTER - t.dy }, i));
}

/** The empty cells next to a tile, and the ghost of the next recorded placement on the free cell nearest the centre. */
function handOf(tiles: TileRenderData[]): { slots: PlacementSlot[]; ghost: HoverState } {
  const taken = new Set(tiles.map((t) => `${t.worldX},${t.worldZ}`));
  const slots = new Map<string, PlacementSlot>();
  for (const t of tiles)
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const key = `${t.worldX + dx},${t.worldZ + dz}`;
      if (!taken.has(key)) slots.set(key, { x: t.worldX + dx, y: t.worldZ + dz });
    }
  const next = (placements38 as { placements: FixtureTile[] }).placements[0]!;
  const ghost: HoverState = { x: next.x - CENTER, y: CENTER - next.y, valid: true, idle: true, placed: true, planIndex: next.plan, orientation: next.orientation };
  return { slots: [...slots.values()], ghost };
}

/** The backdrop's colour as drawn: the most common colour along the image's border (a tile may reach a corner). */
function backdropOf(data: ImageData): [number, number, number] {
  const { width: w, height: h, data: px } = data;
  const counts = new Map<number, number>();
  const border = [...Array(w).keys()].flatMap((x) => [x, (h - 1) * w + x]).concat([...Array(h).keys()].flatMap((y) => [y * w, y * w + w - 1]));
  for (const p of border) {
    const c = (px[p * 4]! << 16) | (px[p * 4 + 1]! << 8) | px[p * 4 + 2]!;
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  const [c] = [...counts].sort((a, b) => b[1] - a[1])[0]!;
  return [(c >> 16) & 255, (c >> 8) & 255, c & 255];
}

/**
 * The backdrop turned transparent: each connected region of pixels near the backdrop's colour that touches an edge or is large
 * (a hole in the board), never a small dark patch inside a tile. A pixel next to it keeps part of its alpha by its distance
 * (the antialiased edge).
 */
function key(data: ImageData): void {
  const { width: w, height: h, data: px } = data;
  const [r0, g0, b0] = backdropOf(data);
  const dist = (p: number) => Math.abs(px[p * 4]! - r0) + Math.abs(px[p * 4 + 1]! - g0) + Math.abs(px[p * 4 + 2]! - b0);
  const NEAR = 18;
  const MIN_HOLE = Math.round((w * h) / 2500);
  // 0 unseen, 1 not backdrop, 2 backdrop kept as is (a small region), 3 keyed.
  const state = new Uint8Array(w * h);
  const region: number[] = [];
  for (let start = 0; start < w * h; start++) {
    if (state[start]) continue;
    if (dist(start) > NEAR) {
      state[start] = 1;
      continue;
    }
    region.length = 0;
    let edge = false;
    const stack = [start];
    state[start] = 2;
    while (stack.length) {
      const p = stack.pop()!;
      region.push(p);
      const x = p % w;
      if (x === 0 || x === w - 1 || p < w || p >= w * (h - 1)) edge = true;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) {
        if (q < 0 || q >= w * h || state[q]) continue;
        if (dist(q) > NEAR) continue;
        state[q] = 2;
        stack.push(q);
      }
    }
    if (edge || region.length >= MIN_HOLE) for (const p of region) state[p] = 3;
  }
  for (let p = 0; p < w * h; p++) {
    if (state[p] === 3) px[p * 4 + 3] = 0;
    else {
      const x = p % w;
      const next = (x > 0 && state[p - 1] === 3) || (x < w - 1 && state[p + 1] === 3) || (p >= w && state[p - w] === 3) || (p < w * (h - 1) && state[p + w] === 3);
      if (next) px[p * 4 + 3] = Math.min(255, Math.round((dist(p) / (NEAR * 3)) * 255));
    }
  }
}

/** The image as a WebP data URL, and the backdrop's colour as drawn (before any keying). */
function toWebp(source: CanvasImageSource, width: number, height: number, keyed: boolean): { webp: string; corner: string } {
  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const context = out.getContext("2d", { willReadFrequently: true })!;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, width, height);
  const corner = `#${backdropOf(context.getImageData(0, 0, width, height)).map((c) => c.toString(16).padStart(2, "0")).join("")}`;
  if (keyed) {
    const data = context.getImageData(0, 0, width, height);
    key(data);
    context.putImageData(data, 0, 0);
  }
  return { webp: out.toDataURL("image/webp", 0.84), corner };
}

let loaded = false;

async function renderBoard(spec: BoardSpec): Promise<{ webp: string; backdrop: string }> {
  if (!scene) throw new Error("direction-renders: setup first");
  stage.style.width = `${spec.width * SUPERSAMPLE}px`;
  stage.style.height = `${spec.height * SUPERSAMPLE}px`;
  const tiles = tilesOf(spec);
  scene.setSkins(spec.theme ? Object.fromEntries(tiles.map((t) => [KEY_OF.get(t.plan)!, spec.theme])) : {});
  scene.updateTiles(tiles);
  const hand = spec.hand ? handOf(tiles) : null;
  scene.setAvailableSlots(hand?.slots ?? []);
  scene.setHoveredTile(hand?.ghost ?? null);
  // The models load in the background: the first board waits for all of them (the 72-tile board names nearly every plan).
  await sleep(loaded ? 1500 : 8000);
  loaded = true;
  // The tiles' centre (the scene's own framing), moved by the offset, then the camera on its sphere around it.
  scene.focusBoard();
  const target = scene.controls.controls.target;
  const [ox, oz] = spec.offset ?? [0, 0];
  target.x += ox * TILE_SIZE;
  target.z += oz * TILE_SIZE;
  const polar = (spec.polar * Math.PI) / 180;
  const azimuth = (spec.azimuth * Math.PI) / 180;
  const { camera } = scene;
  camera.position.set(target.x + 40 * Math.sin(polar) * Math.sin(azimuth), target.y + 40 * Math.cos(polar), target.z + 40 * Math.sin(polar) * Math.cos(azimuth));
  camera.zoom = spec.zoom;
  camera.updateProjectionMatrix();
  camera.lookAt(target);
  scene.requestShadowUpdate();
  for (let i = 0; i < 8; i++) await frame();
  scene.render();
  const { webp, corner } = toWebp(scene.renderer.domElement, spec.width, spec.height, spec.keyed ?? false);
  return { webp, backdrop: corner };
}

/** The banner's letters on their block grid: the khaki face colour sampled at the centre of each block (20.5 units). */
async function bannerGrid(): Promise<boolean[][]> {
  const img = new Image();
  img.src = `data:image/svg+xml;base64,${btoa(banner)}`;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = 1940;
  c.height = 500;
  const context = c.getContext("2d", { willReadFrequently: true })!;
  context.drawImage(img, 0, 0);
  const { data } = context.getImageData(0, 0, 1940, 500);
  const face = (x: number, y: number) => {
    const i = (Math.round(y) * 1940 + Math.round(x)) * 4;
    return Math.abs(data[i]! - 0xba) < 12 && Math.abs(data[i + 1]! - 0xb4) < 12 && Math.abs(data[i + 2]! - 0x78) < 12;
  };
  // The face's box in the banner (measured: x 272 to 1730, y 120 to 325); a block is a fifth of a letter's 205-unit height, halved.
  const S = 20.5;
  const rows: boolean[][] = [];
  for (let r = 0; r < 10; r++) {
    const row: boolean[] = [];
    for (let x = 272 + S / 2; x < 1730; x += S) row.push(face(x, 120 + S / 2 + r * S));
    rows.push(row);
  }
  return rows;
}

/** Deterministic noise for the stones' shades. */
const noise = (x: number, y: number, z: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

async function renderWordmark(spec: WordmarkSpec): Promise<{ webp: string }> {
  const grid = await bannerGrid();
  const rows = grid.length;
  const cols = grid[0]!.length;
  const DEPTH = 4;
  const solid = (x: number, y: number, z: number) => z >= 0 && z < DEPTH && y >= 0 && y < rows && x >= 0 && x < cols && grid[y]![x]!;
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const stone = new THREE.Color();
  // Each face of a voxel that no neighbour covers: x right, y up (row 0 is the top), z toward the camera.
  const FACES: { n: [number, number, number]; corners: [number, number, number][] }[] = [
    { n: [0, 0, 1], corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
    { n: [0, 0, -1], corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
    { n: [1, 0, 0], corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
    { n: [-1, 0, 0], corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
    { n: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
    { n: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  ];
  for (let gy = 0; gy < rows; gy++)
    for (let gx = 0; gx < cols; gx++)
      for (let z = 0; z < DEPTH; z++) {
        if (!solid(gx, gy, z)) continue;
        const y = rows - 1 - gy;
        // A voxel with open air above it is a grass block: green on top, a green rim down its sides; the others are stone.
        const grass = !solid(gx, gy - 1, z);
        for (const face of FACES) {
          const [nx, ny, nz] = face.n;
          if (solid(gx + nx, gy - ny, z + nz)) continue;
          const shade = noise(gx, gy, z);
          if (grass && ny === 1) stone.setHSL(0.27 + shade * 0.03, 0.5, 0.36 + shade * 0.08);
          else if (grass) stone.setHSL(0.28, 0.42, 0.3 + shade * 0.05);
          else stone.setHSL(0.6, 0.03 + shade * 0.03, 0.42 + shade * 0.14);
          const quad = face.corners.map(([cx, cy, cz]) => [gx + cx, y + cy, z + cz] as const);
          for (const i of [0, 1, 2, 0, 2, 3]) {
            positions.push(...quad[i]!);
            normals.push(nx, ny, nz);
            colors.push(stone.r, stone.g, stone.b);
          }
        }
      }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.translate(-cols / 2, -rows / 2, -DEPTH / 2);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }));
  const world = new THREE.Scene();
  world.add(mesh);
  world.add(new THREE.HemisphereLight(0xbcd4ff, 0x3a3324, 1.4));
  const keyLight = new THREE.DirectionalLight(0xffd8a0, 3.2);
  keyLight.position.set(-30, 50, 60);
  world.add(keyLight);
  const fill = new THREE.DirectionalLight(0xffe2c0, 0.5);
  fill.position.set(40, 10, 30);
  world.add(fill);
  // Seen from a little above and to the left, as the banner's extrusion goes down and right.
  const camera = new THREE.PerspectiveCamera(22, spec.width / spec.height, 1, 1000);
  camera.position.set(-4, 22, 62);
  camera.lookAt(0, -1, 0);
  const out = document.createElement("canvas");
  out.width = spec.width * SUPERSAMPLE;
  out.height = spec.height * SUPERSAMPLE;
  const renderer = new THREE.WebGLRenderer({ canvas: out, alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.render(world, camera);
  const { webp } = toWebp(out, spec.width, spec.height, false);
  renderer.dispose();
  return { webp };
}

(window as unknown as { paved: unknown }).paved = {
  setup,
  render: (spec: BoardSpec | WordmarkSpec) => (spec.kind === "board" ? renderBoard(spec) : renderWordmark(spec)),
};
