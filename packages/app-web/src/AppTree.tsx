import type { ComponentType, ReactNode } from "react";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { ConnectionBanner } from "./components/ConnectionBanner";
import { AppShell } from "./components/WalletNotice";

/**
 * What main.tsx puts in #root under the providers: one column (`AppShell`) holding the connection banner, the app and
 * the controller notice, and nothing else in-flow beside it.
 */
export function AppTree({ supportsMint, Router = BrowserRouter }: { supportsMint: boolean; Router?: ComponentType<{ children?: ReactNode }> }) {
  return (
    <Router>
      <AppShell banner={<ConnectionBanner />}>
        <App supportsMint={supportsMint} />
      </AppShell>
    </Router>
  );
}
