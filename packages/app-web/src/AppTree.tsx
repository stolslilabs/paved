import { useRef } from "react";
import type { ComponentType, ReactNode } from "react";
import { BrowserRouter, useLocation } from "react-router-dom";
import { App } from "./App";
import { ConnectionBanner } from "./components/ConnectionBanner";
import { AppShell } from "./components/WalletNotice";

/**
 * The routes that play off chain and use nothing of it: the Tutorial, and Training (a mode of `/game`). They are rendered
 * with no chain client, no controller connector and no indexer client. An old `/game?mode=tutorial` link is one too: the
 * game page only redirects it to `/tutorial`.
 */
export function isOffChainRoute(location: { pathname: string; search: string }): boolean {
  if (location.pathname === "/tutorial") return true;
  const mode = location.pathname === "/game" ? new URLSearchParams(location.search).get("mode") : null;
  return mode === "training" || mode === "tutorial";
}

/** What mounts the chain side (wallet, paved client, indexer client) around its children, given the network's `supportsMint`. */
export type ChainBoundary = ComponentType<{ children: (supportsMint: boolean) => ReactNode }>;

/**
 * The shell, and the chain side under it from the first route that reads the chain: a page that opens on an off-chain
 * route builds none of it, and once built it stays (leaving the Tutorial for the Landing mounts it; nothing unmounts it).
 * With no `Chain`, the app is rendered as given (`supportsMint`) with its banner, as before.
 */
function Routed({ supportsMint, Chain }: { supportsMint: boolean; Chain?: ChainBoundary }) {
  const location = useLocation();
  const chainNeeded = useRef(false);
  if (!isOffChainRoute(location)) chainNeeded.current = true;

  if (!Chain) {
    return (
      <AppShell banner={<ConnectionBanner />}>
        <App supportsMint={supportsMint} />
      </AppShell>
    );
  }
  if (!chainNeeded.current) {
    return (
      <AppShell>
        <App supportsMint={false} />
      </AppShell>
    );
  }
  return (
    <Chain>
      {(mint) => (
        <AppShell banner={<ConnectionBanner />}>
          <App supportsMint={mint} />
        </AppShell>
      )}
    </Chain>
  );
}

/**
 * What main.tsx puts in #root: one column (`AppShell`) holding the connection banner, the app and the controller notice,
 * and nothing else in-flow beside it.
 */
export function AppTree({ supportsMint = false, Router = BrowserRouter, Chain }: { supportsMint?: boolean; Router?: ComponentType<{ children?: ReactNode }>; Chain?: ChainBoundary }) {
  return (
    <Router>
      <Routed supportsMint={supportsMint} Chain={Chain} />
    </Router>
  );
}
