import type { ReactNode } from "react";
import { formatInteger } from "@paved/game-core";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Skeleton } from "../ui/skeleton";
import { Cobbles } from "../elements/cobbles";
import { GOLD_ACTION, GoldShine } from "../elements/gold-action";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { LevelStar } from "../elements/level-star";
import { Notice } from "../elements/notice";
import { SectionTitle } from "../elements/section-title";
import { StatRow } from "../elements/stat-row";
import { BalancesSlot } from "../containers/balances-context";
import type { ShownBalance } from "../containers/balances";
import { DrawerFooter, HudDrawer } from "../containers/hud-drawer";

/** Where the page stands before the Town Hall is shown: the village on its way, or a read that failed (with Retry). */
export type TownHallStatus = { kind: "loading" } | { kind: "error"; message: string; detail?: ErrorDetail };

/** A Town Hall level of the rule: the tiles a village holds round it, and what the upgrade to it asks (nothing at level 1). */
export interface TownHallLevel {
  level: number;
  /** The tiles the village holds at this level, the Town Hall not counted. */
  tiles: number;
  /** The Cobbles of the upgrade to this level; 0 at level 1, the foundation. */
  price: number;
  /** The player level the upgrade to this level asks for. */
  playerLevel: number;
}

/** The player's Town Hall, as read with the village. */
export interface TownHallHeld {
  /** Its level, 1 to the last of `levels`. */
  level: number;
  /** The tiles placed round it. */
  placed: number;
  /** The player's level. */
  playerLevel: number;
  /** The Cobbles held; null while they are not read. */
  cobbles: number | null;
}

export interface TownHallSceneProps {
  status?: TownHallStatus | null;
  /** The player's Town Hall; null while `status` says why not, or where no Town Hall is served. */
  hall: TownHallHeld | null;
  /** Every level of the rule, the first to the last. */
  levels: readonly TownHallLevel[];
  /** The upgrade is on its way. */
  busy?: boolean;
  /** The last upgrade's refusal, in words. */
  refusal?: string | null;
  refusalDetail?: ErrorDetail;
  /** The drawer is open (its route the current one); omitted, open. */
  open?: boolean;
  /** Where the focus goes back on close: the village. */
  returnFocus?: () => HTMLElement | null;
  onUpgrade?: () => void;
  onDismissRefusal?: () => void;
  onRetry?: () => void;
  /** The Cobbles' packs, where the price is short. */
  onGetCobbles?: () => void;
  /** The drawer's close, back to the village. */
  onBack?: () => void;
}

/** The line under the drawer's title. */
const INTRO = "Upgrade it to hold more tiles.";
/** The balance at the header's end: the Cobbles an upgrade costs. */
const BALANCES: readonly ShownBalance[] = ["cobbles"];

const tilesWord = (n: number) => `${formatInteger(n)} ${n === 1 ? "tile" : "tiles"}`;

/** A press on a dialog over the drawer (the Cobbles' packs) is no tap on the village. */
const keepForDialogs = (event: Event) => {
  if ((event.target as Element | null)?.closest?.("[role=dialog], [role=alertdialog]")) event.preventDefault();
};

/** Why the upgrade is held, or null: the player's level first, then the Cobbles (the rule's order). */
function heldBy(hall: TownHallHeld, next: TownHallLevel): "level" | "cobbles" | null {
  if (hall.playerLevel < next.playerLevel) return "level";
  if (hall.cobbles !== null && hall.cobbles < next.price) return "cobbles";
  return null;
}

/** A level's row of the list: its number, its tiles, the player level and the Cobbles it asks; reached, a check in their place. */
function LevelRow({ row, state }: { row: TownHallLevel; state: "reached" | "current" | "next" | "later" }) {
  return (
    <li
      aria-current={state === "current" ? "true" : undefined}
      data-state={state}
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-xl px-3 py-2",
        state === "current" ? "drawer-tile ring-2 ring-primary" : "drawer-carved",
        state === "later" && "opacity-60",
      )}
    >
      <span className="text-outline w-16 shrink-0 font-display text-lg leading-tight">Level {row.level}</span>
      <span className="min-w-0 flex-1 text-sm font-semibold wrap-anywhere">{tilesWord(row.tiles)}</span>
      {state === "current" ? (
        <span className="text-outline shrink-0 text-sm font-bold">Yours</span>
      ) : state === "reached" ? (
        <Icon name="check" size="sm" label="Reached" className="shrink-0 text-success" />
      ) : (
        <span className="flex shrink-0 items-center gap-2">
          <LevelStar level={row.playerLevel} size="sm" />
          <Cobbles value={row.price} />
        </span>
      )}
    </li>
  );
}

/**
 * The Town Hall (`/town-hall`, TOWN-HALL-PAGE, in place of the upgrade's dialog): the HUD's drawer, opened by a tap on the Town Hall
 * of one's own village, docked at the right from `tablet`, the Cobbles at its header's end. Its level and the tiles the village holds
 * round it; the next level, what it brings and what it asks (the player's level, the Cobbles), each with what the player has; every
 * level of the rule in a list, the reached ones checked. The upgrade is the footer's gold action, with its price beside it, held
 * while the player's level or Cobbles are short, the reason in words; at the last level, no footer. The village on its way shows the
 * page's shape, a failed read has Retry, a refusal is the app's error with Dismiss.
 */
export function TownHallScene(props: TownHallSceneProps) {
  const { status, hall, levels, busy = false } = props;
  const current = hall ? (levels.find((l) => l.level === hall.level) ?? null) : null;
  const next = hall ? (levels.find((l) => l.level === hall.level + 1) ?? null) : null;
  const held = hall && next ? heldBy(hall, next) : null;

  let body: ReactNode;
  if (status?.kind === "error") {
    body = <InlineError title="The Town Hall cannot be read" message={status.message} detail={status.detail} action={<Button size="sm" onClick={props.onRetry}>Retry</Button>} />;
  } else if (status?.kind === "loading") {
    body = (
      <div role="status" aria-label="Reading the Town Hall" className="flex flex-col gap-3">
        <Skeleton className="h-9 w-40 rounded-lg" />
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-36 rounded-xl" />
      </div>
    );
  } else if (!hall || !current) {
    body = (
      <Notice tone="warning" title="No Town Hall here yet">
        This network has no Town Hall to upgrade yet. Your village keeps its tiles.
      </Notice>
    );
  } else {
    body = (
      <>
        <InlineError
          title="Upgrade refused"
          message={props.refusal}
          detail={props.refusalDetail}
          action={
            <Button size="sm" variant="outline" onClick={props.onDismissRefusal}>
              Dismiss
            </Button>
          }
        />
        <section aria-labelledby="town-hall-yours" className="flex flex-col gap-3">
          <SectionTitle id="town-hall-yours">Your Town Hall</SectionTitle>
          <div data-slot="town-hall-level" className="drawer-carved flex flex-col gap-1 rounded-2xl p-4">
            <span className="text-outline font-display text-4xl leading-tight">Level {hall.level}</span>
            <span className="text-sm text-muted-foreground">
              Your village holds <span className="font-semibold text-foreground">{tilesWord(current.tiles)}</span> round it;{" "}
              <span className="numeric font-semibold text-foreground">{formatInteger(Math.min(hall.placed, current.tiles))}</span> placed.
            </span>
          </div>
        </section>
        <section aria-labelledby="town-hall-next" className="flex flex-col gap-3">
          <SectionTitle id="town-hall-next">Next level</SectionTitle>
          {next ? (
            <div data-slot="town-hall-next" className="drawer-carved flex flex-col rounded-2xl px-4 py-2">
              <StatRow label="Tiles" value={`${formatInteger(current.tiles)} → ${formatInteger(next.tiles)}`} hint="The hall grows, and the village holds two more tiles." />
              <StatRow
                label="Player level"
                value={formatInteger(next.playerLevel)}
                tone={held === "level" ? "danger" : "default"}
                hint={held === "level" ? `It opens at player level ${next.playerLevel} (you are level ${hall.playerLevel}).` : `You are level ${hall.playerLevel}.`}
              />
              <StatRow
                label="Price"
                value={<Cobbles value={next.price} />}
                hint={
                  held === "cobbles" ? (
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span>Not enough Cobbles yet.</span>
                      {props.onGetCobbles && (
                        <Button size="sm" variant="outline" onClick={props.onGetCobbles}>
                          Get Cobbles
                        </Button>
                      )}
                    </span>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <Notice tone="info" title="Last level">
              Your Town Hall is at its last level.
            </Notice>
          )}
        </section>
        <section aria-labelledby="town-hall-levels" className="flex flex-col gap-3">
          <SectionTitle id="town-hall-levels">Levels</SectionTitle>
          <ol aria-labelledby="town-hall-levels" className="flex flex-col gap-2">
            {levels.map((row) => (
              <LevelRow key={row.level} row={row} state={row.level < hall.level ? "reached" : row.level === hall.level ? "current" : row.level === hall.level + 1 ? "next" : "later"} />
            ))}
          </ol>
        </section>
      </>
    );
  }

  const off = held !== null || busy || !props.onUpgrade;
  return (
    <HudDrawer
      open={props.open ?? true}
      onOpenChange={(to) => {
        if (!to) props.onBack?.();
      }}
      title="Town Hall"
      subtitle={INTRO}
      side="right"
      slot="town-hall"
      returnFocus={props.returnFocus}
      end={<BalancesSlot layout="pill" kinds={BALANCES} direction="column" />}
      onInteractOutside={keepForDialogs}
    >
      {body}
      {!status && hall && next && (
        <DrawerFooter>
          <div data-slot="town-hall-footer" className="flex min-h-16 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2">
            <span role="group" aria-label="Price" className="flex min-w-0 flex-col">
              <span className="text-sm leading-tight font-semibold text-muted-foreground">Level {next.level} for</span>
              <Cobbles value={next.price} className="text-outline text-lg font-bold" />
            </span>
            <Button
              variant="ghost"
              // The drawers' gold action (the Vault's), its light passing while it can be pressed.
              style={GOLD_ACTION}
              className="relative ml-auto h-12 min-w-36 shrink-0 px-1 text-lg font-black text-foreground mobile:text-xl"
              aria-label={`Upgrade to level ${next.level} for ${formatInteger(next.price)} ${next.price === 1 ? "Cobble" : "Cobbles"}`}
              onClick={off ? undefined : props.onUpgrade}
              disabled={off}
              loading={busy}
            >
              {!off && <GoldShine />}
              Upgrade
            </Button>
          </div>
        </DrawerFooter>
      )}
    </HudDrawer>
  );
}
