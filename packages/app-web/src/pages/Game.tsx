import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { GameCanvas } from "@paved/renderer/react";
import {
  IngameStatus,
  HandPanel,
  GameCompleteDialog,
  CharacterMenu,
  SpotSelector,
  useGameStore,
} from "@paved/ui";
import type { GameScene, TileRenderData, CharacterRenderData } from "@paved/renderer";
import { useDojo, useActions } from "@paved/chain";
import {
  ModeType,
  Layout,
  Plan,
  Orientation,
  Direction,
  DirectionType,
  Spot,
  SpotType,
  getSpotOffset,
  getIndexFromCharacter,
  getColorFromCharacter,
  getRole,
} from "@paved/game-core";
import { findNextTile, shouldPollUpdateBuilder, shouldShowSpotSelector, spotKeyToNumber } from "../utils/game-helpers";
import { buildCharQuery, toRenderCharacters } from "../utils/char-helpers";
import { toriiQuery, padAddress } from "../utils/torii";
import { parseGameParams, modeToContractName } from "../utils/game-params";

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

let _debugOnce = true;

/** Validate placement: adjacent + all touching edges must match (Carcassonne rules) */
function canPlaceTile(
  gridX: number,
  gridY: number,
  tilePlan: number,
  tileOrientation: number,
  placedTiles: TileRenderData[],
): boolean {
  const absX = gridX + CENTER;
  const absY = CENTER - gridY;

  // Build position lookup (contract coordinates)
  const byPos = new Map<string, TileRenderData>();
  for (const t of placedTiles) byPos.set(`${t.x},${t.y}`, t);

  if (byPos.has(`${absX},${absY}`)) return false; // occupied

  // Find cardinal neighbors (y+1=North in contract coords)
  const north = byPos.get(`${absX},${absY + 1}`);
  const east = byPos.get(`${absX + 1},${absY}`);
  const south = byPos.get(`${absX},${absY - 1}`);
  const west = byPos.get(`${absX - 1},${absY}`);

  if (!north && !east && !south && !west) return false; // must be adjacent

  // Candidate tile's layout with orientation applied
  const plan = Plan.from(tilePlan);
  const layout = Layout.from(plan, Orientation.from(tileOrientation).value);

  // Get neighbor layout directly (avoids Tile constructor which can throw on bad player_id)
  const neighborLayout = (t: TileRenderData) =>
    Layout.from(Plan.from(t.plan), Orientation.from(t.orientation).value);

  if (_debugOnce) {
    _debugOnce = false;
    const dirs = { north, east, south, west };
    const found = Object.entries(dirs).filter(([, v]) => v);
    console.log("[canPlaceTile debug]", {
      grid: { gridX, gridY }, contract: { absX, absY },
      tilePlan, tileOrientation, tilesCount: placedTiles.length,
      neighbors: found.map(([dir, t]) => ({ dir, plan: t!.plan, orientation: t!.orientation })),
      candidateEdges: { N: layout.north.value, E: layout.east.value, S: layout.south.value, W: layout.west.value },
    });
  }

  // Check edge compatibility with each neighbor
  if (north && !layout.isCompatible(neighborLayout(north), new Direction(DirectionType.North))) return false;
  if (east && !layout.isCompatible(neighborLayout(east), new Direction(DirectionType.East))) return false;
  if (south && !layout.isCompatible(neighborLayout(south), new Direction(DirectionType.South))) return false;
  if (west && !layout.isCompatible(neighborLayout(west), new Direction(DirectionType.West))) return false;

  return true;
}

/** Convert Torii tile rows to TileRenderData (only placed tiles with orientation != 0) */
function toRenderTiles(rows: any[]): TileRenderData[] {
  return rows
    .filter((t: any) => Number(t.orientation) !== 0)
    .map((t: any) => ({
      game_id: Number(t.game_id),
      id: Number(t.id),
      player_id: t.player_id ?? "0",
      plan: Number(t.plan),
      orientation: Number(t.orientation),
      x: Number(t.x),
      y: Number(t.y),
      occupied_spot: Number(t.occupied_spot),
      worldX: Number(t.x) - CENTER,
      worldZ: CENTER - Number(t.y),
    }));
}

export function GamePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const gameParams = parseGameParams(searchParams);
  const modeType = gameParams.mode as ModeType;
  const contractName = modeToContractName(gameParams.mode);

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
  const selectedTile = useGameStore((s) => s.selectedTile);

  const [hoverGrid, setHoverGrid] = useState<{ x: number; y: number } | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [builderState, setBuilderState] = useState<BuilderState | null>(null);
  const [toriiTiles, setToriiTiles] = useState<TileRenderData[]>([]);
  const [optimisticTiles, setOptimisticTiles] = useState<TileRenderData[]>([]);
  const [characters, setCharacters] = useState<CharacterRenderData[]>([]);
  const [optimisticCharacters, setOptimisticCharacters] = useState<CharacterRenderData[]>([]);
  const [spawning, setSpawning] = useState(false);
  const spawnAttempted = useRef(false);
  const tileRowsRef = useRef<any[]>([]); // raw Torii tile rows (includes unplaced tiles)
  const inFlightTileRef = useRef<number | null>(null); // tile id being built (guards poll)

  // Merge Torii tiles with optimistic tiles (optimistic removed once Torii catches up)
  const tiles = useMemo(() => {
    const toriiIds = new Set(toriiTiles.map(t => t.id));
    const pending = optimisticTiles.filter(t => !toriiIds.has(t.id));
    return [...toriiTiles, ...pending];
  }, [toriiTiles, optimisticTiles]);

  // Merge Torii characters with optimistic characters
  const mergedCharacters = useMemo(() => {
    const toriiKeys = new Set(characters.map(c => `${c.gameId}-${c.playerId}-${c.index}`));
    const pending = optimisticCharacters.filter(c => !toriiKeys.has(`${c.gameId}-${c.playerId}-${c.index}`));
    return [...characters, ...pending];
  }, [characters, optimisticCharacters]);

  // Load a specific game by ID, or auto-spawn a new game on mount
  useEffect(() => {
    if (!account || !client || !provider || spawnAttempted.current) return;
    spawnAttempted.current = true;

    const loadGameById = async (targetGameId: number) => {
      const url = client.config.toriiUrl;
      try {
        const games = await toriiQuery(url,
          `SELECT id, over, built, discarded, tile_count, score FROM [paved-Game] WHERE id = ${targetGameId}`
        );
        if (games.length > 0) {
          setGameState({
            id: Number(games[0].id),
            over: Boolean(games[0].over),
            built: Number(games[0].built),
            discarded: Number(games[0].discarded),
            tile_count: Number(games[0].tile_count),
            score: Number(games[0].score),
          });
          const tileRows = await toriiQuery(url,
            `SELECT * FROM [paved-Tile] WHERE game_id = ${targetGameId}`
          );
          setToriiTiles(toRenderTiles(tileRows));

          // Only load builder state if not readonly
          if (!gameParams.readonly) {
            const builders = await toriiQuery(url,
              `SELECT game_id, tile_id, characters FROM [paved-Builder] WHERE player_id = '${padAddress(account.address)}' AND game_id = ${targetGameId}`
            );
            if (builders.length > 0) {
              const tileId = Number(builders[0].tile_id);
              const currentTile = tileRows.find((t: any) => Number(t.id) === tileId);
              setBuilderState({
                tile_id: tileId,
                tile_plan: currentTile ? Number(currentTile.plan) : 0,
                characters: Number(builders[0].characters),
              });
            }
          }
        }
      } catch {
        // Torii not available yet
      }
    };

    const checkAndSpawn = async () => {
      // If a specific game ID was provided, load it directly
      if (gameParams.gameId !== null) {
        await loadGameById(gameParams.gameId);
        return;
      }

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
            setToriiTiles(toRenderTiles(tileRows));
            return;
          }
        }
      } catch {
        // Torii not available yet
      }

      // No active game found, spawn one
      setSpawning(true);
      try {
        const contractTag = `paved-${contractName}`;
        const contractAddr = client.config.manifest?.contracts?.find((c: any) => c.tag === contractTag)?.address;
        console.log(`Spawning ${contractName} game. ${contractName} contract:`, contractAddr);
        const result = await provider.execute(
          account as any,
          [
            {
              contractName: "Token",
              entrypoint: "approve",
              calldata: [contractAddr, `0x${(1e18).toString(16)}`],
            },
            { contractName, entrypoint: "spawn", calldata: [] },
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
  }, [account, client, provider, spawn, gameParams.gameId, gameParams.readonly, contractName]);

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

        // Store raw rows so handleConfirm can look up the next tile
        tileRowsRef.current = tileRows;

        // Only update builderState if no in-flight tx would be overwritten
        if (shouldPollUpdateBuilder(inFlightTileRef.current, tileId)) {
          const currentTile = tileRows.find((t: any) => Number(t.id) === tileId);
          setBuilderState({
            tile_id: tileId,
            tile_plan: currentTile ? Number(currentTile.plan) : 0,
            characters: Number(builders[0].characters),
          });
        }

        // Convert placed tiles to render data
        setToriiTiles(toRenderTiles(tileRows));

        // Query characters for rendering
        const charRows = await toriiQuery(url, buildCharQuery(gameId));
        if (!cancelled) {
          const tileMap = new Map<number, { worldX: number; worldZ: number }>();
          for (const t of toRenderTiles(tileRows)) {
            tileMap.set(t.id, { worldX: t.worldX, worldZ: t.worldZ });
          }
          setCharacters(toRenderCharacters(charRows, tileMap));
        }

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

  const handleTileClick = useCallback((gridX: number, gridY: number) => {
    const store = useGameStore.getState();
    store.setX(gridX + CENTER);
    store.setY(CENTER - gridY);
    store.setSelectedTile({ col: gridX, row: gridY });
    store.setSpot(0);
  }, []);

  const handleTileHover = useCallback((gridX: number, gridY: number) => {
    setHoverGrid({ x: gridX, y: gridY });
  }, []);

  const handleHoverLeave = useCallback(() => {
    setHoverGrid(null);
  }, []);

  // Compute all valid placement positions for the current tile + orientation
  const availableSlots = useMemo(() => {
    if (!builderState || builderState.tile_plan === 0 || tiles.length === 0) return [];

    // Collect all unoccupied positions adjacent to a placed tile
    const occupied = new Set<string>();
    const candidates = new Set<string>();
    for (const t of tiles) {
      occupied.add(`${t.worldX},${t.worldZ}`);
    }
    for (const t of tiles) {
      const gx = t.worldX;
      const gy = t.worldZ;
      for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]] as const) {
        const key = `${gx + dx},${gy + dy}`;
        if (!occupied.has(key)) candidates.add(key);
      }
    }

    // Check which candidates are valid placements
    const slots: Array<{ x: number; y: number }> = [];
    try {
      for (const key of candidates) {
        const [sx, sy] = key.split(",").map(Number);
        if (canPlaceTile(sx, sy, builderState.tile_plan, orientation, tiles)) {
          slots.push({ x: sx, y: sy });
        }
      }
    } catch {
      // Validation error — return empty
    }
    return slots;
  }, [builderState, orientation, tiles]);

  const hoverState = useMemo(() => {
    if (!builderState || builderState.tile_plan === 0) return null;
    // If a tile position is locked (clicked), use it; otherwise follow the mouse
    const grid = selectedTile ? { x: selectedTile.col, y: selectedTile.row } : hoverGrid;
    if (!grid) return null;
    // Only show ghost tile at positions where placement is actually possible
    const isSlot = availableSlots.some(s => s.x === grid.x && s.y === grid.y);
    if (!isSlot) return null;
    try {
      const valid = canPlaceTile(grid.x, grid.y, builderState.tile_plan, orientation, tiles);
      return { x: grid.x, y: grid.y, valid, idle: true, planIndex: builderState.tile_plan, orientation };
    } catch (e) {
      console.error("canPlaceTile error:", e);
      return null;
    }
  }, [hoverGrid, selectedTile, builderState, orientation, tiles, availableSlots]);

  const showSpotSelector = shouldShowSpotSelector(character, selectedTile, hoverState?.valid ?? false);

  const handleRotate = useCallback(() => {
    setOrientation(orientation + 1);
    useGameStore.getState().setSpot(0); // spot positions change with rotation
  }, [orientation, setOrientation]);

  const handleConfirm = useCallback(async () => {
    if (!gameState || !builderState) return;

    // Optimistically place tile on the board immediately (pending = loading state)
    const optimistic: TileRenderData = {
      game_id: gameState.id,
      id: builderState.tile_id,
      player_id: account?.address ?? "0",
      plan: builderState.tile_plan,
      orientation,
      x,
      y,
      occupied_spot: spot,
      worldX: x - CENTER,
      worldZ: CENTER - y,
      pending: true,
    };
    setOptimisticTiles(prev => [...prev, optimistic]);

    // Optimistic character placement
    if (character > 0 && spot > 0) {
      const spotType = spot > 0 ? Spot.from(spot).value : SpotType.None;
      const offset = getSpotOffset(spotType);
      const charWorldX = optimistic.worldX + offset.dx;
      const charWorldZ = optimistic.worldZ + offset.dz;

      const optimisticChar: CharacterRenderData = {
        gameId: gameState.id,
        playerId: account?.address ?? "0",
        index: character,
        tileId: builderState.tile_id,
        spot,
        weight: 1,
        power: 1,
        color: getColorFromCharacter(character),
        name: getRole(getIndexFromCharacter(character)),
        worldX: charWorldX,
        worldZ: charWorldZ,
      };
      setOptimisticCharacters(prev => [...prev, optimisticChar]);
    }

    useGameStore.getState().setSelectedTile(null);
    useGameStore.getState().setCharacter(0);
    useGameStore.getState().setSpot(0);
    // Keep hoverGrid so the ghost stays visible with the next tile

    // Mark in-flight so the poll doesn't overwrite our optimistic builderState
    inFlightTileRef.current = builderState.tile_id;

    // Optimistically switch to the next tile in the deck
    const next = findNextTile(tileRowsRef.current, builderState.tile_id);
    if (next) {
      setBuilderState({
        tile_id: next.tile_id,
        tile_plan: next.tile_plan,
        characters: builderState.characters,
      });
      setOrientation(1); // reset rotation for new tile
    }

    const result = await build({
      mode: modeType,
      gameId: gameState.id,
      tileId: builderState.tile_id,
      orientation,
      x,
      y,
      role: character,
      spot,
    });
    console.log("Build result:", result);

    // Tx resolved — clear in-flight guard so poll can update normally
    inFlightTileRef.current = null;

    // If tx failed, remove the optimistic tile and revert builderState
    if (!result) {
      setOptimisticTiles(prev => prev.filter(t => t.id !== builderState.tile_id));
    }
  }, [build, gameState, builderState, orientation, x, y, character, spot, account]);

  const handleDiscard = useCallback(async () => {
    if (!gameState) return;
    const result = await discard(modeType, gameState.id);
    console.log("Discard result:", result);
  }, [discard, gameState]);

  // Stable refs for keyboard hotkeys — avoids re-registering listener on every state change
  const hotkeys = useRef({ handleRotate, handleConfirm, handleDiscard, loading, builderState, gameState, hoverState, character, selectedTile });
  useEffect(() => {
    hotkeys.current = { handleRotate, handleConfirm, handleDiscard, loading, builderState, gameState, hoverState, character, selectedTile };
  });

  // Keyboard hotkeys: R=rotate, C=confirm, D=discard
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const h = hotkeys.current;
      switch (e.key.toLowerCase()) {
        case "r":
          h.handleRotate();
          break;
        case "c":
          if (!h.loading && h.builderState && h.hoverState?.valid) h.handleConfirm();
          break;
        case "d":
          if (!h.loading && h.gameState) h.handleDiscard();
          break;
        default: {
          const spotNum = spotKeyToNumber(e.key);
          if (spotNum !== null && h.character > 0 && h.selectedTile && h.hoverState?.valid) {
            useGameStore.getState().setSpot(spotNum);
          }
          break;
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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
        characters={mergedCharacters}
        hover={gameParams.readonly ? null : hoverState}
        availableSlots={gameParams.readonly ? [] : availableSlots}
        strategyMode={strategyMode}
        onReady={handleReady}
        onTileClick={gameParams.readonly ? undefined : handleTileClick}
        onTileHover={gameParams.readonly ? undefined : handleTileHover}
        onHoverLeave={gameParams.readonly ? undefined : handleHoverLeave}
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

        {!gameParams.readonly && (
          <div style={{ pointerEvents: "auto", gridColumn: 3, gridRow: "1 / -1", alignSelf: "center" }}>
            <CharacterMenu
              packedCharacters={builderState?.characters ?? 0}
              selectedCharacter={character}
              onSelectCharacter={(c) => useGameStore.getState().setCharacter(c)}
            />
          </div>
        )}

        {!gameParams.readonly && showSpotSelector && builderState && (
          <div style={{ pointerEvents: "auto", gridColumn: 1, gridRow: 2, alignSelf: "center" }}>
            <SpotSelector
              tilePlan={builderState.tile_plan}
              orientation={orientation}
              roleIndex={getIndexFromCharacter(character)}
              selectedSpot={spot}
              onSelectSpot={(s) => useGameStore.getState().setSpot(s)}
              visible={true}
            />
          </div>
        )}

        {!gameParams.readonly && (
          <div style={{ pointerEvents: "auto", gridColumn: 3, gridRow: 3, display: "flex", gap: 8, alignItems: "center" }}>
            <HandPanel
              onRotate={handleRotate}
              onConfirm={handleConfirm}
              confirmDisabled={loading || !builderState || !hoverState?.valid || (character > 0 && spot === 0)}
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
        )}
      </div>

      <GameCompleteDialog
        score={gameState?.score ?? 0}
        visible={gameState?.over === true}
        onClose={() => navigate("/")}
      />
    </div>
  );
}
