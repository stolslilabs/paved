import type { BalancesState } from "../components/containers/balances";
import { useAccount } from "../wallet/wallet";
import { useDataSources } from "./sources";
import { usePavedBalance, useUsdcBalance, useVaultPosition } from "./chain";
import { useCobbleAccount } from "./cobbles";

/**
 * The connected wallet's USDC, PAVED, vPAVED and Cobbles as the Balances container reads them (#538, #620), and `retry`, which
 * reads them again (a failed read's Retry; its message is the Balances' own, `balancesMessage`). A new account, with nothing on chain yet, reads zeros like any other: a token's
 * `balance_of` and the ledger answer for any address.
 */
export function useBalances(): { state: BalancesState; retry: () => void } {
  const wallet = useAccount();
  // The player the data layer reads for: the signer's account (the wallet's, once connected).
  const address = useDataSources().signer?.address ?? wallet.address;
  const usdc = useUsdcBalance(address);
  const paved = usePavedBalance(address);
  const cobbles = useCobbleAccount(address);
  // The Vault's shares (#620): the same read as the Vault page's, so the two share one cache entry.
  const vault = useVaultPosition(address);
  const retry = () => void Promise.all([usdc, paved, cobbles, vault].filter((q) => q.isError).map((q) => q.refetch()));
  return { state: stateOf(), retry };

  function stateOf(): BalancesState {
    if (!address) return { status: "disconnected", connecting: wallet.status === "connecting" };
    const failed = usdc.error ?? paved.error ?? cobbles.error;
    if (failed) return { status: "error", message: failed instanceof Error ? failed.message : String(failed), retrying: usdc.isFetching || paved.isFetching || cobbles.isFetching };
    if (usdc.isPending && paved.isPending && cobbles.isPending) return { status: "loading" };
    // Each balance shows as it arrives: a read still out is `undefined` (a skeleton), one with no source `null` (a dash).
    const known = <T,>(q: { isPending: boolean; data: T | null | undefined }) => (q.isPending ? undefined : (q.data ?? null));
    return {
      status: "ready",
      usdc: known(usdc),
      paved: known(paved),
      // Shown only when held: a failed read hides it (null) rather than the whole bar's error.
      vpaved: vault.isPending ? undefined : (vault.data?.shares ?? null),
      cobbles: cobbles.isPending ? undefined : (cobbles.data?.cobbles ?? null),
    };
  }
}
