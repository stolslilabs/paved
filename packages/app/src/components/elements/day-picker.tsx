import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";

/** Seconds of a tournament: a UTC day (`TOURNAMENT_DURATION` of the indexer, `CHALLENGE_DURATION` of the contracts). */
export const DAY_S = 86_400;

/** A day id's date, UTC (a day is the tournament id `timestamp / 86400`): "Wed 14 Oct". */
export function formatDay(day: number): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
    .format(new Date(day * DAY_S * 1000))
    .replace(",", "");
}

export interface DayPickerProps {
  /** The day shown, a tournament id. */
  day: number;
  /** Today's id: the picker goes no further. */
  today: number;
  /** The first day there is (the indexer's first tournament): the picker goes no earlier. */
  first: number;
  onChange?: (day: number) => void;
  className?: string;
}

/** The day picker of the leaderboard and the quests (`/leaderboard/:day?`, `/quests/:day?`): one UTC day back or forward. */
export function DayPicker({ day, today, first, onChange, className }: DayPickerProps) {
  const isToday = day === today;
  return (
    <div role="group" aria-label="Day" className={cn("flex items-center gap-1 rounded-lg border border-border bg-card p-1", className)}>
      <Button variant="ghost" size="icon" className="size-8" aria-label="Previous day" disabled={day <= first} onClick={() => onChange?.(day - 1)}>
        <Icon name="chevron-left" size="sm" />
      </Button>
      <span className="flex min-w-32 flex-1 flex-col items-center leading-tight" aria-live="polite">
        <span className="text-sm font-semibold">{isToday ? "Today" : formatDay(day)}</span>
        <span className="text-[11px] text-muted-foreground">
          {isToday ? formatDay(day) : "UTC day"} · <span className="numeric">#{day}</span>
        </span>
      </span>
      <Button variant="ghost" size="icon" className="size-8" aria-label="Next day" disabled={day >= today} onClick={() => onChange?.(day + 1)}>
        <Icon name="chevron-right" size="sm" />
      </Button>
    </div>
  );
}
