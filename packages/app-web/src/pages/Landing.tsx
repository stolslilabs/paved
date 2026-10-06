import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LandingScreen, ModeDetailDialog, ModeDetailDialogStat, TokenPanel } from "@paved/ui";
import type { GameModeCardProps, GameListItemProps } from "@paved/ui";
import { usePaved, useRead } from "@paved/chain";
import type { GameMode, GameView, PavedClient, PlayerGame, TournamentView } from "@paved/chain";
import { buildGameRoute } from "../utils/mode-routing";
import { canConfirmEntry, canOfferCreate, entryFee, formatTimeRemaining, formatTokenAmount, podium, TOKEN_LABEL } from "../utils/landing-helpers";

interface ModeInfo {
  mode: GameMode;
  title: string;
  tiles: number;
  duration: string;
  /** Daily's entry is read from `Daily.entry_price`; Tutorial is free. */
  paid: boolean;
}

/** The two modes the contracts have since P1 (Weekly and configurable games are gone). */
const MODES: ModeInfo[] = [
  { mode: "daily", title: "Daily Challenge", tiles: 38, duration: "24 hours", paid: true },
  { mode: "tutorial", title: "Tutorial", tiles: 10, duration: "Practice", paid: false },
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
  // What a Daily spawn pulls (O-23): the same source the contract's `spawn` uses.
  const price = useRead((c) => c.views.entryPrice(), [], { onVisible: true });
  const tournament = useRead<TournamentView>(
    async (c) => c.views.tournament(await c.views.currentTournamentId()),
    [],
    { onVisible: true },
  );

  const write = async (fn: () => Promise<unknown>, after: Array<() => void>) => {
    after = [...after, price.refresh]; // a write may change what the entry costs the player to see
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

  // "Create Account" only once a read has answered that this address has no player: with the RPC
  // down or the read in flight, a registered player must not be offered a create that reverts.
  const canCreate = canOfferCreate(status, player);
  const handleCreate = () =>
    canCreate && writer && write(() => writer.createPlayer("Paved", { mintTestToken: supportsMint }), [player.refresh, balance.refresh]);
  const readErrors = (
    [
      ["player", player.error],
      ["balance", balance.error],
      ["games", games.error],
      ["tournament", tournament.error],
      ["entry price", price.error],
    ] as const
  ).filter(([, error]) => error);
  const handleMint = () => writer && write(() => writer.mint(), [balance.refresh]);

  const allGames: ListedGame[] = games.data ?? [];
  const active = allGames.filter((g) => !g.over);
  const completed = allGames.filter((g) => g.over);
  const daily = tournament.data;

  const fee = entryFee(price, deployment.addresses.Token);
  const feeLabel =
    fee.kind === "amount"
      ? `${formatTokenAmount(fee.amount, deployment.tokenDecimals)} ${TOKEN_LABEL}`
      : fee.kind === "free"
        ? "Free"
        : fee.kind === "unknown-token"
          ? "Unknown token"
          : fee.kind === "error"
            ? "Unavailable"
            : "…";

  const gameModes: GameModeCardProps[] = MODES.map((m) => ({
    mode: m.mode,
    title: m.title,
    description: `${m.tiles} tiles`,
    tileCount: m.tiles,
    duration: m.duration,
    entryFee: !m.paid ? "Free" : feeLabel,
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
    // The only place that asks the game page to spawn (and pay the Daily entry): with the amount the
    // player sees here, which the spawn refuses to differ from.
    if (resume) navigate(buildGameRoute({ gameId: resume.gameId, mode: resume.mode }));
    else if (selected === "daily") {
      if (!canConfirmEntry(fee, false)) return;
      navigate(buildGameRoute({ mode: selected, spawn: true, price: fee.kind === "amount" ? fee.amount : 0n }));
    } else navigate(buildGameRoute({ mode: selected, spawn: true }));
    setSelected(null);
  };

  const selectedCard = selected ? gameModes.find((m) => m.mode === selected) : null;
  // A Daily start needs a known entry fee; resuming a game, and the free Tutorial, do not.
  const confirmAllowed = selected !== "daily" || canConfirmEntry(fee, active.some((g) => g.mode === "daily"));

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
      {readErrors.length > 0 && (
        <div role="alert" style={{ background: "#7f1d1d", color: "#fff", padding: "8px 12px", fontSize: 14 }}>
          {`Cannot read from ${deployment.network}: `}
          {readErrors.map(([what, error]) => `${what} (${error})`).join("; ")}
          <button
            type="button"
            onClick={() => [player, balance, games, tournament, price].forEach((r) => r.refresh())}
            style={{ marginLeft: 12, background: "transparent", border: "1px solid #fff", color: "#fff", borderRadius: 6, cursor: "pointer" }}
          >
            Retry
          </button>
        </div>
      )}
      <LandingScreen
        // Until the player is known (read in flight or failed), neither the games nor "Create Account".
        connected={status === "ready" && (player.data !== null || canCreate)}
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
                  disabled={status !== "ready" || !confirmAllowed}
                  title={status !== "ready" ? "Not connected" : !confirmAllowed ? `Entry price: ${feeLabel}` : undefined}
                  style={{
                    flex: 1,
                    background: status === "ready" && confirmAllowed ? "#f59e0b" : "#555",
                    border: "none",
                    color: "#0a0a0a",
                    padding: "12px 24px",
                    borderRadius: 8,
                    cursor: status === "ready" && confirmAllowed ? "pointer" : "not-allowed",
                    fontFamily: "RubikMonoOne",
                    fontSize: 14,
                  }}
                >
                  {status !== "ready"
                    ? "Not connected"
                    : !confirmAllowed
                      ? feeLabel === "Unknown token" ? "Unknown token" : "Entry price unavailable"
                      : selectedCard.hasActiveGame ? "Resume Game" : "Start Game"}
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
