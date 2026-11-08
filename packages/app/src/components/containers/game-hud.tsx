import type { CSSProperties } from "react";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { capScore, rewardOf, winningScore } from "@paved/game-core";
import { cn } from "../../lib/utils";
import { Countdown } from "../elements/countdown";
import { Icon } from "../ui/icon";
import { TOKENS, amountFigure } from "../elements/amount";
import { formatPoints } from "../elements/score";
import { TokenIcon } from "../elements/token-icon";
import { CoachMark } from "../elements/coach-mark";
import { HudFrame } from "../elements/hud-frame";
import { UiIcon } from "../elements/ui-icon";
import { COACH_BOX, type CoachTarget } from "./coach";
import { MockMarkSlot } from "./mock-mark";
import { RestartHold } from "./restart-hold";
import type { RewardCurve } from "./reward-estimate";

export interface GameHudProps {
  title: string;
  score: number;
  /** Points the last move added. */
  delta?: number | null;
  /** The points the tile placed and not yet validated would score: "(+154)" beside the score, in place of the last move's gain (#568). */
  preview?: number | null;
  /** `GameView.expiresAt` of a Challenge game (start + 24 h); none for Training and Story. */
  expiresAt?: number | null;
  /**
   * A Challenge game's curve (#705): its terms' `R`, `c` and `H`, and its day's threshold. Beside the countdown, the score to
   * beat until the score reaches it, then what the score earns now; none for Training and Story, or while it is read.
   */
  reward?: RewardCurve | null;
  now: number;
  onBack?: () => void;
  /** The gear: opens the device settings over the board (#541). */
  onSettings?: () => void;
  /** Restart, held (GAME-OVERLAY): Story's level, Training's game (TRAINING-END) again from its first tile. */
  onRestart?: () => void;
  /** Restart's name: "Hold to restart the level" (Story's) unless given (Training's game). */
  restartLabel?: string;
  /** Restart is shown, dimmed: the level's intro or end is over the board. */
  restartDisabled?: boolean;
  /** A Story coach mark points at the gear: its light (the deck's is on the tile stack, #606; the season dial's is the board scene's). */
  coach?: CoachTarget | null;
  className?: string;
}

/** The header's round controls, Back and the gear: the HUD drawer's 44 px target and its white states. */
const CONTROL = "state-layer grid size-11 shrink-0 cursor-pointer place-items-center rounded-full outline-none";

/** A carved groove between the header's parts (the book's), as the footer tabs': the near-black line and the bevel's light beside it. */
const GROOVE: CSSProperties = {
  backgroundImage: "linear-gradient(to right, var(--hud-outline) 50%, color-mix(in oklab, var(--drawer-bevel) 50%, transparent) 50%)",
};

/**
 * The board's header over the scene (GAME-OVERLAY, the Paved UX Book's board screen, mockup 3 of "Resume a Challenge"): on the HUD's
 * frame, as the Scout's; Back (the drawers'), the title outlined in the display font and under it the score beside the painted star,
 * the last move's gain in green or the placed tile's points in gold; then, for a Challenge, behind a carved groove, the time left by the
 * painted stopwatch and the reward by the PAVED coin ("max" under it from the cap's score); Story's Restart, held; the painted gear. The tiles left are on the tile stack (#606).
 */
export function GameHud({ title, score, delta, preview, expiresAt, reward, now, onBack, onSettings, onRestart, restartLabel, restartDisabled, coach, className }: GameHudProps) {
  const challenge = expiresAt != null || reward;
  return (
    <header className={cn("relative isolate flex min-h-14 items-center gap-0.5 py-1 pr-1 pl-0.5 mobile:gap-1 tablet:gap-2 tablet:pr-2", className)}>
      <HudFrame px={13} />
      {onBack && (
        <button type="button" aria-label="Back" className={CONTROL} onClick={onBack}>
          <Icon name="chevron-left" className="drawer-icon" />
        </button>
      )}
      {/* The title, a name, is cut first and stays whole in its title (WRAP360): `w-0 min-w-full` keeps its length out of the
          column's width. The mark on the title's line, after it (#622): a Challenge game is the mock's on a mock build (#927). */}
      {/* The score is the column's floor (WRAP360): the title is cut first, the gain goes under the score where it does not fit beside it. */}
      <div className={cn("flex flex-1 flex-col gap-0.5", !onBack && "pl-2")}>
        <div className="flex w-0 min-w-full items-center gap-1.5">
          <h1 title={title} className="text-outline min-w-0 truncate pr-0.5 font-display text-base leading-snug tracking-wide mobile:text-lg tablet:text-xl">
            {title}
          </h1>
          <MockMarkSlot className="shrink-0" />
        </div>
        <HudScore score={score} delta={delta} preview={preview} />
      </div>
      {/* A Challenge's clock and reward: side by side from tablet, one over the other on a phone. */}
      {challenge && (
        <>
          <span aria-hidden className="my-2 w-0.5 shrink-0 self-stretch" style={GROOVE} />
          <div className="flex shrink-0 flex-col items-start gap-1 px-1 tablet:flex-row tablet:items-center tablet:gap-3 tablet:px-2">
            {expiresAt != null && (
              <Countdown
                expiresAt={expiresAt}
                now={now}
                short
                art={<UiIcon name="countdown" px={24} className="drawer-icon size-5 tablet:size-6" />}
                className="text-outline gap-1 text-sm font-bold data-[state=ok]:text-foreground tablet:text-base"
              />
            )}
            {reward && <HudReward curve={reward} score={score} />}
          </div>
        </>
      )}
      {onRestart && <RestartHold onRestart={onRestart} label={restartLabel} disabled={restartDisabled} className="size-11 shrink-0 rounded-full p-0" />}
      {onSettings && (
        <span data-coach={coach === "settings" ? "settings" : undefined} className={cn(COACH_BOX, "grid shrink-0")}>
          {coach === "settings" && <CoachMark />}
          <button type="button" aria-label="Settings" className={CONTROL} onClick={onSettings}>
            <UiIcon name="settings" px={32} className="drawer-icon size-8" />
          </button>
        </span>
      )}
    </header>
  );
}

/**
 * The score under the title (the book's): the painted star, the figure outlined, then the placed tile's points in gold, "(+154)" (#568),
 * or else the last move's gain in green, moving in. "Score" is read, not shown.
 */
function HudScore({ score, delta, preview }: { score: number; delta?: number | null; preview?: number | null }) {
  return (
    <div className="flex flex-wrap items-center gap-x-1">
      <span className="inline-flex shrink-0 items-center gap-1">
        <UiIcon name="star" px={20} className="drawer-icon size-4.5 shrink-0 tablet:size-5" />
        <span className="sr-only">Score</span>
        <span data-testid="score-value" className="numeric text-outline text-base leading-none font-bold tracking-tight tablet:text-lg">
          {formatPoints(score)}
        </span>
      </span>
      {preview != null ? (
        <span data-testid="score-preview" title="The points this tile would score" className="numeric text-outline text-xs font-bold whitespace-nowrap text-primary tablet:text-sm">
          (+{formatPoints(preview)})<span className="sr-only"> if placed</span>
        </span>
      ) : (
        // The gain before goes out of the line at once (no "+300 +150" side by side while it fades).
        <AnimatePresence mode="popLayout">
          {delta ? (
            <m.span
              key={`${score}-${delta}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.1 } }}
              className="numeric text-outline text-xs font-bold text-success tablet:text-sm"
            >
              +{formatPoints(delta)}
            </m.span>
          ) : null}
        </AnimatePresence>
      )}
    </div>
  );
}

/**
 * The HUD's reward (#705): "Beat 1,150" by the painted trophy under the threshold, then "≈ 172.84" over "PAVED" beside the PAVED coin
 * (the book's), what the score earns at the day's threshold (`curve::payout`), and "max" beside "PAVED" from the cap's score. An estimate while the day
 * is open: its mean fixes the threshold when it closes.
 */
function HudReward({ curve, score }: { curve: RewardCurve; score: number }) {
  const least = winningScore(curve.threshold);
  if (curve.reference === null || score < least) {
    return (
      <span data-testid="hud-reward" title="The score to beat at today's threshold" className="text-outline inline-flex items-center gap-1 text-sm font-bold whitespace-nowrap tablet:text-base">
        <UiIcon name="trophy" px={24} className="drawer-icon size-5 tablet:size-6" />
        <span>
          Beat <span className="numeric">{formatPoints(least)}</span>
        </span>
      </span>
    );
  }
  // Compact from 10,000 PAVED, so the header keeps its width (WRAP360).
  const amount = amountFigure(rewardOf(curve.reference, score, curve.threshold, curve.slopeBps, curve.cap), "paved", true);
  const capped = score >= capScore(curve.threshold, curve.slopeBps, curve.cap);
  return (
    <span data-testid="hud-reward" title="What this score earns at today's threshold, an estimate until the day closes" className="text-outline inline-flex items-center gap-1 font-bold">
      <TokenIcon kind="paved" size="lg" className="size-5 tablet:size-6" />
      <span className="flex flex-col leading-none">
        <span className="numeric text-sm whitespace-nowrap tablet:text-base">
          <span className="sr-only">Estimated reward </span>≈ {amount}
        </span>
        {/* "max" on the coin's line, under the figure: the header keeps its width at 320 px (WRAP360). */}
        <span className="text-xs tracking-wide whitespace-nowrap">
          <span className="sr-only"> </span>
          {TOKENS.paved.symbol}
          {capped && " max"}
        </span>
      </span>
    </span>
  );
}
