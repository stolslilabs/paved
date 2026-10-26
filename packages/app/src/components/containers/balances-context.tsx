import { createContext, lazy, Suspense, useContext } from "react";
import { cn } from "../../lib/utils";
import { Skeleton } from "../ui/skeleton";
import type { BalancesProps } from "./balances";
import { usePagePanel } from "./page-panel-context";

/**
 * Which balances a page's header shows (HEADER-BALANCES, #720; the rule by route is `routes/header-balances.ts`): `phone`, the
 * Cobbles' plate below `desktop`; `desktop`, every balance (`all`) or none.
 */
export interface HeaderBalances {
  phone: boolean;
  desktop: "all" | "none";
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


/** The balances in their own chunk (BALANCES, #538): the tab pages load it beside their code, the first bundle does not carry it. */
const Balances = lazy(() => import("./balances").then((m) => ({ default: m.Balances })));

/**
 * The balances where a page puts them: `pill` in the page below `desktop` (the Cobbles, `PageBalances`), `rail` at the end of the navigation's
 * header from it. The page's rule says whether each shows; the place says at which widths (`className`: `desktop:hidden`,
 * `hidden desktop:flex`), so a flow's top bar can choose its own. `noCobbles`: the page draws its own Cobbles plate, so the
 * slot leaves them out (the pill is then empty). The space is held while the chunk arrives, so nothing moves.
 */
export function BalancesSlot({ layout, noCobbles, className }: { layout: BalancesProps["layout"]; noCobbles?: boolean; className?: string }) {
  const value = useContext(BalancesContext);
  const show = useHeaderBalances();
  if (!value || !show || (layout === "pill" ? !show.phone || noCobbles : show.desktop === "none")) return null;
  const hold = <Skeleton className={cn("h-8 rounded-full", layout === "pill" ? "w-24" : "w-80", className)} />;
  return (
    <Suspense fallback={hold}>
      <Balances {...value} layout={layout} noCobbles={noCobbles} className={className} />
    </Suspense>
  );
}

/**
 * The balances below `desktop` (PAGE-HEADER, #760): in the page, right under its header, at the content's top right, scrolling
 * with it; never in the header, which stays one row. From `desktop` they are on the header's row (`BalancesSlot` `rail`).
 * Nothing at all where the page's rule shows no Cobbles on a phone, or where the page draws its own (`noCobbles`). Nothing in
 * the side panel (#762), whose page's header has the room for them (`PanelBalances`).
 */
export function PageBalances({ noCobbles, className }: { noCobbles?: boolean; className?: string }) {
  const value = useContext(BalancesContext);
  const show = useHeaderBalances();
  const panel = usePagePanel();
  if (!value || !show?.phone || noCobbles || panel) return null;
  return (
    <div data-slot="page-balances" className={cn("flex justify-end desktop:hidden", className)}>
      <BalancesSlot layout="pill" />
    </div>
  );
}

/**
 * The balances in a side panel's header (DESK-PANELS, #762, the owner's decision of 2026-10-25): the panel covers the home's
 * rail, so they come back in the page's header, only where they matter to the page (the phone's rule, `HeaderBalances.phone`: the
 * Cobbles, where they are bought, earned or spent). Nothing on a full page.
 */
export function PanelBalances({ noCobbles }: { noCobbles?: boolean }) {
  if (!usePagePanel()) return null;
  return <BalancesSlot layout="pill" noCobbles={noCobbles} />;
}
