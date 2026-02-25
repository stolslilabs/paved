import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  LandingScreen,
  ModeDetailDialog,
  ModeDetailDialogStat,
} from "@paved/ui";
import type { GameModeCardProps, GameListItemProps } from "@paved/ui";
import { useDojo } from "@paved/chain";
import { ModeType, Mode, Tournament } from "@paved/game-core";
import { feltToString, padAddress, toriiQuery } from "../utils/torii";
import { usePlayerGames } from "../hooks/usePlayerGames";
import { useTournaments } from "../hooks/useTournaments";
import { useLeaderboard } from "../hooks/useLeaderboard";
import { formatTimeRemaining, formatEntryFee } from "../utils/landing-helpers";
import { buildGameRoute } from "../utils/mode-routing";

const MODE_LIST: ModeType[] = [ModeType.Daily, ModeType.Weekly, ModeType.Tutorial];

const MODE_TITLES: Record<string, string> = {
  [ModeType.Daily]: "Daily Challenge",
  [ModeType.Weekly]: "Weekly Tournament",
  [ModeType.Tutorial]: "Tutorial",
};

const MODE_DURATIONS: Record<string, string> = {
  [ModeType.Daily]: "24 hours",
  [ModeType.Weekly]: "7 days",
  [ModeType.Tutorial]: "Practice",
};

function computeEndTime(mode: Mode): number {
  const duration = mode.duration();
  const tournamentId = Tournament.computeId(duration);
  return (tournamentId + 1) * duration + mode.offset();
}

export function LandingPage() {
  const navigate = useNavigate();
  const { account, provider, isReady, client } = useDojo();
  const [playerName, setPlayerName] = useState<string | undefined>(undefined);
  const [creating, setCreating] = useState(false);
  const [selectedMode, setSelectedMode] = useState<string | null>(null);

  const toriiUrl = client?.config?.toriiUrl ?? null;
  const accountAddress = account?.address ?? null;

  // Poll Torii for player existence
  useEffect(() => {
    if (!account || !client) return;
    let cancelled = false;

    const checkPlayer = async () => {
      const rows = await toriiQuery(
        client.config.toriiUrl,
        `SELECT name FROM [paved-Player] WHERE id = '${padAddress(account.address)}'`
      );
      if (!cancelled && rows.length > 0) {
        setPlayerName(feltToString(rows[0].name));
      }
    };

    checkPlayer();
    const interval = setInterval(checkPlayer, 3000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [account, client]);

  // Data hooks
  const { activeGames, completedGames, isLoading: gamesLoading } = usePlayerGames(toriiUrl, accountAddress);
  const { tournaments, isLoading: tournamentsLoading } = useTournaments(toriiUrl);
  const { players: leaderboard, isLoading: leaderboardLoading } = useLeaderboard(toriiUrl);

  const handleSpawn = async () => {
    if (!account || !provider || creating) return;
    setCreating(true);
    try {
      await provider.execute(
        account as any,
        [
          { contractName: "Token", entrypoint: "mint", calldata: [] },
          {
            contractName: "Account",
            entrypoint: "create",
            calldata: ["0x5061766564", account.address],
          },
        ],
        "paved"
      );
      console.log("Player created");
    } catch (e: any) {
      const msg = e?.message || "";
      if (msg.includes("Already exist")) {
        // Player already exists, fine
      } else {
        console.error("Failed to create player:", e);
      }
    } finally {
      setCreating(false);
    }
  };

  // Build game mode cards
  const gameModes: GameModeCardProps[] = MODE_LIST.map((modeType) => {
    const mode = new Mode(modeType);
    const tournamentKey = modeType === ModeType.Daily ? "daily" : modeType === ModeType.Weekly ? "weekly" : null;
    const tournament = tournamentKey ? tournaments[tournamentKey] : null;
    const hasActive = activeGames.some((g) => g.mode === modeType);

    return {
      mode: modeType,
      title: MODE_TITLES[modeType] || modeType,
      description: `${mode.count()} tiles`,
      tileCount: mode.count(),
      duration: MODE_DURATIONS[modeType] || "",
      entryFee: formatEntryFee(mode.price()),
      prizePool: tournament?.prizePool,
      topPlayers: tournament?.topPlayers,
      timeRemaining: modeType !== ModeType.Tutorial ? formatTimeRemaining(computeEndTime(mode)) : undefined,
      hasActiveGame: hasActive,
      onPress: () => setSelectedMode(modeType),
    };
  });

  // Handle mode confirm (from dialog)
  const handleModeConfirm = () => {
    if (!selectedMode) return;
    const activeGame = activeGames.find((g) => g.mode === selectedMode);
    if (activeGame) {
      navigate(buildGameRoute({ gameId: activeGame.gameId, mode: activeGame.mode }));
    } else {
      navigate(`/game?mode=${selectedMode}`);
    }
    setSelectedMode(null);
  };

  // Build game list item props with navigation callbacks
  const activeGameItems: GameListItemProps[] = activeGames.map((g) => ({
    gameId: g.gameId,
    mode: g.mode,
    score: g.score,
    tilesPlaced: g.tilesPlaced,
    totalTiles: g.totalTiles,
    isOver: g.isOver,
    onEnter: () => navigate(buildGameRoute({ gameId: g.gameId, mode: g.mode })),
  }));

  const completedGameItems: GameListItemProps[] = completedGames.map((g) => ({
    gameId: g.gameId,
    mode: g.mode,
    score: g.score,
    tilesPlaced: g.tilesPlaced,
    totalTiles: g.totalTiles,
    isOver: g.isOver,
    onEnter: () => navigate(buildGameRoute({ gameId: g.gameId, mode: g.mode, readonly: true })),
  }));

  // Find the selected mode card data for the dialog
  const selectedModeData = selectedMode ? gameModes.find((m) => m.mode === selectedMode) : null;

  return (
    <>
      <LandingScreen
        connected={isReady && !!account}
        playerName={playerName}
        onSpawn={handleSpawn}
        gameModes={gameModes}
        activeGames={activeGameItems}
        completedGames={completedGameItems}
        leaderboard={leaderboard}
        isLoading={gamesLoading || tournamentsLoading || leaderboardLoading}
        onModeSelect={(mode: string) => setSelectedMode(mode)}
      />
      {selectedMode && selectedModeData && (
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
          onClick={() => setSelectedMode(null)}
        >
          <div onClick={(e) => e.stopPropagation()}>
            <ModeDetailDialog>
              <h2 style={{ color: "#f5f5f5", fontFamily: "RubikMonoOne", margin: 0 }}>
                {selectedModeData.title}
              </h2>
              <ModeDetailDialogStat>
                <span style={{ color: "#999" }}>Tiles</span>
                <span style={{ color: "#f5f5f5" }}>{selectedModeData.tileCount}</span>
              </ModeDetailDialogStat>
              <ModeDetailDialogStat>
                <span style={{ color: "#999" }}>Duration</span>
                <span style={{ color: "#f5f5f5" }}>{selectedModeData.duration}</span>
              </ModeDetailDialogStat>
              <ModeDetailDialogStat>
                <span style={{ color: "#999" }}>Entry Fee</span>
                <span style={{ color: "#f5f5f5" }}>{selectedModeData.entryFee}</span>
              </ModeDetailDialogStat>
              {selectedModeData.prizePool && (
                <ModeDetailDialogStat>
                  <span style={{ color: "#999" }}>Prize Pool</span>
                  <span style={{ color: "#f5f5f5" }}>{selectedModeData.prizePool} ETH</span>
                </ModeDetailDialogStat>
              )}
              {selectedModeData.topPlayers && selectedModeData.topPlayers.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ color: "#999", fontSize: 12 }}>Top Players</span>
                  {selectedModeData.topPlayers.map((p, i) => (
                    <span key={i} style={{ color: "#f5f5f5", fontSize: 12 }}>
                      {i + 1}. {p.name} - {p.score}
                    </span>
                  ))}
                </div>
              )}
              <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                <button
                  onClick={handleModeConfirm}
                  style={{
                    flex: 1,
                    background: "#f59e0b",
                    border: "none",
                    color: "#0a0a0a",
                    padding: "12px 24px",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontFamily: "RubikMonoOne",
                    fontSize: 14,
                  }}
                >
                  {selectedModeData.hasActiveGame ? "Resume Game" : "Start Game"}
                </button>
                <button
                  onClick={() => setSelectedMode(null)}
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
