import { useState } from "react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../ui/sheet";
import { Skeleton } from "../ui/skeleton";
import { Amount } from "../elements/amount";
import { Cobbles } from "../elements/cobbles";
import { InlineError } from "../elements/inline-error";

/** The wallet's three balances as a page reads them. USDC and PAVED are tokens (base units); Cobbles are a ledger (a count). */
export type BalancesState =
  | { status: "disconnected"; connecting?: boolean }
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      /** Null: no source on this network, shown as a dash; undefined: the read is still out, a skeleton. */
      usdc: bigint | null | undefined;
      paved: bigint | null | undefined;
      cobbles: number | null | undefined;
    };

/** Where each balance leads: USDC to where it is got, PAVED to the Vault, Cobbles to the Cobble shop. */
export type BalanceKind = "usdc" | "paved" | "cobbles";

export interface BalancesProps {
  /** `pill`: a compact figure that opens a sheet (below `desktop`); `rail`: the three always visible (from `desktop`). */
  layout: "pill" | "rail";
  state: BalancesState;
  onAction?: (kind: BalanceKind) => void;
  onConnect?: () => void;
  /** Starts the sheet open (stories). */
  defaultOpen?: boolean;
  className?: string;
}

const ROWS: readonly { kind: BalanceKind; label: string; icon: string; action: string }[] = [
  { kind: "usdc", label: "USDC", icon: "wallet", action: "Get USDC" },
  { kind: "paved", label: "PAVED", icon: "piggy-bank", action: "Vault" },
  { kind: "cobbles", label: "Cobbles", icon: "cubes-stacked", action: "Cobble shop" },
];

function Figure({ kind, state }: { kind: BalanceKind; state: Extract<BalancesState, { status: "ready" }> }) {
  const value = kind === "cobbles" ? state.cobbles : kind === "usdc" ? state.usdc : state.paved;
  if (value === undefined) return <Skeleton className="mt-1 h-4 w-20" />;
  if (kind === "cobbles") return value === null ? <span className="numeric">–</span> : <Cobbles value={value as number} />;
  return value === null ? <span className="numeric">–</span> : <Amount value={value as bigint} token={kind as "usdc" | "paved"} className="text-sm" />;
}

/** One balance: its figure, and a tap (at least 44 px high) to the place that acts on it. */
function Row({ kind, state, onAction }: { kind: BalanceKind; state: BalancesState; onAction?: (kind: BalanceKind) => void }) {
  const row = ROWS.find((r) => r.kind === kind)!;
  return (
    <button
      type="button"
      onClick={() => onAction?.(kind)}
      aria-label={`${row.label}: ${row.action}`}
      className="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Icon name={row.icon} size="sm" fixedWidth className="text-muted-foreground" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-xs text-muted-foreground">{row.label}</span>
        {state.status === "ready" ? <Figure kind={kind} state={state} /> : <Skeleton className="mt-1 h-4 w-20" />}
      </span>
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        {row.action}
        <Icon name="chevron-right" size="xs" />
      </span>
    </button>
  );
}

function Rows({ state, onAction, onConnect }: Pick<BalancesProps, "state" | "onAction" | "onConnect">) {
  if (state.status === "disconnected") {
    return (
      <div className="flex flex-col gap-2 px-3 py-2">
        <span className="text-xs text-muted-foreground">Connect to see your USDC, PAVED and Cobbles.</span>
        <Button size="sm" onClick={onConnect} loading={state.connecting}>
          Connect
        </Button>
      </div>
    );
  }
  if (state.status === "error") return <InlineError message={state.message} title="Balances" />;
  return (
    <div className="flex flex-col">
      {ROWS.map((r) => (
        <Row key={r.kind} kind={r.kind} state={state} onAction={onAction} />
      ))}
    </div>
  );
}

/** The pill's one figure: the Cobbles (the balance a player spends most). */
function PillFace({ state }: { state: BalancesState }) {
  if (state.status === "ready" && state.cobbles === undefined) return <Skeleton className="h-4 w-12" />;
  if (state.status === "ready") return state.cobbles === null ? <span>Balances</span> : <Cobbles value={state.cobbles} size="sm" />;
  if (state.status === "loading") return <Skeleton className="h-4 w-12" />;
  if (state.status === "error") return <Icon name="triangle-exclamation" size="sm" label="Balances unavailable" className="text-muted-foreground" />;
  return <span>Connect</span>;
}

/**
 * The balances at hand (#538), one component, two layouts. `pill`: a 40 px pill in the page header showing the Cobbles; a
 * tap opens a sheet with USDC, PAVED and Cobbles, each with its action (a guest's pill connects instead). `rail`: the
 * three balances at the bottom of the left rail, each a link. Disconnected: a Connect call; loading: skeletons; error: a
 * short inline error, never a toast.
 */
export function Balances({ layout, state, onAction, onConnect, defaultOpen = false, className }: BalancesProps) {
  const [open, setOpen] = useState(defaultOpen);
  if (layout === "rail") {
    return (
      <section aria-label="Balances" className={cn("hidden flex-col gap-1 border-t border-border pt-3 desktop:flex", className)}>
        <Rows state={state} onAction={onAction} onConnect={onConnect} />
      </section>
    );
  }
  const guest = state.status === "disconnected";
  return (
    <div className={cn("desktop:hidden", className)}>
      <Button
        variant="outline"
        className="h-10 rounded-full px-3"
        aria-label={guest ? "Connect" : "Balances"}
        aria-haspopup={guest ? undefined : "dialog"}
        onClick={() => (guest ? onConnect?.() : setOpen(true))}
        loading={guest ? state.connecting : undefined}
      >
        <PillFace state={state} />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>Balances</SheetTitle>
            <SheetDescription>Your wallet, at hand.</SheetDescription>
          </SheetHeader>
          <Rows
            state={state}
            onAction={(kind) => {
              setOpen(false);
              onAction?.(kind);
            }}
            onConnect={onConnect}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}
