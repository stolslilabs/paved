import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  LandingScreen,
  ModeDetailDialog,
  ModeDetailDialogStat,
  TokenPanel,
} from "@paved/ui";
import type { GameModeCardProps, GameListItemProps } from "@paved/ui";
import { useActions, useBalance, useDojo, useEconomyConfig, useEconomyState } from "@paved/chain";
import { ModeType, Mode, Tournament, validateGameConfigInput } from "@paved/game-core";
import { feltToString, padAddress, toriiQuery } from "../utils/torii";
import { usePlayerGames } from "../hooks/usePlayerGames";
import { useTournaments } from "../hooks/useTournaments";
import { useLeaderboard } from "../hooks/useLeaderboard";
import { formatTimeRemaining, formatEntryFee } from "../utils/landing-helpers";
import { buildGameRoute } from "../utils/mode-routing";
import {
  buildCreateGameRoute,
  defaultConfigForMode,
  type CreatePath,
} from "../utils/create-options";
import { formatTokenAmount, mapLandingTokenPanel } from "../utils/economy-ui";

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
  const advancedConfigEnabled = import.meta.env.VITE_CONFIG_CREATE_V1 === "true";
  const [playerName, setPlayerName] = useState<string | undefined>(undefined);
  const [creating, setCreating] = useState(false);
  const [selectedMode, setSelectedMode] = useState<string | null>(null);
  const [createPath, setCreatePath] = useState<CreatePath>("legacy");
  const [templateId, setTemplateId] = useState("1");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [customConfig, setCustomConfig] = useState(() => defaultConfigForMode(ModeType.Daily));

  const toriiUrl = client?.config?.toriiUrl ?? null;
  const accountAddress = account?.address ?? null;
  const { mintToken, loading: mintLoading, error: mintError } = useActions(provider, account, client?.config?.manifest);
  const { balance } = useBalance(provider, accountAddress);
  const { config: economyConfig } = useEconomyConfig(provider);
  const { state: economyState } = useEconomyState(provider);
  const tokenPanel = mapLandingTokenPanel({
    balance,
    supportsMint: Boolean(client?.config?.supportsTokenMint),
    mintLoading,
    mintError,
  });
  const networkLabel = client?.config?.profileLabel ?? client?.config?.profile ?? "Local";

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
        [{
          contractName: "Account",
          entrypoint: "create",
          calldata: ["0x5061766564", account.address],
        }],
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

  const handleMint = async () => {
    if (!account) return;
    await mintToken();
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
      const mode = selectedMode as ModeType;
      if (createPath === "template") {
        const parsedTemplateId = Number(templateId);
        if (!Number.isInteger(parsedTemplateId) || parsedTemplateId <= 0) {
          setFieldErrors({ templateId: "Template id must be a positive integer." });
          return;
        }
        navigate(buildCreateGameRoute(mode, "template", parsedTemplateId));
      } else if (createPath === "custom") {
        const errors = validateGameConfigInput(customConfig);
        if (errors.length > 0) {
          const mapped: Record<string, string> = {};
          for (const error of errors) {
            if (error.includes("durationSeconds")) mapped.durationSeconds = error;
            else if (error.includes("tileLimit")) mapped.tileLimit = error;
            else if (error.includes("accessRoot")) mapped.accessRoot = error;
            else mapped.general = error;
          }
          setFieldErrors(mapped);
          return;
        }
        navigate(buildCreateGameRoute(mode, "custom", undefined, customConfig));
      } else {
        navigate(buildCreateGameRoute(mode, "legacy"));
      }
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
  const selectedTournament = selectedMode === ModeType.Daily
    ? tournaments.daily
    : selectedMode === ModeType.Weekly
      ? tournaments.weekly
      : null;

  useEffect(() => {
    if (!selectedMode) return;
    setCreatePath("legacy");
    setTemplateId("1");
    setFieldErrors({});
    setCustomConfig(defaultConfigForMode(selectedMode as ModeType));
  }, [selectedMode]);

  return (
    <>
      <div style={{
        position: "fixed",
        right: 16,
        top: 16,
        zIndex: 30,
        width: 320,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}>
        <TokenPanel
          networkLabel={networkLabel}
          balanceLabel={tokenPanel.balanceLabel}
          supportsMint={tokenPanel.supportsMint}
          isMinting={tokenPanel.isMinting}
          error={tokenPanel.error}
          onMint={handleMint}
        />
        {(economyState || economyConfig) && (
          <div style={{
            background: "rgba(0, 0, 0, 0.7)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 10,
            padding: 10,
            color: "#f5f5f5",
            fontSize: 12,
            lineHeight: 1.5,
          }}>
            <div>Economy scale: {economyConfig?.fp_scale ?? 1_000_000}</div>
            <div>Last supply: {economyState ? formatTokenAmount(economyState.last_supply, 18, 4) : "-"}</div>
            <div>Last target: {economyState ? formatTokenAmount(economyState.last_target, 18, 4) : "-"}</div>
          </div>
        )}
      </div>
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
              {selectedTournament?.rewardPreview?.length ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ color: "#999", fontSize: 12 }}>Payout Preview</span>
                  {selectedTournament.rewardPreview.map((row) => (
                    <span key={row.rank} style={{ color: "#f5f5f5", fontSize: 12 }}>
                      #{row.rank}: {row.baseLabel} * {row.multiplierLabel} = {row.adjustedLabel} ETH
                    </span>
                  ))}
                </div>
              ) : null}
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                <label style={{ color: "#999", fontSize: 12 }}>Creation</label>
                <select
                  value={createPath}
                  onChange={(e) => {
                    const next = e.target.value as CreatePath;
                    setCreatePath(next);
                    setFieldErrors({});
                  }}
                  style={{
                    background: "rgba(255,255,255,0.08)",
                    color: "#f5f5f5",
                    border: "1px solid rgba(255,255,255,0.2)",
                    borderRadius: 8,
                    padding: "8px 10px",
                  }}
                >
                  <option value="legacy">Default</option>
                  <option value="template">Template</option>
                  {advancedConfigEnabled && <option value="custom">Custom (Advanced)</option>}
                </select>
                {createPath === "template" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <input
                      value={templateId}
                      onChange={(e) => {
                        setTemplateId(e.target.value);
                        setFieldErrors((prev) => ({ ...prev, templateId: "" }));
                      }}
                      placeholder="Template ID"
                      style={{
                        background: "rgba(255,255,255,0.08)",
                        color: "#f5f5f5",
                        border: "1px solid rgba(255,255,255,0.2)",
                        borderRadius: 8,
                        padding: "8px 10px",
                      }}
                    />
                    {fieldErrors.templateId && (
                      <span style={{ color: "#f87171", fontSize: 11 }}>{fieldErrors.templateId}</span>
                    )}
                  </div>
                )}
                {createPath === "custom" && advancedConfigEnabled && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                    <input
                      value={String(customConfig.entryPrice)}
                      onChange={(e) => setCustomConfig((prev) => ({ ...prev, entryPrice: e.target.value }))}
                      placeholder="Entry Price"
                      style={{ background: "rgba(255,255,255,0.08)", color: "#f5f5f5", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8, padding: "8px 10px" }}
                    />
                    <input
                      value={String(customConfig.durationSeconds)}
                      onChange={(e) => setCustomConfig((prev) => ({ ...prev, durationSeconds: Number(e.target.value) || 0 }))}
                      placeholder="Duration (s)"
                      style={{ background: "rgba(255,255,255,0.08)", color: "#f5f5f5", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8, padding: "8px 10px" }}
                    />
                    <input
                      value={String(customConfig.tileLimit)}
                      onChange={(e) => setCustomConfig((prev) => ({ ...prev, tileLimit: Number(e.target.value) || 0 }))}
                      placeholder="Tile Limit"
                      style={{ background: "rgba(255,255,255,0.08)", color: "#f5f5f5", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8, padding: "8px 10px" }}
                    />
                    <input
                      value={String(customConfig.accessRoot)}
                      onChange={(e) => setCustomConfig((prev) => ({ ...prev, accessRoot: e.target.value }))}
                      placeholder="Access Root"
                      style={{ background: "rgba(255,255,255,0.08)", color: "#f5f5f5", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8, padding: "8px 10px" }}
                    />
                    <label style={{ color: "#f5f5f5", fontSize: 11 }}>
                      <input
                        type="checkbox"
                        checked={customConfig.privateGame}
                        onChange={(e) => setCustomConfig((prev) => ({ ...prev, privateGame: e.target.checked }))}
                        style={{ marginRight: 6 }}
                      />
                      Private
                    </label>
                    <label style={{ color: "#f5f5f5", fontSize: 11 }}>
                      <input
                        type="checkbox"
                        checked={customConfig.allowDiscard}
                        onChange={(e) => setCustomConfig((prev) => ({ ...prev, allowDiscard: e.target.checked }))}
                        style={{ marginRight: 6 }}
                      />
                      Allow Discard
                    </label>
                    <label style={{ color: "#f5f5f5", fontSize: 11 }}>
                      <input
                        type="checkbox"
                        checked={customConfig.allowSurrender}
                        onChange={(e) => setCustomConfig((prev) => ({ ...prev, allowSurrender: e.target.checked }))}
                        style={{ marginRight: 6 }}
                      />
                      Allow Surrender
                    </label>
                    {(fieldErrors.durationSeconds || fieldErrors.tileLimit || fieldErrors.accessRoot || fieldErrors.general) && (
                      <span style={{ gridColumn: "1 / -1", color: "#f87171", fontSize: 11 }}>
                        {fieldErrors.durationSeconds || fieldErrors.tileLimit || fieldErrors.accessRoot || fieldErrors.general}
                      </span>
                    )}
                  </div>
                )}
              </div>
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
