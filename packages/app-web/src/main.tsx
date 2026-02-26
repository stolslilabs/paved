import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { TamaguiProvider } from "tamagui";
import { tamaguiConfig } from "@paved/ui";
import { DojoChainProvider, createDojoConfig } from "@paved/chain";
import { App } from "./App";
import { resolveAppNetworkProfile } from "./utils/network-profile";

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

const DEFAULT_LOCAL_WORLD = "0x04d8a741b4c0680c3f3de05808173c3640428a841d75f9055f250d1f9cff3ad1";
const profile = resolveAppNetworkProfile(import.meta.env as any);
const config = createDojoConfig({
  rpcUrl: profile.rpcUrl,
  toriiUrl: profile.toriiUrl,
  worldAddress: profile.worldAddress || profile.manifest?.world?.address || DEFAULT_LOCAL_WORLD,
  manifest: profile.manifest,
  profile: profile.key,
  profileLabel: profile.label,
  supportsTokenMint: profile.supportsMint,
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
