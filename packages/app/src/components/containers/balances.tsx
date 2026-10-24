import { formatUnits } from "@paved/game-core";
import * as m from "motion/react-m";
import { useEffect, useState } from "react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
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
   * `pill`: the Cobbles' plate alone (a page's header below `desktop`, where Cobbles move: #720). `rail`: every balance in a
   * row, each a tap to its place (the navigation's header from `desktop`, a flow's top bar). Each layout shows at every width:
   * the slot hides it where the other one stands.
   */
  layout: "pill" | "rail";
  /** `rail`: the Cobbles left out, where the page draws its own plate (the village: the Cobbles never show twice, #720). */
  noCobbles?: boolean;
  state: BalancesState;
  onAction?: (kind: BalanceKind) => void;
  onConnect?: () => void;
  /** The network has a test-USDC faucet (devnet, Sepolia): USDC's action mints; without it USDC has no action here. */
  faucet?: boolean;
  /** The faucet mint is on its way. */
  minting?: boolean;
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

/** The balances a player sees: vPAVED only while it shows (`useVpavedPlate`), the Cobbles unless the page has its own. */
const shownKinds = (vpaved: boolean, noCobbles?: boolean) => ORDER.filter((kind) => (kind !== "vpaved" || vpaved) && (kind !== "cobbles" || !noCobbles));

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
  // `from` serves the plates that mount with the deposit; a plate mounted later shows the balance as a first load.
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

/** One balance in the bar: a plate (at least 44 px of tap with its padding) that leads to its place. */
function PlateTap({ kind, from, state, onAction, faucet, minting }: PlateTapProps) {
  const amount = amountOf(state, kind);
  if (amount === undefined) return <Skeleton className="h-8 w-20 rounded-full" />;
  const { action, inert } = actionOf(kind, faucet, minting);
  const { decimals, fraction } = PLATES[kind];
  return (
    <m.button
      type="button"
      onClick={() => onAction?.(kind)}
      disabled={inert}
      aria-label={nameOf(kind, amount, action)}
      whileTap={inert ? undefined : { scale: 0.94 }}
      className="flex min-h-11 shrink-0 cursor-pointer items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
    >
      <ResourcePlate kind={kind} amount={amount} from={from} decimals={decimals} fraction={fraction} plus={kind === "cobbles"} tone={kind === "cobbles" ? "invite" : "default"} />
    </m.button>
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
 * vPAVED joins when held and leads to the Vault. `pill` (a phone): the Cobbles alone (#720: no other currency on a phone; the
 * Vault shows PAVED and vPAVED in its content). `rail`: every balance in a row. Disconnected: Connect; loading: skeleton
 * plates; error: a short inline error (a mark on a phone, its message in its name), never a toast.
 */
export function Balances({ layout, state, onAction, onConnect, faucet, minting, noCobbles, className }: BalancesProps) {
  const vpaved = useVpavedPlate(state.status === "ready" ? state.vpaved : undefined);
  if (layout === "rail") {
    const fromOf = (kind: BalanceKind) => (kind === "vpaved" ? vpaved.from : undefined);
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
          shownKinds(vpaved.shown, noCobbles).map((kind) => <PlateTap key={kind} kind={kind} from={fromOf(kind)} state={state} onAction={onAction} faucet={faucet} minting={minting} />)
        )}
      </section>
    );
  }
  return (
    <section aria-label="Balances" className={cn("flex items-center", className)}>
      {state.status === "disconnected" ? (
        <Guest connecting={state.connecting} onConnect={onConnect} />
      ) : state.status === "error" ? (
        <span role="img" aria-label={`Balances unavailable: ${state.message}`} title={state.message} className="grid size-11 place-items-center">
          <Icon name="triangle-exclamation" size="sm" className="text-muted-foreground" />
        </span>
      ) : state.status === "ready" ? (
        <PlateTap kind="cobbles" state={state} onAction={onAction} />
      ) : (
        PLATE_HOLD
      )}
    </section>
  );
}
