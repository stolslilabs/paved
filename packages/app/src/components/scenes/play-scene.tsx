import { useState, type ReactNode } from "react";
import * as m from "motion/react-m";
import { BalancesSlot } from "../containers/balances-context";
import type { ShownBalance } from "../containers/balances";
import { HudDrawer } from "../containers/hud-drawer";
import { PlayModes, type PlayModesProps } from "../containers/play-modes";
import { Notice } from "../elements/notice";

export interface PlaySceneProps extends PlayModesProps {
  /** The drawer is open (its route the current one); omitted, open. */
  open?: boolean;
  /** Where the focus goes back on close: the HUD's control that opened it (the dock's Play). */
  returnFocus?: () => HTMLElement | null;
  /**
   * The Challenge's stake (`/play/challenge`): its body (`PurchaseScene`, or its price being read), the panel's view in the modes' place.
   * Null or omitted: the modes.
   */
  challenge?: ReactNode;
  /**
   * Story's campaigns (`/story`, STORY-PAGE): their body (`StoryScene`), the panel's view in the modes' place, as the stake. Null or
   * omitted: the modes.
   */
  story?: ReactNode;
  /**
   * The Puzzle (`/play/puzzle`, Play's Limited mode): its body (`PuzzleScene`), the panel's view in the modes' place, as Story's. Null or
   * omitted: the modes.
   */
  puzzle?: ReactNode;
  /**
   * The Joust (`/play/joust`, Play's Limited mode): its body (`JoustScene`), the panel's view in the modes' place, as the Puzzle's;
   * `joustTitle` names its own view on the header ("Both top 10", "Ranking"). Null or omitted: the modes.
   */
  joust?: ReactNode;
  joustTitle?: string;
  /** The Expedition (`/play/expedition`, Play's Limited mode): its body (`ExpeditionScene`), a view as the Joust's. Null or omitted: the modes. */
  expedition?: ReactNode;
  /** The Masterpiece (`/play/masterpiece`, Play's Limited mode): its body (`MasterpieceScene`), a view as the Joust's; `masterpieceTitle` names its own view ("Ranking"). Null or omitted: the modes. */
  masterpiece?: ReactNode;
  masterpieceTitle?: string;
  /** The Colossus (`/play/colossus`, Play's Limited mode): its body (`ColossusScene`), as the Joust's; `colossusTitle` names its own view. */
  colossus?: ReactNode;
  colossusTitle?: string;
  /** Play's close, back to the village. */
  onBack?: () => void;
  /** The stake's Back, to the modes. */
  onChallengeBack?: () => void;
  /** Story's Back, to the modes (never into the level just played). */
  onStoryBack?: () => void;
  /** The Puzzle's Back, to the modes (never into the game just played). */
  onPuzzleBack?: () => void;
  /** The Joust's Back: to the modes, or from one of its views to the joust. */
  onJoustBack?: () => void;
  /** The Expedition's Back, to the modes. */
  onExpeditionBack?: () => void;
  /** The Masterpiece's Back: to the modes, or from its ranking to the week. */
  onMasterpieceBack?: () => void;
  /** The Colossus's Back: to the modes, or from one of its views to the site. */
  onColossusBack?: () => void;
}

/** The stake's balance at the header's end (the drawers' rule: the page's balance at the top right), USDC, what it spends. */
const USDC: readonly ShownBalance[] = ["usdc"];
/** The Puzzle's balance at its header's end: the Cobbles, what its prize pays. */
const COBBLES: readonly ShownBalance[] = ["cobbles"];

/** A press on a dialog over the drawer (a wallet's) is no tap on the village. */
const keepForDialogs = (event: Event) => {
  if ((event.target as Element | null)?.closest?.("[role=dialog], [role=alertdialog]")) event.preventDefault();
};

/**
 * Play (`/play`, PLAY-PAGE, the Paved UX Book's "modes", "modes-resume" and "challenge"), opened by the dock's Play: the HUD's drawer, as
 * Missions and the Shop (`HudDrawer`): a full page with Back on a phone, a side panel docked at the right from `tablet` (the book draws a
 * centred window, which no drawer is: docked as the Shop). In it the modes (`PlayModes`): Ranked, Paid, Free, Limited. The Challenge's stake
 * (`/play/challenge`) is a panel of its own in the modes' place at every width (the owner's ask of 2026-11-06: no sheet from the bottom;
 * Guild's menu pattern), sliding in from the right, its Back to the modes and the red cross out to the village, the USDC balance at its
 * header's end (the drawers' rule, where the book writes it under the title). Story's campaigns (`/story`, STORY-PAGE) are a view of
 * the same kind, "Story" on the header, its Back to the modes. A pause says so under the modes: Training and Story stay open.
 */
export function PlayScene({ open = true, returnFocus, challenge = null, story = null, puzzle = null, joust = null, joustTitle, expedition = null, masterpiece = null, masterpieceTitle, colossus = null, colossusTitle, onBack, onChallengeBack, onStoryBack, onPuzzleBack, onJoustBack, onExpeditionBack, onMasterpieceBack, onColossusBack, ...modes }: PlaySceneProps) {
  const view = challenge !== null ? "challenge" : story !== null ? "story" : puzzle !== null ? "puzzle" : joust !== null ? "joust" : expedition !== null ? "expedition" : masterpiece !== null ? "masterpiece" : colossus !== null ? "colossus" : "modes";
  // The first view comes with the drawer's own slide; only a move between views slides.
  const [last, setLast] = useState(view);
  const [moved, setMoved] = useState(false);
  if (last !== view) {
    setLast(view);
    setMoved(true);
  }
  return (
    <HudDrawer
      open={open}
      onOpenChange={(next) => {
        if (!next) onBack?.();
      }}
      title={view === "challenge" ? "Challenge" : view === "story" ? "Story" : view === "puzzle" ? "Puzzle" : view === "joust" ? (joustTitle ?? "Joust") : view === "expedition" ? "Expedition" : view === "masterpiece" ? (masterpieceTitle ?? "Masterpiece") : view === "colossus" ? (colossusTitle ?? "Colossus") : "Play"}
      side="right"
      slot="play"
      returnFocus={returnFocus}
      // The title, the plate and both controls do not fit a phone under 360 px (the Shop's rule): there the title keeps the row.
      end={
        view === "challenge" ? (
          <BalancesSlot layout="pill" kinds={USDC} className="hidden mobile:flex" />
        ) : view === "puzzle" || view === "joust" || view === "expedition" || view === "masterpiece" || view === "colossus" ? (
          <BalancesSlot layout="pill" kinds={COBBLES} className="hidden mobile:flex" />
        ) : undefined
      }
      onBack={view === "challenge" ? onChallengeBack : view === "story" ? onStoryBack : view === "puzzle" ? onPuzzleBack : view === "joust" ? onJoustBack : view === "expedition" ? onExpeditionBack : view === "masterpiece" ? onMasterpieceBack : view === "colossus" ? onColossusBack : undefined}
      onInteractOutside={keepForDialogs}
    >
      <m.div
        key={view}
        // A view (the stake, Story) comes in from the right, the modes back from the left (no slide under reduced motion: `MotionConfig`).
        initial={moved && { x: view === "modes" ? -48 : 48, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        className="flex flex-col gap-4"
      >
        {view === "challenge" ? (
          challenge
        ) : view === "story" ? (
          story
        ) : view === "puzzle" ? (
          puzzle
        ) : view === "joust" ? (
          joust
        ) : view === "expedition" ? (
          expedition
        ) : view === "masterpiece" ? (
          masterpiece
        ) : view === "colossus" ? (
          colossus
        ) : (
          <>
            <PlayModes {...modes} />
            {modes.spawnPaused && <Notice tone="warning">New Challenge games are paused. Training and Story mode stay open.</Notice>}
          </>
        )}
      </m.div>
    </HudDrawer>
  );
}
