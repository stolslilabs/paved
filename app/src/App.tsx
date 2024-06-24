import "./App.css";

import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import GameScreen from "./ui/screens/GameScreen";
import { GameLobby } from "./ui/screens/GameLobby";
import { useQueryParams } from "./hooks/useQueryParams";
import { Toaster } from "./ui/elements/sonner";
import { Landing } from "./ui/screens/Landing";
import { useDojo } from "./dojo/useDojo";
import { usePlayer } from "./hooks/usePlayer";

export const CoreScreen = () => {
  const { gameId } = useQueryParams();
  const {
    account: { account },
  } = useDojo();

  const { player } = usePlayer({ playerId: account?.address });
  return (
    <>
      {!account && !player && <Landing />}
      {!!account && !!player && !gameId && <GameLobby />}
      {!!account && !!player && !!gameId && <GameScreen />}
    </>
  );
};

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<CoreScreen />} />
      </Routes>
      <Toaster position="top-center" />
    </Router>
  );
}

export default App;
