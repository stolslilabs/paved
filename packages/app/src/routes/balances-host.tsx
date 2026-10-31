import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "react-router";
import { BalancesProvider } from "../components/containers/balances-context";
import type { BalanceKind } from "../components/containers/balances";
import { toastError } from "../components/containers/error-toast";
import { queryKeys } from "../data/keys";
import { useBalances } from "../data/balances";
import { MOCKED } from "../data/data-source";
import { useDataSources } from "../data/sources";
import { useAccount } from "../wallet/wallet";
import { useCobblesSheet } from "./cobbles-sheet";
import { errorDetail } from "./error-detail";
import { useAppNavigate } from "./ref";

/**
 * Where PAVED, vPAVED and the Cobbles lead (#871): the Challenge's purchase, the Vault, and the Cobble packs (#621). USDC mints from
 * the faucet where there is one.
 * The packs open as the village's page from the village, and in place, in a sheet over any other page (BACK-RULE #783). The
 * rule's `DESTINATION` says the same for the plates on those pages (header-balances.test checks both agree).
 */
export const DESTINATION = { paved: "/play/challenge", vpaved: "/vault", cobbles: "/cobbles" } as const;

/**
 * Devnet and Sepolia deploy the Faucet (`FAUCET_NETWORKS` of `@paved/chain`, kept out of the first bundle); mainnet has none.
 * The mock's faucet is the ledger's (#927): on the mock, "Get test USDC" is always there, whatever the network.
 */
const FAUCET_NETWORKS = ["devnet", "sepolia"];
const FAUCET = MOCKED || FAUCET_NETWORKS.includes(import.meta.env.VITE_NETWORK || (import.meta.env.DEV ? "devnet" : ""));

/**
 * Reads the balances once for the whole shell and hands them to the home and the pages' headers (`BalancesSlot`), with the page's
 * route (`page`, #855: its set is the rule's, `header-balances.ts`, read in the balances' chunk; `null`, none), where the page
 * shows some or the home is mounted under it. A plate on its own page leads nowhere, and is not pressed (`here`). `faucet`: whether
 * USDC mints here, the build's (`FAUCET`) by default; a story of the mock's ledger, built as no mock, gives its own.
 */
export function BalancesHost({ page, faucet = FAUCET, children }: { page: string | null; faucet?: boolean; children: ReactNode }) {
  const { state, retry } = useBalances();
  const wallet = useAccount();
  const { signer } = useDataSources();
  const queryClient = useQueryClient();
  const go = useAppNavigate();
  const { pathname } = useLocation();
  const cobbles = useCobblesSheet();
  const [minting, setMinting] = useState(false);
  const address = signer?.address ?? wallet.address;
  const onAction = useCallback(
    (kind: BalanceKind) => {
      if (kind === "cobbles" && pathname !== "/") return cobbles.open();
      if (kind !== "usdc") return go(DESTINATION[kind]);
      if (!signer || !address) return;
      setMinting(true);
      signer
        .mint()
        .then(() => queryClient.invalidateQueries({ queryKey: queryKeys.chain.usdcBalance(address) }))
        .catch((e: unknown) => toastError({ title: "The test USDC did not arrive", message: e instanceof Error ? e.message : String(e), detail: errorDetail(e) }))
        .finally(() => setMinting(false));
    },
    [go, pathname, cobbles.open, signer, address, queryClient],
  );
  const onConnect = useCallback(() => void wallet.connect(), [wallet]);
  const value = useMemo(
    () => ({ state, page, onAction, onConnect, onRetry: retry, faucet: faucet && Boolean(signer), minting }),
    [state, page, onAction, onConnect, retry, faucet, signer, minting],
  );
  return (
    <BalancesProvider value={value}>
      {children}
      {cobbles.sheet}
    </BalancesProvider>
  );
}
