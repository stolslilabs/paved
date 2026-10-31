import { capScore, rewardOf, winningScore } from "@paved/game-core";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Countdown } from "../elements/countdown";
import { Icon } from "../ui/icon";
import { TOKENS, amountFigure } from "../elements/amount";
import { Score, formatPoints } from "../elements/score";
import { TokenIcon } from "../elements/token-icon";
import { COACH_RING, type CoachTarget } from "./coach";
import { MockMarkSlot } from "./mock-mark";
import type { RewardCurve } from "./reward-estimate";

export interface GameHudProps {
  title: string;
  score: number;
  /** Points the last move added. */
  delta?: number | null;
  /** The points the tile placed and not yet validated would score: "(+154)" over the score, in place of its label (#568). */
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
  /** A Story coach mark points at the gear: it is ringed (the deck's ring is on the tile stack, #606; the season dial's is the board scene's). */
  coach?: CoachTarget | null;
  className?: string;
}

/** The board's header over the scene: Back and the mode, the time left, the score, the settings gear. The tiles left are on the tile stack (#606). */
export function GameHud({ title, score, delta, preview, expiresAt, reward, now, onBack, onSettings, coach, className }: GameHudProps) {
  return (
    <header
      className={cn(
        "flex items-center gap-1 rounded-xl mobile:gap-2 tablet:gap-3 border border-border bg-card/90 px-1.5 mobile:px-2 py-2 shadow-lg backdrop-blur tablet:px-3",
        className,
      )}
    >
      {onBack && (
        <Button variant="ghost" size="icon" className="size-9 shrink-0 mobile:size-10" aria-label="Back" onClick={onBack}>
          <Icon name="chevron-left" />
        </Button>
      )}
      {/* The countdown is the column's floor; the title, a name, is cut first and stays whole in its title (WRAP360):
          `w-0 min-w-full` keeps its length out of the column's width. */}
      <div className="flex flex-1 flex-col gap-1">
        {/* The mark on the title's line, after it (#622): a Challenge game is the mock's on a mock build (#927). */}
        <div className="flex w-0 min-w-full items-center gap-1.5">
          <h1 title={title} className="min-w-0 truncate font-display text-sm font-semibold">{title}</h1>
          <MockMarkSlot className="shrink-0" />
        </div>
        {/* The time left and the reward share a line where they fit; on a phone the reward goes under the time. */}
        {(expiresAt != null || reward) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {expiresAt != null && <Countdown expiresAt={expiresAt} now={now} />}
            {reward && <HudReward curve={reward} score={score} />}
          </div>
        )}
      </div>
      <div className="mobile:border-l mobile:border-border mobile:pl-3">
        <Score value={score} delta={delta} preview={preview} size="hud" tone="default" label="Score" icon="star" iconClassName="hidden tablet:inline-flex" />
      </div>
      {onSettings && (
        <Button variant="ghost" size="icon" className={cn("size-9 shrink-0 mobile:size-10", coach === "settings" && COACH_RING)} aria-label="Settings" onClick={onSettings}>
          <Icon name="gear" />
        </Button>
      )}
    </header>
  );
}

/**
 * The HUD's reward (#705): "Beat 1,150" under the threshold, then "≈ 172.84" beside the PAVED coin, what the score earns at
 * the day's threshold (`curve::payout`), and "max" from the cap's score. An estimate while the day is open: its mean fixes the
 * threshold when it closes.
 */
function HudReward({ curve, score }: { curve: RewardCurve; score: number }) {
  const least = winningScore(curve.threshold);
  if (curve.reference === null || score < least) {
    return (
      <span data-testid="hud-reward" title="The score to beat at today's threshold" className="inline-flex items-center gap-1.5 text-xs whitespace-nowrap text-muted-foreground">
        <Icon name="trophy" size="sm" />
        <span>
          Beat <span className="numeric font-semibold">{formatPoints(least)}</span>
        </span>
      </span>
    );
  }
  // Compact from 10,000 PAVED, so the header keeps its width (WRAP360).
  const amount = amountFigure(rewardOf(curve.reference, score, curve.threshold, curve.slopeBps, curve.cap), "paved", true);
  const capped = score >= capScore(curve.threshold, curve.slopeBps, curve.cap);
  return (
    // "max" goes under the figure where the column is too narrow for both (WRAP360).
    <span
      data-testid="hud-reward"
      title="What this score earns at today's threshold, an estimate until the day closes"
      className="inline-flex flex-wrap items-center gap-x-1.5 text-xs text-primary"
    >
      <TokenIcon kind="paved" size="em" />
      <span className="numeric font-semibold whitespace-nowrap">
        <span className="sr-only">Estimated reward </span>≈ {amount}
        <span className="sr-only"> {TOKENS.paved.symbol}</span>
      </span>
      {capped && <span>max</span>}
    </span>
  );
}

