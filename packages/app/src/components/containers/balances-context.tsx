import { createContext, lazy, Suspense, useContext, useMemo, type ReactNode } from "react";
import { cn } from "../../lib/utils";
import { Skeleton } from "../ui/skeleton";
import type { BalancesProps, ShownBalance } from "./balances";

/**
 * What the shell hands the pages' headers and the home: the balances, the page's set (`kinds`, #855: `routes/header-balances.ts`)
 * and what their actions do. The shell gives it where the page shows balances, or the home stays mounted under it (a panel's page
 * from `desktop`); absent (the other pages, stories, tests), no balances are drawn.
 */
const BalancesContext = createContext<Omit<BalancesProps, "layout"> | null>(null);
export const BalancesProvider = BalancesContext.Provider;

/**
 * A page's own balances where it is drawn over another page (the packs' sheet over the page that asked for them, #855): its set
 * (`kinds`) and the plates that lead to it (`here`) replace the page's under it. Nothing to change without the shell's balances.
 */
export function BalancesOf({ kinds, here, children }: Pick<BalancesProps, "kinds" | "here"> & { children: ReactNode }) {
  const value = useContext(BalancesContext);
  const own = useMemo(() => (value ? { ...value, kinds, here } : null), [value, kinds, here]);
  return <BalancesProvider value={own}>{children}</BalancesProvider>;
}

const COBBLES: readonly ShownBalance[] = ["cobbles"];

/**
 * The home's and the packs' sets (#855), the rule's (`routes/header-balances.ts`, which imports no module so the header sweep's
 * Node reads it), passed on here beside the slot: a lazy page that imports the route table itself splits this module out of the
 * entry.
 */
export { HOME_BALANCES, PACKS_BALANCES, PACKS_HERE } from "../../routes/header-balances";

/** The balances in their own chunk (BALANCES, #538): the pages load it beside their code, the first bundle does not carry it. */
const Balances = lazy(() => import("./balances").then((m) => ({ default: m.Balances })));

/**
 * The page's balances (#855) in the home's format (ONE-HEADER, #781): the phone's plates (`pill`) below `desktop`, the larger ones
 * (`rail`) from it, at the home's top right (a `column`, #828) and in the pages' headers (`PageHeader`, a `row`). The place says at
 * which widths (`className`: `desktop:hidden`, `hidden desktop:flex`); the home names its own set (`kinds`), under a panel's page
 * as alone. The space is held while the chunk arrives, so nothing moves.
 */
export function BalancesSlot({ layout, kinds, direction, className }: Pick<BalancesProps, "layout" | "kinds" | "direction" | "className">) {
  const value = useContext(BalancesContext);
  // Omitted (a story's, a test's provider): the Cobbles, the set of most pages.
  const shown = kinds ?? value?.kinds ?? COBBLES;
  if (!value || shown.length === 0) return null;
  const plate = layout === "pill" ? "h-8 w-24" : "h-9 w-28";
  const hold = (
    <span className={cn("flex", direction === "column" ? "flex-col items-end gap-2" : "items-center gap-2", className)}>
      {shown.filter((kind) => kind !== "vpaved-held").map((kind) => (
        <span key={kind} className="flex min-h-11 items-center">
          <Skeleton className={cn("rounded-lg", plate)} />
        </span>
      ))}
    </span>
  );
  return (
    <Suspense fallback={hold}>
      <Balances {...value} kinds={shown} layout={layout} direction={direction} className={className} />
    </Suspense>
  );
}
