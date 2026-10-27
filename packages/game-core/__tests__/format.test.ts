import { describe, expect, it } from "vitest";
import { LOCALE, formatAgo, formatBoundary, formatBps, formatCompact, formatDate, formatFixed, formatInteger, formatNumber, formatPercent, formatRelative, formatUnits } from "../src/format";

// Run under `LANG=fr_FR.UTF-8 TZ=Europe/Paris` too (CI does): the process locale must change nothing here.
describe("formatter (P-66, en-US)", () => {
  it("fixes the locale", () => {
    expect(LOCALE).toBe("en-US");
  });

  it("writes numbers with commas and a point", () => {
    expect(formatNumber(1234567.891)).toBe("1,234,567.891");
    expect(formatNumber(1234.5, { minFractionDigits: 2 })).toBe("1,234.50");
    expect(formatNumber(12345678901234567890n)).toBe("12,345,678,901,234,567,890");
    expect(formatInteger(1239.6)).toBe("1,240");
    expect(formatFixed(3, 2)).toBe("3.00");
    expect(formatCompact(1_250_000)).toBe("1.3M");
  });

  it("writes percentages", () => {
    expect(formatPercent(0.255, { maxFractionDigits: 1 })).toBe("25.5%");
    expect(formatBps(7368)).toBe("73.68%");
    expect(formatBps(250)).toBe("2.5%");
    expect(formatBps(1_000_000)).toBe("10,000%");
  });

  it("cuts a token amount to its fraction, commas in the whole part", () => {
    expect(formatUnits(1_234_567_890n, 6, 2)).toBe("1,234.56");
    expect(formatUnits(-1_500_000n, 6, 2)).toBe("-1.50");
    expect(formatUnits(5n * 10n ** 18n, 18, 0)).toBe("5");
  });

  it("writes dates the en-US way, in the zone asked", () => {
    const moment = Date.UTC(2026, 9, 15, 15, 0);
    expect(formatDate(moment, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })).toBe("Thu, Oct 15 UTC");
    expect(formatDate(new Date(moment), { month: "2-digit", day: "2-digit", year: "numeric", timeZone: "UTC" })).toBe("10/15/2026 UTC");
    // A boundary shown in UTC says so, under the Paris process zone too.
    expect(formatDate(moment, { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" })).toBe("15:00 UTC");
    expect(formatDate(moment, { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Europe/Paris" })).toBe("17:00");
  });

  it("writes a moment past in its largest unit only, short", () => {
    expect(formatAgo(0)).toBe("now");
    expect(formatAgo(-59)).toBe("now");
    expect(formatAgo(30)).toBe("now");
    expect(formatAgo(-60)).toBe("1min ago");
    expect(formatAgo(-(59 * 60 + 59))).toBe("59min ago");
    expect(formatAgo(-3_600)).toBe("1h ago");
    expect(formatAgo(-(2 * 3_600 + 48 * 60))).toBe("2h ago");
    expect(formatAgo(-(23 * 3_600 + 59 * 60))).toBe("23h ago");
    expect(formatAgo(-86_400)).toBe("1d ago");
    expect(formatAgo(-(3 * 86_400 + 5 * 3_600))).toBe("3d ago");
    expect(formatAgo(-7 * 86_400)).toBe("1w ago");
    expect(formatAgo(-29 * 86_400)).toBe("4w ago");
    expect(formatAgo(-30 * 86_400)).toBe("1mo ago");
    expect(formatAgo(-100 * 86_400)).toBe("3mo ago");
    expect(formatAgo(-364 * 86_400)).toBe("12mo ago");
    expect(formatAgo(-365 * 86_400)).toBe("1y ago");
    expect(formatAgo(-3 * 365 * 86_400)).toBe("3y ago");
  });

  it("writes a moment relative to now, to the minute", () => {
    expect(formatRelative(0)).toBe("in less than a minute");
    expect(formatRelative(59)).toBe("in less than a minute");
    expect(formatRelative(60)).toBe("in 1 min");
    expect(formatRelative(12 * 60 + 40)).toBe("in 12 min");
    expect(formatRelative(3600)).toBe("in 1 h");
    expect(formatRelative(3600 + 5 * 60)).toBe("in 1 h 05 min");
    expect(formatRelative(23 * 3600 + 12 * 60 + 59)).toBe("in 23 h 12 min");
    expect(formatRelative(86_400)).toBe("in 24 h");
    expect(formatRelative(47 * 3600 + 59 * 60)).toBe("in 47 h 59 min");
    expect(formatRelative(2 * 86_400 + 3 * 3600)).toBe("in 2 d 3 h");
    expect(formatRelative(-1)).toBe("less than a minute ago");
    expect(formatRelative(-3 * 60)).toBe("3 min ago");
    expect(formatRelative(-2 * 3600)).toBe("2 h ago");
    expect(formatRelative(-3 * 60, { ended: true })).toBe("ended 3 min ago");
    expect(formatRelative(-2 * 3600, { ended: true })).toBe("ended 2 h ago");
    expect(formatRelative(-30, { ended: true })).toBe("ended less than a minute ago");
    expect(formatRelative(-3 * 86_400, { ended: true })).toBe("ended 3 d ago");
  });

  it("writes a game boundary in UTC with its label, whatever the process zone", () => {
    expect(formatBoundary(Date.UTC(2026, 9, 16, 17, 0) / 1000)).toBe("Fri, Oct 16, 17:00 UTC");
    expect(formatBoundary(Date.UTC(2026, 9, 17, 0, 0) / 1000)).toBe("Sat, Oct 17, 00:00 UTC");
  });
});

// P-82: a grouping separator is a comma, never a space, a no-break space (U+00A0) or a narrow no-break space (U+202F).
describe("no space as a grouping separator (P-82)", () => {
  const SPACES = /[\s\u00a0\u202f]/;
  const outputs: [string, string][] = [
    ["formatNumber large", formatNumber(123456789012.345)],
    ["formatNumber negative", formatNumber(-1234567.891)],
    ["formatNumber decimals", formatNumber(1234.5, { minFractionDigits: 3 })],
    ["formatNumber bigint", formatNumber(-12345678901234567890n)],
    ["formatInteger large", formatInteger(9_876_543_210)],
    ["formatInteger negative", formatInteger(-1_270)],
    ["formatFixed", formatFixed(-1234567.5, 2)],
    ["formatCompact", formatCompact(-1_250_000)],
    ["formatPercent", formatPercent(12345.678, { maxFractionDigits: 2 })],
    ["formatBps", formatBps(-1_234_567)],
    ["formatUnits", formatUnits(-12_345_678_900_000n, 6, 2)],
  ];
  it.each(outputs)("%s", (_name, text) => {
    expect(text).not.toMatch(SPACES);
  });
});
