import "./App.css";
import { useMemo } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import GameScreen from "./ui/screens/GameScreen";
import { GameLobby } from "./ui/screens/GameLobby";
import { useQueryParams } from "./hooks/useQueryParams";
import { Toaster } from "./components/ui/sonner";

export const CoreScreen = () => {
  const { gameId } = useQueryParams();
  const borderColor = useMemo(() => "#7D6669", []);
  return (
    <div className="border-8 w-screen h-screen" style={{ borderColor }}>
      {gameId ? <GameScreen /> : <GameLobby />}
    </div>
  );
};

function App() {
  return (
    <>
      <Router>
        <Routes>
          <Route path="/" element={<CoreScreen />} />
        </Routes>
        <Toaster position="top-center" />
      </Router>
    </>
  );
}

export default App;
