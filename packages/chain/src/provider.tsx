import React, { createContext, useContext, useState, useEffect } from "react";
import type { Account } from "starknet";
import type { DojoProvider as DojoProviderCore } from "@dojoengine/core";
import type { DojoConfig } from "./config";
import { createChainClient, ChainClient, BurnerManagerLike } from "./client";

interface DojoContextType {
  client: ChainClient | null;
  account: Account | null;
  provider: DojoProviderCore | null;
  burnerManager: BurnerManagerLike | null;
  isReady: boolean;
}

const DojoContext = createContext<DojoContextType>({
  client: null,
  account: null,
  provider: null,
  burnerManager: null,
  isReady: false,
});

export function useDojo() {
  return useContext(DojoContext);
}

export function DojoChainProvider({
  config,
  children,
}: {
  config: DojoConfig;
  children: React.ReactNode;
}) {
  const [state, setState] = useState<DojoContextType>({
    client: null,
    account: null,
    provider: null,
    burnerManager: null,
    isReady: false,
  });

  useEffect(() => {
    let cancelled = false;
    createChainClient(config)
      .then((client) => {
        if (cancelled) return;
        const account =
          client.burnerManager?.getActiveAccount() ?? client.masterAccount;
        setState({
          client,
          account,
          provider: client.provider,
          burnerManager: client.burnerManager,
          isReady: true,
        });
      })
      .catch((err) => {
        console.error("Failed to initialize chain client:", err);
      });
    return () => {
      cancelled = true;
    };
  }, [config]);

  return (
    <DojoContext.Provider value={state}>{children}</DojoContext.Provider>
  );
}
