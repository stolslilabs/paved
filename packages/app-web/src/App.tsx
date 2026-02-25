import { Routes, Route } from "react-router-dom";
import { useGameStore, useUIStore } from "@paved/ui";
import { LandingPage } from "./pages/Landing";
import { GamePage } from "./pages/Game";

export function App() {
  const loading = useUIStore((s) => s.loading);

  return (
    <div style={{ width: "100%", height: "100%", cursor: loading ? "wait" : "default" }}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/game" element={<GamePage />} />
      </Routes>
    </div>
  );
}
