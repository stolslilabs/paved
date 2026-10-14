import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Countdown } from "../elements/countdown";
import { Glyph } from "../elements/glyph";
import { Score } from "../elements/score";
import { TilesLeft } from "../elements/tiles-left";

export interface GameHudProps {
  title: string;
  score: number;
  /** Points the last move added. */
  delta?: number | null;
  remaining: number;
  discarded: number;
  /** `expires_at` of a paid game (purchase time + 24 h); none for Training and the Tutorial. */
  expiresAt?: number | null;
  now: number;
  onBack?: () => void;
  className?: string;
}

/** The board's header over the scene: Back and the mode, the tiles left with the discards, the time left, the score. */
export function GameHud({ title, score, delta, remaining, discarded, expiresAt, now, onBack, className }: GameHudProps) {
  return (
    <header
      className={cn(
        "flex items-center gap-3 rounded-xl border border-border bg-card/90 px-2 py-2 shadow-lg backdrop-blur tablet:px-3",
        className,
      )}
    >
      {onBack && (
        <Button variant="ghost" size="icon" aria-label="Back" onClick={onBack}>
          <Glyph name="back" />
        </Button>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h1 className="truncate text-sm font-semibold">{title}</h1>
        {expiresAt != null && <Countdown expiresAt={expiresAt} now={now} />}
      </div>
      <TilesLeft remaining={remaining} discarded={discarded} />
      <div className="flex items-center gap-2 border-l border-border pl-3">
        <Glyph name="star" className="size-5 fill-primary text-primary" />
        <Score value={score} delta={delta} size="md" tone="default" label="Score" />
      </div>
    </header>
  );
}
