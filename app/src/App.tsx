import "./App.css";

import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import GameScreen from "./ui/screens/GameScreen";
import { GameLobby } from "./ui/screens/GameLobby";
import { useQueryParams } from "./hooks/useQueryParams";
import { Toaster } from "./ui/elements/sonner";
import { Landing } from "./ui/screens/Landing";

import {
  StarknetConfig,
  Connector,
  starkscan,
  jsonRpcProvider,
} from "@starknet-react/core";
import { Chain, sepolia } from "@starknet-react/chains";
import CartridgeConnector from "@cartridge/connector";

export const CoreScreen = () => {
  const { gameId } = useQueryParams();
  return gameId ? <GameScreen /> : <GameLobby />;
};

function rpc(_chain: Chain) {
  return {
    nodeUrl: import.meta.env.VITE_PUBLIC_NODE_URL,
  };
}

const connectors = [
  new CartridgeConnector([], {
    theme: {
      colors: {
        primary: "#ff0000",
        secondary: "green",
      },
    },
  }) as never as Connector,
];

function App() {
  return (
    <>
      <StarknetConfig
        autoConnect
        chains={[sepolia]}
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
