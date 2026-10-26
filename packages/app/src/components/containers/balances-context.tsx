import { createContext, lazy, Suspense, useContext } from "react";
import { cn } from "../../lib/utils";
import { Skeleton } from "../ui/skeleton";
import type { BalancesProps } from "./balances";

/**
 * What the shell hands the pages' headers and the home: the balances and what their actions do. The shell gives it on every page
 * but the game scenes (`routes/header-balances.ts`); absent (the game scenes, stories, tests), no balances are drawn.
 */
const BalancesContext = createContext<Omit<BalancesProps, "layout"> | null>(null);
export const BalancesProvider = BalancesContext.Provider;

/** The balances in their own chunk (BALANCES, #538): the pages load it beside their code, the first bundle does not carry it. */
const Balances = lazy(() => import("./balances").then((m) => ({ default: m.Balances })));

/**
 * The balances in the home's format (ONE-HEADER, #781): the Cobbles' `pill` below `desktop`, every balance's `rail` from it, the
 * same at the home's top right and in every page's header (`PageHeader`). The place says at which widths (`className`:
 * `desktop:hidden`, `hidden desktop:flex`). The space is held while the chunk arrives, so nothing moves.
 */
export function BalancesSlot({ layout, className }: { layout: BalancesProps["layout"]; className?: string }) {
  const value = useContext(BalancesContext);
  if (!value) return null;
  const hold = <Skeleton className={cn("h-8 rounded-full", layout === "pill" ? "w-24" : "w-80", className)} />;
  return (
    <Suspense fallback={hold}>
      <Balances {...value} layout={layout} className={className} />
    </Suspense>
  );
}
