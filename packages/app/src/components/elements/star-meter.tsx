import { formatInteger, formatPercent } from "@paved/game-core";
import { cn } from "../../lib/utils";
import { STAR_MARKS, shareOf, starsFor } from "../../lib/pvp-rules";
import { Icon } from "../ui/icon";

/** The share the bar ends at: past the third mark, with room for an attack that beats the village. */
const BAR_END = 1.25;

export interface StarMeterProps {
  /** The attack's score so far. */
  score: number;
  /** The defender's village score. */
  target: number;
  className?: string;
}

/**
 * An attack's live score as a share of the defender's (issue 647): a bar that fills toward the target, its three star marks at
 * 70 / 85 / 110 % (`STAR_MARKS`, proposed), each star lit once reached, the share and the points under it. A `meter` for
 * assistive technology, named with the share and the stars.
 */
export function StarMeter({ score, target, className }: StarMeterProps) {
  const share = shareOf(score, target);
  const stars = starsFor(score, target);
  const fill = Math.min(share / BAR_END, 1);
  return (
    <div
      role="meter"
      aria-label={`Score ${formatPercent(share, { maxFractionDigits: 0 })} of the target, ${stars} of 3 stars`}
      aria-valuemin={0}
      aria-valuemax={Math.round(BAR_END * 100)}
      aria-valuenow={Math.round(share * 100)}
      aria-valuetext={`${formatPercent(share, { maxFractionDigits: 0 })}, ${stars} of 3 stars`}
      data-stars={stars}
      className={cn("flex flex-col gap-1", className)}
    >
      {/* The stars over their marks: lit once reached. */}
      <div aria-hidden className="relative h-5">
        {STAR_MARKS.map((mark, i) => (
          <span key={mark} data-reached={i < stars} className="absolute top-0 -translate-x-1/2" style={{ left: `${(mark / BAR_END) * 100}%` }}>
            <Icon name="star" size="sm" className={cn("transition-colors duration-300", i < stars ? "text-primary" : "text-muted-foreground/50")} />
          </span>
        ))}
      </div>
      <div aria-hidden className="relative h-2.5 overflow-hidden rounded-full bg-secondary">
        <span
          data-fill
          className="absolute inset-y-0 left-0 rounded-full bg-primary transition-[width] duration-500 ease-out motion-reduce:transition-none"
          style={{ width: `${fill * 100}%` }}
        />
        {STAR_MARKS.map((mark) => (
          <span key={mark} className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-background/80" style={{ left: `${(mark / BAR_END) * 100}%` }} />
        ))}
      </div>
      <div aria-hidden className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
        <span className="numeric">
          <span className="font-semibold text-foreground">{formatInteger(score)}</span> / {formatInteger(target)}
        </span>
        <span className="numeric font-semibold text-foreground">{formatPercent(share, { maxFractionDigits: 0 })}</span>
      </div>
    </div>
  );
}
