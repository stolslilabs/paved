import { describe, expect, it } from "vitest";
import { DAY_S, WEEK_S, endOfUtcDay, isLive, isLiveOnDay, questPeriod, questWindow, windowEnd, type QuestSchedule } from "../src/lib/quest-window";

// Day 20,000 starts at 1,728,000,000 s (a Friday). Everything below is relative to it.
const D0 = 20_000 * DAY_S;
const everyDay: QuestSchedule = { start: D0, interval: DAY_S, duration: DAY_S };
/** Nums' scheme: one day live in a 3-day interval, `start` offset by 0, 1 or 2 days. */
const rotating = (offset: number): QuestSchedule => ({ start: D0 + offset * DAY_S, interval: 3 * DAY_S, duration: DAY_S });
const weekly: QuestSchedule = { start: D0, interval: WEEK_S, duration: WEEK_S };

describe("questWindow", () => {
  it("is active today for a quest in today's slot, with the window's id and end", () => {
    const now = D0 + 6 * DAY_S + 15 * 3_600; // day 6, 15:00
    const w = questWindow(rotating(0), now);
    expect(w).toEqual({ active: true, intervalId: 2, opensAt: D0 + 6 * DAY_S, endsAt: D0 + 7 * DAY_S });
    expect(questWindow(everyDay, now)).toMatchObject({ active: true, intervalId: 6, endsAt: D0 + 7 * DAY_S });
  });

  it("is not live today for the other two slots of the rotation, and the three cover every day once", () => {
    const now = D0 + 6 * DAY_S + 15 * 3_600;
    expect(isLive(rotating(1), now)).toBe(false);
    expect(isLive(rotating(2), now)).toBe(false);
    // The interval id is the one the slot is in even when it is not live: the next window is the id after.
    expect(questWindow(rotating(1), now)).toMatchObject({ active: false, intervalId: 1, endsAt: D0 + 5 * DAY_S });
    for (let day = 0; day < 9; day++) {
      const live = [0, 1, 2].filter((o) => isLive(rotating(o), D0 + day * DAY_S + 1));
      expect(live).toEqual([day % 3]);
    }
  });

  it("ends the day exactly at the second: the last second is live, the next opens the next window", () => {
    const end = D0 + 6 * DAY_S + DAY_S;
    expect(questWindow(rotating(0), end - 1)).toMatchObject({ active: true, intervalId: 2, endsAt: end });
    expect(isLive(rotating(0), end)).toBe(false);
    // An every-day quest rolls straight into the next interval id.
    expect(questWindow(everyDay, end - 1)).toMatchObject({ active: true, intervalId: 6 });
    expect(questWindow(everyDay, end)).toMatchObject({ active: true, intervalId: 7, opensAt: end, endsAt: end + DAY_S });
  });

  it("ends the week exactly at the second, from its own start (a Friday here, not a Monday)", () => {
    const end = weekly.start + 2 * WEEK_S + WEEK_S; // the end of interval id 2
    expect(questWindow(weekly, end - 1)).toMatchObject({ active: true, intervalId: 2, endsAt: end });
    expect(questWindow(weekly, end)).toMatchObject({ active: true, intervalId: 3, opensAt: end, endsAt: end + WEEK_S });
    expect(new Date(end * 1000).getUTCDay()).toBe(new Date(weekly.start * 1000).getUTCDay());
    expect(new Date(weekly.start * 1000).getUTCDay()).toBe(5);
  });

  it("reads an offset start: before it, nothing is live; at it, interval 0 opens", () => {
    const q = rotating(2);
    expect(questWindow(q, q.start - 1)).toMatchObject({ active: false, intervalId: -1, opensAt: q.start });
    expect(questWindow(q, q.start)).toMatchObject({ active: true, intervalId: 0, opensAt: q.start, endsAt: q.start + DAY_S });
    expect(isLive(q, q.start + 3 * DAY_S)).toBe(true);
    expect(questWindow(q, q.start + 3 * DAY_S)).toMatchObject({ intervalId: 1 });
    expect(isLive(q, q.start + 4 * DAY_S)).toBe(false);
  });

  it("treats an interval of 0 as one window", () => {
    const once: QuestSchedule = { start: D0, interval: 0, duration: DAY_S };
    expect(questWindow(once, D0 + 10)).toMatchObject({ active: true, intervalId: 0, endsAt: D0 + DAY_S });
    expect(isLive(once, D0 + DAY_S)).toBe(false);
    expect(isLive(once, D0 + 40 * DAY_S)).toBe(false);
  });
});

describe("isLiveOnDay", () => {
  it("lists a quest on the days of its slot only, and none before its start", () => {
    const days = Array.from({ length: 9 }, (_, i) => 20_000 + i).filter((d) => isLiveOnDay(rotating(1), d));
    expect(days).toEqual([20_001, 20_004, 20_007]);
    expect(isLiveOnDay(rotating(1), 19_999)).toBe(false);
  });

  it("lists a weekly on every day of its week, and not before its start", () => {
    expect(isLiveOnDay(weekly, 19_999)).toBe(false);
    expect(Array.from({ length: 14 }, (_, i) => 20_000 + i).every((d) => isLiveOnDay(weekly, d))).toBe(true);
    // A quest live 2 days of every 7 is listed on those two days of each week only.
    const part: QuestSchedule = { start: D0 + DAY_S, interval: WEEK_S, duration: 2 * DAY_S };
    expect(Array.from({ length: 14 }, (_, i) => 20_000 + i).filter((d) => isLiveOnDay(part, d))).toEqual([20_001, 20_002, 20_008, 20_009]);
  });
});

describe("period and ends", () => {
  it("tells a daily from a weekly by its duration", () => {
    expect(questPeriod(everyDay)).toBe("daily");
    expect(questPeriod(rotating(0))).toBe("daily");
    expect(questPeriod(weekly)).toBe("weekly");
  });

  it("closes the UTC day at the next midnight, a second before included", () => {
    expect(endOfUtcDay(D0)).toBe(D0 + DAY_S);
    expect(endOfUtcDay(D0 + DAY_S - 1)).toBe(D0 + DAY_S);
  });

  it("gives the soonest end among the live quests, null when none is live", () => {
    const now = D0 + 6 * DAY_S + 3_600;
    expect(windowEnd([rotating(0), rotating(1), everyDay], now)).toBe(D0 + 7 * DAY_S);
    expect(windowEnd([weekly], now)).toBe(D0 + WEEK_S);
    expect(windowEnd([rotating(1)], now)).toBeNull();
    expect(windowEnd([], now)).toBeNull();
  });
});
