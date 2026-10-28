import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "react-router";
import { BalancesProvider } from "../components/containers/balances-context";
import type { BalanceKind, ShownBalance } from "../components/containers/balances";
import { toastError } from "../components/containers/error-toast";
import { queryKeys } from "../data/keys";
import { useBalances } from "../data/balances";
import { useDataSources } from "../data/sources";
import { useAccount } from "../wallet/wallet";
import { useCobblesSheet } from "./cobbles-sheet";
import { errorDetail } from "./error-detail";
import { useAppNavigate } from "./ref";

/**
 * Where PAVED, vPAVED and the Cobbles lead: the Vault, and the Cobble packs (#621). USDC mints from the faucet where there is one.
 * The packs open as the village's page from the village, and in place, in a sheet over any other page (BACK-RULE #783).
 */
const DESTINATION = { paved: "/vault", vpaved: "/vault", cobbles: "/cobbles" } as const;
const LEADING = Object.keys(DESTINATION) as (keyof typeof DESTINATION)[];

/** The balances whose page is the one at `pathname` (the Vault's, the packs'): in view already, their plates lead nowhere (#855). */
export const hereOf = (pathname: string): readonly BalanceKind[] => LEADING.filter((kind) => DESTINATION[kind] === pathname);

/** Devnet and Sepolia deploy the Faucet (`FAUCET_NETWORKS` of `@paved/chain`, kept out of the first bundle); mainnet has none. */
const FAUCET_NETWORKS = ["devnet", "sepolia"];
const FAUCET = FAUCET_NETWORKS.includes(import.meta.env.VITE_NETWORK || (import.meta.env.DEV ? "devnet" : ""));

/**
 * Reads the balances once for the whole shell and hands them to the home and the pages' headers (`BalancesSlot`), with the page's
 * set (`kinds`, `header-balances.ts`, #855), where the page shows some or the home is mounted under it.
 */
export function BalancesHost({ kinds, children }: { kinds: readonly ShownBalance[]; children: ReactNode }) {
  const state = useBalances();
  const wallet = useAccount();
  const { signer } = useDataSources();
  const queryClient = useQueryClient();
  const go = useAppNavigate();
  const { pathname } = useLocation();
  const cobbles = useCobblesSheet();
  const [minting, setMinting] = useState(false);
  const address = signer?.address ?? wallet.address;
  const here = useMemo(() => hereOf(pathname), [pathname]);
  const onAction = useCallback(
    (kind: BalanceKind) => {
      if (here.includes(kind)) return;
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
    [go, pathname, here, cobbles.open, signer, address, queryClient],
  );
  const onConnect = useCallback(() => void wallet.connect(), [wallet]);
  const value = useMemo(
    () => ({ state, kinds, here, onAction, onConnect, faucet: FAUCET && Boolean(signer), minting }),
    [state, kinds, here, onAction, onConnect, signer, minting],
  );
  return (
    <BalancesProvider value={value}>
      {children}
      {cobbles.sheet}
    </BalancesProvider>
  );
}
