import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Countdown } from "../elements/countdown";
import { Icon } from "../ui/icon";
import { Score } from "../elements/score";
import { TilesLeft } from "../elements/tiles-left";

export interface GameHudProps {
  title: string;
  score: number;
  /** Points the last move added. */
  delta?: number | null;
  remaining: number;
  /** `GameView.expiresAt` of a Challenge game (start + 24 h); none for Training and the Tutorial. */
  expiresAt?: number | null;
  now: number;
  onBack?: () => void;
  className?: string;
}

/** The board's header over the scene: Back and the mode, the tiles left, the time left, the score. */
export function GameHud({ title, score, delta, remaining, expiresAt, now, onBack, className }: GameHudProps) {
  return (
    <header
      className={cn(
        "flex items-center gap-2 rounded-xl tablet:gap-3 border border-border bg-card/90 px-2 py-2 shadow-lg backdrop-blur tablet:px-3",
        className,
      )}
    >
      {onBack && (
        <Button variant="ghost" size="icon" aria-label="Back" onClick={onBack}>
          <Icon name="chevron-left" />
        </Button>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h1 className="truncate font-display text-sm font-semibold">{title}</h1>
        {expiresAt != null && <Countdown expiresAt={expiresAt} now={now} />}
      </div>
      <TilesLeft remaining={remaining} />
      <div className="border-l border-border pl-3">
        <Score value={score} delta={delta} size="hud" tone="default" label="Score" icon="star" iconClassName="hidden tablet:inline-flex" />
      </div>
    </header>
  );
}
