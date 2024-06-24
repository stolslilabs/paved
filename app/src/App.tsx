import "./App.css";

import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import GameScreen from "./ui/screens/GameScreen";
import { GameLobby } from "./ui/screens/GameLobby";
import { useQueryParams } from "./hooks/useQueryParams";
import { Toaster } from "./ui/elements/sonner";
import { Landing } from "./ui/screens/Landing";

import {
  StarknetConfig,
  starkscan,
  jsonRpcProvider,
} from "@starknet-react/core";
import { Chain, sepolia, mainnet } from "@starknet-react/chains";
import { getConnectors } from "./data/getConnectors";
import { useCallback } from "react";

export const CoreScreen = () => {
  const { gameId } = useQueryParams();
  return gameId ? <GameScreen /> : <GameLobby />;
};

const { connectors } = getConnectors();

function App() {
  const rpc = useCallback((_chain: Chain) => {
    return { nodeUrl: import.meta.env.VITE_PUBLIC_NODE_URL, };
  }, []);
  
  return (
    <>
      <StarknetConfig
        autoConnect
        chains={[import.meta.env.VITE_PUBLIC_STARKNET ? mainnet : sepolia]}
        connectors={connectors}
        explorer={starkscan}
        provider={jsonRpcProvider({ rpc })}
      >
        <Router>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/game" element={<CoreScreen />} />
          </Routes>
          <Toaster position="top-center" />
        </Router>
      </StarknetConfig>
    </>
  );
}

export default App;
