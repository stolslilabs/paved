import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Countdown } from "../elements/countdown";
import { Icon } from "../ui/icon";
import { Score } from "../elements/score";
import { COACH_RING, type CoachTarget } from "./coach";

export interface GameHudProps {
  title: string;
  score: number;
  /** Points the last move added. */
  delta?: number | null;
  /** The points the tile placed and not yet validated would score: "(+154)" over the score, in place of its label (#568). */
  preview?: number | null;
  /** `GameView.expiresAt` of a Challenge game (start + 24 h); none for Training and Story. */
  expiresAt?: number | null;
  now: number;
  onBack?: () => void;
  /** The gear: opens the device settings over the board (#541). */
  onSettings?: () => void;
  /** A Story coach mark points at the gear: it is ringed (the deck's ring is on the tile stack, #606; the season dial's is the board scene's). */
  coach?: CoachTarget | null;
  className?: string;
}

/** The board's header over the scene: Back and the mode, the time left, the score, the settings gear. The tiles left are on the tile stack (#606). */
export function GameHud({ title, score, delta, preview, expiresAt, now, onBack, onSettings, coach, className }: GameHudProps) {
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
        <h1 title={title} className="w-0 min-w-full truncate font-display text-sm font-semibold">{title}</h1>
        {expiresAt != null && <Countdown expiresAt={expiresAt} now={now} />}
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
