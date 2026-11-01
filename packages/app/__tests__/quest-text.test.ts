import { describe, expect, it } from "vitest";
import { ACHIEVEMENT_TEXT, DESCRIPTION_MAX, QUEST_TEXT } from "../src/components/containers/quest-text";

// The Missions card keeps two lines of description (#975): every text fits them at 320 px, so none is cut there. The count
// is measured once at 320 px (`DESCRIPTION_MAX`'s comment); a text over it is rewritten shorter.

describe("quest and achievement texts (#975)", () => {
  const all = [...Object.entries(QUEST_TEXT).map(([id, t]) => [`quest ${id}`, t] as const), ...Object.entries(ACHIEVEMENT_TEXT).map(([id, t]) => [`achievement ${id}`, t] as const)];

  it.each(all)("%s: its description fits two lines at 320 px", (_, { description }) => {
    expect(description.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
  });

  it("holds the measured count, with a margin under the 79 characters that took a third line", () => {
    expect(DESCRIPTION_MAX).toBeLessThan(79);
  });
});
