import { useCallback, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { GameCanvas } from "@paved/renderer/react";
import type { GameScene, TileRenderData } from "@paved/renderer";
import { TILE_SIZE } from "@paved/renderer";
import { offset } from "@paved/game-core";
import type { CharacterData, TileData } from "@paved/game-core";
import { toRenderCharacters } from "../utils/char-helpers";
import board38 from "../../../game-core/bench/fixtures/board-38.json?raw";
import board72 from "../../../game-core/bench/fixtures/board-72.json?raw";
import { runBench } from "./run-bench";
import type { BenchResult } from "./run-bench";

/**
 * Bench entry: renders a recorded board through the game's own renderer path (GameCanvas,
 * GameScene, the same assets, materials, effects and `play` camera), without the chain layer.
 *
 *   bench.html?bench=38|72[&duration=20000]
 *
 * The result lands in `window.__benchResult` (or `window.__benchError`).
 */
declare global {
  interface Window {
    __benchResult?: BenchResult;
    __benchError?: string;
  }
}

interface Board {
  tiles: TileData[];
  characters: CharacterData[];
}

window.__benchPhase = "load";

const params = new URLSearchParams(window.location.search);
const size = Number(params.get("bench") ?? 38);
const durationMs = Number(params.get("duration") ?? 20000);

const board: Board = JSON.parse(size === 72 ? board72 : board38);

// Same conversion as Game.tsx toRenderTiles, from the recorded rows instead of Torii.
const renderTiles: TileRenderData[] = board.tiles.map((t) => ({
  ...t,
  worldX: t.x - offset,
  worldZ: offset - t.y,
}));

function Bench() {
  const [tiles, setTiles] = useState<TileRenderData[]>([]);

  const characters = useMemo(() => {
    const byId = new Map(renderTiles.map((t) => [t.id, { worldX: t.worldX, worldZ: t.worldZ }]));
    return tiles.length > 0 ? toRenderCharacters(board.characters, byId) : [];
  }, [tiles]);

  // Like the game, the board arrives after the scene is ready.
  const onReady = useCallback((scene: GameScene) => {
    setTiles(renderTiles);
    const xs = renderTiles.map((t) => t.worldX * TILE_SIZE);
    const zs = renderTiles.map((t) => t.worldZ * TILE_SIZE);
    const bounds = { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
    runBench(scene, { tileCount: renderTiles.length, durationMs, bounds }).then(
      (result) => {
        window.__benchResult = result;
      },
      (err) => {
        window.__benchError = String(err?.stack ?? err);
      },
    );
  }, []);

  return (
    <GameCanvas
      basePath=""
      tiles={tiles}
      characters={characters}
      cameraMode="play"
      onReady={onReady}
      style={{ position: "absolute", inset: 0 }}
    />
  );
}

createRoot(document.getElementById("root")!).render(<Bench />);
