import { Profiler, StrictMode } from "react";
import type { ProfilerOnRenderCallback } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { TamaguiProvider } from "tamagui";
import { tamaguiConfig, useGameStore } from "@paved/ui";
import { PavedProvider } from "@paved/chain";
import { GameScene } from "@paved/renderer";
import { App } from "../App";
import { resolveAppNetwork, resolvePlayerAccount } from "../utils/network";
import { loadBoard } from "./board";
import { cameraPose } from "./camera-path";
import { CLICK_DISTANCE } from "./click-bench";
import { DisplayLatency } from "./display-latency";
import type { DisplaySample } from "./display-latency";
import { probes } from "./play-probes";
import type { FetchRecord, InputRecord, LongTask } from "./play-probes";
import { drawnTiles, glInfo, measureRefresh, pageInfo } from "./run-bench";
import { cellToClient, holdOverview } from "./screen";

/**
 * In-play bench: the real Game page (App at /game, the same providers as src/main.tsx),
 * talking to the local mock of Torii's SQL endpoint and of the RPC served by the driver
 * (scripts/bench/mock-chain.ts), on the 72-tile board. Game.tsx polls it at its own cadence.
 *
 * Bench-only additions, all read-only: the probes of play-probes.ts (fetch, long tasks,
 * inputs), a React Profiler around the app (built with react-dom/profiling: see
 * vite.bench.config.ts), and a hook on GameScene.prototype.start that hands the scene to the
 * bench for the frame counters and the camera path.
 */
export interface CommitRecord {
  phase: string;
  /** Time React spent rendering the committed update (Profiler actualDuration). */
  actualMs: number;
  baseMs: number;
  startTime: number;
  commitTime: number;
}

export interface PlayResult {
  mode: "play";
  tileCount: number;
  ttiMs: number;
  refreshMs: number;
  session: { start: number; end: number; durationMs: number };
  rafDeltas: number[];
  cpuMs: number[];
  calls: number[];
  triangles: number[];
  commits: CommitRecord[];
  longTasks: LongTask[];
  fetches: FetchRecord[];
  inputs: InputRecord[];
  /** Keydown "c" (confirm) to the first presented frame with the optimistic tile. */
  confirms: DisplaySample[];
  confirmMisses: number[];
  heapBytes: { atTti: number | null; atEnd: number | null };
  gl: ReturnType<typeof glInfo>;
  page: ReturnType<typeof pageInfo>;
}

declare global {
  interface Window {
    __benchPlay?: PlayBench;
  }
}

const PATH_MS = 20000;
const heap = (): number | null => (performance as any).memory?.usedJSHeapSize ?? null;

class PlayBench {
  scene: GameScene | null = null;
  ttiMs = NaN;
  ready = false;
  private heapAtTti: number | null = null;
  private refreshMs = NaN;
  private readonly commits: CommitRecord[] = [];
  private readonly latency = new DisplayLatency();
  private recording = false;
  private held = false;
  private confirms = 0;
  private session = { start: NaN, end: NaN, durationMs: 0 };
  private rafDeltas: number[] = [];
  private cpuMs: number[] = [];
  private calls: number[] = [];
  private triangles: number[] = [];
  private readonly board = loadBoard(72);

  constructor(readonly tileCount: number) {}

  onRender: ProfilerOnRenderCallback = (_id, phase, actualDuration, baseDuration, startTime, commitTime) => {
    this.commits.push({ phase, actualMs: actualDuration, baseMs: baseDuration, startTime, commitTime });
  };

  attach(scene: GameScene): void {
    this.scene = scene;
    scene.renderer.info.autoReset = false;
    scene.setFrameObserver({
      afterTick: ({ cpuMs, rendered }) => {
        if (!rendered) return;
        const tiles = drawnTiles(scene);
        if (Number.isNaN(this.ttiMs) && tiles >= this.tileCount) {
          this.ttiMs = performance.now();
          this.heapAtTti = heap();
          measureRefresh().then((r) => {
            this.refreshMs = r;
            this.ready = true;
          });
        }
        this.latency.afterTick(rendered, tiles);
        if (this.recording) {
          this.cpuMs.push(cpuMs);
          this.calls.push(scene.renderer.info.render.calls);
          this.triangles.push(scene.renderer.info.render.triangles);
        }
        scene.renderer.info.reset();
      },
    });
    window.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "c" && this.recording && !e.repeat) this.latency.arm(this.confirms++, e.timeStamp, drawnTiles(scene) + 1);
      },
      { capture: true },
    );
  }

  /** Start the session: the camera path loops (20 s per lap) until stop(), except while held. */
  start(durationMs: number): void {
    const scene = this.scene!;
    this.recording = true;
    this.session = { start: performance.now(), end: NaN, durationMs };
    let start = 0;
    let prev = 0;
    const step = (ts: number) => {
      if (!this.recording) return;
      if (start === 0) start = ts;
      else this.rafDeltas.push(ts - prev);
      prev = ts;
      if (!this.held) {
        const p = cameraPose(((ts - start) % PATH_MS) / PATH_MS, this.board.bounds);
        scene.controls.controls.target.set(...p.target);
        scene.camera.position.set(...p.position);
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /** Hold the camera on the fixed overview while the driver clicks, or release it. */
  hold(on: boolean): void {
    this.held = on;
    if (on) holdOverview(this.scene!, this.board.bounds, CLICK_DISTANCE);
  }

  /** Page coordinates of a cell given in contract coordinates (as the mock serves them). */
  target(x: number, y: number): { x: number; y: number } | null {
    const t = this.board.tiles[0];
    return cellToClient(this.scene!, x - t.x + t.worldX, t.y - y + t.worldZ);
  }

  orientation(): number {
    return useGameStore.getState().orientation;
  }

  stop(): PlayResult {
    this.recording = false;
    this.session.end = performance.now();
    const scene = this.scene!;
    return {
      mode: "play",
      tileCount: this.tileCount,
      ttiMs: this.ttiMs,
      refreshMs: this.refreshMs,
      session: this.session,
      rafDeltas: this.rafDeltas,
      cpuMs: this.cpuMs,
      calls: this.calls,
      triangles: this.triangles,
      commits: this.commits,
      longTasks: probes.longTasks,
      fetches: probes.fetches,
      inputs: probes.inputs,
      confirms: this.latency.samples,
      confirmMisses: this.latency.misses,
      heapBytes: { atTti: this.heapAtTti, atEnd: heap() },
      gl: glInfo(scene),
      page: pageInfo(scene),
    };
  }
}


/** The chain the mock of scripts/bench/mock-chain.ts serves: contract addresses and the playing account. */
export const BENCH_ADDRESSES = {
  VITE_ACCOUNT_ADDRESS: "0x1a",
  VITE_DAILY_ADDRESS: "0x2a",
  VITE_TUTORIAL_ADDRESS: "0x3a",
  VITE_TOKEN_ADDRESS: "0x4a",
  VITE_PLAYER_ADDRESS: "0x5a",
  VITE_PLAYER_PRIVATE_KEY: "0x1",
};

export function mountPlay(): void {
  const params = new URLSearchParams(window.location.search);
  const bench = new PlayBench(Number(params.get("tiles") ?? 72));
  window.__benchPlay = bench;

  // Hand the game's scene to the bench when its render loop starts (the loop itself is unchanged).
  const start = GameScene.prototype.start;
  GameScene.prototype.start = function (this: GameScene) {
    bench.attach(this);
    return start.call(this);
  };

  // Same providers as src/main.tsx, pointed at the driver's mock RPC (scripts/bench/mock-chain.ts),
  // which serves these addresses and accepts this account's writes.
  const env = {
    // A devnet in kind: the only network that takes a key from the env.
    VITE_NETWORK: "devnet",
    VITE_RPC_URL: `${window.location.origin}/rpc`,
    ...BENCH_ADDRESSES,
  };
  const network = resolveAppNetwork(env, {});
  const account = resolvePlayerAccount(env, network.deployment);
  const gameId = params.get("game") ?? "1";

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <TamaguiProvider config={tamaguiConfig} defaultTheme="dark">
        <PavedProvider deployment={network.deployment} account={account} tip={0n}>
          <MemoryRouter initialEntries={[`/game?mode=daily&id=${gameId}`]}>
            <Profiler id="game" onRender={bench.onRender}>
              <App />
            </Profiler>
          </MemoryRouter>
        </PavedProvider>
      </TamaguiProvider>
    </StrictMode>,
  );
}
