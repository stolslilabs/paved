import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { LandingScreen, ModeDetailDialog, ModeDetailDialogStat, TokenPanel } from "@paved/ui";
import type { GameModeCardProps, GameListItemProps } from "@paved/ui";
import { useIndexerRead, usePaved, useRead } from "@paved/chain";
import type { GameMode, LeaderboardEntry, GameView, PavedClient, PlayerGame } from "@paved/chain";
import { buildGameRoute } from "../utils/mode-routing";
import { startIntent } from "../utils/start-game";
import { savedTrainingStatus } from "../training/use-training";
import { EconomyPanel } from "../components/EconomyPanel";
import { EconomyPurchase } from "../components/EconomyPurchase";
import { useEconomy } from "../utils/economy-context";
import { purchaseIntent } from "../utils/economy-start";
import { referrerFromSearch } from "../utils/economy-view";
import { useMe, usePlayerLabel } from "../utils/player-label";
import { entryFee, formatTimeRemaining, shortAddress, tokenLabel } from "../utils/landing-helpers";

interface ModeInfo {
  mode: GameMode;
  title: string;
  tiles: number;
  duration: string;
  /** Daily's entry is read from `Daily.entry_price`. */
  paid: boolean;
}

/**
 * The right panel stays above the notice footer: 16 px top margin and 64 px for the footer (one line is about 33 px, two
 * wrapped lines about 57 px, so 64 covers a narrow screen). `100vh` includes the area under a mobile browser's address
 * bar, so `100dvh` is the height, with `100vh` first for browsers without it (an inline style cannot carry both).
 */
export const PANEL_MAX_HEIGHT_CSS =
  ".landing-right-panel{max-height:calc(100vh - 16px - 64px);max-height:calc(100dvh - 16px - 64px)}";

/** The one mode the contracts have since D-21 (Weekly, configurable games and the on-chain Tutorial are gone). */
const MODES: ModeInfo[] = [{ mode: "daily", title: "Daily Challenge", tiles: 38, duration: "24 hours", paid: true }];

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

/** Rows of today's leaderboard shown on the Daily card. */
export const TOP_SHOWN = 3;

/**
 * The top 3 of today on the Daily card, from the indexer. Nothing while it loads, when the indexer is not configured or
 * fails (the card's other content stays, no error), and one line when nobody has finished a game today.
 */
export function DailyTop({ day }: { day: number | null | undefined }) {
  const board = useIndexerRead(day === null || day === undefined ? null : (c) => c.leaderboard(day, { limit: TOP_SHOWN }), [day], { onVisible: true });
  const entries: LeaderboardEntry[] = board.data?.data.entries.slice(0, TOP_SHOWN) ?? [];
  const label = usePlayerLabel();
  if (!board.data) return null;
  return (
    <div data-testid="daily-top" style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
      {entries.length === 0 ? (
        <span role="status">No games finished today yet.</span>
      ) : (
        <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 2 }}>
          {entries.map((e) => (
            <li key={e.playerId}>
              {`${e.rank}. `}
              <Link to={`/player/${e.playerId}`} style={{ color: "#f5f5f5" }}>
                {label(e.playerId, e.name)}
              </Link>
              {` - ${e.bestScore}`}
            </li>
          ))}
        </ol>
      )}
      <Link to="/leaderboard" style={{ color: "#f59e0b" }}>
        See the leaderboard
      </Link>
    </div>
  );
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

  // Reads happen on connect, after this client's writes (refresh), and when the page becomes visible.
  const balance = useRead((c) => (address ? c.balance(address) : Promise.resolve(0n)), [address]);
  const games = useRead((c) => (address ? listGames(c, address) : Promise.resolve([])), [address], { onVisible: true });
  // What a Daily spawn pulls (O-23): the same source the contract's `spawn` uses.
  const price = useRead((c) => c.views.entryPrice(), [], { onVisible: true });
  // The current day (`Daily.current_day`), for the time left in it.
  const day = useRead((c) => c.views.currentDay(), [], { onVisible: true });

  // D-25 (E): the player is whoever is connected (the wallet address), with no registration; the name is the Controller's
  // username where it is known, else a short address.
  const me = useMe();
  const playerName = me.id === null ? undefined : (me.username ?? shortAddress(me.id));

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

  const readErrors = (
    [
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

  // Training is free and off chain: its card does not wait for a wallet, a player or any read. The saved game is replayed
  // once per mount, not on every render.
  const saved = useMemo(() => savedTrainingStatus(), []);
  const training: GameModeCardProps = {
    mode: "training",
    title: "Training",
    description: "Free, no wallet, no rewards",
    tileCount: 38,
    duration: "No limit",
    entryFee: "Free",
    free: true,
    hasActiveGame: saved === "playing",
    // A finished game is not resumed: the card opens its result.
    actionLabel: saved === "over" ? "View result" : undefined,
    onPress: () => navigate(buildGameRoute({ mode: "training" })),
  };

  const modeCards: GameModeCardProps[] = MODES.map((m) => ({
    mode: m.mode,
    title: m.title,
    description: `${m.tiles} tiles`,
    tileCount: m.tiles,
    duration: m.duration,
    // With the economy deployed the Daily is bought in USDC by stake (P8); the price shows in the stake picker.
    entryFee: !m.paid ? "Free" : economy.client ? "USDC, by stake" : feeLabel,
    timeRemaining: m.mode === "daily" && dayEnd !== null ? formatTimeRemaining(dayEnd) : undefined,
    hasActiveGame: active.some((g) => g.mode === m.mode),
    extra: m.mode === "daily" ? <DailyTop day={day.data} /> : undefined,
    onPress: () => setSelected(m.mode),
  }));
  // The Tutorial is a page of its own on the engine (U1), off chain since D-21: no dialog, no start, no wallet.
  const tutorial: GameModeCardProps = {
    mode: "tutorial",
    title: "Tutorial",
    description: "10 tiles",
    tileCount: 10,
    duration: "Practice",
    entryFee: "Free",
    hasActiveGame: false,
    onPress: () => navigate("/tutorial"),
  };
  // The Daily, then the off-chain modes: Training and the Tutorial are free for anyone, the Daily's start keeps its gate.
  const gameModes: GameModeCardProps[] = [...modeCards, training, tutorial];

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
  // A Daily start needs a known entry fee; resuming a game does not.
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
            onClick={() => [balance, games, day, price].forEach((r) => r.refresh())}
            style={{ marginLeft: 12, background: "transparent", border: "1px solid #fff", color: "#fff", borderRadius: 6, cursor: "pointer" }}
          >
            Retry
          </button>
        </div>
      )}
      <LandingScreen
        connected={status === "ready"}
        playerName={status === "ready" ? playerName : undefined}
        gameModes={gameModes}
        activeGames={active.map(toItem(false))}
        completedGames={completed.map(toItem(true))}
        isLoading={games.loading || day.loading}
        onModeSelect={(mode: string) => setSelected(mode as GameMode)}
        onLeaderboard={() => navigate("/leaderboard")}
        onQuests={() => navigate("/quests")}
        onProfile={me.id && status === "ready" ? () => navigate(`/player/${me.id}`) : undefined}
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
