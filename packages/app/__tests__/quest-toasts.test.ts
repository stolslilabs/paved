import { describe, expect, it } from "vitest";
import { completionKey, newlyCompleted, type Trackable } from "../src/lib/quest-toasts";

const q = (id: number, completed: boolean, intervalId = 6): Trackable => ({ id, intervalId, completed });

describe("newlyCompleted", () => {
  it("returns the quests that went from under way to complete", () => {
    const prev = [q(1, true), q(2, false), q(3, false)];
    const next = [q(1, true), q(2, true), q(3, false)];
    expect(newlyCompleted("quest", prev, next).map((t) => t.id)).toEqual([2]);
  });

  it("returns several at once, in the new list's order", () => {
    expect(newlyCompleted("quest", [q(1, false), q(2, false)], [q(1, true), q(2, true)]).map((t) => t.id)).toEqual([1, 2]);
  });

  it("returns nothing on a first read, however much is already complete", () => {
    expect(newlyCompleted("quest", null, [q(1, true), q(2, true)])).toEqual([]);
  });

  it("returns nothing for the same data read again", () => {
    const list = [q(1, true), q(2, false)];
    expect(newlyCompleted("quest", list, [...list])).toEqual([]);
  });

  it("returns nothing for a quest absent before (a new interval or definition), or one that went backwards", () => {
    expect(newlyCompleted("quest", [q(1, false, 5)], [q(1, true, 6)])).toEqual([]);
    expect(newlyCompleted("quest", [q(1, false)], [q(2, true)])).toEqual([]);
    expect(newlyCompleted("quest", [q(1, true)], [q(1, false)])).toEqual([]);
  });

  it("shows a (quest, interval) once: not again once announced, even if progress dips and returns", () => {
    const announced = new Set([completionKey("quest", q(2, true))]);
    expect(newlyCompleted("quest", [q(2, false)], [q(2, true)], announced)).toEqual([]);
    // The same quest in the next interval is a new key.
    expect(newlyCompleted("quest", [q(2, false, 7)], [q(2, true, 7)], announced).map((t) => t.id)).toEqual([2]);
  });

  it("keys an achievement without an interval, apart from a quest of the same id", () => {
    const a: Trackable = { id: 2, completed: false };
    expect(newlyCompleted("achievement", [a], [{ ...a, completed: true }]).map((t) => t.id)).toEqual([2]);
    expect(completionKey("achievement", a)).toBe("achievement:2:0");
    expect(completionKey("quest", q(2, true))).toBe("quest:2:6");
  });
});
