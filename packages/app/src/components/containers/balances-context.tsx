import { createContext, lazy, Suspense, useContext } from "react";
import { cn } from "../../lib/utils";
import { Skeleton } from "../ui/skeleton";
import type { BalancesProps, ShownBalance } from "./balances";

/**
 * What the shell hands the pages' headers and the home: the balances, the page's route (`page`, #855: its set is the rule's,
 * `routes/header-balances.ts`, read in the balances' chunk; `null`, none) and what their actions do. The shell gives it where the
 * page shows balances, or the home stays mounted under it (a panel's page from `desktop`); absent (the other pages, stories,
 * tests), no balances are drawn. A page drawn over another sets its own (`BalancesOf`).
 */
export const BalancesContext = createContext<Omit<BalancesProps, "layout"> | null>(null);
export const BalancesProvider = BalancesContext.Provider;

const COBBLES: readonly ShownBalance[] = ["cobbles"];

/** The balances in their own chunk (BALANCES, #538): the pages load it beside their code, the first bundle does not carry it. */
const Balances = lazy(() => import("./balances").then((m) => ({ default: m.Balances })));

/**
 * The page's balances (#855) in the home's format (ONE-HEADER, #781): the phone's plates (`pill`) below `desktop`, the larger ones
 * (`rail`) from it, at the home's top right (a `column`, #828) and in the pages' headers (`PageHeader`, a `row`). The place says at
 * which widths (`className`: `desktop:hidden`, `hidden desktop:flex`); the home names its own set (`kinds`), under a panel's page
 * as alone. The space is held while the chunk arrives: a plate per balance where the set is named, one where it is the page's.
 */
export function BalancesSlot({ kinds, ...slot }: Pick<BalancesProps, "layout" | "kinds" | "direction" | "beside" | "className">) {
  const { layout, direction, className } = slot;
  const value = useContext(BalancesContext);
  // Neither a set nor a page (a story's, a test's provider): the Cobbles, the set of most pages. A page that shows none, none.
  const shown = kinds ?? value?.kinds ?? (value?.page === undefined ? COBBLES : undefined);
  if (!value || shown?.length === 0 || (!shown && value.page === null)) return null;
  const plate = layout === "pill" ? "h-8 w-24" : "h-9 w-28";
  const hold = (
    <span className={cn("flex", direction === "column" ? "flex-col items-end gap-2" : "items-center gap-2", className)}>
      {(shown ?? COBBLES).filter((kind) => kind !== "vpaved-held").map((kind) => (
        <span key={kind} className="flex min-h-11 items-center">
          <Skeleton className={cn("rounded-lg", plate)} />
        </span>
      ))}
    </span>
  );
  return (
    <Suspense fallback={hold}>
      <Balances {...value} {...slot} kinds={shown} />
    </Suspense>
  );
}
