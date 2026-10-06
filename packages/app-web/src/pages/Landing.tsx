import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LandingScreen, ModeDetailDialog, ModeDetailDialogStat, TokenPanel } from "@paved/ui";
import type { GameModeCardProps, GameListItemProps } from "@paved/ui";
import { DAILY_PRICE, usePaved, useRead } from "@paved/chain";
import type { GameMode, GameView, PavedClient, PlayerGame, TournamentView } from "@paved/chain";
import { buildGameRoute } from "../utils/mode-routing";
import { formatTimeRemaining, formatTokenAmount, podium, TOKEN_LABEL } from "../utils/landing-helpers";

interface ModeInfo {
  mode: GameMode;
  title: string;
  tiles: number;
  duration: string;
  price: bigint;
}

/** The two modes the contracts have since P1 (Weekly and configurable games are gone). */
const MODES: ModeInfo[] = [
  { mode: "daily", title: "Daily Challenge", tiles: 38, duration: "24 hours", price: DAILY_PRICE },
  { mode: "tutorial", title: "Tutorial", tiles: 10, duration: "Practice", price: 0n },
];

/** Finished games listed on the landing page, newest first. */
const COMPLETED_SHOWN = 10;

interface ListedGame extends PlayerGame {
  view: GameView;
}

/** The player's games from events, with one `game` view each for the counts (active ones, and the latest finished ones). */
async function listGames(client: PavedClient, address: string): Promise<ListedGame[]> {
  const games = await client.events.playerGames(address);
  const shown = [...games.filter((g) => !g.over), ...games.filter((g) => g.over).slice(0, COMPLETED_SHOWN)];
  return Promise.all(shown.map(async (g) => ({ ...g, view: await client.views.game({ mode: g.mode, gameId: g.gameId }) })));
}

export function LandingPage({ supportsMint = false }: { supportsMint?: boolean }) {
  const navigate = useNavigate();
  const { status, writer, address, deployment } = usePaved();
  const [selected, setSelected] = useState<GameMode | null>(null);
  const [writing, setWriting] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);

  // Reads happen on connect, after this client's writes (refresh), and when the page becomes visible.
  const player = useRead((c) => (address ? c.player(address) : Promise.resolve(null)), [address]);
  const balance = useRead((c) => (address ? c.balance(address) : Promise.resolve(0n)), [address]);
  const games = useRead((c) => (address ? listGames(c, address) : Promise.resolve([])), [address], { onVisible: true });
  const tournament = useRead<TournamentView>(
    async (c) => c.views.tournament(await c.views.currentTournamentId()),
    [],
    { onVisible: true },
  );

  const write = async (fn: () => Promise<unknown>, after: Array<() => void>) => {
    if (writing) return;
    setWriting(true);
    setWriteError(null);
    try {
      await fn();
      after.forEach((refresh) => refresh());
    } catch (error) {
      setWriteError(error instanceof Error ? error.message : String(error));
    } finally {
      setWriting(false);
    }
  };

  const handleCreate = () =>
    writer && write(() => writer.createPlayer("Paved", { mintTestToken: supportsMint }), [player.refresh, balance.refresh]);
  const handleMint = () => writer && write(() => writer.mint(), [balance.refresh]);

  const allGames: ListedGame[] = games.data ?? [];
  const active = allGames.filter((g) => !g.over);
  const completed = allGames.filter((g) => g.over);
  const daily = tournament.data;

  const gameModes: GameModeCardProps[] = MODES.map((m) => ({
    mode: m.mode,
    title: m.title,
    description: `${m.tiles} tiles`,
    tileCount: m.tiles,
    duration: m.duration,
    entryFee: m.price === 0n ? "Free" : `${formatTokenAmount(m.price, deployment.tokenDecimals)} ${TOKEN_LABEL}`,
    prizePool: m.mode === "daily" && daily ? formatTokenAmount(daily.prize, deployment.tokenDecimals) : undefined,
    topPlayers: m.mode === "daily" && daily ? podium(daily) : undefined,
    timeRemaining: m.mode === "daily" && daily ? formatTimeRemaining(daily.endTime) : undefined,
    hasActiveGame: active.some((g) => g.mode === m.mode),
    onPress: () => setSelected(m.mode),
  }));

  const toItem = (readonly: boolean) => (g: ListedGame): GameListItemProps => ({
    gameId: g.gameId,
    mode: g.mode,
    score: g.view.score,
    tilesPlaced: g.view.placedCount,
    totalTiles: g.view.deckSize,
    isOver: g.over,
    onEnter: () => navigate(buildGameRoute({ gameId: g.gameId, mode: g.mode, readonly })),
  });

  const handleConfirm = () => {
    if (!selected) return;
    const resume = active.find((g) => g.mode === selected);
    // Without an id the game page spawns a new game.
    navigate(resume ? buildGameRoute({ gameId: resume.gameId, mode: resume.mode }) : buildGameRoute({ mode: selected }));
    setSelected(null);
  };

  const selectedCard = selected ? gameModes.find((m) => m.mode === selected) : null;

  return (
    <>
      <div style={{ position: "fixed", right: 16, top: 16, zIndex: 30, width: 320 }}>
        <TokenPanel
          networkLabel={deployment.network}
          balanceLabel={`${formatTokenAmount(balance.data ?? 0n, deployment.tokenDecimals)} ${TOKEN_LABEL}`}
          supportsMint={supportsMint && status === "ready"}
          isMinting={writing}
          error={writeError}
          onMint={handleMint}
        />
      </div>
      <LandingScreen
        connected={status === "ready"}
        playerName={player.data?.name}
        onSpawn={handleCreate}
        gameModes={gameModes}
        activeGames={active.map(toItem(false))}
        completedGames={completed.map(toItem(true))}
        isLoading={games.loading || tournament.loading}
        onModeSelect={(mode: string) => setSelected(mode as GameMode)}
      />
      {selected && selectedCard && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(0,0,0,0.7)",
            zIndex: 1000,
          }}
          onClick={() => setSelected(null)}
        >
          <div onClick={(e) => e.stopPropagation()}>
            <ModeDetailDialog>
              <h2 style={{ color: "#f5f5f5", fontFamily: "RubikMonoOne", margin: 0 }}>{selectedCard.title}</h2>
              <ModeDetailDialogStat>
                <span style={{ color: "#999" }}>Tiles</span>
                <span style={{ color: "#f5f5f5" }}>{selectedCard.tileCount}</span>
              </ModeDetailDialogStat>
              <ModeDetailDialogStat>
                <span style={{ color: "#999" }}>Duration</span>
                <span style={{ color: "#f5f5f5" }}>{selectedCard.duration}</span>
              </ModeDetailDialogStat>
              <ModeDetailDialogStat>
                <span style={{ color: "#999" }}>Entry Fee</span>
                <span style={{ color: "#f5f5f5" }}>{selectedCard.entryFee}</span>
              </ModeDetailDialogStat>
              {selectedCard.prizePool && (
                <ModeDetailDialogStat>
                  <span style={{ color: "#999" }}>Prize Pool</span>
                  <span style={{ color: "#f5f5f5" }}>{`${selectedCard.prizePool} ${TOKEN_LABEL}`}</span>
                </ModeDetailDialogStat>
              )}
              {selectedCard.topPlayers && selectedCard.topPlayers.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ color: "#999", fontSize: 12 }}>Top Players</span>
                  {selectedCard.topPlayers.map((p, i) => (
                    <span key={i} style={{ color: "#f5f5f5", fontSize: 12 }}>
                      {i + 1}. {p.name} - {p.score}
                    </span>
                  ))}
                </div>
              )}
              <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                <button
                  onClick={handleConfirm}
                  disabled={status !== "ready"}
                  title={status !== "ready" ? "Not connected" : undefined}
                  style={{
                    flex: 1,
                    background: status === "ready" ? "#f59e0b" : "#555",
                    border: "none",
                    color: "#0a0a0a",
                    padding: "12px 24px",
                    borderRadius: 8,
                    cursor: status === "ready" ? "pointer" : "not-allowed",
                    fontFamily: "RubikMonoOne",
                    fontSize: 14,
                  }}
                >
                  {status !== "ready" ? "Not connected" : selectedCard.hasActiveGame ? "Resume Game" : "Start Game"}
                </button>
                <button
                  onClick={() => setSelected(null)}
                  style={{
                    background: "transparent",
                    border: "1px solid #555",
                    color: "#999",
                    padding: "12px 24px",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontFamily: "RubikMonoOne",
                    fontSize: 14,
                  }}
                >
                  Cancel
                </button>
              </div>
            </ModeDetailDialog>
          </div>
        </div>
      )}
    </>
  );
}
