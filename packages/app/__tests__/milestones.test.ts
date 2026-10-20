import { describe, expect, it } from "vitest";
import { completionLine } from "../src/components/containers/completion-toasts";
import { stepState } from "../src/components/containers/mission-track-card";
import { taskLeft } from "../src/components/containers/quest-text";
import { MULTI_TASK, milestoneFill, milestoneTracks, nextStep } from "../src/lib/milestones";
import { completedAtEnd } from "../src/lib/quest-toasts";
import { QUESTS_TIERED, QUESTS_TODAY } from "../src/mocks/quests";

const entry = (id: number, taskId: number, total: number, count: number, group = "daily") => ({
  id,
  group,
  tasks: [{ taskId, total, count: Math.min(count, total) }],
  completed: count >= total,
});

describe("milestone tracks (#595)", () => {
  it("groups the tiers of one task in one window into one track, steps by target, the count the largest served", () => {
    const tracks = milestoneTracks([entry(7, 2, 12, 9), entry(1, 1, 1, 1), entry(5, 2, 4, 9), entry(6, 2, 8, 9), entry(15, 2, 30, 22, "weekly")], (e) => e.group);
    expect(tracks.map((t) => [t.key, t.count, t.steps.map((s) => [s.entry.id, s.target, s.reached])])).toEqual([
      ["daily:2", 9, [[5, 4, true], [6, 8, true], [7, 12, false]]],
      ["daily:1", 1, [[1, 1, true]]],
      ["weekly:2", 22, [[15, 30, false]]],
    ]);
    expect(nextStep(tracks[0])).toMatchObject({ step: { target: 12 }, left: 3 });
    expect(nextStep(tracks[1])).toBeNull();
  });

  it("keeps a mission of several tasks on a track of its own", () => {
    const multi = { tasks: [{ taskId: 2, total: 4, count: 1 }, { taskId: 4, total: 2, count: 0 }], completed: false };
    const tracks = milestoneTracks([multi, { ...multi }], () => "daily");
    expect(tracks).toHaveLength(2);
    expect(tracks[0].taskId).toBe(MULTI_TASK);
    // Its entry keeps every task, for the scene to draw each.
    expect(tracks[0].steps.map((s) => s.entry.tasks.map((t) => t.taskId))).toEqual([[2, 4]]);
  });

  it("the fresh definitions: one step per track; the tiered proposal: three steps per family", () => {
    const today = milestoneTracks(QUESTS_TODAY.quests, (q) => `${q.duration}:${q.start}:${q.interval}`);
    expect(today.every((t) => t.steps.length === 1)).toBe(true);
    const tiered = milestoneTracks(QUESTS_TIERED.quests, (q) => `${q.duration}:${q.start}:${q.interval}`);
    expect(tiered.map((t) => t.steps.length)).toEqual([1, 3, 3, 3, 2, 2, 2]);
  });

  it("fills the bar evenly between steps", () => {
    expect(milestoneFill(0, [4, 8, 12])).toBe(0);
    expect(milestoneFill(2, [4, 8, 12])).toBeCloseTo(1 / 6);
    expect(milestoneFill(4, [4, 8, 12])).toBeCloseTo(1 / 3);
    expect(milestoneFill(6, [4, 8, 12])).toBeCloseTo(0.5);
    expect(milestoneFill(12, [4, 8, 12])).toBe(1);
    expect(milestoneFill(99, [4, 8, 12])).toBe(1);
    expect(milestoneFill(2_710, [5_000])).toBeCloseTo(0.542);
    expect(milestoneFill(3, [])).toBe(0);
  });

  it("names a step's state from its reward and its place", () => {
    const step = (reached: boolean, reward?: { cobbles: number; claimed: boolean }) => ({ id: 1, title: "x", target: 1, reached, completedAt: null, reward });
    expect(stepState(step(true, { cobbles: 5, claimed: true }), false)).toBe("claimed");
    expect(stepState(step(true, { cobbles: 5, claimed: false }), false)).toBe("claimable");
    expect(stepState(step(true), false)).toBe("done");
    expect(stepState(step(false), true)).toBe("next");
    expect(stepState(step(false), false)).toBe("locked");
  });

  it("says what is left, one and many", () => {
    expect(taskLeft(4, 1)).toBe("1 more forest");
    expect(taskLeft(2, 3)).toBe("3 more roads or cities");
    expect(taskLeft(3, 2_290)).toBe("2,290 more points");
    expect(taskLeft(99, 2)).toBe("2 more units");
  });
});

describe("completions of one game (#595)", () => {
  it("are the entries completed at the game's end", () => {
    const list = [
      { id: 1, completed: true, completedAt: 1_600 },
      { id: 2, completed: true, completedAt: 1_300 },
      { id: 3, completed: false, completedAt: null },
    ];
    expect(completedAtEnd(list, 1_600).map((e) => e.id)).toEqual([1]);
    expect(completedAtEnd(list, 0)).toEqual([]);
  });

  it("a toast's line carries the points and the Cobbles to claim", () => {
    expect(completionLine({ cobbles: 10 })).toBe("+10 Cobbles to claim");
    expect(completionLine({ cobbles: 1 })).toBe("+1 Cobble to claim");
    expect(completionLine({ description: "+20 pts", cobbles: 20 })).toBe("+20 pts · +20 Cobbles to claim");
    expect(completionLine({})).toBeUndefined();
  });
});
