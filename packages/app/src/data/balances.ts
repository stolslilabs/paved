import type { BalancesState } from "../components/containers/balances";
import { useAccount } from "../wallet/wallet";
import { usePavedBalance, useUsdcBalance } from "./chain";
import { useCobbleAccount } from "./cobbles";

/** The connected wallet's USDC, PAVED and Cobbles as the Balances container reads them (#538). */
export function useBalances(): BalancesState {
  const wallet = useAccount();
  const address = wallet.address;
  const usdc = useUsdcBalance(address);
  const paved = usePavedBalance(address);
  const cobbles = useCobbleAccount(address);
  if (!address) return { status: "disconnected", connecting: wallet.status === "connecting" };
  const failed = usdc.error ?? paved.error ?? cobbles.error;
  if (failed) return { status: "error", message: failed instanceof Error ? failed.message : String(failed) };
  if (usdc.isPending || paved.isPending || cobbles.isPending) return { status: "loading" };
  return { status: "ready", usdc: usdc.data ?? null, paved: paved.data ?? null, cobbles: cobbles.data?.cobbles ?? null };
}
