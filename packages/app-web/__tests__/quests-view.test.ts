import { describe, expect, it } from "vitest";

import { ACHIEVEMENT_TEXT, QUEST_TEXT, achievementTitle, questTitle, scheduleLabel } from "../src/utils/quests-view";

const DAY = 86400;

describe("the texts of quests and achievements", () => {
  it("knows every quest of v1 and v2a (1 to 16) and every achievement (1 to 16), so no screen shows an id", () => {
    for (let id = 1; id <= 16; id++) {
      expect(QUEST_TEXT[id], `quest ${id}`).toBeDefined();
      expect(QUEST_TEXT[id]!.description.length).toBeGreaterThan(0);
      expect(questTitle(id)).not.toContain("#");
      expect(ACHIEVEMENT_TEXT[id], `achievement ${id}`).toBeDefined();
      expect(ACHIEVEMENT_TEXT[id]!.description.length).toBeGreaterThan(0);
      expect(achievementTitle(id)).not.toContain("#");
    }
  });

  it("uses the titles quests.md proposes for v2a", () => {
    expect([5, 6, 7, 8, 9, 10, 11, 12, 13].map(questTitle)).toEqual([
      "Small Works", "Public Works", "Great Works", "Woodland Walk", "Deep Woods", "Old Growth", "Warm-Up Score", "Strong Day", "Grand Day",
    ]);
    expect([14, 15, 16].map(questTitle)).toEqual(["Weekly Forester", "Weekly Builder", "Weekly Points"]);
    expect([10, 11, 12, 13, 14, 15, 16].map(achievementTitle)).toEqual([
      "Forester II", "Pilgrimage II", "Grand Builder II", "High Roller II", "High Roller III", "Settler IV", "Settler V",
    ]);
  });

  it("shows an id the list does not know by its number", () => {
    expect(questTitle(99)).toBe("Quest #99");
    expect(achievementTitle(99)).toBe("Achievement #99");
  });
});

describe("scheduleLabel", () => {
  const at = (duration: number, interval: number) => ({ startTime: 0, endTime: 0, duration, interval });

  it("keeps the v1 labels", () => {
    expect(scheduleLabel(at(DAY, DAY))).toBe("Every UTC day");
    expect(scheduleLabel(at(0, 0))).toBe("Once");
  });

  it("says every third UTC day for the 3-day rotation of v2a", () => {
    expect(scheduleLabel({ startTime: DAY, endTime: 0, duration: DAY, interval: 3 * DAY })).toBe("Every third UTC day");
  });

  it("says every week, Monday to Sunday UTC, for the weeklies of v2a", () => {
    expect(scheduleLabel({ startTime: 345_600, endTime: 0, duration: 7 * DAY, interval: 7 * DAY })).toBe("Every week (Monday to Sunday UTC)");
  });

  it("guesses nothing for another schedule", () => {
    expect(scheduleLabel(at(DAY, 2 * DAY))).toBe("On a custom schedule");
    expect(scheduleLabel(at(3 * DAY, 3 * DAY))).toBe("On a custom schedule");
  });
});
