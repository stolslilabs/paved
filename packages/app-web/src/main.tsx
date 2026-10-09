import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { TamaguiProvider } from "tamagui";
import { tamaguiConfig } from "@paved/ui";
import { IndexerProvider } from "@paved/chain";
import { App } from "./App";
import { ConnectionBanner } from "./components/ConnectionBanner";
import { WalletProvider } from "./components/WalletProvider";
import { resolveAppNetwork } from "./utils/network";

if (import.meta.env.DEV && typeof window !== "undefined") {
  window.addEventListener("load", () => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations()
        .then((registrations) => Promise.all(registrations.map((r) => r.unregister())))
        .catch(() => {});
    }

    if ("caches" in window) {
      caches.keys()
        .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
        .catch(() => {});
    }
  });
}

// contracts/deployments/<network>.json, written by CORE's deploy script; absent until a deployment exists.
const deploymentFiles = import.meta.glob("../../../contracts/deployments/*.json", { eager: true });
const env = import.meta.env as Record<string, string | undefined>;
const network = resolveAppNetwork(env, deploymentFiles);

if (!network.deployment.configured) {
  console.error(`Paved: not connected, ${network.deployment.missing.join(", ")} missing.`);
}

const root = createRoot(document.getElementById("root")!);

root.render(
  <StrictMode>
    <TamaguiProvider config={tamaguiConfig} defaultTheme="dark">
      <WalletProvider env={env} network={network}>
        <IndexerProvider client={network.indexer}>
          <ConnectionBanner />
          <BrowserRouter>
            <App supportsMint={network.supportsMint} />
          </BrowserRouter>
        </IndexerProvider>
      </WalletProvider>
    </TamaguiProvider>
  </StrictMode>
);
