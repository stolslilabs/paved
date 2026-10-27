import { formatDate } from "@paved/game-core";

// The shield's time left (issue 806): `HH:MM`, the minutes rounded up, shared by the home's chip, the League page and the scout.

/** Up while its end is ahead (`PvpShield.up` and `until` in the future). */
export const shieldUp = (endsAt: number | null | undefined, now: number): endsAt is number => endsAt != null && endsAt > now;

/** The minutes left, rounded up: a shield never reads 00:00 while it is up. */
const minutesLeft = (seconds: number): number => Math.max(0, Math.ceil(seconds / 60));

/** `HH:MM` from seconds, the minutes rounded up ("07:42"; one second left is "00:01"); 0 and below read as 00:00. */
export function formatHoursMinutes(seconds: number): string {
  const minutes = minutesLeft(seconds);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** The same time in words, for a screen reader: "7 hours 42 minutes", "1 hour", "42 minutes", "1 minute". */
export function spokenHoursMinutes(seconds: number): string {
  const minutes = minutesLeft(seconds);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hours = h > 0 ? `${h} ${h === 1 ? "hour" : "hours"}` : "";
  const mins = m > 0 || h === 0 ? `${m} ${m === 1 ? "minute" : "minutes"}` : "";
  return [hours, mins].filter(Boolean).join(" ");
}

/** "Shielded, 7 hours 42 minutes left": the shield's accessible name. */
export const shieldLabel = (endsAt: number, now: number): string => `Shielded, ${spokenHoursMinutes(endsAt - now)} left`;

/** The shield's end as the player's clock reads it: "18:40". */
export const shieldEnd = (endsAt: number): string => formatDate(endsAt * 1000, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** The time left as an ISO duration, for a `<time>`'s `dateTime`: whole minutes, rounded up. */
export const shieldDuration = (endsAt: number, now: number): string => `PT${minutesLeft(endsAt - now)}M`;
