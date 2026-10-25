import { Countdown } from "../elements/countdown";
import { CHEST_CHOICES, CHEST_NAME, ChestBadge, type ChestRank } from "../elements/chest-badge";
import { Cobbles } from "../elements/cobbles";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { Notice } from "../elements/notice";
import { TileChip, type TileArt } from "../elements/tile-chip";
import { tileName } from "../elements/tile-render";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Skeleton } from "../ui/skeleton";
import { ChestReveal, type ChestDraw } from "../containers/chest-reveal";
import { PVP_CHESTS_A_DAY } from "../containers/layout-rules";
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
  /** The PvP chests won today (at most 3 a day, #732). */
  pvpToday?: number;
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
  onConnect?: () => void;
  onRetry?: () => void;
  onOpen?: (chestId: number) => void;
  onTake?: (chestId: number, index: number) => void;
  onDismissRefusal?: () => void;
  onEditLayout?: () => void;
}

/**
 * The chests (#739, part of #732): the chests won and not opened yet, by rank (bronze one tile, silver one of 2, gold one of
 * 3), and the day's PvP chests left (3 a day; Story chests do not count). Open draws a chest's tiles; the tile kept goes to the
 * inventory, with the Cobbles the chest may hold. Data and writes come as props and callbacks: the page wires them to the v2
 * chests (#736) in a later task.
 */
export function VillageChestsScene({
  status,
  chests = [],
  inOrder = false,
  pvpToday = 0,
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
  onConnect,
  onRetry,
  onOpen,
  onTake,
  onDismissRefusal,
  onEditLayout,
}: VillageChestsSceneProps) {
  const left = Math.max(0, PVP_CHESTS_A_DAY - pvpToday);
  const waiting = chests.filter((c) => c.id !== opened?.chestId);
  return (
    <TabFrame tab="chests" onNavigate={onNavigate} desktop="none">
      <div className="flex min-h-full flex-col bg-background">
        <TopBar title="Chests" onBack={onBack} />
        <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] desktop:max-w-4xl">
          {status ? (
            <SkinsStatusView
              status={status}
              guestTitle="Connect to open your chests"
              guestText="Chests come with your stars: in PvP 1 star gives a bronze chest, 2 a silver one, 3 a gold one."
              errorTitle="The chests could not be read"
              skeleton={
                <div className="flex flex-col gap-3">
                  <Skeleton className="h-16 w-full rounded-xl" />
                  <Skeleton className="h-20 w-full rounded-xl" />
                  <Skeleton className="h-20 w-full rounded-xl" />
                </div>
              }
              onConnect={onConnect}
              onRetry={onRetry}
            />
          ) : (
            <div className="flex flex-col gap-4 desktop:grid desktop:grid-cols-[1fr_22rem] desktop:items-start">
              <div className="flex flex-col gap-4 desktop:order-2">
                <section aria-label="Today's PvP chests" className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">PvP chests today</span>
                    <span className="text-sm" aria-label={`${left} of ${PVP_CHESTS_A_DAY} left today`}>
                      <span className="numeric font-semibold">{left}</span>
                      <span className="text-muted-foreground"> / {PVP_CHESTS_A_DAY} left</span>
                    </span>
                  </div>
                  <div aria-hidden className="flex gap-1.5">
                    {Array.from({ length: PVP_CHESTS_A_DAY }, (_, i) => (
                      <span key={i} className={cn("h-1.5 flex-1 rounded-full", i < pvpToday ? "bg-muted-foreground/40" : "bg-primary")} />
                    ))}
                  </div>
                  {resetsAt != null && now != null && (
                    <Countdown expiresAt={resetsAt} now={now} label={left === 0 ? "More chests in" : "Resets in"} className="self-start" />
                  )}
                  {left === 0 && <p className="text-xs text-muted-foreground">Today's PvP chests are won: attacks still win crowns and XP.</p>}
                </section>
                <p className="hidden text-xs text-muted-foreground desktop:block">
                  Bronze: one tile. Silver: keep one of 2. Gold: keep one of 3. A chest may also hold Cobbles, more often the higher its rank and your league.
                </p>
              </div>
              <div className="flex flex-col gap-4 desktop:order-1">
                {refusal && (
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
                )}
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
                  <section aria-labelledby="chests-title" className="flex flex-col gap-2">
                    <h2 id="chests-title" className="flex items-center gap-1 text-sm font-semibold">
                      Waiting <span className="numeric text-muted-foreground">{waiting.length}</span>
                    </h2>
                    <ul className="flex flex-col gap-2">
                      {waiting.map((chest, i) => (
                        <li key={chest.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                          <ChestBadge rank={chest.rank} size="sm" />
                          <div className="flex min-w-0 flex-1 flex-col">
                            <span className="text-sm font-semibold">{CHEST_NAME[chest.rank]}</span>
                            {(chest.source || chest.label) && (
                              <span className="text-xs text-muted-foreground">
                                {[chest.source && (chest.source === "pvp" ? "PvP" : "Story"), chest.label].filter(Boolean).join(" · ")}
                              </span>
                            )}
                            {inOrder && i > 0 && <span className="text-xs text-muted-foreground">Opens after the one above</span>}
                          </div>
                          <Button
                            size="sm"
                            disabled={opened != null || (opening != null && opening !== chest.id) || busy || (inOrder && i > 0)}
                            loading={opening === chest.id}
                            onClick={() => onOpen?.(chest.id)}
                            aria-label={`Open the ${CHEST_NAME[chest.rank].toLowerCase()}: ${CHEST_CHOICES[chest.rank] === 1 ? "one tile" : `one of ${CHEST_CHOICES[chest.rank]} tiles`}`}
                          >
                            Open
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : (
                  !opened && (
                    <Notice icon="gift" title="No chest waiting">
                      Win stars to earn one: in PvP, 1 star gives a bronze chest, 2 a silver one, 3 a gold one; in Story, 3 stars on a level the first time.
                    </Notice>
                  )
                )}
                {opened == null && waiting.length > 0 && (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground desktop:hidden">
                    <Icon name="circle-info" size="xs" /> A chest may also hold Cobbles, more often the higher its rank.
                  </p>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </TabFrame>
  );
}
