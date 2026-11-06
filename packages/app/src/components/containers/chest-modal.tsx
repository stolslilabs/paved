import { useEffect } from "react";
import { useSidePanel } from "../../lib/side-panel";
import { useReducedMotionConfig } from "motion/react";
import * as m from "motion/react-m";
import { haptic } from "../../lib/haptics";
import { cn } from "../../lib/utils";
import { CHEST_CHOICES, CHEST_NAME, type ChestRank } from "../elements/chest-badge";
import { CHEST_DROP_S } from "../elements/chest-designs";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { LazyChestArt } from "../elements/lazy-chest-art";
import type { TileArt } from "../elements/tile-chip";
import { tileName } from "../elements/tile-render";
import { UiIcon } from "../elements/ui-icon";
import { Button } from "../ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "../ui/dialog";
import { ScrollRegion } from "../ui/scroll-region";
import { useSfx } from "./audio-provider";
import { BigPill, ChestReveal, TileCard, revealTitle, type ChestDraw } from "./chest-reveal";

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

/** The tile just kept: said until the next chest opens. */
export interface ChestTaken {
  plan: number;
}

/** The shake: a few short shakes, then a pause, repeated (s). */
export const SHAKE_S = 0.7;
export const SHAKE_PAUSE_S = 1.4;

export interface ChestModalProps {
  open: boolean;
  /** Closed by the player (the cross, Escape, a tap outside, Claim): the page stays, the chests wait. */
  onClose: () => void;
  /** The chest at the centre, the next to open; null once none waits. */
  chest: Chest | null;
  /** The chests waiting after the one shown: said under the chest. */
  more: number;
  /** The chest opened, its draw in: the burst, then its tiles. */
  opened: { chestId: number; draw: ChestDraw } | null;
  /** The opening on its way (its draw waits): the chest shakes on. */
  opening: boolean;
  /** The tile just kept, said until Claim; null: nothing to say. */
  taken: ChestTaken | null;
  /** The choice on its way. */
  busy?: boolean;
  refusal?: string | null;
  refusalDetail?: ErrorDetail;
  /** The tiles' pictures, by plan key: their angled renders in the player's skins. */
  tileArt?: TileArt;
  initialChoice?: number | null;
  /** For the stories: the chest held open in its light. */
  held?: boolean;
  onOpen?: (chestId: number) => void;
  onTake?: (chestId: number, index: number) => void;
  onDismissRefusal?: () => void;
}

/**
 * The modal's frame (CHESTS-PAGE, the Paved UX Book's `chest-reveal`; the owner's ask of 2026-11-06: no window from `tablet`, the reveal
 * in front of everything): none at any width, the reveal standing on the blurred page, the screen's whole height (its body scrolls on a
 * short one), a soft shade behind it so it reads over a bright village.
 */
const FRAME = "flex h-dvh max-w-full flex-col gap-0 overflow-hidden rounded-none border-0 bg-transparent p-0 pt-[env(safe-area-inset-top)] text-center font-round shadow-none";
/** The whole screen at every width: the dialog's own 32 rem from `tablet` (`sm:max-w-lg`) let go, inline. */
const FULL = { maxWidth: "100%" } as const;
const SHADE = { backgroundImage: "radial-gradient(closest-side, color-mix(in oklab, var(--background) 65%, transparent), transparent)" } as const;
/** From `desktop` the reveal stands larger, as the book's desktop draws it (a scale: the stylesheet has no room for a second size). */
const DESKTOP_QUERY = "(min-width: 64rem)";
const LARGER = { ...SHADE, transform: "scale(1.25)" } as const;
/** The HUD drawers' red close (`hud-drawer.tsx`'s `CONTROL`), at the frame's top right: a phone's screen corner, the window's. */
const CLOSE = "state-layer grid size-11 cursor-pointer place-items-center rounded-full outline-none";

/**
 * A ready chest's opening (#784), restyled after the Paved UX Book's reveal (CHESTS-PAGE): over the blurred page at every width, the
 * HUD drawers' red cross at its corner until the chest is tapped; from the tap to the tile taken it cannot be closed. The chest (`ChestArt`) drops in at the centre under its name,
 * lands in a puff of dust and shakes (a few short squashing shakes, a pause, again) over "Tap to open"; a tap opens it: it springs, its
 * lid pops up in a flash and light bursts from inside in its rank's colour, its tiles fly out and stand as the book's cards under
 * "Choose 1 of 3" (`ChestReveal`), the one chosen in gold, then Take. The tile kept is said on the gold card with one answer, Claim
 * (the owner's ask of 2026-11-06), back to where the chest was won. One sound per beat (`shake`, `burst`, `flip` per tile, `keep`), at the sound effects' volume; a buzz on the
 * shake and the burst where the device has one. Under reduced motion nothing shakes or flies: a short fade instead, the sounds kept.
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
  tileArt,
  initialChoice,
  held,
  onOpen,
  onTake,
  onDismissRefusal,
}: ChestModalProps) {
  const phase = opened ? "reveal" : taken ? "taken" : chest ? "closed" : null;
  // Tapped, a chest is drawn: its tile must be taken (the owner's ask of 2026-11-06). No cross, and neither Escape nor a tap outside
  // closes it; left anyway (a reload, the app closed), it comes back (the page's arrival, the home's `ChestPrompt`).
  const locked = phase === "reveal" || (phase === "closed" && opening);
  // The tile kept has one answer, Claim: no cross beside it.
  const cross = !locked && phase !== "taken";
  const desktop = useSidePanel(DESKTOP_QUERY);
  const keep = (event: Event) => {
    if (locked) event.preventDefault();
  };
  return (
    <Dialog open={open && phase !== null} onOpenChange={(next) => !next && !locked && onClose()}>
      <DialogContent data-phase={phase ?? undefined} data-locked={locked || undefined} showClose={false} onEscapeKeyDown={keep} onInteractOutside={keep} className={FRAME} style={FULL}>
        <div className="flex shrink-0 justify-end px-2 pt-2">
          {!cross ? (
            <span aria-hidden className="size-11" />
          ) : (
            <DialogClose className={CLOSE}>
              <UiIcon name="close" px={36} className="drawer-icon size-9" />
              <span className="sr-only">Close</span>
            </DialogClose>
          )}
        </div>
        {/* A short phone: the body scrolls, its light kept inside it; a tall one centres the reveal on the page under it (the auto margins). */}
        <ScrollRegion className="flex min-h-0 flex-1 flex-col overflow-x-hidden px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <div className="mt-auto flex flex-col items-center gap-4" style={desktop ? LARGER : SHADE}>
            {phase === "reveal" && opened ? (
              <Reveal key={opened.chestId} opened={opened} busy={busy} tileArt={tileArt} initialChoice={initialChoice} held={held} onTake={onTake} />
            ) : phase === "taken" && taken ? (
              <Taken taken={taken} tileArt={tileArt} onClaim={onClose} />
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
          </div>
          <span aria-hidden className="mt-auto" />
        </ScrollRegion>
      </DialogContent>
    </Dialog>
  );
}

/** "PvP · 3 stars against Rook", when the read says. */
const origin = (chest: Chest) => [chest.source && (chest.source === "pvp" ? "PvP" : "Story"), chest.label].filter(Boolean).join(" · ");

/** The book's large outlined heading, the dialog's name. */
const HEADING = "text-outline font-game text-4xl leading-tight font-normal text-balance";

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
    <div className="flex flex-col items-center gap-2">
      <DialogTitle className={HEADING}>{CHEST_NAME[chest.rank]}</DialogTitle>
      <DialogDescription className="text-base font-semibold text-muted-foreground">{where || "A chest to open"}</DialogDescription>
      <button
        type="button"
        disabled={opening}
        aria-busy={opening || undefined}
        aria-label={`Open the ${CHEST_NAME[chest.rank].toLowerCase()}: ${choices === 1 ? "one tile" : `one of ${choices} tiles`}`}
        onClick={() => {
          haptic("firm");
          onOpen?.(chest.id);
        }}
        className="relative my-2 grid size-56 place-items-center rounded-full outline-none"
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
      <p role="status" className={cn("text-outline font-game text-3xl", opening ? "text-muted-foreground" : "text-primary")}>
        {opening ? "Opening…" : "Tap to open"}
      </p>
      <p className="text-sm font-semibold text-muted-foreground">
        {choices === 1 ? "One tile, yours as it is" : `Keep one of its ${choices} tiles`}
        {more > 0 && (
          <>
            {" · "}
            <span className="tabular-nums">{more}</span> more after it
          </>
        )}
      </p>
    </div>
  );
}

/** The book's reveal: "Choose 1 of 3" over the cards, the chest open under them, Take. */
function Reveal({
  opened,
  busy,
  tileArt,
  initialChoice,
  held,
  onTake,
}: Pick<ChestModalProps, "busy" | "tileArt" | "initialChoice" | "held" | "onTake"> & { opened: { chestId: number; draw: ChestDraw } }) {
  const { draw } = opened;
  const single = draw.plans.length === 1;
  return (
    <div className="flex w-full flex-col items-center gap-1">
      {/* The heading alone: the chest's rank is said by the chest under the cards (the owner's ask of 2026-11-06). */}
      <DialogTitle className={HEADING}>{revealTitle(draw)}</DialogTitle>
      <DialogDescription className="sr-only">
        {CHEST_NAME[draw.rank]}: {single ? "one tile, yours as it is." : `keep one of its ${CHEST_CHOICES[draw.rank]} tiles.`}
      </DialogDescription>
      <ChestReveal
        draw={draw}
        initialChoice={initialChoice}
        busy={busy}
        tileArt={tileArt}
        held={held}
        onTake={(i) => onTake?.(opened.chestId, i)}
      />
    </div>
  );
}

/** The tile kept, on the gold card, and one answer (the owner's ask of 2026-11-06): Claim, back to the game's end (or the home). */
function Taken({ taken, tileArt, onClaim }: { taken: ChestTaken; tileArt?: TileArt; onClaim: () => void }) {
  // The tile in the inventory: the reward's buzz (the owner's ask of 2026-11-06).
  useEffect(() => haptic("reward"), []);
  return (
    <div className="flex flex-col items-center gap-3">
      <DialogTitle className={HEADING}>Added to your inventory</DialogTitle>
      <DialogDescription className="sr-only">{tileName(taken.plan)}</DialogDescription>
      <m.span initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 380, damping: 16 }} className="my-1 flex w-36">
        <TileCard as="div" plan={taken.plan} art={tileArt} gold />
      </m.span>
      <span className="pt-2">
        <BigPill label="Claim" at={0.25} onClick={onClaim} />
      </span>
    </div>
  );
}
