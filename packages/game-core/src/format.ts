/**
 * The one place a number, an amount, a percentage or a date becomes text (P-66). The locale is fixed to en-US while the
 * app is not multilingual: a French or German browser reads "1,240.5" and "Oct 15" like everyone else. A future i18n
 * replaces `LOCALE` (or makes it a setting) and nothing else: no caller names a locale, and none calls
 * `toLocaleString` or `Intl` itself (a guard test fails on it).
 */
export const LOCALE = "en-US";

const numberFormats = new Map<string, Intl.NumberFormat>();
const dateFormats = new Map<string, Intl.DateTimeFormat>();

function numberFormat(options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = JSON.stringify(options);
  let format = numberFormats.get(key);
  if (!format) numberFormats.set(key, (format = new Intl.NumberFormat(LOCALE, options)));
  return format;
}

function dateFormat(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = JSON.stringify(options);
  let format = dateFormats.get(key);
  if (!format) dateFormats.set(key, (format = new Intl.DateTimeFormat(LOCALE, options)));
  return format;
}

export interface NumberOptions {
  /** Digits after the point, at least (0 when omitted). */
  minFractionDigits?: number;
  /** Digits after the point, at most (the larger of `minFractionDigits` and 3 when omitted). */
  maxFractionDigits?: number;
}

function fractionOptions({ minFractionDigits, maxFractionDigits }: NumberOptions): Intl.NumberFormatOptions {
  return { minimumFractionDigits: minFractionDigits, maximumFractionDigits: maxFractionDigits };
}

/** A number with a comma every three digits: `1240.5` is "1,240.5". A bigint stays exact. */
export function formatNumber(value: number | bigint, options: NumberOptions = {}): string {
  return numberFormat(fractionOptions(options)).format(value);
}

/** A count: rounded to a whole number, with its commas ("1,240"). */
export function formatInteger(value: number): string {
  return numberFormat({ maximumFractionDigits: 0 }).format(Math.round(value));
}

/** A fixed number of decimals, trailing zeros kept: `formatFixed(3, 2)` is "3.00". */
export function formatFixed(value: number, decimals: number): string {
  return numberFormat({ minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
}

/** Large figures short: `1_250_000` is "1.3M" (compact, at most one decimal). */
export function formatCompact(value: number): string {
  return numberFormat({ notation: "compact", maximumFractionDigits: 1 }).format(value);
}

/** A percentage from a ratio: `0.255` is "25.5%". */
export function formatPercent(ratio: number, options: NumberOptions = {}): string {
  return numberFormat({ style: "percent", ...fractionOptions(options) }).format(ratio);
}

/** A percentage from basis points (1 bp is 0.01%): `250` is "2.5%", never more than two decimals. */
export function formatBps(bps: number): string {
  return `${formatNumber(bps / 100, { maxFractionDigits: 2 })}%`;
}

/** Base units cut (not rounded) to `fraction` digits, with commas in the whole part: `1_234_567_890n` at 6 decimals is "1,234.56". */
export function formatUnits(amount: bigint, decimals: number, fraction: number): string {
  const negative = amount < 0n;
  const abs = negative ? -amount : amount;
  const scale = 10n ** BigInt(decimals);
  const whole = formatNumber(abs / scale);
  const frac = (abs % scale).toString().padStart(decimals, "0").slice(0, fraction);
  return `${negative ? "-" : ""}${whole}${fraction > 0 ? `.${frac}` : ""}`;
}

/**
 * A moment: epoch milliseconds or a `Date`. `options` are `Intl.DateTimeFormat`'s; `timeZone` is the viewer's own when
 * omitted. A moment shown in UTC (a day or week end, an expiry) always ends with " UTC" ("Thu, Oct 15, 15:00 UTC"), so it
 * is never read as local: the label comes from here, not from each component.
 */
export function formatDate(value: number | Date, options: Intl.DateTimeFormatOptions): string {
  const text = dateFormat(options).format(value);
  return options.timeZone?.toUpperCase() === "UTC" ? `${text} UTC` : text;
}

/** "2 h", "14 h 05 min", "12 min", "2 d 3 h": a span cut to the minute (hours up to 48, then days), never "0 min" after whole hours. */
function formatSpan(totalSeconds: number): string {
  const minutes = Math.floor(Math.abs(totalSeconds) / 60);
  const hours = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (hours >= 48) {
    const h = hours % 24;
    return `${Math.floor(hours / 24)} d${h > 0 ? ` ${h} h` : ""}`;
  }
  if (hours > 0) return m > 0 ? `${hours} h ${String(m).padStart(2, "0")} min` : `${hours} h`;
  return `${m} min`;
}

export interface RelativeOptions {
  /** Write a moment already past as "ended 2 h ago" instead of "2 h ago". */
  ended?: boolean;
}

/**
 * A moment relative to now, from the seconds until it (negative once past): "in 23 h 12 min", "in 12 min", "in less than a
 * minute", "2 h ago", "ended 3 min ago" (`ended`). Cut to the minute; en-US text written here, not by `Intl.RelativeTimeFormat`.
 */
export function formatRelative(secondsUntil: number, { ended = false }: RelativeOptions = {}): string {
  const future = secondsUntil >= 0;
  const small = Math.abs(secondsUntil) < 60;
  if (future) return small ? "in less than a minute" : `in ${formatSpan(secondsUntil)}`;
  return `${ended ? "ended " : ""}${small ? "less than a minute" : formatSpan(secondsUntil)} ago`;
}

/** A game boundary (seconds since the epoch) in UTC, never local: "Thu, Oct 15, 15:00 UTC". */
export function formatBoundary(seconds: number): string {
  return formatDate(seconds * 1000, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" });
}
