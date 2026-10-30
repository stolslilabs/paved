import { formatUnits } from "@paved/game-core";
import * as m from "motion/react-m";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Skeleton } from "../ui/skeleton";
import { InlineError } from "../elements/inline-error";
import { ResourcePlate } from "../elements/resource-plate";
import { HEADER_BALANCES, hereOf } from "../../routes/header-balances";

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

/**
 * Where each balance leads: USDC to where it is got, PAVED to the Challenge's purchase where it is won (#871), vPAVED to the Vault
 * where PAVED becomes vPAVED, Cobbles to the packs (#621).
 */
export type BalanceKind = "usdc" | "paved" | "vpaved" | "cobbles";

/**
 * A balance a page shows (#855, `routes/header-balances.ts`): a kind, always shown, or `vpaved-held`, vPAVED only while the player
 * holds some (#620: the home's).
 */
export type ShownBalance = BalanceKind | "vpaved-held";

export interface BalancesProps {
  /**
   * The plates' size, the same balances either way (#855): `pill`, the phone's (below `desktop`, an error a mark); `rail`, the
   * larger plates from `desktop`. Each layout shows at every width: the slot hides it where the other one stands.
   */
  layout: "pill" | "rail";
  /**
   * The balances shown, in this order; omitted, the page's (`page`, #855: the rule's, `routes/header-balances.ts`, which this chunk
   * carries), or every one (vPAVED while held) without a page.
   */
  kinds?: readonly ShownBalance[];
  /** The open page's route (the shell's, #855): its balances and the plates that lead to it (`here`) are the rule's; `null`, none. */
  page?: string | null;
  /** `row`: side by side (a page's header, #781). `column`: one under the other, right-aligned (the home's top right, #828). */
  direction?: "row" | "column";
  state: BalancesState;
  /**
   * The balances whose page is the one open (#855, #871: vPAVED on the Vault, the Cobbles on the packs): no "+", no action.
   * Omitted, the page's (`page`).
   */
  here?: readonly BalanceKind[];
  onAction?: (kind: BalanceKind) => void;
  onConnect?: () => void;
  /** The network has a test-USDC faucet (devnet, Sepolia): USDC's action mints; without it USDC has no action here. */
  faucet?: boolean;
  /** The faucet mint is on its way. */
  minting?: boolean;
  /**
   * The row a `column` stands in and the control in it the column must not cover (#855: the home's top row and its League
   * control): when the widest plate does not fit right of it, the Cobbles stand alone (`data-crowded`, its rule in theme.css).
   */
  beside?: readonly [row: string, control: string];
  className?: string;
}

/** `page`: the balance leads to a page (the Challenge, the Vault, the packs), so its plate carries a "+" (#828); USDC's faucet is an action, not a page. */
const PLATES: Record<BalanceKind, { label: string; action: string; decimals: number; fraction: number; page: boolean }> = {
  usdc: { label: "USDC", action: "Get USDC", decimals: 6, fraction: 2, page: false },
  paved: { label: "PAVED", action: "Play a Challenge", decimals: 18, fraction: 2, page: true },
  vpaved: { label: "vPAVED", action: "Vault", decimals: 18, fraction: 2, page: true },
  cobbles: { label: "Cobbles", action: "Buy packs", decimals: 0, fraction: 0, page: true },
};
const EVERY: readonly ShownBalance[] = ["usdc", "paved", "vpaved-held", "cobbles"];
const kindOf = (shown: ShownBalance): BalanceKind => (shown === "vpaved-held" ? "vpaved" : shown);

/** A balance in base units (the Cobbles' count as is); null and undefined pass through. */
function amountOf(state: Ready, kind: BalanceKind): bigint | null | undefined {
  const value = state[kind];
  return typeof value === "number" ? BigInt(value) : value;
}

/** "USDC, PAVED and Cobbles": the balances' names in a sentence. */
function namesOf(kinds: readonly ShownBalance[]) {
  const labels = kinds.map((shown) => PLATES[kindOf(shown)].label);
  return labels.length < 2 ? labels.join("") : `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
}

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

/**
 * BALANCES-BY-PAGE (#855, the issue's second open point): a column that would crowd a control (`beside`: a box that holds both,
 * then the control), its widest plate (a large PAVED balance) wider than the room between the control and the column's right
 * edge, keeps the Cobbles alone (`data-crowded`). The control may arrive later (its own chunk): it is looked up at each measure,
 * watched for, then watched. The other plates
 * leave the flow, hidden, but keep their width, so the measure does not change with the answer. Their amounts stay on the Vault,
 * a tap away.
 */
function useCrowded(beside?: readonly [row: string, control: string]) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const column = ref.current;
    if (!beside || !column) return;
    const [rowOf, controlOf] = beside;
    const row = column.closest(rowOf);
    if (!row) return;
    const measure = () => {
      const plates = [...column.querySelectorAll<HTMLElement>("[data-kind]")];
      const control = row.querySelector(controlOf);
      // A plate's width follows its amount: each is watched once it has arrived (the column grows as they do), the control too.
      for (const box of [...plates, control]) if (box) sizes.observe(box);
      // The room between the control and the column's own right edge, where the plates end (#856: the control left the top row).
      const free = control ? column.getBoundingClientRect().right - control.getBoundingClientRect().right - 8 : Infinity;
      column.toggleAttribute("data-crowded", plates.length > 1 && Math.max(...plates.map((plate) => plate.offsetWidth)) > free);
    };
    const sizes = new ResizeObserver(measure);
    // The control's arrival (#856: its column's box is sized by its band, not by the control).
    const arrival = new MutationObserver(() => row.querySelector(controlOf) && (arrival.disconnect(), measure()));
    arrival.observe(row, { childList: true, subtree: true });
    // The row, and the column as its plates arrive.
    for (const box of [row, column]) sizes.observe(box);
    return () => {
      sizes.disconnect();
      arrival.disconnect();
    };
  }, [beside]);
  return ref;
}

/** The plates' size (#828): a 32 px box under a 48 px bare icon on a phone (`pill`), 36 under 52 from `desktop` (`rail`, #213). */
type PlateSize = "sm" | "md";
const holdOf = (size: PlateSize) => <Skeleton className={cn("rounded-lg", size === "md" ? "h-9 w-28" : "h-8 w-24")} />;

interface PlateTapProps {
  /** The amount a plate that just appeared counts from (vPAVED's first deposit). */
  from?: bigint;
  kind: BalanceKind;
  state: Ready;
  /** The plate's page is the one open: it leads nowhere. */
  here?: boolean;
  onAction?: (kind: BalanceKind) => void;
  faucet?: boolean;
  minting?: boolean;
  size: PlateSize;
  /** The plate shares a phone's row with another (the Vault's PAVED and vPAVED): its "+" from `mobile` only, so both fit 320 px (#871). */
  crowdedRow?: boolean;
}

/** A plate's action, and whether it has none: none on its own page; USDC mints only where there is a faucet, and not twice at once. */
function actionOf(kind: BalanceKind, here?: boolean, faucet?: boolean, minting?: boolean) {
  if (here) return { action: "", inert: true };
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
function PlateTap({ kind, from, state, here, onAction, faucet, minting, size, crowdedRow }: PlateTapProps) {
  const amount = amountOf(state, kind);
  if (amount === undefined) return holdOf(size);
  const { action, inert } = actionOf(kind, here, faucet, minting);
  const { decimals, fraction, page } = PLATES[kind];
  return (
    <m.button
      type="button"
      data-kind={kind}
      onClick={() => onAction?.(kind)}
      disabled={inert}
      aria-label={nameOf(kind, amount, action)}
      data-plate={kind}
      whileTap={inert ? undefined : { scale: 0.94 }}
      className="flex min-h-11 shrink-0 cursor-pointer items-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
    >
      <ResourcePlate kind={kind} amount={amount} from={from} decimals={decimals} fraction={fraction} size={size} plus={page && !here} plusFrom={crowdedRow ? "mobile" : undefined} tone={kind === "cobbles" ? "invite" : "default"} />
    </m.button>
  );
}

function Guest({ connecting, onConnect, names }: { connecting?: boolean; onConnect?: () => void; names?: string }) {
  return (
    <div className="flex items-center gap-2">
      {names && <span className="hidden text-xs text-muted-foreground wide:inline">Connect to see your {names}.</span>}
      <Button size="sm" onClick={onConnect} loading={connecting}>
        Connect
      </Button>
    </div>
  );
}

/**
 * The balances at hand (#538), as a game's resource bar (#620): each currency on its own plate (#828), its icon over the plate's
 * right end, the figure chunky, counting to each new value; a "+" over the left end where the balance leads to a page (the
 * Challenge, the Vault, the packs), none on that page itself (`here`). The Cobbles' plate stands apart (a gold edge, a slow shine) and leads to the packs; vPAVED leads to the Vault, and
 * joins when held where the page shows it so (`vpaved-held`). Only the page's balances (`kinds`, #855), the same on a phone
 * (`pill`) and from `desktop` (`rail`), in a row or a column (`direction`); none, nothing. Disconnected: Connect; loading:
 * skeleton plates; error: a short inline error (a mark on a phone, its message in its name), never a toast.
 */
export function Balances({ layout, page, direction = "row", state, onAction, onConnect, faucet, minting, beside, className, ...props }: BalancesProps) {
  // No page (a story's, a test's), every balance; a page that shows none (`null`, or a route the rule does not name), none.
  const kinds = props.kinds ?? (page === undefined ? EVERY : (HEADER_BALANCES[page as keyof typeof HEADER_BALANCES] ?? []));
  const here = props.here ?? (page == null ? undefined : hereOf(`/${page}`));
  const held = kinds.includes("vpaved-held");
  const crowded = useCrowded(beside);
  const vpaved = useVpavedPlate(held && state.status === "ready" ? state.vpaved : undefined);
  if (kinds.length === 0) return null;
  const size: PlateSize = layout === "rail" ? "md" : "sm";
  // The mount's count up serves the plate that joins with a first deposit; an always-shown plate counts as any other.
  const fromOf = (kind: BalanceKind) => (kind === "vpaved" && held ? vpaved.from : undefined);
  const shown = kinds.filter((kind) => kind !== "vpaved-held" || vpaved.shown).map(kindOf);
  // A phone's header row of two plates or more: their "+" from `mobile` (#871), the 320 px screen keeps both whole.
  const crowdedRow = size === "sm" && direction === "row" && shown.length > 1;
  return (
    <section
      ref={crowded}
      aria-label="Balances"
      data-direction={direction}
      className={cn("flex min-w-0", direction === "column" ? "flex-col items-end gap-3" : cn("items-center", size === "md" ? "gap-3" : "gap-2"), className)}
    >
      {state.status === "disconnected" ? (
        <Guest connecting={state.connecting} onConnect={onConnect} names={size === "md" ? namesOf(kinds) : undefined} />
      ) : state.status === "error" ? (
        size === "md" ? (
          <InlineError message={state.message} title="Balances" />
        ) : (
          <span role="img" aria-label={`Balances unavailable: ${state.message}`} title={state.message} className="grid size-11 place-items-center">
            <Icon name="triangle-exclamation" size="sm" className="text-muted-foreground" />
          </span>
        )
      ) : state.status === "loading" ? (
        // The plates' rows: a skeleton in each plate's place, nothing moves when they arrive.
        kinds
          .filter((shown) => shown !== "vpaved-held")
          .map((shown) => (
            <span key={shown} className="flex min-h-11 items-center">
              {holdOf(size)}
            </span>
          ))
      ) : (
        shown.map((kind) => (
          <PlateTap key={kind} kind={kind} from={fromOf(kind)} state={state} here={here?.includes(kind)} onAction={onAction} faucet={faucet} minting={minting} size={size} crowdedRow={crowdedRow} />
        ))
      )}
    </section>
  );
}
