import { describe, expect, it } from "vitest";
import { ACHIEVEMENT_TEXT, QUEST_TEXT, TUTORIAL_TEXT, missionTask } from "../src/components/containers/quest-text";

// MISSIONS-PAGE and HOME-EDGES (the owner's asks of 2026-11-04): the Missions card and the home's mission tab show a mission's task,
// the description's first clause, on one line: what follows a colon or a comma names the target's tier or the period.

describe("the mission's task", () => {
  it("is the description up to its first colon or comma, without the full stop", () => {
    expect(missionTask("Score roads and cities in a day: the middle of three rotating targets.")).toBe("Score roads and cities in a day");
    expect(missionTask("Score forests over the week, Monday to Sunday UTC.")).toBe("Score forests over the week");
    expect(missionTask("Settle an attack in PvP: win, lose or surrender.")).toBe("Settle an attack in PvP");
    expect(missionTask("Finish today's Challenge.")).toBe("Finish today's Challenge");
    expect(missionTask("")).toBe("");
  });

  const all = [...Object.entries(QUEST_TEXT).map(([id, t]) => [`quest ${id}`, t] as const), ...Object.entries(ACHIEVEMENT_TEXT).map(([id, t]) => [`achievement ${id}`, t] as const),
    ...Object.entries(TUTORIAL_TEXT).map(([task, t]) => [`tutorial ${task}`, t] as const),
  ];

  it.each(all)("%s: its task is words, no colon, comma or full stop", (_, { description }) => {
    expect(missionTask(description)).toMatch(/^[A-Z][^:,]*[^.]$/);
  });
});
