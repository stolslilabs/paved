import { useEffect } from "react";
import { useReducedMotionConfig } from "motion/react";
import * as m from "motion/react-m";
import { haptic } from "../../lib/haptics";
import { cn } from "../../lib/utils";
import { CHEST_CHOICES, CHEST_NAME, type ChestRank } from "../elements/chest-badge";
import { CHEST_DROP_S } from "../elements/chest-designs";
import { Cobbles } from "../elements/cobbles";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { LazyChestArt } from "../elements/lazy-chest-art";
import { TileChip, type TileArt } from "../elements/tile-chip";
import { tileName } from "../elements/tile-render";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../ui/dialog";
import { ScrollRegion } from "../ui/scroll-region";
import { useSfx } from "./audio-provider";
import { ChestReveal, TILE_GAP_S, TILES_OUT_S, type ChestDraw } from "./chest-reveal";

/** A chest waiting to be opened (#736): its rank from the result, and where it was won. */
export interface Chest {
  id: number;
  rank: ChestRank;
  /** PvP (1, 2 or 3 stars) or Story (3 stars, the first time); unset when the read does not say. */
  source?: "pvp" | "story";
  /** What it was won on: "3 stars against Rook", "Campaign 2, level 5"; unset when the read does not say. */
  label?: string;
  /** Today's PvP slot it fills (0 to 2, #784); unset for a Story chest, a chest of an earlier day, or a read that does not say. */
  slot?: number;
}

/** The tile just kept (and the Cobbles, if any): said until the next chest opens. */
export interface ChestTaken {
  plan: number;
  cobbles: number | null;
}

/** The shake: a few short shakes, then a pause, repeated (s). */
export const SHAKE_S = 0.7;
export const SHAKE_PAUSE_S = 1.4;

export interface ChestModalProps {
  open: boolean;
  /** Closed by the player (the cross, Escape, a tap outside, Later or Done): the page stays, the chests wait. */
  onClose: () => void;
  /** The chest at the centre, the next to open; null once none waits. */
  chest: Chest | null;
  /** The chests waiting after the one shown: "Next chest" after the choice when there are some. */
  more: number;
  /** The chest opened, its draw in: the burst, then its tiles. */
  opened: { chestId: number; draw: ChestDraw } | null;
  /** The opening on its way (its draw waits): the chest shakes on. */
  opening: boolean;
  /** The tile just kept, said until "Next chest"; null: nothing to say. */
  taken: ChestTaken | null;
  /** The choice on its way. */
  busy?: boolean;
  refusal?: string | null;
  refusalDetail?: ErrorDetail;
  owned?: Readonly<Record<number, number>>;
  tileArt?: TileArt;
  initialChoice?: number | null;
  /** For the stories: the chest held open in its light. */
  held?: boolean;
  onOpen?: (chestId: number) => void;
  onTake?: (chestId: number, index: number) => void;
  /** To the next chest, after a choice. */
  onNext?: () => void;
  onEditLayout?: () => void;
  onDismissRefusal?: () => void;
}

/**
 * A ready chest's opening (#784), in a modal over the dimmed page. The chest (`ChestArt`) drops in at the centre, lands in a puff of
 * dust and shakes (a few short squashing shakes, a pause, again) under "Tap to open"; a tap opens it: it crouches and springs, its lid
 * pops up on its hinges in a flash and light bursts from inside, rays and a glow in its rank's colour, it lands, its tiles fly out and
 * settle side by side (the choice of `ChestReveal`),
 * and the Cobbles show when it held some. The tile kept is said with "Next chest" while others wait, or Done. One sound per beat (`shake`, `burst`, `flip` per tile, `keep`), at the sound effects'
 * volume; a buzz on the shake and the burst where the device has one. Under reduced motion nothing shakes or flies: a short
 * fade instead, the sounds kept.
 */
export function ChestModal({
  open,
  onClose,
  chest,
  more,
  opened,
  opening,
  taken,
  busy,
  refusal = null,
  refusalDetail,
  owned,
  tileArt,
  initialChoice,
  held,
  onOpen,
  onTake,
  onNext,
  onEditLayout,
  onDismissRefusal,
}: ChestModalProps) {
  const phase = opened ? "reveal" : taken ? "taken" : chest ? "closed" : null;
  return (
    <Dialog open={open && phase !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        data-phase={phase ?? undefined}
        className="flex max-h-[85dvh] flex-col overflow-hidden sm:max-w-sm bg-popover p-0 text-center"
      >
        {/* A short phone: the modal's body scrolls, its light kept inside it. */}
        <ScrollRegion className="flex min-h-0 flex-col gap-4 px-4 pt-6 pb-5">
          {phase === "reveal" && opened ? (
            <Reveal key={opened.chestId} opened={opened} busy={busy} owned={owned} tileArt={tileArt} initialChoice={initialChoice} held={held} onTake={onTake} />
          ) : phase === "taken" && taken ? (
            <Taken taken={taken} more={more} tileArt={tileArt} onNext={onNext} onClose={onClose} onEditLayout={onEditLayout} />
          ) : (
            chest && <Closed key={chest.id} chest={chest} more={more} opening={opening} onOpen={onOpen} />
          )}
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
        </ScrollRegion>
      </DialogContent>
    </Dialog>
  );
}

/** "PvP · 3 stars against Rook", when the read says. */
const origin = (chest: Chest) => [chest.source && (chest.source === "pvp" ? "PvP" : "Story"), chest.label].filter(Boolean).join(" · ");

/** The chest at the centre, shaking, waiting for the tap; shaking faster while its draw is on its way. */
function Closed({ chest, more, opening, onOpen }: { chest: Chest; more: number; opening: boolean; onOpen?: (id: number) => void }) {
  const reduced = useReducedMotionConfig() ?? false;
  const play = useSfx();
  // A rattle and a buzz with each shake; under reduced motion, once on arrival.
  useEffect(() => {
    const shake = () => {
      play("shake");
      haptic("light");
    };
    shake();
    if (reduced || opening) return;
    const timer = setInterval(shake, (SHAKE_S + SHAKE_PAUSE_S) * 1000);
    return () => clearInterval(timer);
  }, [play, reduced, opening]);
  const where = origin(chest);
  const choices = CHEST_CHOICES[chest.rank];
  return (
    <div className="flex flex-col items-center gap-3">
      <DialogTitle className="font-display text-2xl">{CHEST_NAME[chest.rank]}</DialogTitle>
      <DialogDescription>{where || "A chest to open"}</DialogDescription>
      <button
        type="button"
        disabled={opening}
        aria-busy={opening || undefined}
        aria-label={`Open the ${CHEST_NAME[chest.rank].toLowerCase()}: ${choices === 1 ? "one tile" : `one of ${choices} tiles`}`}
        onClick={() => onOpen?.(chest.id)}
        className="relative my-4 grid size-56 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <m.span
          data-shake={reduced ? undefined : opening ? "fast" : ""}
          animate={
            reduced
              ? { rotate: 0, y: 0 }
              : { rotate: [0, -9, 9, -7, 7, -3, 3, 0], y: [0, -6, 0, -4, 0, -2, 0, 0], scaleX: [1, 1.06, 0.97, 1.04, 0.98, 1.02, 1, 1], scaleY: [1, 0.92, 1.05, 0.96, 1.03, 0.98, 1, 1] }
          }
          transition={
            reduced
              ? { duration: 0 }
              : opening
                ? { duration: SHAKE_S / 2, repeat: Infinity, ease: "easeInOut" }
                : { duration: SHAKE_S, repeat: Infinity, repeatDelay: SHAKE_PAUSE_S, ease: "easeInOut", delay: CHEST_DROP_S }
          }
          style={{ transformOrigin: "50% 95%" }}
          className="relative grid place-items-center"
        >
          <LazyChestArt rank={chest.rank} state="ready" shake={false} drop size="lg" label={null} />
        </m.span>
      </button>
      <p role="status" className={cn("font-display text-xl", opening ? "text-muted-foreground" : "text-primary")}>
        {opening ? "Opening…" : "Tap to open"}
      </p>
      <p className="text-xs text-muted-foreground">
        {choices === 1 ? "One tile, yours as it is" : `Keep one of its ${choices} tiles`}
        {more > 0 && (
          <>
            {" · "}
            <span className="numeric">{more}</span> more after it
          </>
        )}
      </p>
    </div>
  );
}

/** The lid's swing and the light, then the tiles out of the chest and the choice. */
function Reveal({
  opened,
  busy,
  owned,
  tileArt,
  initialChoice,
  held,
  onTake,
}: Pick<ChestModalProps, "busy" | "owned" | "tileArt" | "initialChoice" | "held" | "onTake"> & { opened: { chestId: number; draw: ChestDraw } }) {
  const play = useSfx();
  const { draw } = opened;
  const tiles = draw.plans.length;
  // The burst at once, a flip as each tile leaves the chest.
  useEffect(() => {
    play("burst");
    haptic("firm");
    const timers = Array.from({ length: tiles }, (_, i) => setTimeout(() => play("flip"), (TILES_OUT_S + TILE_GAP_S * i) * 1000));
    return () => timers.forEach(clearTimeout);
  }, [play, tiles]);
  const single = tiles === 1;
  return (
    <div className="flex flex-col items-center gap-3">
      <DialogTitle className="font-display text-2xl">{CHEST_NAME[draw.rank]}</DialogTitle>
      <DialogDescription>{single ? "One tile, yours as it is." : `Keep one of its ${CHEST_CHOICES[draw.rank]} tiles.`}</DialogDescription>
      {/* The chest opens: it springs, its lid pops up on its hinges, the light bursts in the rank's colour. */}
      <div data-burst={draw.rank} className="relative grid h-36 w-full place-items-center">
        <LazyChestArt rank={draw.rank} state={held ? "open" : "opening"} size="md" label={null} />
      </div>
      <ChestReveal
        variant="modal"
        draw={draw}
        owned={owned}
        initialChoice={initialChoice}
        busy={busy}
        tileArt={tileArt}
        onTake={(i) => {
          play("keep");
          onTake?.(opened.chestId, i);
        }}
        className="relative w-full"
      />
    </div>
  );
}

/** The tile kept: Next chest while others wait, or Done. */
function Taken({ taken, more, tileArt, onNext, onClose, onEditLayout }: { taken: ChestTaken; more: number; tileArt?: TileArt; onNext?: () => void; onClose: () => void; onEditLayout?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <DialogTitle className="font-display text-2xl">Added to your inventory</DialogTitle>
      <DialogDescription>{tileName(taken.plan)}</DialogDescription>
      <m.span initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 380, damping: 16 }} className="my-2 block size-28">
        <TileChip plan={taken.plan} art={tileArt} className="size-full rounded-md border-0" />
      </m.span>
      {taken.cobbles != null && <Cobbles value={taken.cobbles} sign="+" />}
      <div className="flex w-full flex-col gap-2">
        {more > 0 ? (
          <>
            <Button size="lg" className="w-full" onClick={onNext}>
              Next chest · <span className="numeric">{more}</span> left
            </Button>
            <Button variant="ghost" className="w-full" onClick={onClose}>
              Later
            </Button>
          </>
        ) : (
          <>
            <Button size="lg" className="w-full" onClick={onClose}>
              Done
            </Button>
            {onEditLayout && (
              <Button variant="outline" className="w-full" onClick={onEditLayout}>
                Edit layout
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
