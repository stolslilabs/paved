import type { GameScene } from "@paved/renderer";
import { cameraPose } from "./camera-path";
import type { PathBounds } from "./camera-path";
import { GpuTimer } from "./gpu-timer";

export interface BenchOptions {
  /** Tiles the scene must hold before the first measured frame. */
  tileCount: number;
  /** Length of the scripted camera path. */
  durationMs: number;
  /** Bounds of the board in world units (tile * TILE_SIZE). */
  bounds: PathBounds;
}

export interface BenchResult {
  tileCount: number;
  durationMs: number;
  /** Navigation start to the end of the first frame that drew every tile, input bound. */
  ttiMs: number;
  /** Median requestAnimationFrame interval of an idle page: the refresh interval. */
  refreshMs: number;
  /** requestAnimationFrame interval of every frame of the camera path. */
  rafDeltas: number[];
  /** CPU time of the render-loop tick, for every frame that rendered. */
  cpuMs: number[];
  /** Draw calls and triangles of every rendered frame (all passes, `renderer.info`). */
  calls: number[];
  triangles: number[];
  /** GPU time of every sampled frame, null when the timer query is not exposed. */
  gpuMs: number[] | null;
  rafFrames: number;
  renderedFrames: number;
  heapBytes: { atTti: number | null; atEnd: number | null };
  info: { geometries: number; textures: number; programs: number };
  gl: { renderer: string; vendor: string; version: string };
  page: {
    innerWidth: number;
    innerHeight: number;
    devicePixelRatio: number;
    canvasWidth: number;
    canvasHeight: number;
    userAgent: string;
  };
}

declare global {
  interface Window {
    /** "load" until the camera path starts, then "path", then "done": for the driver's profiler. */
    __benchPhase?: "load" | "path" | "done";
  }
}

const IDLE_FRAMES = 60;

const nextFrame = (): Promise<number> => new Promise((resolve) => requestAnimationFrame(resolve));

const heap = (): number | null => (performance as any).memory?.usedJSHeapSize ?? null;

const median = (xs: number[]): number => {
  const s = xs.slice().sort((a, b) => a - b);
  return s.length === 0 ? NaN : s[Math.floor(s.length / 2)];
};

/** Number of tile meshes in the scene (the first child group of TileRenderer is the placed tiles). */
const drawnTiles = (scene: GameScene): number => scene.tiles.getGroup().children[0]?.children.length ?? 0;

/**
 * Wait for every tile to be drawn, then run the scripted camera path and collect the
 * per-frame figures. Only observes the scene: the render path is the game's own.
 */
export async function runBench(scene: GameScene, options: BenchOptions): Promise<BenchResult> {
  const { renderer } = scene;
  const gl = renderer.getContext();
  const gpu = new GpuTimer(gl);
  renderer.info.autoReset = false;

  const cpuMs: number[] = [];
  const calls: number[] = [];
  const triangles: number[] = [];
  let recording = false;
  let renderedFrames = 0;
  let ttiMs = NaN;
  let heapAtTti: number | null = null;

  scene.setFrameObserver({
    beforeRender() {
      if (recording) gpu.begin();
    },
    afterTick({ cpuMs: cpu, rendered }) {
      if (rendered) {
        if (Number.isNaN(ttiMs) && drawnTiles(scene) === options.tileCount) {
          ttiMs = performance.now();
          heapAtTti = heap();
        }
        if (recording) {
          gpu.end();
          cpuMs.push(cpu);
          calls.push(renderer.info.render.calls);
          triangles.push(renderer.info.render.triangles);
          renderedFrames++;
          gpu.poll();
        }
        renderer.info.reset();
      }
    },
  });

  // Time to interactive: first rendered frame with all tiles; the surface input is bound by init().
  while (Number.isNaN(ttiMs)) await nextFrame();

  // Idle page: the rAF interval is the display refresh interval.
  const idle: number[] = [];
  let last = await nextFrame();
  for (let i = 0; i < IDLE_FRAMES; i++) {
    const ts = await nextFrame();
    idle.push(ts - last);
    last = ts;
  }
  const refreshMs = median(idle);

  // Scripted path.
  const rafDeltas: number[] = [];
  const pose = (u: number) => {
    const p = cameraPose(u, options.bounds);
    scene.controls.controls.target.set(...p.target);
    scene.camera.position.set(...p.position);
  };
  recording = true;
  window.__benchPhase = "path";
  pose(0);
  let start = 0;
  let prev = 0;
  await new Promise<void>((resolve) => {
    const step = (ts: number) => {
      if (start === 0) {
        start = ts;
      } else {
        rafDeltas.push(ts - prev);
      }
      prev = ts;
      const u = (ts - start) / options.durationMs;
      if (u >= 1) {
        resolve();
        return;
      }
      pose(u);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  recording = false;
  window.__benchPhase = "done";
  // Let the last GPU queries land.
  for (let i = 0; i < 10; i++) {
    await nextFrame();
    gpu.poll();
  }
  scene.setFrameObserver(null);

  const dbg = gl.getExtension("WEBGL_debug_renderer_info");
  const canvas = renderer.domElement;
  return {
    tileCount: options.tileCount,
    durationMs: options.durationMs,
    ttiMs,
    refreshMs,
    rafDeltas,
    cpuMs,
    calls,
    triangles,
    gpuMs: gpu.available ? gpu.samples : null,
    rafFrames: rafDeltas.length,
    renderedFrames,
    heapBytes: { atTti: heapAtTti, atEnd: heap() },
    info: {
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
      programs: renderer.info.programs?.length ?? 0,
    },
    gl: {
      renderer: String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)),
      vendor: String(dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR)),
      version: String(gl.getParameter(gl.VERSION)),
    },
    page: {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      userAgent: navigator.userAgent,
    },
  };
}
