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

console.log(import.meta.env.VITE_PUBLIC_ACCOUNT_CONTRACT);

const connectors = [
  new CartridgeConnector(
    [
      {
        target: import.meta.env.VITE_PUBLIC_ACCOUNT_CONTRACT,
        method: "initialize",
      },
      {
        target: import.meta.env.VITE_PUBLIC_ACCOUNT_CONTRACT,
        method: "create",
      },
      {
        target: import.meta.env.VITE_PUBLIC_DAILY_CONTRACT,
        method: "initialize",
      },
      {
        target: import.meta.env.VITE_PUBLIC_DAILY_CONTRACT,
        method: "spawn",
      },
      {
        target: import.meta.env.VITE_PUBLIC_DAILY_CONTRACT,
        method: "claim",
      },
      {
        target: import.meta.env.VITE_PUBLIC_DAILY_CONTRACT,
        method: "sponsor",
      },
      {
        target: import.meta.env.VITE_PUBLIC_DAILY_CONTRACT,
        method: "discard",
      },
      {
        target: import.meta.env.VITE_PUBLIC_DAILY_CONTRACT,
        method: "surrender",
      },
      {
        target: import.meta.env.VITE_PUBLIC_DAILY_CONTRACT,
        method: "build",
      },
      {
        target: import.meta.env.VITE_PUBLIC_WEEKLY_CONTRACT,
        method: "initialize",
      },
      {
        target: import.meta.env.VITE_PUBLIC_WEEKLY_CONTRACT,
        method: "spawn",
      },
      {
        target: import.meta.env.VITE_PUBLIC_WEEKLY_CONTRACT,
        method: "claim",
      },
      {
        target: import.meta.env.VITE_PUBLIC_WEEKLY_CONTRACT,
        method: "sponsor",
      },
      {
        target: import.meta.env.VITE_PUBLIC_WEEKLY_CONTRACT,
        method: "discard",
      },
      {
        target: import.meta.env.VITE_PUBLIC_WEEKLY_CONTRACT,
        method: "surrender",
      },
      {
        target: import.meta.env.VITE_PUBLIC_WEEKLY_CONTRACT,
        method: "build",
      },
    ],
    {
      theme: {
        colors: {
          primary: "#0ad3ff",
          secondary: "#78ffd6",
        },
      },
    }
  ) as never as Connector,
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
