import { createContext, createElement, useContext, useMemo, type ReactNode } from "react";
import { createEconomyClient, usePaved } from "@paved/chain";
import type { EconomyClient, EconomyDeployment, EconomyViews, EconomyWriter } from "@paved/chain";
import { appEconomy } from "./economy-network";

interface EconomyOverride {
  deployment: EconomyDeployment;
  /** Views to use instead of the contracts' (tests: `FakeEconomy`). */
  views?: EconomyViews;
  now?: () => number;
}

const EconomyContext = createContext<EconomyOverride | null>(null);

/** Overrides the economy of the build (tests). Without it, `useEconomy` reads the deployments files and the env. */
export function EconomyProvider({ value, children }: { value: EconomyOverride; children: ReactNode }) {
  return createElement(EconomyContext.Provider, { value }, children);
}

export interface EconomyState {
  deployment: EconomyDeployment;
  /** Null when the economy is not deployed (every network until CORE's E2/E3) or the game client is not configured. */
  client: EconomyClient | null;
  /** Null without a ready account. */
  writer: EconomyWriter | null;
  /** Seconds since the epoch, for "is the day over" (overridden in tests). */
  now: () => number;
}

const wallClock = () => Math.floor(Date.now() / 1000);

export function useEconomy(): EconomyState {
  const override = useContext(EconomyContext);
  const { client: base, writer: baseWriter, deployment: baseDeployment } = usePaved();
  const deployment = useMemo(() => override?.deployment ?? appEconomy(baseDeployment), [override, baseDeployment]);
  return useMemo(() => {
    const client = createEconomyClient(deployment, base, override?.views);
    const writer = client && baseWriter ? client.writer(baseWriter, { now: override?.now }) : null;
    return { deployment, client, writer, now: override?.now ?? wallClock };
  }, [deployment, base, baseWriter, override]);
}
