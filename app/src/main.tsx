import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { setup, SetupResult } from "./dojo/setup.ts";
import { DojoProvider } from "./dojo/context.tsx";
import { dojoConfig } from "../dojoConfig.ts";
import { StarknetProvider } from "./ui/components/Starknet.tsx";
import { GameLoading } from "./ui/screens/GameLoading.tsx";
import { Analytics } from "@vercel/analytics/react";

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement,
);

function Main() {
  const [setupResult, setSetupResult] = useState<SetupResult | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function initialize() {
      const result = await setup(dojoConfig());
      setSetupResult(result);
    }

    initialize();
    setTimeout(() => setReady(true), 5000);
  }, []);

  if (!setupResult || !ready) return <GameLoading />;

  return (
    <React.StrictMode>
      <StarknetProvider>
        <DojoProvider value={setupResult}>
          {!setupResult && <GameLoading />}
          {setupResult && <App />}
        </DojoProvider>
      </StarknetProvider>
      <Analytics />
    </React.StrictMode>
  );
}

root.render(<Main />);
