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

const profile = resolveAppNetworkProfile(import.meta.env as any);
const config = createDojoConfig({
  rpcUrl: profile.rpcUrl,
  toriiUrl: profile.toriiUrl,
  addresses: profile.addresses,
  profile: profile.key,
  profileLabel: profile.label,
  supportsTokenMint: profile.supportsMint,
});

if (!config.configured) {
  console.error(
    "Paved: contract addresses are not configured (set VITE_ACCOUNT_ADDRESS, VITE_DAILY_ADDRESS, " +
      "VITE_TUTORIAL_ADDRESS and VITE_TOKEN_ADDRESS). The app cannot reach a chain.",
  );
}

const root = createRoot(document.getElementById("root")!);

root.render(
  <StrictMode>
    <TamaguiProvider config={tamaguiConfig} defaultTheme="dark">
      <DojoChainProvider config={config}>
        {!config.configured && (
          <div role="alert" style={{ background: "#7f1d1d", color: "#fff", padding: "8px 12px", fontSize: 14 }}>
            Not configured: set VITE_ACCOUNT_ADDRESS, VITE_DAILY_ADDRESS, VITE_TUTORIAL_ADDRESS and
            VITE_TOKEN_ADDRESS. The native data layer is not wired yet, so the game cannot reach a chain.
          </div>
        )}
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </DojoChainProvider>
    </TamaguiProvider>
  </StrictMode>
);
