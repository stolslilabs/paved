import { Routes, Route } from "react-router-dom";
import { useGameStore, useUIStore } from "@paved/ui";
import { LandingPage } from "./pages/Landing";
import { GamePage } from "./pages/Game";
import { LeaderboardPage } from "./pages/Leaderboard";
import { PlayerPage } from "./pages/Player";
import { QuestsPage } from "./pages/Quests";

export function App({ supportsMint = false }: { supportsMint?: boolean }) {
  const loading = useUIStore((s) => s.loading);

  return (
    <div style={{ width: "100%", height: "100%", cursor: loading ? "wait" : "default" }}>
      <Routes>
        <Route path="/" element={<LandingPage supportsMint={supportsMint} />} />
        <Route path="/game" element={<GamePage />} />
        <Route path="/leaderboard/:tournamentId?" element={<LeaderboardPage />} />
        <Route path="/quests/:day?" element={<QuestsPage />} />
        <Route path="/player/:playerId" element={<PlayerPage />} />
      </Routes>
    </div>
  );
}
