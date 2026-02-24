import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { TamaguiProvider } from "tamagui";
import { tamaguiConfig } from "@paved/ui";
import { DojoChainProvider, createDojoConfig } from "@paved/chain";
import manifest from "../../../contracts/manifests/dev/deployment/manifest.json";
import { App } from "./App";

const config = createDojoConfig({
  rpcUrl: "http://localhost:5050",
  toriiUrl: "http://localhost:8080",
  masterAddress: "0x127fd5f1fe78a71f8bcd1fec63e3fe2f0486b6ecd5c86a0466c3a21fa5cfcec",
  masterPrivateKey: "0xc5b2fcab997346f3ea1c00b002ecf6f382c5f9c9659a3894eb783c5320f912",
  worldAddress: "0x04d8a741b4c0680c3f3de05808173c3640428a841d75f9055f250d1f9cff3ad1",
  manifest,
});

const root = createRoot(document.getElementById("root")!);

root.render(
  <StrictMode>
    <TamaguiProvider config={tamaguiConfig} defaultTheme="dark">
      <DojoChainProvider config={config}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </DojoChainProvider>
    </TamaguiProvider>
  </StrictMode>
);
