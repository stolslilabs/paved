import { createContext, lazy, Suspense, useContext } from "react";
import { cn } from "../../lib/utils";
import { Skeleton } from "../ui/skeleton";
import type { BalancesProps } from "./balances";

/**
 * Which balances a page's header shows (HEADER-BALANCES, #720; the rule by route is `routes/header-balances.ts`): `phone`, the
 * Cobbles' plate below `desktop`; `desktop`, every balance (`all`), every one but the Cobbles where the page draws its own
 * (`no-cobbles`), or none.
 */
export interface HeaderBalances {
  phone: boolean;
  desktop: "all" | "no-cobbles" | "none";
}

/** A provider that names no rule (stories, tests): every balance the header can show. */
const FULLEST: HeaderBalances = { phone: true, desktop: "all" };

/**
 * What the shell hands the pages' headers: the balances, what their actions do, and which the page shows (`show`, `FULLEST` when
 * omitted). Absent (stories, tests): no balances are drawn.
 */
const BalancesContext = createContext<(Omit<BalancesProps, "layout" | "noCobbles"> & { show?: HeaderBalances }) | null>(null);
export const BalancesProvider = BalancesContext.Provider;

/** The balances the page's header shows; none at all without the shell's provider. */
export function useHeaderBalances(): HeaderBalances | null {
  const value = useContext(BalancesContext);
  return value ? (value.show ?? FULLEST) : null;
}

/** The header has the Cobbles' strip below `desktop`: its second row (`page-header`, theme.css), one row without it. */
export const useBalancesStrip = () => useHeaderBalances()?.phone ?? false;

/** The balances in their own chunk (BALANCES, #538): the tab pages load it beside their code, the first bundle does not carry it. */
const Balances = lazy(() => import("./balances").then((m) => ({ default: m.Balances })));

/**
 * The balances where a page puts them: `pill` in a header below `desktop` (the Cobbles), `rail` at the end of the navigation's
 * header from it. The page's rule says whether each shows; the place says at which widths (`className`: `desktop:hidden`,
 * `hidden desktop:flex`), so a flow's top bar can choose its own. The space is held while the chunk arrives, so nothing moves.
 */
export function BalancesSlot({ layout, className }: { layout: BalancesProps["layout"]; className?: string }) {
  const value = useContext(BalancesContext);
  const show = useHeaderBalances();
  if (!value || !show || (layout === "pill" ? !show.phone : show.desktop === "none")) return null;
  const hold = <Skeleton className={cn("h-8 rounded-full", layout === "pill" ? "w-24" : "w-80", className)} />;
  return (
    <Suspense fallback={hold}>
      <Balances {...value} layout={layout} noCobbles={show.desktop === "no-cobbles"} className={className} />
    </Suspense>
  );
}
