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
   * `pill`: the Cobbles' plate alone (the home's and every page's header below `desktop`, #781). `rail`: every balance in a
   * row, each a tap to its place (the same from `desktop`). Each layout shows at every width:
   * the slot hides it where the other one stands.
   */
  layout: "pill" | "rail";
  /**
   * `row`: side by side (a page's header, #781). `column`: one under the other, right-aligned (the home's top right, #828). The
   * pill's one plate is the same either way.
   */
  direction?: "row" | "column";
  state: BalancesState;
  onAction?: (kind: BalanceKind) => void;
  onConnect?: () => void;
  /** The network has a test-USDC faucet (devnet, Sepolia): USDC's action mints; without it USDC has no action here. */
  faucet?: boolean;
  /** The faucet mint is on its way. */
  minting?: boolean;
  className?: string;
}

/** `page`: the balance leads to a page (the Vault, the packs), so its plate carries a "+" (#828); USDC's faucet is an action, not a page. */
const PLATES: Record<BalanceKind, { label: string; action: string; decimals: number; fraction: number; page: boolean }> = {
  usdc: { label: "USDC", action: "Get USDC", decimals: 6, fraction: 2, page: false },
  paved: { label: "PAVED", action: "Vault", decimals: 18, fraction: 2, page: true },
  vpaved: { label: "vPAVED", action: "Vault", decimals: 18, fraction: 2, page: true },
  cobbles: { label: "Cobbles", action: "Buy packs", decimals: 0, fraction: 0, page: true },
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
  // `from` serves the plates that mount with the deposit; a plate mounted later shows the balance as a first load.
  useEffect(() => {
    if (from === undefined) return;
    const timer = setTimeout(() => setFrom(undefined), VPAVED_LEAVE_MS);
    return () => clearTimeout(timer);
  }, [from]);
  return { shown, from };
}

/** The plates' size (#828): a 32 px box under a 48 px bare icon on a phone (`pill`), 36 under 52 from `desktop` (`rail`, #213). */
type PlateSize = "sm" | "md";
const holdOf = (size: PlateSize) => <Skeleton className={cn("rounded-lg", size === "md" ? "h-9 w-28" : "h-8 w-24")} />;

interface PlateTapProps {
  /** The amount a plate that just appeared counts from (vPAVED's first deposit). */
  from?: bigint;
  kind: BalanceKind;
  state: Ready;
  onAction?: (kind: BalanceKind) => void;
  faucet?: boolean;
  minting?: boolean;
  size: PlateSize;
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

/** One balance in the bar: a plate (at least 44 px of tap with the icon's overhang) that leads to its place, the whole plate a tap. */
function PlateTap({ kind, from, state, onAction, faucet, minting, size }: PlateTapProps) {
  const amount = amountOf(state, kind);
  if (amount === undefined) return holdOf(size);
  const { action, inert } = actionOf(kind, faucet, minting);
  const { decimals, fraction, page } = PLATES[kind];
  return (
    <m.button
      type="button"
      onClick={() => onAction?.(kind)}
      disabled={inert}
      aria-label={nameOf(kind, amount, action)}
      whileTap={inert ? undefined : { scale: 0.94 }}
      className="flex min-h-11 shrink-0 cursor-pointer items-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
    >
      <ResourcePlate kind={kind} amount={amount} from={from} decimals={decimals} fraction={fraction} size={size} plus={page} tone={kind === "cobbles" ? "invite" : "default"} />
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

/**
 * The balances at hand (#538), as a game's resource bar (#620): each currency on its own plate (#828), its icon over the plate's
 * right end, the figure chunky, counting to each new value; a "+" over the left end where the balance leads to a page (the Vault,
 * the packs). The Cobbles' plate stands apart (a gold edge, a slow shine) and leads to the packs; vPAVED joins when held and
 * leads to the Vault. `pill` (a phone): the Cobbles alone (#720: no other currency on a phone; the Vault shows PAVED and vPAVED in
 * its content). `rail`: every balance, in a row or a column (`direction`). Disconnected: Connect; loading: skeleton plates;
 * error: a short inline error (a mark on a phone, its message in its name), never a toast.
 */
export function Balances({ layout, direction = "row", state, onAction, onConnect, faucet, minting, className }: BalancesProps) {
  const vpaved = useVpavedPlate(state.status === "ready" ? state.vpaved : undefined);
  if (layout === "rail") {
    const fromOf = (kind: BalanceKind) => (kind === "vpaved" ? vpaved.from : undefined);
    return (
      <section aria-label="Balances" data-direction={direction} className={cn("flex min-w-0", direction === "column" ? "flex-col items-end gap-2" : "items-center gap-3", className)}>
        {state.status === "disconnected" ? (
          <Guest connecting={state.connecting} onConnect={onConnect} wide />
        ) : state.status === "error" ? (
          <InlineError message={state.message} title="Balances" />
        ) : state.status === "loading" ? (
          // The plates' rows: a skeleton in each plate's place, nothing moves when they arrive.
          ORDER.filter((kind) => kind !== "vpaved").map((kind) => (
            <span key={kind} className="flex min-h-11 items-center">
              {holdOf("md")}
            </span>
          ))
        ) : (
          shownKinds(vpaved.shown).map((kind) => <PlateTap key={kind} kind={kind} from={fromOf(kind)} state={state} onAction={onAction} faucet={faucet} minting={minting} size="md" />)
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
        <PlateTap kind="cobbles" state={state} onAction={onAction} size="sm" />
      ) : (
        holdOf("sm")
      )}
    </section>
  );
}
