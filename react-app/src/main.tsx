import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { setup } from "./dojo/generated/setup.ts";
import { DojoProvider } from "./dojo/DojoContext.tsx";
import { dojoConfig } from "../dojoConfig.ts";
import { StarknetProvider } from "./ui/components/Starknet.tsx";
import { TooltipProvider } from "./components/ui/tooltip.tsx";

async function init() {
  const rootElement = document.getElementById("root");
  if (!rootElement) throw new Error("React root not found");
  const root = ReactDOM.createRoot(rootElement as HTMLElement);

  const setupResult = await setup(dojoConfig());

  root.render(
    <React.StrictMode>
      <StarknetProvider>
        <DojoProvider value={setupResult}>
          <App />
        </DojoProvider>
      </StarknetProvider>
    </React.StrictMode>
  );
}

init();
