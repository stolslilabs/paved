import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { BalancesProvider } from "../components/containers/balances-context";
import type { BalanceKind } from "../components/containers/balances";
import { toastError } from "../components/containers/error-toast";
import { queryKeys } from "../data/keys";
import { useBalances } from "../data/balances";
import { useDataSources } from "../data/sources";
import { useAccount } from "../wallet/wallet";
import { errorDetail } from "./error-detail";
import { useAppNavigate } from "./ref";

/** Where PAVED, vPAVED and the Cobbles lead: the Vault, and the Cobble packs (#621). USDC mints from the faucet where there is one. */
const DESTINATION = { paved: "/vault", vpaved: "/vault", cobbles: "/cobbles" } as const;

/** Devnet and Sepolia deploy the Faucet (`FAUCET_NETWORKS` of `@paved/chain`, kept out of the first bundle); mainnet has none. */
const FAUCET_NETWORKS = ["devnet", "sepolia"];
const FAUCET = FAUCET_NETWORKS.includes(import.meta.env.VITE_NETWORK || (import.meta.env.DEV ? "devnet" : ""));

/** Reads the balances once for the whole shell and hands them to the pages' headers and rail (`BalancesSlot`). */
export function BalancesHost({ children }: { children: ReactNode }) {
  const state = useBalances();
  const wallet = useAccount();
  const { signer } = useDataSources();
  const queryClient = useQueryClient();
  const go = useAppNavigate();
  const [minting, setMinting] = useState(false);
  const address = signer?.address ?? wallet.address;
  const onAction = useCallback(
    (kind: BalanceKind) => {
      if (kind !== "usdc") return go(DESTINATION[kind]);
      if (!signer || !address) return;
      setMinting(true);
      signer
        .mint()
        .then(() => queryClient.invalidateQueries({ queryKey: queryKeys.chain.usdcBalance(address) }))
        .catch((e: unknown) => toastError({ title: "The test USDC did not arrive", message: e instanceof Error ? e.message : String(e), detail: errorDetail(e) }))
        .finally(() => setMinting(false));
    },
    [go, signer, address, queryClient],
  );
  const onConnect = useCallback(() => void wallet.connect(), [wallet]);
  const value = useMemo(() => ({ state, onAction, onConnect, faucet: FAUCET && Boolean(signer), minting }), [state, onAction, onConnect, signer, minting]);
  return <BalancesProvider value={value}>{children}</BalancesProvider>;
}
