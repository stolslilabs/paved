import { useReducedMotionConfig } from "motion/react";
import * as m from "motion/react-m";
import { CHEST_CHOICES, CHEST_NAME, ChestBadge, type ChestRank } from "../elements/chest-badge";
import { Cobbles } from "../elements/cobbles";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { Notice } from "../elements/notice";
import { TileChip, type TileArt } from "../elements/tile-chip";
import { tileName } from "../elements/tile-render";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { ChestSlots, type ChestSlotsLook } from "../containers/chest-slots";
import { Skeleton } from "../ui/skeleton";
import { ChestReveal, type ChestDraw } from "../containers/chest-reveal";
import { SkinsStatusView, type SkinsStatus } from "../containers/skins-status";
import { TabFrame } from "../containers/tab-frame";
import { TopBar } from "../containers/top-bar";
import type { Tab } from "../../routes/pages";
import { cn } from "../../lib/utils";

/** A chest waiting to be opened (#736): its rank from the result, and where it was won. */
export interface Chest {
  id: number;
  rank: ChestRank;
  /** PvP (1, 2 or 3 stars) or Story (3 stars, the first time); unset when the read does not say. */
  source?: "pvp" | "story";
  /** What it was won on: "3 stars against Rook", "Campaign 2, level 5"; unset when the read does not say. */
  label?: string;
}

/** The tile just kept (and the Cobbles, if any): said until the next chest opens. */
export interface ChestTaken {
  plan: number;
  cobbles: number | null;
}

export interface VillageChestsSceneProps {
  /** Why the chests are not shown: a guest, the reads on their way, a failed read. */
  status?: SkinsStatus | null;
  chests?: readonly Chest[];
  /** The chests open in the order won (the rules', #741): only the first waiting can be opened. */
  inOrder?: boolean;
  /** The PvP chests won today (at most 3 a day, #732): the slots filled. */
  pvpToday?: number;
  /** Their ranks in the order won, when the read gives them (the mock ledger does not yet): each filled slot shows its chest. */
  pvpRanks?: readonly ChestRank[];
  /** The slots just came back (the reset reached while on the page): "Ready" for a short while. Also when `now` reaches `resetsAt`. */
  ready?: boolean;
  /** The hero's direction (#759): `pedestals`, the one kept, or `dial`. */
  look?: ChestSlotsLook;
  /** Seconds since the epoch: the next UTC day, when the day's PvP chests count again from 0. */
  resetsAt?: number;
  /** Seconds since the epoch: the scene's clock. */
  now?: number;
  /** A chest being opened: its draw, once the chain drew it (VRF). */
  opened?: { chestId: number; draw: ChestDraw } | null;
  /** The chest whose opening is on its way: its draw waits. */
  opening?: number | null;
  taken?: ChestTaken | null;
  /** The choice on its way. */
  busy?: boolean;
  refusal?: string | null;
  refusalDetail?: ErrorDetail;
  /** How many of each plan the player holds (the inventory and the layout). */
  owned?: Readonly<Record<number, number>>;
  tileArt?: TileArt;
  /** Where the stories start: a tile chosen in the open chest. */
  initialChoice?: number | null;
  onBack?: () => void;
  /** A pick in the phone's bar (#763): the page is the Chests tab's. */
  onNavigate?: (tab: Tab) => void;
  /** To the mode choice: win stars to fill a slot. */
  onPlay?: () => void;
  onConnect?: () => void;
  onRetry?: () => void;
  onOpen?: (chestId: number) => void;
  onTake?: (chestId: number, index: number) => void;
  onDismissRefusal?: () => void;
  onEditLayout?: () => void;
}

/**
 * The chests (#739, part of #732): the chests won and not opened yet, by rank (bronze one tile, silver one of 2, gold one of
 * 3), and the day's PvP chests left (3 a day; Story chests do not count). Livelier since #759: the day's three slots are the hero
 * (`ChestSlots`), with the reset's countdown ticking at their side, and the waiting chests are large art that wobbles when it
 * can be opened. A tap draws a chest's tiles; the tile kept goes to the inventory, with the Cobbles the chest may hold. Data and writes come as props and callbacks: the page wires them to the v2
 * chests (#736) in a later task.
 */
export function VillageChestsScene({
  status,
  chests = [],
  inOrder = false,
  pvpToday = 0,
  pvpRanks,
  ready = false,
  look = "pedestals",
  resetsAt,
  now,
  opened = null,
  opening = null,
  taken = null,
  busy,
  refusal = null,
  refusalDetail,
  owned,
  tileArt,
  initialChoice,
  onBack,
  onNavigate,
  onPlay,
  onConnect,
  onRetry,
  onOpen,
  onTake,
  onDismissRefusal,
  onEditLayout,
}: VillageChestsSceneProps) {
  const reduced = useReducedMotionConfig() ?? false;
  const waiting = chests.filter((c) => c.id !== opened?.chestId);
  // The reset reached on the scene's own clock: the day's slots are free, whatever the read still says.
  const reset = ready || (resetsAt != null && now != null && now >= resetsAt);
  const empty = waiting.length === 0 && !opened;
  return (
    <TabFrame tab="chests" onNavigate={onNavigate}>
      <div className="flex min-h-full flex-col bg-background">
        <TopBar title="Chests" onBack={onBack} />
        <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {status ? (
            <SkinsStatusView
              status={status}
              guestTitle="Connect to open your chests"
              guestText="Chests come with your stars: in PvP 1 star gives a bronze chest, 2 a silver one, 3 a gold one."
              errorTitle="The chests could not be read"
              skeleton={
                <div className="flex flex-col gap-3">
                  <Skeleton className="h-80 w-full rounded-2xl" />
                  <Skeleton className="h-40 w-full rounded-2xl" />
                </div>
              }
              onConnect={onConnect}
              onRetry={onRetry}
            />
          ) : (
            <div className="flex flex-col gap-4">
              <ChestSlots
                won={pvpToday}
                ranks={pvpRanks}
                resetsAt={reset && !ready ? undefined : resetsAt}
                now={now}
                ready={reset}
                look={look}
                onPlay={empty ? undefined : onPlay}
                className={cn(opened && "order-2")}
              />
              <div className="flex flex-col gap-4">
                <InlineError
                  title="Not done"
                  message={refusal}
                  detail={refusalDetail}
                  action={
                    onDismissRefusal && (
                      <Button size="sm" variant="ghost" onClick={onDismissRefusal}>
                        Dismiss
                      </Button>
                    )
                  }
                />
                {taken && !opened && (
                  <Notice icon="circle-check" title="Added to your inventory" action={onEditLayout && <Button size="sm" variant="outline" onClick={onEditLayout}>Edit layout</Button>}>
                    <span className="inline-flex flex-wrap items-center gap-2">
                      <TileChip plan={taken.plan} art={tileArt} size="sm" className="border-0" />
                      {tileName(taken.plan)}
                      {taken.cobbles != null && <Cobbles value={taken.cobbles} sign="+" size="sm" />}
                    </span>
                  </Notice>
                )}
                {opened && (
                  <ChestReveal key={opened.chestId} draw={opened.draw} owned={owned} initialChoice={initialChoice} busy={busy} tileArt={tileArt} onTake={(i) => onTake?.(opened.chestId, i)} />
                )}
                {waiting.length > 0 ? (
                  <section aria-labelledby="chests-title" className="flex flex-col gap-3">
                    <h2 id="chests-title" className="flex items-center gap-1.5 font-display text-lg">
                      Waiting <span className="numeric rounded-full bg-primary/15 px-2 text-sm text-primary">{waiting.length}</span>
                    </h2>
                    <ul className="grid grid-cols-2 gap-3">
                      {waiting.map((chest, i) => {
                        const locked = inOrder && i > 0;
                        const disabled = opened != null || (opening != null && opening !== chest.id) || busy || locked;
                        // The chest that can be opened now wobbles; the others wait still.
                        const lively = !disabled && !reduced && opening == null;
                        return (
                          <li key={chest.id} className={cn(waiting.length % 2 === 1 && i === 0 && "col-span-2")}>
                            <Button
                              variant="outline"
                              disabled={disabled}
                              loading={opening === chest.id}
                              onClick={() => onOpen?.(chest.id)}
                              aria-label={`Open the ${CHEST_NAME[chest.rank].toLowerCase()}: ${CHEST_CHOICES[chest.rank] === 1 ? "one tile" : `one of ${CHEST_CHOICES[chest.rank]} tiles`}`}
                              className={cn("h-full w-full flex-col gap-2 rounded-2xl bg-card px-3 py-4 whitespace-normal", locked && "opacity-60 disabled:opacity-60")}
                            >
                              <m.span
                                data-wobble={lively ? "" : undefined}
                                animate={lively ? { rotate: [0, -7, 7, -4, 4, 0], y: [0, -4, 0, -2, 0, 0] } : { rotate: 0, y: 0 }}
                                transition={lively ? { duration: 0.9, repeat: Infinity, repeatDelay: 2.2, ease: "easeInOut" } : { duration: 0.2 }}
                                className="py-2"
                              >
                                <ChestBadge rank={chest.rank} size={locked ? "lg" : "xl"} glow={!locked} />
                              </m.span>
                              <span className="text-sm font-semibold">{CHEST_NAME[chest.rank]}</span>
                              {(chest.source || chest.label) && (
                                <span className="text-xs font-normal text-muted-foreground">
                                  {[chest.source && (chest.source === "pvp" ? "PvP" : "Story"), chest.label].filter(Boolean).join(" · ")}
                                </span>
                              )}
                              <span className={cn("flex items-center gap-1 text-xs", locked ? "font-normal text-muted-foreground" : "text-primary")}>
                                {locked ? (
                                  <>
                                    <Icon name="lock" size="xs" /> Opens after the one before
                                  </>
                                ) : opening === chest.id ? (
                                  "Opening…"
                                ) : disabled ? (
                                  <span className="font-normal text-muted-foreground">Waits its turn</span>
                                ) : (
                                  "Tap to open"
                                )}
                              </span>
                            </Button>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ) : (
                  empty && (
                    <section aria-labelledby="none-title" className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-border px-4 py-6 text-center">
                      <Icon name="treasure-chest" size="2xl" className="text-muted-foreground/50" />
                      <h2 id="none-title" className="font-display text-lg">
                        No chest waiting
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        Win stars to fill a slot: in PvP, 1 star gives a bronze chest, 2 a silver one, 3 a gold one; in Story, 3 stars on a level the first time.
                      </p>
                      {onPlay && (
                        <Button onClick={onPlay}>
                          <Icon name="swords" size="sm" /> Choose a mode
                        </Button>
                      )}
                    </section>
                  )
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </TabFrame>
  );
}
