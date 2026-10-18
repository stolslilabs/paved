import type { BalancesState } from "../components/containers/balances";
import { useAccount } from "../wallet/wallet";
import { useDataSources } from "./sources";
import { usePavedBalance, useUsdcBalance } from "./chain";
import { useCobbleAccount } from "./cobbles";

/** The connected wallet's USDC, PAVED and Cobbles as the Balances container reads them (#538). */
export function useBalances(): BalancesState {
  const wallet = useAccount();
  // The player the data layer reads for: the signer's account (the wallet's, once connected).
  const address = useDataSources().signer?.address ?? wallet.address;
  const usdc = useUsdcBalance(address);
  const paved = usePavedBalance(address);
  const cobbles = useCobbleAccount(address);
  if (!address) return { status: "disconnected", connecting: wallet.status === "connecting" };
  const failed = usdc.error ?? paved.error ?? cobbles.error;
  if (failed) return { status: "error", message: failed instanceof Error ? failed.message : String(failed) };
  if (usdc.isPending && paved.isPending && cobbles.isPending) return { status: "loading" };
  // Each balance shows as it arrives: a read still out is `undefined` (a skeleton), one with no source `null` (a dash).
  const known = <T,>(q: { isPending: boolean; data: T | null | undefined }) => (q.isPending ? undefined : (q.data ?? null));
  return { status: "ready", usdc: known(usdc), paved: known(paved), cobbles: cobbles.isPending ? undefined : (cobbles.data?.cobbles ?? null) };
}
