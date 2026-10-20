import { formatUnits } from "@paved/game-core";
import * as m from "motion/react-m";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "../ui/sheet";
import { Skeleton } from "../ui/skeleton";
import { InlineError } from "../elements/inline-error";
import { ResourcePlate } from "../elements/resource-plate";

/** The wallet's balances as a page reads them. USDC, PAVED and vPAVED are tokens (base units); Cobbles are a ledger (a count). */
export type BalancesState =
  | { status: "disconnected"; connecting?: boolean }
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      /** Null: no source on this network, shown as a dash; undefined: the read is still out, a skeleton. */
      usdc: bigint | null | undefined;
      paved: bigint | null | undefined;
      /** The Vault's shares: shown only when the player holds some (#620). */
      vpaved?: bigint | null | undefined;
      cobbles: number | null | undefined;
    };
type Ready = Extract<BalancesState, { status: "ready" }>;

/** Where each balance leads: USDC to where it is got, PAVED and vPAVED to the Vault, Cobbles to the packs (#621). */
export type BalanceKind = "usdc" | "paved" | "vpaved" | "cobbles";

export interface BalancesProps {
  /**
   * `pill`: the Cobbles and USDC plates (a page's header below `desktop`, a flow's strip); the USDC plate opens a sheet with every
   * balance. `rail`: every balance in a row, each a tap to its place (the navigation's header from `desktop`, a flow's top bar).
   * Each layout shows at every width: the slot hides it where the other one stands.
   */
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

const PLATES: Record<BalanceKind, { label: string; action: string; decimals: number; fraction: number }> = {
  usdc: { label: "USDC", action: "Get USDC", decimals: 6, fraction: 2 },
  paved: { label: "PAVED", action: "Vault", decimals: 18, fraction: 2 },
  vpaved: { label: "vPAVED", action: "Vault", decimals: 18, fraction: 2 },
  cobbles: { label: "Cobbles", action: "Buy packs", decimals: 0, fraction: 0 },
};
const ORDER: readonly BalanceKind[] = ["usdc", "paved", "vpaved", "cobbles"];

/** A balance in base units (the Cobbles' count as is); null and undefined pass through. */
function amountOf(state: Ready, kind: BalanceKind): bigint | null | undefined {
  const value = state[kind];
  return typeof value === "number" ? BigInt(value) : value;
}

/** The balances a player sees: vPAVED only while it shows (`useVpavedPlate`). */
const shownKinds = (vpaved: boolean) => ORDER.filter((kind) => kind !== "vpaved" || vpaved);

/** How long a vPAVED plate stays once its balance falls to zero: its count down and its "−N" play out first. */
const VPAVED_LEAVE_MS = 2400;

/**
 * Whether the vPAVED plate shows, and what it counts from (issue 620). It shows while some is held. A first deposit mounts it
 * counting up from the zero before (`from`), so the gain animates like any other; a withdrawal to zero keeps it on screen at
 * 0.00 until its count down and its "−N" are over, then it leaves. Never animated from a missing value, as the plates.
 */
function useVpavedPlate(vpaved: bigint | null | undefined): { shown: boolean; from?: bigint } {
  const held = (vpaved ?? 0n) > 0n;
  const [seen, setSeen] = useState(vpaved);
  const [shown, setShown] = useState(held);
  const [from, setFrom] = useState<bigint | undefined>(undefined);
  if (vpaved !== seen) {
    setSeen(vpaved);
    const known = typeof seen === "bigint" && typeof vpaved === "bigint";
    if (held && !shown) {
      setShown(true);
      setFrom(known ? (seen as bigint) : undefined);
    }
    if (!held && shown && !known) setShown(false);
  }
  const leaving = shown && !held;
  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => setShown(false), VPAVED_LEAVE_MS);
    return () => clearTimeout(timer);
  }, [leaving]);
  // `from` serves the plates that mount with the deposit; a sheet opened later shows the balance as a first load.
  useEffect(() => {
    if (from === undefined) return;
    const timer = setTimeout(() => setFrom(undefined), VPAVED_LEAVE_MS);
    return () => clearTimeout(timer);
  }, [from]);
  return { shown, from };
}

interface PlateTapProps {
  /** The amount a plate that just appeared counts from (vPAVED's first deposit). */
  from?: bigint;
  kind: BalanceKind;
  state: Ready;
  onAction?: (kind: BalanceKind) => void;
  faucet?: boolean;
  minting?: boolean;
}

/** A plate's action, and whether it has none: USDC mints only where there is a faucet, and not twice at once. */
function actionOf(kind: BalanceKind, faucet?: boolean, minting?: boolean) {
  if (kind !== "usdc") return { action: PLATES[kind].action, inert: false };
  return { action: minting ? "Minting…" : faucet ? "Get test USDC" : "", inert: !faucet || Boolean(minting) };
}

/** The name a plate reads as: its figure and token, then its action ("240 Cobbles: Buy packs"). */
function nameOf(kind: BalanceKind, amount: bigint | null, action: string) {
  const { label, decimals, fraction } = PLATES[kind];
  const figure = amount === null ? `${label} unavailable` : `${formatUnits(amount, decimals, fraction)} ${label}`;
  return action ? `${figure}: ${action}` : figure;
}

/**
 * One balance in the bar: a plate (at least 44 px of tap with its padding) that leads to its place. `opens`: the plate opens
 * the sheet (the trigger's props come through `rest`), so it is a tap whatever its own action.
 */
function PlateTap({
  kind,
  from,
  state,
  onAction,
  faucet,
  minting,
  opens,
  children,
  ...rest
}: PlateTapProps & { opens?: boolean; children?: ReactNode; "aria-label"?: string; "aria-haspopup"?: "dialog" }) {
  const amount = amountOf(state, kind);
  if (amount === undefined) return <Skeleton className="h-8 w-20 rounded-full" />;
  const { action, inert: noAction } = actionOf(kind, faucet, minting);
  const inert = noAction && !opens;
  const { decimals, fraction } = PLATES[kind];
  return (
    <m.button
      type="button"
      onClick={() => onAction?.(kind)}
      disabled={inert}
      aria-label={nameOf(kind, amount, action)}
      whileTap={inert ? undefined : { scale: 0.94 }}
      className="flex min-h-11 shrink-0 cursor-pointer items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
      {...rest}
    >
      <ResourcePlate kind={kind} amount={amount} from={from} decimals={decimals} fraction={fraction} plus={kind === "cobbles"} tone={kind === "cobbles" ? "invite" : "default"}>
        {children}
      </ResourcePlate>
    </m.button>
  );
}

/** A row of the sheet: a large plate, the balance's name and its action. */
function SheetRow({ kind, from, state, onAction, faucet, minting }: PlateTapProps) {
  const amount = amountOf(state, kind);
  const { action, inert } = actionOf(kind, faucet, minting);
  const { label, decimals, fraction } = PLATES[kind];
  return (
    <button
      type="button"
      onClick={() => onAction?.(kind)}
      disabled={inert || amount === undefined}
      // The plate's figure is hidden from assistive technology: the row's name carries it ("48.50 USDC: Get test USDC").
      aria-label={amount === undefined ? (action ? `${label}: ${action}` : label) : nameOf(kind, amount, action)}
      aria-busy={amount === undefined || undefined}
      className="state-layer flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-xl px-2 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
    >
      {amount === undefined ? (
        <Skeleton className="h-11 w-32 rounded-full" />
      ) : (
        <ResourcePlate kind={kind} amount={amount} from={from} decimals={decimals} fraction={fraction} size="md" plus={kind === "cobbles"} tone={kind === "cobbles" ? "invite" : "default"} />
      )}
      <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
        <span className="hidden mobile:inline">{label}</span>
        {action && <span className="text-foreground">· {action}</span>}
        {action && !inert && <Icon name="chevron-right" size="xs" />}
      </span>
    </button>
  );
}

function Guest({ connecting, onConnect, wide }: { connecting?: boolean; onConnect?: () => void; wide?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {wide && <span className="hidden text-xs text-muted-foreground wide:inline">Connect to see your USDC, PAVED and Cobbles.</span>}
      <Button size="sm" onClick={onConnect} loading={connecting}>
        Connect
      </Button>
    </div>
  );
}

const PLATE_HOLD = <Skeleton className="h-8 w-20 rounded-full" />;

/**
 * The balances at hand (#538), as a game's resource bar (#620): each currency on its own plate, its icon as a coin, the figure
 * chunky, counting to each new value. The Cobbles' plate stands apart (a gold edge, a "+", a slow shine) and leads to the packs;
 * vPAVED joins when held and leads to the Vault. `pill` (a phone): the Cobbles and USDC; a tap on USDC opens a sheet with every
 * balance and its action. `rail`: every balance in a row. Disconnected: Connect; loading: skeleton plates; error: a short inline
 * error (in the sheet on a phone), never a toast.
 */
export function Balances({ layout, state, onAction, onConnect, faucet, minting, defaultOpen = false, className }: BalancesProps) {
  const [open, setOpen] = useState(defaultOpen);
  const vpaved = useVpavedPlate(state.status === "ready" ? state.vpaved : undefined);
  const fromOf = (kind: BalanceKind) => (kind === "vpaved" ? vpaved.from : undefined);
  if (layout === "rail") {
    return (
      <section aria-label="Balances" className={cn("flex min-w-0 items-center gap-1.5", className)}>
        {state.status === "disconnected" ? (
          <Guest connecting={state.connecting} onConnect={onConnect} wide />
        ) : state.status === "error" ? (
          <InlineError message={state.message} title="Balances" />
        ) : state.status === "loading" ? (
          <>
            {PLATE_HOLD}
            {PLATE_HOLD}
            {PLATE_HOLD}
          </>
        ) : (
          shownKinds(vpaved.shown).map((kind) => <PlateTap key={kind} kind={kind} from={fromOf(kind)} state={state} onAction={onAction} faucet={faucet} minting={minting} />)
        )}
      </section>
    );
  }
  if (state.status === "disconnected")
    return (
      <section aria-label="Balances" className={cn("flex items-center", className)}>
        <Guest connecting={state.connecting} onConnect={onConnect} />
      </section>
    );
  const pick = (kind: BalanceKind) => {
    if (kind !== "usdc") setOpen(false);
    onAction?.(kind);
  };
  return (
    <section aria-label="Balances" className={cn("flex items-center gap-1.5", className)}>
      <Sheet open={open} onOpenChange={setOpen}>
        {/* The USDC plate is the sheet's trigger, so that closing the sheet puts the focus back on it. */}
        {state.status === "ready" ? (
          <SheetTrigger asChild>
            <PlateTap kind="usdc" state={state} opens aria-label="Balances" aria-haspopup="dialog">
              <Icon name="chevron-right" size="xs" className="-ml-0.5 rotate-90 text-muted-foreground" />
            </PlateTap>
          </SheetTrigger>
        ) : state.status === "error" ? (
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="rounded-full" aria-label="Balances unavailable" aria-haspopup="dialog">
              <Icon name="triangle-exclamation" size="sm" className="text-muted-foreground" />
            </Button>
          </SheetTrigger>
        ) : (
          PLATE_HOLD
        )}
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>Balances</SheetTitle>
            <SheetDescription>Your wallet, at hand.</SheetDescription>
          </SheetHeader>
          {state.status === "ready" ? (
            <div className="flex flex-col gap-1 px-2 pb-2">
              {shownKinds(vpaved.shown).map((kind) => (
                <SheetRow key={kind} kind={kind} from={fromOf(kind)} state={state} onAction={pick} faucet={faucet} minting={minting} />
              ))}
            </div>
          ) : (
            <div className="px-4 pb-4">
              <InlineError message={state.status === "error" ? state.message : null} title="Balances" />
            </div>
          )}
        </SheetContent>
      </Sheet>
      {state.status === "ready" ? <PlateTap kind="cobbles" state={state} onAction={onAction} /> : PLATE_HOLD}
    </section>
  );
}
