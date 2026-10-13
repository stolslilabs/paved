import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { LandingScreen, ModeDetailDialog, ModeDetailDialogStat, TokenPanel } from "@paved/ui";
import type { GameModeCardProps, GameListItemProps } from "@paved/ui";
import { indexerPlayerId, usePaved, useRead } from "@paved/chain";
import type { GameMode, GameView, PavedClient, PlayerGame } from "@paved/chain";
import { buildGameRoute } from "../utils/mode-routing";
import { startIntent } from "../utils/start-game";
import { EconomyPanel } from "../components/EconomyPanel";
import { EconomyPurchase } from "../components/EconomyPurchase";
import { useEconomy } from "../utils/economy-context";
import { purchaseIntent } from "../utils/economy-start";
import { referrerFromSearch } from "../utils/economy-view";
import { canOfferCreate, entryFee, formatTimeRemaining, playerNameError, tokenLabel } from "../utils/landing-helpers";

interface ModeInfo {
  mode: GameMode;
  title: string;
  tiles: number;
  duration: string;
  /** Daily's entry is read from `Daily.entry_price`; Tutorial is free. */
  paid: boolean;
}

/**
 * The right panel stays above the notice footer: 16 px top margin and 64 px for the footer (one line is about 33 px, two
 * wrapped lines about 57 px, so 64 covers a narrow screen). `100vh` includes the area under a mobile browser's address
 * bar, so `100dvh` is the height, with `100vh` first for browsers without it (an inline style cannot carry both).
 */
export const PANEL_MAX_HEIGHT_CSS =
  ".landing-right-panel{max-height:calc(100vh - 16px - 64px);max-height:calc(100dvh - 16px - 64px)}";

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
  const economy = useEconomy();
  // A referral link names a referrer only: the purchase still needs the confirm below.
  const [searchParams] = useSearchParams();
  const referrer = referrerFromSearch(searchParams);
  const [selected, setSelected] = useState<GameMode | null>(null);
  const [writing, setWriting] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);

  // Reads happen on connect, after this client's writes (refresh), and when the page becomes visible.
  const player = useRead((c) => (address ? c.player(address) : Promise.resolve(null)), [address]);
  const balance = useRead((c) => (address ? c.balance(address) : Promise.resolve(0n)), [address]);
  const games = useRead((c) => (address ? listGames(c, address) : Promise.resolve([])), [address], { onVisible: true });
  // What a Daily spawn pulls (O-23): the same source the contract's `spawn` uses.
  const price = useRead((c) => c.views.entryPrice(), [], { onVisible: true });
  // The current day (`Daily.current_day`), for the time left in it.
  const day = useRead((c) => c.views.currentDay(), [], { onVisible: true });

  const playerId = player.data?.id ?? null;

  // `after` refreshes run when the write went through; `settled` ones run whatever the outcome.
  const write = async (fn: () => Promise<unknown>, after: Array<() => void>, settled: Array<() => void> = []) => {
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
      settled.forEach((refresh) => refresh());
    }
  };

  // "Create Account" only once a read has answered that this address has no player: with the RPC
  // down or the read in flight, a registered player must not be offered a create that reverts.
  const canCreate = canOfferCreate(status, player);
  const handleCreate = () => {
    if (!canCreate || !writer) return;
    const invalid = playerNameError(name);
    setNameError(invalid);
    if (invalid) return;
    return write(() => writer.createPlayer(name, { mintTestToken: supportsMint && !!deployment.mockUsdc }), [player.refresh, balance.refresh]);
  };
  const readErrors = (
    [
      ["player", player.error],
      ["balance", balance.error],
      ["games", games.error],
      ["day", day.error],
      ["entry price", price.error],
    ] as const
  ).filter(([, error]) => error);
  const handleMint = () => writer && write(() => writer.mint(), [balance.refresh]);

  const allGames: ListedGame[] = games.data ?? [];
  const active = allGames.filter((g) => !g.over);
  const completed = allGames.filter((g) => g.over);
  const dayEnd = day.data === null || day.data === undefined ? null : (day.data + 1) * 86400;

  // The Daily entry is paid in USDC since E3 (`contracts.USDC`, the devnet's MockUSDC), not in the old Token.
  const fee = entryFee(price, economy.deployment.addresses.USDC, deployment.tokenDecimals);
  const feeLabel =
    fee.kind === "amount"
      ? tokenLabel(fee.amount, deployment.tokenDecimals)
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
    // With the economy deployed the Daily is bought in USDC by stake (P8); the price shows in the stake picker.
    entryFee: !m.paid ? "Free" : economy.client ? "USDC, by stake" : feeLabel,
    timeRemaining: m.mode === "daily" && dayEnd !== null ? formatTimeRemaining(dayEnd) : undefined,
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
    // The only place that consents to start a game (and to pay the Daily entry): the consent is the
    // history state, with the amount the player sees here, which the spawn refuses to differ from.
    const route = buildGameRoute({ mode: selected });
    if (resume) navigate(buildGameRoute({ gameId: resume.gameId, mode: resume.mode }));
    else if (selected === "daily") {
      return; // a new Daily game is bought with the stake picker, never from this dialog
    } else navigate(route, { state: startIntent(selected, null) });
    setSelected(null);
  };

  const selectedCard = selected ? gameModes.find((m) => m.mode === selected) : null;
  // A Daily start needs a known entry fee; resuming a game, and the free Tutorial, do not.
  // A new Daily game is bought with the stake picker (E3: `Daily.spawn` takes USDC and a swap floor); this dialog only resumes one.
  const confirmAllowed = selected !== "daily" || active.some((g) => g.mode === "daily");

  return (
    <>
      <style>{PANEL_MAX_HEIGHT_CSS}</style>
      <div className="landing-right-panel" style={{ position: "fixed", right: 16, top: 16, zIndex: 30, width: 320, overflowY: "auto" }}>
        <TokenPanel
          networkLabel={deployment.network}
          balanceLabel={tokenLabel(balance.data ?? 0n, deployment.tokenDecimals)}
          supportsMint={supportsMint && !!deployment.mockUsdc && status === "ready"}
          isMinting={writing}
          error={writeError}
          onMint={handleMint}
        />
        {canCreate && (
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
            <input
              aria-label="Player name"
              placeholder="Player name (1 to 31 characters)"
              maxLength={31}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setNameError(null);
              }}
              style={{ background: "#111", color: "#fff", border: "1px solid #555", borderRadius: 6, padding: "6px 8px" }}
            />
            {nameError && <span role="alert" style={{ color: "#fecaca", fontSize: 12 }}>{nameError}</span>}
          </div>
        )}
        <div style={{ marginTop: 8 }}>
          <EconomyPanel economy={economy} address={address} origin={window.location.origin} write={write} busy={writing} />
        </div>
      </div>
      {readErrors.length > 0 && (
        <div role="alert" style={{ background: "#7f1d1d", color: "#fff", padding: "8px 12px", fontSize: 14 }}>
          {`Cannot read from ${deployment.network}: `}
          {readErrors.map(([what, error]) => `${what} (${error})`).join("; ")}
          <button
            type="button"
            onClick={() => [player, balance, games, day, price].forEach((r) => r.refresh())}
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
        isLoading={games.loading || day.loading}
        onModeSelect={(mode: string) => setSelected(mode as GameMode)}
        onLeaderboard={() => navigate("/leaderboard")}
        onQuests={() => navigate("/quests")}
        onProfile={playerId ? () => navigate(`/player/${indexerPlayerId(playerId)}`) : undefined}
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
              {selected === "daily" && economy.client && !selectedCard.hasActiveGame && (
                <EconomyPurchase
                  client={economy.client}
                  address={address}
                  ready={status === "ready" && economy.writer !== null}
                  referrer={referrer}
                  onConfirm={(stake, confirmedPrice, ref, confirmedMinOut, acceptedLowQuote) => {
                    // The consent to pay is this click's history state, never the link's URL.
                    navigate(buildGameRoute({ mode: "daily" }), { state: purchaseIntent(stake, confirmedPrice, ref, confirmedMinOut, acceptedLowQuote) });
                    setSelected(null);
                  }}
                />
              )}
              <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                {!(selected === "daily" && economy.client && !selectedCard.hasActiveGame) && (
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
                      ? feeLabel === "Unknown token" ? "Unknown token" : fee.kind === "amount" || fee.kind === "free" ? "Buy it in USDC: not deployed here" : "Entry price unavailable"
                      : selectedCard.hasActiveGame ? "Resume Game" : "Start Game"}
                </button>
                )}
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
