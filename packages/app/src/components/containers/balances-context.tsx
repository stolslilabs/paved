import { createContext, lazy, Suspense, useContext } from "react";
import { cn } from "../../lib/utils";
import { Skeleton } from "../ui/skeleton";
import type { BalancesProps } from "./balances";

/** What the shell hands the pages' headers: the three balances and what their actions do. Absent (stories, tests): no balances are drawn. */
const BalancesContext = createContext<Omit<BalancesProps, "layout"> | null>(null);
export const BalancesProvider = BalancesContext.Provider;

/** The balances in their own chunk (BALANCES, #538): the tab pages load it beside their code, the first bundle does not carry it. */
const Balances = lazy(() => import("./balances").then((m) => ({ default: m.Balances })));

/**
 * The balances where a page puts them: `pill` in a header below `desktop`, `rail` at the bottom of the left rail from it
 * (each hidden at the other size). The space is held while the chunk arrives, so nothing moves.
 */
export function BalancesSlot({ layout, className }: { layout: BalancesProps["layout"]; className?: string }) {
  const value = useContext(BalancesContext);
  if (!value) return null;
  const hold = layout === "pill" ? <Skeleton className={cn("h-10 w-24 rounded-full desktop:hidden", className)} /> : <Skeleton className={cn("hidden h-32 w-full desktop:block", className)} />;
  return (
    <Suspense fallback={hold}>
      <Balances layout={layout} className={className} {...value} />
    </Suspense>
  );
}
