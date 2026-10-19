import { useState } from "react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "../ui/sheet";
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
  /** `pill`: a compact figure that opens a sheet (below `desktop`); `rail`: the three always visible, in a row at the end of the navigation's header (from `desktop`). */
  layout: "pill" | "rail";
  state: BalancesState;
  onAction?: (kind: BalanceKind) => void;
  onConnect?: () => void;
  /** The network has a test-USDC faucet (devnet, Sepolia): USDC's action mints; without it USDC has no action here. */
  faucet?: boolean;
  /** The faucet mint is on its way. */
  minting?: boolean;
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
function Row({ kind, state, onAction, faucet, minting, compact }: { kind: BalanceKind; state: BalancesState; onAction?: (kind: BalanceKind) => void; faucet?: boolean; minting?: boolean; compact?: boolean }) {
  const base = ROWS.find((r) => r.kind === kind)!;
  const row = kind === "usdc" ? { ...base, action: minting ? "Minting…" : faucet ? "Get test USDC" : "" } : base;
  const inert = kind === "usdc" && (!faucet || minting);
  return (
    <button
      type="button"
      onClick={() => onAction?.(kind)}
      disabled={inert}
      aria-label={row.action ? `${row.label}: ${row.action}` : row.label}
      className={cn(
        "state-layer flex min-h-11 cursor-pointer items-center gap-x-3 gap-y-1 rounded-lg px-3 py-2 text-left outline-none disabled:cursor-default focus-visible:ring-2 focus-visible:ring-ring",
        compact ? "gap-x-2 px-2.5 py-1" : "w-full flex-wrap",
      )}
    >
      <Icon name={row.icon} size="sm" fixedWidth className="text-muted-foreground" />
      <span className={cn("flex min-w-0 flex-col", !compact && "flex-1 basis-40")}>
        <span className="text-xs text-muted-foreground">{row.label}</span>
        {state.status === "ready" ? <Figure kind={kind} state={state} /> : <Skeleton className="mt-1 h-4 w-20" />}
      </span>
      {/* In the header the action is the row's name only (its `aria-label`); the sheet spells it out. */}
      {!compact && (
        <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
          {row.action}
          {row.action && !inert && <Icon name="chevron-right" size="xs" />}
        </span>
      )}
    </button>
  );
}

function Rows({ state, onAction, onConnect, faucet, minting, compact }: Pick<BalancesProps, "state" | "onAction" | "onConnect" | "faucet" | "minting"> & { compact?: boolean }) {
  if (state.status === "disconnected") {
    return (
      <div className={cn("flex gap-2", compact ? "items-center" : "flex-col px-3 py-2")}>
        <span className={cn("text-xs text-muted-foreground", compact && "hidden wide:inline")}>Connect to see your USDC, PAVED and Cobbles.</span>
        <Button size="sm" onClick={onConnect} loading={state.connecting}>
          Connect
        </Button>
      </div>
    );
  }
  if (state.status === "error") return <InlineError message={state.message} title="Balances" />;
  return (
    <div className={cn("flex", compact ? "flex-row items-center gap-1" : "flex-col")}>
      {ROWS.map((r) => (
        <Row key={r.kind} kind={r.kind} state={state} onAction={onAction} faucet={faucet} minting={minting} compact={compact} />
      ))}
    </div>
  );
}

/** The pill's one figure: the Cobbles (the balance a player spends most). */
function PillFace({ state }: { state: BalancesState }) {
  if (state.status === "ready") {
    const { cobbles } = state;
    if (cobbles === undefined) return <Skeleton className="h-4 w-12" />;
    return cobbles === null ? <span>Balances</span> : <Cobbles value={cobbles} size="sm" />;
  }
  if (state.status === "loading") return <Skeleton className="h-4 w-12" />;
  if (state.status === "error") return <Icon name="triangle-exclamation" size="sm" label="Balances unavailable" className="text-muted-foreground" />;
  return <span>Connect</span>;
}

/**
 * The balances at hand (#538), one component, two layouts. `pill`: a 40 px pill in the page header showing the Cobbles; a
 * tap opens a sheet with USDC, PAVED and Cobbles, each with its action (a guest's pill connects instead). `rail`: the
 * three balances in a row at the end of the navigation's header (direction D, #537), each a link. Disconnected: a Connect call; loading: skeletons; error: a
 * short inline error, never a toast.
 */
export function Balances({ layout, state, onAction, onConnect, faucet, minting, defaultOpen = false, className }: BalancesProps) {
  const [open, setOpen] = useState(defaultOpen);
  if (layout === "rail") {
    return (
      <section aria-label="Balances" className={cn("hidden shrink-0 items-center desktop:flex", className)}>
        <Rows state={state} onAction={onAction} onConnect={onConnect} faucet={faucet} minting={minting} compact />
      </section>
    );
  }
  const guest = state.status === "disconnected";
  const pill = (
    <Button
      variant="outline"
      className="h-10 rounded-full px-3"
      aria-label={guest ? "Connect" : "Balances"}
      aria-haspopup={guest ? undefined : "dialog"}
      onClick={guest ? onConnect : undefined}
      loading={guest ? state.connecting : undefined}
    >
      <PillFace state={state} />
    </Button>
  );
  return (
    <div className={cn("desktop:hidden", className)}>
      <Sheet open={open} onOpenChange={setOpen}>
        {/* The pill is the sheet's trigger, so that closing the sheet puts the focus back on it. */}
        {guest ? pill : <SheetTrigger asChild>{pill}</SheetTrigger>}
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>Balances</SheetTitle>
            <SheetDescription>Your wallet, at hand.</SheetDescription>
          </SheetHeader>
          <Rows
            state={state}
            onAction={(kind) => {
              if (kind !== "usdc") setOpen(false);
              onAction?.(kind);
            }}
            onConnect={onConnect}
            faucet={faucet}
            minting={minting}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}
