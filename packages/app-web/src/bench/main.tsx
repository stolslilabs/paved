import { useCallback, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { GameCanvas } from "@paved/renderer/react";
import type { GameScene, TileRenderData } from "@paved/renderer";
import { toRenderCharacters } from "../utils/char-helpers";
import { loadBoard } from "./board";
import type { BenchBoard } from "./board";
import { ClickBench } from "./click-bench";
import { installProbes } from "./play-probes";
import { runBench } from "./run-bench";
import type { BenchResult } from "./run-bench";

/**
 * Bench entry. Three modes, all on a recorded board (packages/game-core/bench/fixtures):
 *
 *   bench.html?bench=38|72[&duration=20000]   frame time along the scripted camera path
 *   bench.html?bench=38|72&mode=click         click-to-display latency (driven by the driver)
 *   bench.html?mode=play[&duration=60000]     the real Game page against the local mock of
 *                                             Torii and the RPC (scripts/bench/mock-chain.ts)
 *
 * The board and click modes render through the game's own renderer path (GameCanvas,
 * GameScene, the same assets, materials, effects and `play` camera), without the chain layer.
 * The result lands in `window.__benchResult` (or `window.__benchError`).
 */
declare global {
  interface Window {
    __benchResult?: unknown;
    __benchError?: string;
  }
}

window.__benchPhase = "load";

const params = new URLSearchParams(window.location.search);
const mode = params.get("mode") ?? "board";

const fail = (err: any) => {
  window.__benchError = String(err?.stack ?? err);
};

function Bench({ board, durationMs }: { board: BenchBoard; durationMs: number }) {
  const [tiles, setTiles] = useState<TileRenderData[]>([]);
  const click = useRef<ClickBench | null>(null);

  const characters = useMemo(() => {
    const byId = new Map(board.tiles.map((t) => [t.id, { worldX: t.worldX, worldZ: t.worldZ }]));
    return tiles.length > 0 ? toRenderCharacters(board.characters, byId) : [];
  }, [tiles, board]);

  // Like the game, the board arrives after the scene is ready.
  const onReady = useCallback((scene: GameScene) => {
    setTiles(board.tiles);
    if (mode === "click") {
      const bench = new ClickBench(scene, board, (tile) => setTiles((prev) => [...prev, tile]));
      click.current = bench;
      window.__benchClick = bench;
      runBench(scene, { tileCount: board.tiles.length, durationMs: 0, bounds: board.bounds })
        .then(() => bench.start())
        .catch(fail);
      return;
    }
    runBench(scene, { tileCount: board.tiles.length, durationMs, bounds: board.bounds }).then(
      (result: BenchResult) => {
        window.__benchResult = result;
      },
      fail,
    );
  }, [board, durationMs]);

  const onTileClick = useCallback((gx: number, gy: number) => click.current?.onTileClick(gx, gy), []);

  return (
    <GameCanvas
      basePath=""
      tiles={tiles}
      characters={characters}
      cameraMode="play"
      onReady={onReady}
      onTileClick={mode === "click" ? onTileClick : undefined}
      style={{ position: "absolute", inset: 0 }}
    />
  );
}

try {
  if (mode === "play") {
    // Probes first, so that they see the app's first fetch.
    installProbes();
    import("./play").then((m) => m.mountPlay()).catch(fail);
  } else if (mode === "board" || mode === "click") {
    const board = loadBoard(Number(params.get("bench") ?? 38));
    const durationMs = Number(params.get("duration") ?? 20000);
    createRoot(document.getElementById("root")!).render(<Bench board={board} durationMs={durationMs} />);
  } else {
    throw new Error(`unknown bench mode: ${mode}`);
  }
} catch (err) {
  fail(err);
}
