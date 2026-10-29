import { useContext, useMemo, type ReactNode } from "react";
import { BalancesContext, BalancesProvider } from "./balances-context";

/**
 * A page's own balances where it is drawn over another page (the packs' sheet over the page that asked for them, #855): its route
 * (`page`) replaces the page's under it, so its set and the plates that lead to it are its own (the rule's, read in the balances'
 * chunk). Nothing to change without the shell's balances. Apart from the slot, in the chunk of the page that uses it.
 */
export function BalancesOf({ page, children }: { page: string; children: ReactNode }) {
  const value = useContext(BalancesContext);
  const own = useMemo(() => (value ? { ...value, kinds: undefined, here: undefined, page } : null), [value, page]);
  return <BalancesProvider value={own}>{children}</BalancesProvider>;
}
