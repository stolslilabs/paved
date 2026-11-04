import { describe, expect, it } from "vitest";
import { QUEST_TEXT } from "../src/components/containers/quest-text";
import { missionTask } from "../src/data/mission-progress";

// HOME-EDGES: the home's mission in progress shows its task under its title (the owner's ask of 2026-11-04), the description's first
// clause: what follows a colon names the target's tier ("the middle of three rotating targets"), not what to do.
describe("the mission's task", () => {
  it("is the description up to its colon, without the full stop", () => {
    expect(missionTask("Score roads and cities in a day: the middle of three rotating targets.")).toBe("Score roads and cities in a day");
    expect(missionTask("Score forests over the week, Monday to Sunday UTC.")).toBe("Score forests over the week, Monday to Sunday UTC");
    expect(missionTask("")).toBe("");
  });

  it("gives every mission a task: words, no colon, no full stop (the capsule cuts it to one line)", () => {
    for (const [id, { description }] of Object.entries(QUEST_TEXT)) {
      const task = missionTask(description);
      expect(task, `quest ${id}`).toMatch(/^[A-Z][^:]*[^.]$/);
    }
  });
});
