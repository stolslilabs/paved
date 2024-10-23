import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import GameScreen from "./ui/screens/GameScreen";
import { GameLobby } from "./ui/screens/GameLobby";
import { useQueryParams } from "./hooks/useQueryParams";
import { Toaster } from "./ui/elements/sonner";
import { Landing } from "./ui/screens/Landing";
import { useDojo } from "./dojo/useDojo";
import { usePlayer } from "./hooks/usePlayer";
import { useEffect } from "react";
import { useMusicPlayer } from "./hooks/useMusicPlayer";
import { TooltipProvider } from "./ui/elements/tooltip";

export const CoreScreen = () => {
  const { gameId } = useQueryParams();
  const {
    account: { account },
  } = useDojo();

  const { player } = usePlayer({ playerId: account?.address });
  const { play, muted } = useMusicPlayer();

  useEffect(() => {
    if (muted) return;
    if (gameId) {
      play.ingame();
    } else {
      play.lobby();
    }
  }, [gameId, muted]);

  return (
    <TooltipProvider>
      <div className="h-full w-full">
        {!player && <Landing />}
        {!!account && !!player && !gameId && <GameLobby />}
        {!!account && !!player && !!gameId && <GameScreen />}
      </div>
    </TooltipProvider>
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
