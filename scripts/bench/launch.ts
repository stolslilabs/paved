// How the bench starts its browser, apart from run.ts so that it can be tested without one.
//
// Owner's rule (Overseer, 2026-10-07): no browser window on the Mac while the owner uses it, with any
// flag. The only measuring mode is new headless Chrome with the real GPU (ANGLE on Metal); the
// software-rendering smoke mode is not a measure. There is no off-screen or on-screen mode.

export type Mode = "gpu" | "smoke";

/** Flags of the GPU mode: new headless keeps the GPU process; these pick the Metal path and refuse a blocklist fallback. */
export const GPU_FLAGS = ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] as const;
export const SMOKE_FLAGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] as const;

/** Options that existed for a visible or off-screen window: refused, whatever the value. */
const REFUSED = ["offscreen", "window-position", "headed"];

export interface TrialSpec {
  kind: "board";
  size: number;
  durationMs: number;
  profile: "throttled";
  runs: number;
  warmup: number;
}
/** The owner's 10-second trial: one throttled board run of 10 s at 72 tiles. */
export const TRIAL: TrialSpec = { kind: "board", size: 72, durationMs: 10_000, profile: "throttled", runs: 1, warmup: 0 };

/** The mode named by the arguments; throws on an option that would open a window. */
export function parseMode(argv: string[]): { mode: Mode; trial: boolean } {
  for (const name of REFUSED) {
    if (argv.includes(`--${name}`) || argv.some((a) => a.startsWith(`--${name}=`))) {
      throw new Error(
        `--${name} is refused: no browser window on the Mac. Measures run in new headless with the GPU (the default); --headless is the software smoke mode.`,
      );
    }
  }
  const has = (name: string) => argv.includes(`--${name}`);
  if (has("chromium") && !has("headless")) throw new Error("--chromium <path> applies to the smoke mode: use it with --headless");
  if (has("trial")) {
    for (const name of TRIAL_FIXED) {
      if (has(name)) throw new Error(`--trial is one fixed run (throttled board, 72 tiles, 10 s): --${name} is refused with it`);
    }
  }
  return { mode: has("headless") ? "smoke" : "gpu", trial: has("trial") };
}

/** Options the trial sets itself. */
const TRIAL_FIXED = ["click", "play", "sizes", "runs", "duration", "profiles"];

/** The full launch arguments of a mode, recorded in machine.json. */
export function launchArgs(mode: Mode, winW: number, winH: number): string[] {
  return [`--window-size=${winW},${winH}`, "--enable-precise-memory-info", ...(mode === "gpu" ? GPU_FLAGS : SMOKE_FLAGS)];
}

/** What a page says about its GPU: the WebGL renderer string, and whether the timer query exists. */
export interface GpuFacts {
  renderer: string;
  timerQuery: boolean;
}

/** A GPU-mode run is refused, before any figure is written, when the browser renders in software or has no GPU timer. */
export function checkGpu(facts: { renderer: string | null | undefined; gpuMs?: number[] | null; timerQuery?: boolean }): void {
  const renderer = facts.renderer ?? "";
  if (renderer === "") throw new Error("GPU check: the page reports no WebGL renderer");
  if (/swiftshader/i.test(renderer)) throw new Error(`GPU check: the WebGL renderer is software rendering (${renderer}); no figure is written`);
  if (facts.timerQuery === false) throw new Error(`GPU check: no GPU timer query (EXT_disjoint_timer_query_webgl2) on ${renderer}; no figure is written`);
  if ("gpuMs" in facts && (facts.gpuMs === null || facts.gpuMs === undefined || facts.gpuMs.length === 0)) {
    throw new Error(`GPU check: gpuMs is null on ${renderer}; no figure is written`);
  }
}

/** Runs in the page: the facts `checkGpu` needs. */
export function probeGpu(): GpuFacts {
  const gl = document.createElement("canvas").getContext("webgl2");
  if (!gl) return { renderer: "", timerQuery: false };
  const dbg = gl.getExtension("WEBGL_debug_renderer_info");
  return {
    renderer: String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)),
    timerQuery: gl.getExtension("EXT_disjoint_timer_query_webgl2") !== null,
  };
}

/** The part of a browser the preflight uses (Playwright's Browser fits). */
export interface PreflightBrowser {
  newPage(): Promise<{ evaluate(fn: () => GpuFacts): Promise<GpuFacts>; close(): Promise<void> }>;
  close(): Promise<void>;
}

/**
 * The browser of a run, after a preflight on a blank page: launch once; in GPU mode probe the WebGL
 * renderer and the timer query and refuse (closing the browser) when it is software or has no GPU
 * timer, so no figure is written. The smoke mode is not checked.
 */
export async function launchChecked<B extends PreflightBrowser>(mode: Mode, launcher: () => Promise<B>): Promise<B> {
  const browser = await launcher();
  if (mode === "smoke") return browser;
  try {
    const page = await browser.newPage();
    const facts = await page.evaluate(probeGpu);
    await page.close();
    checkGpu(facts);
  } catch (e) {
    await browser.close();
    throw e;
  }
  return browser;
}
