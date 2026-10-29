import { useState } from "react";
import { CHEST_NAME, type ChestRank } from "../elements/chest-badge";
import { Cobbles } from "../elements/cobbles";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { Notice } from "../elements/notice";
import { TileChip, type TileArt } from "../elements/tile-chip";
import { tileName } from "../elements/tile-render";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { ChestModal, type Chest, type ChestTaken } from "../containers/chest-modal";
import { ChestSlots, type ChestSlotsLook } from "../containers/chest-slots";
import { Skeleton } from "../ui/skeleton";
import type { ChestDraw } from "../containers/chest-reveal";
import { SkinsStatusView, type SkinsStatus } from "../containers/skins-status";
import { TabFrame } from "../containers/tab-frame";
import { TopBar } from "../containers/top-bar";
import type { Tab } from "../../routes/pages";

export type { Chest, ChestTaken };

export interface VillageChestsSceneProps {
  /** Why the chests are not shown: a guest, the reads on their way, a failed read. */
  status?: SkinsStatus | null;
  chests?: readonly Chest[];
  /** The chests open only in the order won: the modal shows the first waiting. Otherwise (the default, #784) PvP first, then Story, or the slot tapped. */
  inOrder?: boolean;
  /** The PvP chests won today (at most 3 a day, #732): the slots filled. */
  pvpToday?: number;
  /** Of those, the slots whose chest was opened already (#784), by index: they show a grey, disabled chest. */
  pvpOpened?: readonly number[];
  /** Their ranks by slot, when the read gives them; unset, a slot takes the rank of the chest that names it (`Chest.slot`). */
  pvpRanks?: readonly (ChestRank | undefined)[];
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
  /** The modal opens by itself on arrival while a chest is ready (#784, the default); false: the page alone, the stories' slots. */
  initialModalOpen?: boolean;
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
 * The chests (#739, part of #732; livelier since #759; #784): the day's three PvP slots are the hero (`ChestSlots`), each saying
 * its state (free, won in its rank's colour, opened and grey), with the reset's countdown ticking at their side. A ready chest
 * opens in a modal on arrival (`ChestModal`): it shakes at the centre, a tap bursts it open with light and sound, its tiles fly
 * out and the choice keeps one; then the next chest, PvP first and then Story (which take no slot), or the page. Closed, the
 * modal stays closed for the visit; a won slot or "Open your chests" brings it back. The tile kept goes to the inventory, with
 * the Cobbles the chest may hold. Data and writes come as props and callbacks: the page wires them to the v2 chests (#736).
 */
export function VillageChestsScene({
  status,
  chests = [],
  inOrder = false,
  pvpToday = 0,
  pvpOpened,
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
  initialModalOpen = true,
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
  // Closed by the player: closed for the visit (#784, open point 3), until a slot or "Open your chests" asks for it again.
  const [dismissed, setDismissed] = useState(!initialModalOpen);
  // The tile kept that "Next chest" has passed: the modal then shows the next chest.
  const [passed, setPassed] = useState<ChestTaken | null>(null);
  // A won slot tapped, when the chests need not open in order: its chest at the centre.
  const [picked, setPicked] = useState<number | null>(null);
  const waiting = chests.filter((c) => c.id !== opened?.chestId);
  const queue = inOrder ? waiting : [...waiting.filter((c) => c.source !== "story"), ...waiting.filter((c) => c.source === "story")];
  const current = (!inOrder && queue.find((c) => c.id === picked)) || queue[0] || null;
  const said = taken && taken !== passed && !opened ? taken : null;
  const more = opened || said ? queue.length : Math.max(0, queue.length - 1);
  const modal = !status && !dismissed && (opened != null || said != null || current != null);
  // The reset reached on the scene's own clock: the day's slots are free, whatever the read still says.
  const reset = ready || (resetsAt != null && now != null && now >= resetsAt);
  const empty = waiting.length === 0 && !opened;
  const ranks = Array.from({ length: Math.max(pvpToday, 0) }, (_, i) => pvpRanks?.[i] ?? chests.find((c) => c.slot === i)?.rank);
  // A chest asked for (a won slot, "Open your chests"): it, not the tile kept before, which the page itself still says.
  const show = (chestId?: number) => {
    setDismissed(false);
    setPicked(chestId ?? null);
    setPassed(taken);
  };
  return (
    <TabFrame tab="chests" onNavigate={onNavigate}>
      <TopBar title="Chests" onBack={onBack} />
      <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {status ? (
          <SkinsStatusView
            status={status}
            guestTitle="Connect to open your chests"
            guestText="Chests come with your stars: in PvP 1 star gives a basic chest, 2 a rare one, 3 an epic one."
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
              opened={pvpOpened}
              ranks={ranks}
              resetsAt={reset && !ready ? undefined : resetsAt}
              now={now}
              ready={reset}
              look={look}
              onPlay={empty ? undefined : onPlay}
              // A chest drawn and not kept yet comes first: no other slot opens until its tile is chosen (said under the slots).
              onOpenSlot={opened ? undefined : (i) => show(chests.find((c) => c.slot === i)?.id)}
            />
            <InlineError
              title="Not done"
              message={modal ? null : refusal}
              detail={refusalDetail}
              action={
                onDismissRefusal && (
                  <Button size="sm" variant="ghost" onClick={onDismissRefusal}>
                    Dismiss
                  </Button>
                )
              }
            />
            {taken && !opened && !modal && (
              <Notice icon="circle-check" title="Added to your inventory" action={onEditLayout && <Button size="sm" variant="outline" onClick={onEditLayout}>Edit layout</Button>}>
                <span className="inline-flex flex-wrap items-center gap-2">
                  <TileChip plan={taken.plan} art={tileArt} size="sm" className="border-0" />
                  {tileName(taken.plan)}
                  {taken.cobbles != null && <Cobbles value={taken.cobbles} sign="+" size="sm" />}
                </span>
              </Notice>
            )}
            {!modal && opened && (
              <p role="status" className="text-center text-sm text-muted-foreground">
                Your {CHEST_NAME[opened.draw.rank].toLowerCase()} is open: keep one of its tiles before the next chest.
              </p>
            )}
            {!modal && (waiting.length > 0 || opened) && (
              <Button size="lg" onClick={() => show()} className="self-center">
                <Icon name="treasure-chest" size="sm" /> {opened ? "Back to the open chest" : "Open your chests"}
                {!opened && (
                  <>
                    {" · "}
                    <span className="numeric">{waiting.length}</span>
                  </>
                )}
              </Button>
            )}
            {empty && (
              <section aria-labelledby="none-title" className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-border px-4 py-6 text-center">
                <Icon name="treasure-chest" size="2xl" className="text-muted-foreground/50" />
                <h2 id="none-title" className="font-display text-lg">
                  No chest waiting
                </h2>
                <p className="text-sm text-muted-foreground">
                  Win stars to fill a slot: in PvP, 1 star gives a basic chest, 2 a rare one, 3 an epic one; in Story, 3 stars on a level the first time.
                </p>
                {onPlay && (
                  <Button onClick={onPlay}>
                    <Icon name="swords" size="sm" /> Choose a mode
                  </Button>
                )}
              </section>
            )}
          </div>
        )}
      </main>
      <ChestModal
        open={modal}
        onClose={() => {
          setDismissed(true);
          // Later, Done or the cross: the tile kept was seen; the page says it until the next chest opens.
          setPassed(taken);
        }}
        chest={current}
        more={more}
        opened={opened}
        opening={current != null && opening === current.id}
        taken={said}
        busy={busy}
        refusal={modal ? refusal : null}
        refusalDetail={refusalDetail}
        owned={owned}
        tileArt={tileArt}
        initialChoice={initialChoice}
        onOpen={onOpen}
        onTake={onTake}
        onNext={() => {
          setPassed(taken);
          // The ids are the read's places, which move once a chest is opened: the next is the queue's first again.
          setPicked(null);
        }}
        onEditLayout={onEditLayout}
        onDismissRefusal={onDismissRefusal}
      />
    </TabFrame>
  );
}
