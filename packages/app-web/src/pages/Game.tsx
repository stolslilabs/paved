import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { GameCanvas } from "@paved/renderer/react";
import {
  IngameStatus,
  HandPanel,
  GameCompleteDialog,
  CharacterMenu,
  useGameStore,
} from "@paved/ui";
import type { GameScene, TileRenderData, HoverState } from "@paved/renderer";
import { useDojo, useActions } from "@paved/chain";
import { ModeType } from "@paved/game-core";

/** Game board center coordinate (0x7FFFFFFF) */
const CENTER = 2147483647;

interface GameState {
  id: number;
  over: boolean;
  built: number;
  discarded: number;
  tile_count: number;
  score: number;
}

interface BuilderState {
  tile_id: number;
  tile_plan: number;
  characters: number;
}

/** Query Torii SQL endpoint */
async function toriiQuery(toriiUrl: string, sql: string): Promise<any[]> {
  const res = await fetch(toriiUrl + "/sql", { method: "POST", body: sql });
  return res.json();
}

/** Pad address to 66-char 0x-prefixed format (0x + 64 hex) to match Torii storage */
function padAddress(address: string): string {
  const hex = address.replace(/^0x/, "");
  return "0x" + hex.padStart(64, "0");
}

/** Convert Torii tile rows to TileRenderData (only placed tiles with orientation != 0) */
function toRenderTiles(rows: any[]): TileRenderData[] {
  return rows
    .filter((t: any) => Number(t.orientation) !== 0)
    .map((t: any) => ({
      game_id: Number(t.game_id),
      id: Number(t.id),
      player_id: t.player_id ?? "",
      plan: Number(t.plan),
      orientation: Number(t.orientation),
      x: Number(t.x),
      y: Number(t.y),
      occupied_spot: Number(t.occupied_spot),
      worldX: Number(t.x) - CENTER,
      worldZ: Number(t.y) - CENTER,
    }));
}

export function GamePage() {
  const navigate = useNavigate();
  const [scene, setScene] = useState<GameScene | null>(null);
  const { account, provider, client } = useDojo();
  const { spawn, build, discard, loading } = useActions(provider, account, client?.config?.manifest);
  const orientation = useGameStore((s) => s.orientation);
  const setOrientation = useGameStore((s) => s.setOrientation);
  const strategyMode = useGameStore((s) => s.strategyMode);
  const character = useGameStore((s) => s.character);
  const spot = useGameStore((s) => s.spot);
  const x = useGameStore((s) => s.x);
  const y = useGameStore((s) => s.y);

  const [gameState, setGameState] = useState<GameState | null>(null);
  const [builderState, setBuilderState] = useState<BuilderState | null>(null);
  const [tiles, setTiles] = useState<TileRenderData[]>([]);
  const [spawning, setSpawning] = useState(false);
  const spawnAttempted = useRef(false);

  // Auto-spawn a Daily game on mount
  useEffect(() => {
    if (!account || !client || !provider || spawnAttempted.current) return;
    spawnAttempted.current = true;

    const checkAndSpawn = async () => {
      const url = client.config.toriiUrl;
      try {
        const builders = await toriiQuery(url,
          `SELECT game_id, tile_id, characters FROM [paved-Builder] WHERE player_id = '${padAddress(account.address)}' ORDER BY game_id DESC LIMIT 1`
        );

        if (builders.length > 0) {
          const gameId = Number(builders[0].game_id);
          const games = await toriiQuery(url,
            `SELECT id, over, built, discarded, tile_count, score FROM [paved-Game] WHERE id = ${gameId}`
          );
          if (games.length > 0 && !games[0].over) {
            setGameState({
              id: Number(games[0].id),
              over: Boolean(games[0].over),
              built: Number(games[0].built),
              discarded: Number(games[0].discarded),
              tile_count: Number(games[0].tile_count),
              score: Number(games[0].score),
            });
            // Get plan for builder's current tile
            const tileId = Number(builders[0].tile_id);
            const tileRows = await toriiQuery(url,
              `SELECT * FROM [paved-Tile] WHERE game_id = ${gameId}`
            );
            const currentTile = tileRows.find((t: any) => Number(t.id) === tileId);
            setBuilderState({
              tile_id: tileId,
              tile_plan: currentTile ? Number(currentTile.plan) : 0,
              characters: Number(builders[0].characters),
            });
            setTiles(toRenderTiles(tileRows));
            return;
          }
        }
      } catch {
        // Torii not available yet
      }

      // No active game found, spawn one
      setSpawning(true);
      try {
        const contractAddr = client.config.manifest?.contracts?.find((c: any) => c.tag === "paved-Daily")?.address;
        console.log("Spawning Daily game. Daily contract:", contractAddr);
        const result = await provider.execute(
          account as any,
          [
            {
              contractName: "Token",
              entrypoint: "approve",
              calldata: [contractAddr, `0x${(1e18).toString(16)}`],
            },
            { contractName: "Daily", entrypoint: "spawn", calldata: [] },
          ],
          "paved",
        );
        console.log("Game spawned:", result);
      } catch (e: any) {
        console.error("Failed to spawn game:", e?.message || e);
      } finally {
        setSpawning(false);
      }
    };

    checkAndSpawn();
  }, [account, client, provider, spawn]);

  // Poll Torii for game + builder + tiles state
  useEffect(() => {
    if (!account || !client) return;
    let cancelled = false;

    const poll = async () => {
      const url = client.config.toriiUrl;
      try {
        const builders = await toriiQuery(url,
          `SELECT game_id, tile_id, characters FROM [paved-Builder] WHERE player_id = '${padAddress(account.address)}' ORDER BY game_id DESC LIMIT 1`
        );
        if (cancelled || builders.length === 0) return;

        const gameId = Number(builders[0].game_id);
        const tileId = Number(builders[0].tile_id);

        // Query tiles for this game
        const tileRows = await toriiQuery(url,
          `SELECT * FROM [paved-Tile] WHERE game_id = ${gameId}`
        );
        if (cancelled) return;

        // Find builder's current tile plan
        const currentTile = tileRows.find((t: any) => Number(t.id) === tileId);
        setBuilderState({
          tile_id: tileId,
          tile_plan: currentTile ? Number(currentTile.plan) : 0,
          characters: Number(builders[0].characters),
        });

        // Convert placed tiles to render data
        setTiles(toRenderTiles(tileRows));

        // Query game state
        const games = await toriiQuery(url,
          `SELECT id, over, built, discarded, tile_count, score FROM [paved-Game] WHERE id = ${gameId}`
        );
        if (!cancelled && games.length > 0) {
          setGameState({
            id: Number(games[0].id),
            over: Boolean(games[0].over),
            built: Number(games[0].built),
            discarded: Number(games[0].discarded),
            tile_count: Number(games[0].tile_count),
            score: Number(games[0].score),
          });
        }
      } catch {
        // Torii not available
      }
    };

    poll();
    const interval = setInterval(poll, 2000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [account, client]);

  const handleReady = useCallback((s: GameScene) => {
    setScene(s);
  }, []);

  const handleRotate = useCallback(() => {
    setOrientation(orientation + 1);
  }, [orientation, setOrientation]);

  const handleConfirm = useCallback(async () => {
    if (!gameState || !builderState) return;
    const result = await build({
      mode: ModeType.Daily,
      gameId: gameState.id,
      tileId: builderState.tile_id,
      orientation,
      x,
      y,
      role: character,
      spot,
    });
    console.log("Build result:", result);
  }, [build, gameState, builderState, orientation, x, y, character, spot]);

  const handleDiscard = useCallback(async () => {
    if (!gameState) return;
    const result = await discard(ModeType.Daily, gameState.id);
    console.log("Discard result:", result);
  }, [discard, gameState]);

  if (spawning) {
    return (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a0a" }}>
        <span style={{ color: "#f59e0b", fontFamily: "RubikMonoOne", fontSize: 24 }}>Spawning game...</span>
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <GameCanvas
        basePath=""
        tiles={tiles}
        strategyMode={strategyMode}
        onReady={handleReady}
        style={{ position: "absolute", inset: 0 }}
      />

      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          pointerEvents: "none",
          display: "grid",
          gridTemplateColumns: "auto 1fr auto",
          gridTemplateRows: "auto 1fr auto",
          padding: 16,
          gap: 8,
        }}
      >
        <div style={{ pointerEvents: "auto", gridColumn: 1, gridRow: 1 }}>
          <IngameStatus
            score={gameState?.score ?? 0}
            built={gameState?.built ?? 0}
            totalTiles={gameState?.tile_count ?? 72}
            discarded={gameState?.discarded ?? 0}
          />
        </div>

        <div style={{ pointerEvents: "auto", gridColumn: 3, gridRow: "1 / -1", alignSelf: "center" }}>
          <CharacterMenu
            packedCharacters={builderState?.characters ?? 0}
            selectedCharacter={character}
            onSelectCharacter={(c) => useGameStore.getState().setCharacter(c)}
          />
        </div>

        <div style={{ pointerEvents: "auto", gridColumn: 3, gridRow: 3, display: "flex", gap: 8, alignItems: "center" }}>
          <HandPanel
            onRotate={handleRotate}
            onConfirm={handleConfirm}
            confirmDisabled={loading || !builderState}
          />
          <button
            onClick={handleDiscard}
            disabled={loading || !gameState}
            style={{
              background: "transparent",
              border: "1px solid #dc143c",
              color: "#dc143c",
              padding: "8px 16px",
              borderRadius: 8,
              cursor: loading ? "not-allowed" : "pointer",
              fontFamily: "RubikMonoOne",
              fontSize: 14,
              opacity: loading ? 0.5 : 1,
            }}
          >
            Discard
          </button>
        </div>
      </div>

      <GameCompleteDialog
        score={gameState?.score ?? 0}
        visible={gameState?.over === true}
        onClose={() => navigate("/")}
      />
    </div>
  );
}
