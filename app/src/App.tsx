import "./App.css";

import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import GameScreen from "./ui/screens/GameScreen";
import { GameLobby } from "./ui/screens/GameLobby";
import { useQueryParams } from "./hooks/useQueryParams";
import { Toaster } from "./components/ui/sonner";
import { Landing } from "./ui/screens/Landing";

export const CoreScreen = () => {
  const { gameId } = useQueryParams();
  return gameId ? <GameScreen /> : <GameLobby />;
};

function App() {
  return (
    <>
      <Router>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/game" element={<CoreScreen />} />
        </Routes>
        <Toaster position="top-center" />
      </Router>
    </>
  );
}

export default App;
