import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { GameCanvas } from "@paved/renderer/react";
import { IngameStatus, GameCompleteDialog, ActionBar, useGameStore } from "@paved/ui";
import type { GameScene, TileRenderData, CameraMode } from "@paved/renderer";
import { PoolPriceMovedError, PoolQuoteBelowFloorError, PurchaseOutcomeUnknownError, PurchasePriceChangedError, nftOf, useGameSession, usePaved } from "@paved/chain";
import type { GameKey, PlaceMove } from "@paved/chain";
import { Layout, Plan, Orientation, Direction, DirectionType } from "@paved/game-core";
import { ClosedStructures } from "../components/ClosedStructures";
import { GameNft, useCollection } from "../components/GameNft";
import { CENTER, toRenderBoard } from "../utils/game-helpers";
import { getCameraHotkeyAction, toggleCameraMode } from "../utils/camera-helpers";
import { parseGameParams } from "../utils/game-params";
import { buildGameRoute, isTrainingParam } from "../utils/mode-routing";
import type { MoveSenders, PageSession, PageState } from "../training/page-session";
import { useTrainingSession } from "../training/use-training";
import { readStartIntent, startGame } from "../utils/start-game";
import { useEconomy } from "../utils/economy-context";
import { readPurchaseIntent, spawnForIntent, type ReadPurchase } from "../utils/economy-start";
import { REFERRAL_PARAM } from "../utils/economy-view";

/** How long a start consent waits for a ready writer before it is dropped. */
const START_CONSENT_MS = 30_000;

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

const screenStyle = {
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "column" as const,
  gap: 16,
  alignItems: "center",
  justifyContent: "center",
  background: "#0a0a0a",
};
const screenText = { color: "#f59e0b", fontFamily: "RubikMonoOne", fontSize: 24 };

/** The purchase screen, with the referral link's `?ref=` when the purchase had a referrer (read by `referrerFromSearch`). */
function purchaseRoute(referrer: string | null): string {
  return referrer ? `/economy?${new URLSearchParams({ [REFERRAL_PARAM]: referrer })}` : "/economy";
}

function Screen({ text, onBack, backDisabled, action }: { text: string; onBack?: () => void; backDisabled?: boolean; action?: { label: string; onClick: () => void } }) {
  return (
    <div style={screenStyle}>
      <span style={screenText}>{text}</span>
      {action && (
        <button type="button" onClick={action.onClick} style={{ background: "#f59e0b", border: "none", color: "#0a0a0a", padding: "8px 16px", borderRadius: 8, cursor: "pointer" }}>
          {action.label}
        </button>
      )}
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          disabled={backDisabled}
          style={{ background: "transparent", border: "1px solid #555", color: "#999", padding: "8px 16px", borderRadius: 8, cursor: backDisabled ? "default" : "pointer", opacity: backDisabled ? 0.5 : 1 }}
        >
          Back
        </button>
      )}
    </div>
  );
}

/**
 * `/game?mode=..&id=..` shows that game. A game is started only from the landing page's confirm,
 * which carries the player's consent in the history state (a link cannot set it): the page resumes
 * the player's active game of the mode (from its events) or spawns one, then replaces the URL with
 * the game's id. The consent is cleared at mount, ready writer or not, and kept in a ref until the
 * start uses it, so a reload, Back or a refused spawn never pays again and the page still knows
 * that a start is wanted. While a start is in flight the page says so and Back is disabled. A
 * malformed id is "Game not found"; no id and no consent spawns nothing.
 */
export function GamePage() {
  const [searchParams] = useSearchParams();
  // Training is a mode of this route; it never reads the chain providers.
  return isTrainingParam(searchParams.get("mode")) ? <TrainingBoard /> : <ChainGamePage />;
}

function ChainGamePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const gameParams = parseGameParams(searchParams);
  const { status, client, writer, address } = usePaved();
  const economy = useEconomy();
  const [spawnError, setSpawnError] = useState<string | null>(null);
  // A purchase sent whose receipt named no game: not a failure, and no invitation to buy again.
  const [unknownOutcome, setUnknownOutcome] = useState<string | null>(null);
  // A purchase refused before sending because what the player confirmed changed (price, pool, sanity floor): confirm again.
  // Carries the purchase's referrer, so that the retry keeps the referral (review t-0115, 1).
  const [confirmAgain, setConfirmAgain] = useState<{ referrer: string | null } | null>(null);
  // A consent was found at mount and is waiting for a writer, or its start is in flight.
  const [wantsStart, setWantsStart] = useState(false);
  const [starting, setStarting] = useState(false);
  const [expired, setExpired] = useState(false);
  // False once the page is gone (the browser's Back during an in-flight start): no navigation then.
  const alive = useRef(true);
  const intentRef = useRef<{ confirmedAmount: bigint | undefined; purchase?: ReadPurchase } | null>(null);
  const consumed = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (consumed.current || gameParams.gameId !== null) return;
    // A paid Daily (P8) carries its purchase; any other consent is the plain start's.
    const purchase = gameParams.mode === "daily" ? readPurchaseIntent(location.state) : null;
    const found = purchase ? { confirmedAmount: purchase.confirmedPrice, purchase } : readStartIntent(location.state, gameParams.mode);
    if (!found) return;
    intentRef.current = found;
    setWantsStart(true);
    // The state is cleared before anything can be sent, whether or not the writer is ready.
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
    // Mount only: the cleared state must not be read again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A consent that finds no ready writer within START_CONSENT_MS is dropped: the player confirms again.
  useEffect(() => {
    if (!wantsStart) return;
    const timer = setTimeout(() => {
      if (consumed.current) return;
      intentRef.current = null;
      setWantsStart(false);
      setExpired(true);
    }, START_CONSENT_MS);
    return () => clearTimeout(timer);
  }, [wantsStart]);

  useEffect(() => {
    const intent = intentRef.current;
    if (!intent || consumed.current || !client || !writer || !address) return;
    // A purchase waits for the economy's writer (and expires like any consent without one).
    if (intent.purchase && !economy.writer) return;
    consumed.current = true;
    intentRef.current = null;
    setStarting(true);
    startGame(intent, {
      listGames: () => client.events.playerGames(address, [gameParams.mode]),
      spawn: () => spawnForIntent(intent.purchase, economy.writer, () => writer.spawn(gameParams.mode)),
      clearIntent: () => {}, // already cleared at mount
      open: (gameId) => alive.current && navigate(buildGameRoute({ gameId, mode: gameParams.mode }), { replace: true }),
    }).catch((error) => {
      // Before any WriteError test: PurchaseOutcomeUnknownError extends WriteError, and must keep its no-retry screen.
      if (error instanceof PurchaseOutcomeUnknownError) setUnknownOutcome(error.message);
      else setSpawnError(error instanceof Error ? error.message : String(error));
      const retry = error instanceof PoolPriceMovedError || error instanceof PoolQuoteBelowFloorError || error instanceof PurchasePriceChangedError;
      setConfirmAgain(retry && intent.purchase ? { referrer: intent.purchase.referrer } : null);
      setStarting(false);
    });
  }, [wantsStart, client, writer, address, gameParams.mode, navigate, economy.writer]);

  const key = useMemo<GameKey | null>(
    () => (gameParams.gameId === null ? null : { mode: gameParams.mode, gameId: gameParams.gameId }),
    [gameParams.mode, gameParams.gameId],
  );

  if (gameParams.invalidId) return <Screen text={`Game not found: ${searchParams.get("id")}`} onBack={() => navigate("/")} />;
  if (status === "not-configured") return <Screen text="Not connected" onBack={() => navigate("/")} />;
  if (!key) {
    // The error of a refused or failed start stays on screen after the consent is cleared.
    if (unknownOutcome) return <Screen text={unknownOutcome} onBack={() => navigate("/")} />;
    if (spawnError) {
      // Nothing was sent: the way straight back to the purchase screen, where the player sees the new figures.
      const action = confirmAgain ? { label: "Back to purchase", onClick: () => navigate(purchaseRoute(confirmAgain.referrer)) } : undefined;
      return <Screen text={`Cannot start a game: ${spawnError}`} onBack={() => navigate("/")} action={action} />;
    }
    // A paid start in flight: the consent is already cleared, so say what is happening, not "No game selected".
    if (starting) return <Screen text="Spawning game..." onBack={() => navigate("/")} backDisabled />;
    if (expired) return <Screen text="Not connected: confirm again on the landing page" onBack={() => navigate("/")} />;
    // Only the landing page's confirm starts a game: a link, a reload or Back never pays an entry.
    const consent = wantsStart || readStartIntent(location.state, gameParams.mode) !== null || readPurchaseIntent(location.state) !== null;
    if (!consent) return <Screen text="No game selected" onBack={() => navigate("/")} />;
    if (status !== "ready") return <Screen text="Not connected: no playing account" onBack={() => navigate("/")} />;
    return <Screen text="Spawning game..." onBack={() => navigate("/")} backDisabled />;
  }
  return <GameBoard gameKey={key} forceReadonly={gameParams.readonly} />;
}

function GameBoard({ gameKey, forceReadonly }: { gameKey: GameKey; forceReadonly: boolean }) {
  const { writer } = usePaved();
  const { session, state } = useGameSession(gameKey);
  const collection = useCollection();
  // The game's NFT by the Collection's rule (Daily: the game id; Tutorial: 2^32 + the game id); null for an id no game has.
  const tokenId = useMemo(() => {
    try {
      return nftOf(gameKey.mode, gameKey.gameId);
    } catch {
      return null;
    }
  }, [gameKey.mode, gameKey.gameId]);
  const senders = useMemo<MoveSenders | null>(
    () =>
      writer && {
        build: (move) => writer.build(gameKey, move),
        discard: () => writer.discard(gameKey),
        surrender: () => writer.surrender(gameKey),
      },
    [writer, gameKey],
  );
  return (
    <GameBoardView
      session={session}
      state={state}
      senders={senders}
      forceReadonly={forceReadonly}
      gameLabel={`${gameKey.mode} game ${gameKey.gameId}`}
      extras={<GameNft tokenId={tokenId} collection={collection} verify />}
    />
  );
}

/** A Training game: the off-chain engine behind the same page. No wallet, writer, account or indexer is read. */
function TrainingBoard() {
  const { session, state, newGame } = useTrainingSession();
  return <GameBoardView session={session} state={state} senders={NO_CHAIN} forceReadonly={false} gameLabel="training game" onNewGame={newGame} />;
}

/** The senders a Training game gets: `LocalSession` never calls them, and none could reach a chain. */
const NO_CHAIN: MoveSenders = {
  build: () => Promise.reject(new Error("Training sends nothing on chain")),
  discard: () => Promise.reject(new Error("Training sends nothing on chain")),
  surrender: () => Promise.reject(new Error("Training sends nothing on chain")),
};

interface GameBoardViewProps {
  /** The session driving the game: `GameSession` on chain, `LocalSession` in Training. */
  session: PageSession | null;
  state: PageState | null;
  /** The chain writes of the game; null when there is no writer (read only). */
  senders: MoveSenders | null;
  forceReadonly: boolean;
  /** Names the game in the "Game not found" screen. */
  gameLabel: string;
  /** Shown under the points (the game's NFT on chain). */
  extras?: ReactNode;
  /** Set in Training: a finished game offers a new game instead of the chain's "Continue". */
  onNewGame?: () => void;
}

function TrainingComplete({ score, onNewGame, onBack }: { score: number; onNewGame: () => void; onBack: () => void }) {
  return (
    <div
      role="dialog"
      aria-label="Game complete"
      style={{ position: "absolute", inset: 0, zIndex: 30, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)" }}
    >
      <div style={{ background: "#171717", border: "1px solid #555", borderRadius: 12, padding: 24, display: "flex", flexDirection: "column", gap: 16, maxWidth: 360, color: "#f5f5f5", alignItems: "center" }}>
        <span style={{ fontFamily: "RubikMonoOne" }}>Training complete</span>
        <span>Final score</span>
        <span data-testid="final-score" style={{ color: "#f59e0b", fontFamily: "RubikMonoOne", fontSize: 32 }}>{score.toLocaleString()}</span>
        <div style={{ display: "flex", gap: 12 }}>
          <button type="button" onClick={onNewGame} style={{ background: "#f59e0b", border: "none", color: "#0a0a0a", padding: "10px 16px", borderRadius: 8, cursor: "pointer" }}>
            New game
          </button>
          <button type="button" onClick={onBack} style={{ background: "transparent", border: "1px solid #555", color: "#999", padding: "10px 16px", borderRadius: 8, cursor: "pointer" }}>
            Back
          </button>
        </div>
      </div>
    </div>
  );
}

function GameBoardView({ session, state, senders, forceReadonly, gameLabel, extras, onNewGame }: GameBoardViewProps) {
  const navigate = useNavigate();
  const [scene, setScene] = useState<GameScene | null>(null);
  const orientation = useGameStore((s) => s.orientation);
  const setOrientation = useGameStore((s) => s.setOrientation);
  const strategyMode = useGameStore((s) => s.strategyMode);
  const x = useGameStore((s) => s.x);
  const y = useGameStore((s) => s.y);
  const selectedTile = useGameStore((s) => s.selectedTile);
  const [hoverGrid, setHoverGrid] = useState<{ x: number; y: number } | null>(null);
  const [cameraMode, setCameraMode] = useState<CameraMode>("play");

  const readonly = forceReadonly || !senders || (state?.readonly ?? true);
  const loading = state?.pending ?? false;
  const hand = state?.hand ?? null;
  const game = state?.game ?? null;

  const tiles = useMemo(
    () => (state ? toRenderBoard(state, game?.playerId ?? "0x0") : ([] as TileRenderData[])),
    [state, game?.playerId],
  );

  // The structures the last move closed (its receipt's `Scored` events), until the next write.
  const closures = state?.lastScored ?? null;

  const handleReady = useCallback((s: GameScene) => {
    setScene(s);
  }, []);

  const handleTileClick = useCallback((gridX: number, gridY: number) => {
    const store = useGameStore.getState();
    store.setX(gridX + CENTER);
    store.setY(CENTER - gridY);
    store.setSelectedTile({ col: gridX, row: gridY });
  }, []);

  const handleTileHover = useCallback((gridX: number, gridY: number) => {
    setHoverGrid({ x: gridX, y: gridY });
  }, []);

  const handleHoverLeave = useCallback(() => {
    setHoverGrid(null);
  }, []);

  const handleToggleCameraMode = useCallback(() => {
    setCameraMode((prev) => toggleCameraMode(prev));
  }, []);

  const handleRecenter = useCallback(() => {
    scene?.focusBoard();
  }, [scene]);

  // Compute all valid placement positions for the current tile + orientation
  const availableSlots = useMemo(() => {
    if (!hand || tiles.length === 0) return [];

    const occupied = new Set<string>();
    const candidates = new Set<string>();
    for (const t of tiles) {
      occupied.add(`${t.worldX},${t.worldZ}`);
    }
    for (const t of tiles) {
      for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]] as const) {
        const key = `${t.worldX + dx},${t.worldZ + dy}`;
        if (!occupied.has(key)) candidates.add(key);
      }
    }

    const slots: Array<{ x: number; y: number }> = [];
    try {
      for (const key of candidates) {
        const [sx, sy] = key.split(",").map(Number);
        if (canPlaceTile(sx, sy, hand.plan, orientation, tiles)) {
          slots.push({ x: sx, y: sy });
        }
      }
    } catch {
      // Validation error — return empty
    }
    return slots;
  }, [hand, orientation, tiles]);

  const hoverState = useMemo(() => {
    if (!hand) return null;
    // If a tile position is locked (clicked), use it; otherwise follow the mouse
    const grid = selectedTile ? { x: selectedTile.col, y: selectedTile.row } : hoverGrid;
    if (!grid) return null;
    // Only show ghost tile at positions where placement is actually possible
    const isSlot = availableSlots.some((s) => s.x === grid.x && s.y === grid.y);
    if (!isSlot) return null;
    try {
      const valid = canPlaceTile(grid.x, grid.y, hand.plan, orientation, tiles);
      return { x: grid.x, y: grid.y, valid, idle: true, planIndex: hand.plan, orientation };
    } catch (e) {
      console.error("canPlaceTile error:", e);
      return null;
    }
  }, [hoverGrid, selectedTile, hand, orientation, tiles, availableSlots]);

  const handleRotate = useCallback(() => {
    setOrientation(orientation + 1);
  }, [orientation, setOrientation]);

  // The tile is drawn at once (pending); the receipt's events confirm it; one read reconciles.
  const handleConfirm = useCallback(async () => {
    if (!session || !senders || readonly) return;
    const move: PlaceMove = { orientation, x, y };
    useGameStore.getState().setSelectedTile(null);
    // Keep hoverGrid so the ghost stays visible with the next tile
    const placed = await session.place(move, () => senders.build(move));
    if (placed) setOrientation(1); // reset rotation for the new tile
  }, [session, senders, readonly, orientation, x, y, setOrientation]);

  const handleDiscard = useCallback(async () => {
    if (!session || !senders || readonly) return;
    await session.discard(() => senders.discard());
  }, [session, senders, readonly]);

  const [confirmingSurrender, setConfirmingSurrender] = useState(false);
  // Surrender ends the game with its score so far; it asks first and is serialised by the writer.
  const handleSurrender = useCallback(async () => {
    setConfirmingSurrender(false);
    if (!session || !senders || readonly) return;
    await session.surrender(() => senders.surrender());
  }, [session, senders, readonly]);
  const canSurrender = !readonly && !loading && game !== null && !game.over;

  // Stable refs for keyboard hotkeys — avoids re-registering listener on every state change
  const hotkeys = useRef({
    handleRotate,
    handleConfirm,
    handleDiscard,
    handleToggleCameraMode,
    handleRecenter,
    loading,
    hand,
    game,
    hoverState,
  });
  useEffect(() => {
    hotkeys.current = {
      handleRotate,
      handleConfirm,
      handleDiscard,
      handleToggleCameraMode,
      handleRecenter,
      loading,
      hand,
      game,
      hoverState,
    };
  });

  // Keyboard hotkeys: R=rotate, C=confirm, D=discard
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const h = hotkeys.current;
      const cameraAction = getCameraHotkeyAction(e.key);
      if (cameraAction === "toggle-mode") {
        h.handleToggleCameraMode();
        return;
      }
      if (cameraAction === "recenter") {
        h.handleRecenter();
        return;
      }
      switch (e.key.toLowerCase()) {
        case "r":
          h.handleRotate();
          break;
        case "c":
          if (!h.loading && h.hand && h.hoverState?.valid) h.handleConfirm();
          break;
        case "d":
          // The button's own condition: nothing to discard on a finished game or with an empty hand.
          if (!h.loading && h.hand) h.handleDiscard();
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (!state || state.status === "loading") return <Screen text="Loading game..." />;
  if (state.status === "error") {
    const text =
      state.error === "game-not-found" ? `Game not found: ${gameLabel}` : `Cannot read the game: ${state.message}`;
    return <Screen text={text} onBack={() => navigate("/")} />;
  }

  const notice = state.writeError
    ? { text: state.writeError, background: "rgba(127,29,29,0.9)" }
    : state.readError
      ? { text: `Move applied; refresh failed: ${state.readError}`, background: "rgba(120,53,15,0.9)" }
    : !forceReadonly && state.readonly
      ? { text: senders ? "Not your game: read only" : "Not connected: read only", background: "rgba(120,53,15,0.9)" }
      : null;

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      {notice && (
        <div
          role="alert"
          style={{
            position: "absolute",
            top: 12,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 20,
            background: notice.background,
            color: "#fee2e2",
            borderRadius: 8,
            padding: "8px 12px",
            fontSize: 12,
            maxWidth: 520,
          }}
        >
          {notice.text}
        </div>
      )}
      <GameCanvas
        basePath=""
        tiles={tiles}
        hover={readonly ? null : hoverState}
        availableSlots={readonly ? [] : availableSlots}
        strategyMode={strategyMode}
        cameraMode={cameraMode}
        onReady={handleReady}
        onTileClick={readonly ? undefined : handleTileClick}
        onTileHover={readonly ? undefined : handleTileHover}
        onHoverLeave={readonly ? undefined : handleHoverLeave}
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
        <div style={{ pointerEvents: "auto", gridColumn: 1, gridRow: 1, display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
          <IngameStatus
            score={game?.score ?? 0}
            built={Math.max(0, (game?.placedCount ?? 1) - 1)}
            totalTiles={game?.deckSize ?? 0}
            discarded={game?.discardedCount ?? 0}
          />
          <ClosedStructures closures={closures} />
          {extras}
        </div>

        <div style={{ pointerEvents: "auto", gridColumn: 3, gridRow: 1, justifySelf: "end" }}>
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              background: "rgba(0,0,0,0.75)",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: 10,
              padding: 8,
            }}
          >
            <button
              type="button"
              onClick={handleToggleCameraMode}
              style={{
                border: "1px solid rgba(255,255,255,0.25)",
                background: "rgba(255,255,255,0.08)",
                color: "#fff",
                borderRadius: 8,
                padding: "6px 10px",
                cursor: "pointer",
              }}
            >
              Mode: {cameraMode === "play" ? "Play" : "Showcase"} (V)
            </button>
            <button
              type="button"
              onClick={handleRecenter}
              style={{
                border: "1px solid rgba(255,255,255,0.25)",
                background: "rgba(255,255,255,0.08)",
                color: "#fff",
                borderRadius: 8,
                padding: "6px 10px",
                cursor: "pointer",
              }}
            >
              Recenter (F)
            </button>
            {!readonly && (
              <button
                type="button"
                onClick={() => setConfirmingSurrender(true)}
                disabled={!canSurrender}
                style={{
                  border: "1px solid rgba(248,113,113,0.6)",
                  background: "rgba(127,29,29,0.4)",
                  color: "#fecaca",
                  borderRadius: 8,
                  padding: "6px 10px",
                  cursor: canSurrender ? "pointer" : "default",
                  opacity: canSurrender ? 1 : 0.5,
                }}
              >
                {loading ? "Working..." : "Surrender"}
              </button>
            )}
          </div>
        </div>

        {!readonly && (
          <div style={{ pointerEvents: "auto", gridColumn: "1 / -1", gridRow: 3, alignSelf: "end" }}>
            <ActionBar
              tilePlan={hand?.plan ?? 0}
              orientation={orientation}
              onRotate={handleRotate}
              onConfirm={handleConfirm}
              onDiscard={handleDiscard}
              confirmDisabled={loading || !hand || !hoverState?.valid}
              discardDisabled={loading || !hand}
            />
          </div>
        )}
      </div>

      {confirmingSurrender && (
        <div
          role="dialog"
          aria-label="Surrender"
          style={{ position: "absolute", inset: 0, zIndex: 30, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)" }}
        >
          <div style={{ background: "#171717", border: "1px solid #555", borderRadius: 12, padding: 24, display: "flex", flexDirection: "column", gap: 16, maxWidth: 360, color: "#f5f5f5" }}>
            <span>Surrender this game? It ends now with your current score of {game?.score ?? 0}. This cannot be undone.</span>
            <div style={{ display: "flex", gap: 12 }}>
              <button type="button" onClick={handleSurrender} disabled={!canSurrender} style={{ flex: 1, background: "#b91c1c", border: "none", color: "#fff", padding: "10px 16px", borderRadius: 8, cursor: "pointer" }}>
                Confirm surrender
              </button>
              <button type="button" onClick={() => setConfirmingSurrender(false)} style={{ background: "transparent", border: "1px solid #555", color: "#999", padding: "10px 16px", borderRadius: 8, cursor: "pointer" }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {onNewGame ? (
        game?.over === true && <TrainingComplete score={game.score} onNewGame={onNewGame} onBack={() => navigate("/")} />
      ) : (
        <GameCompleteDialog score={game?.score ?? 0} visible={game?.over === true} onClose={() => navigate("/")} />
      )}
    </div>
  );
}
