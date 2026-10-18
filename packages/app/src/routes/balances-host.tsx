import { useCallback, useMemo, type ReactNode } from "react";
import { BalancesProvider } from "../components/containers/balances-context";
import type { BalanceKind } from "../components/containers/balances";
import { useBalances } from "../data/balances";
import { useAccount } from "../wallet/wallet";
import { useAppNavigate } from "./ref";

/** Where each balance leads: USDC and Cobbles to the purchase page (USDC pays the Challenge; its Cobbles tab is the shop), PAVED to the Vault. */
const DESTINATION: Record<BalanceKind, string> = { usdc: "/play/challenge", paved: "/vault", cobbles: "/play/challenge?tab=cobbles" };

/** Reads the balances once for the whole shell and hands them to the pages' headers and rail (`BalancesSlot`). */
export function BalancesHost({ children }: { children: ReactNode }) {
  const state = useBalances();
  const wallet = useAccount();
  const go = useAppNavigate();
  const onAction = useCallback((kind: BalanceKind) => go(DESTINATION[kind]), [go]);
  const onConnect = useCallback(() => void wallet.connect(), [wallet]);
  const value = useMemo(() => ({ state, onAction, onConnect }), [state, onAction, onConnect]);
  return <BalancesProvider value={value}>{children}</BalancesProvider>;
}
