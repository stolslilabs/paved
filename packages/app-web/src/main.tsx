import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { TamaguiProvider } from "tamagui";
import { tamaguiConfig } from "@paved/ui";
import { AppTree } from "./AppTree";
import type { ChainBoundary } from "./AppTree";
import { ChainProviders } from "./components/WalletProvider";

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

// The network is resolved, and the chain clients are built, by `ChainProviders`, on the first route that reads the chain.
const Chain: ChainBoundary = ({ children }) => (
  <ChainProviders env={env} files={deploymentFiles}>
    {children}
  </ChainProviders>
);

const root = createRoot(document.getElementById("root")!);

root.render(
  <StrictMode>
    <TamaguiProvider config={tamaguiConfig} defaultTheme="dark">
      <AppTree Chain={Chain} />
    </TamaguiProvider>
  </StrictMode>
);
