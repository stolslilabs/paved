import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { setup, SetupResult } from "./dojo/setup.ts";
import { DojoProvider } from "./dojo/context.tsx";
import { dojoConfig } from "../dojo.config.ts";
import { GameLoading } from "./ui/screens/GameLoading.tsx";
import { Analytics } from "@vercel/analytics/react";
import { StarknetConfig, jsonRpcProvider } from "@starknet-react/core";
import { Chain, sepolia } from "@starknet-react/chains";
import { useCallback } from "react";
import { getConnectors } from "./data/getConnectors.tsx";
import { GameMaintenance } from "./ui/screens/GameMaintenance.tsx";

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement,
);

const { connectors } = getConnectors();

function Main() {
  const [setupResult, setSetupResult] = useState<SetupResult | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function initialize() {
      const result = await setup(dojoConfig());
      setSetupResult(result);
    }

    initialize();
    setTimeout(() => setReady(true), 1000);
  }, []);
  const rpc = useCallback((_chain: Chain) => {
    return { nodeUrl: import.meta.env.VITE_PUBLIC_NODE_URL };
  }, []);

  return (
    <React.StrictMode>
      {import.meta.env.VITE_PUBLIC_MAINTENANCE === "true" ?
        (<GameMaintenance />)
        : (
          <StarknetConfig
            chains={[sepolia]}
            provider={jsonRpcProvider({ rpc })}
            connectors={connectors}
            autoConnect
          >
            {ready && setupResult ? (
              <DojoProvider value={setupResult}>
                <App />
              </DojoProvider>
            ) : (
              <GameLoading />
            )}
          </StarknetConfig>
        )}
      <Analytics />
    </React.StrictMode>
  );
}

root.render(<Main />);
