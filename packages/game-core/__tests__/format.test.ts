import { describe, expect, it } from "vitest";
import { LOCALE, formatBps, formatCompact, formatDate, formatFixed, formatInteger, formatNumber, formatPercent, formatUnits } from "../src/format";

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
});
