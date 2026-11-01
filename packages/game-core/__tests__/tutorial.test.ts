/** The Tutorial's steps (#977): done in order, each unlocked by the completion of the one before, each paying its Cobbles once. */
import { describe, expect, it } from "vitest";
import {
  TUTORIAL_COBBLES,
  TUTORIAL_STEPS,
  TUTORIAL_TASKS,
  emptyTutorialCounts,
  tutorialCompleted,
  tutorialFinished,
  tutorialOpen,
  tutorialStates,
  tutorialStep,
  tutorialStepClaimed,
  tutorialStepRefusal,
  tutorialToClaim,
  type TutorialCounts,
  type TutorialTask,
} from "../src";

const counts = (done: Partial<Record<TutorialTask, number>> = {}): TutorialCounts => ({ ...emptyTutorialCounts(), ...done });

/** Every step's task reached up to step `n` (1 to 8), none after. */
const upTo = (n: number): TutorialCounts => counts(Object.fromEntries(TUTORIAL_STEPS.slice(0, n).map((s) => [s.task, s.target])));

/** The claimed word of the steps `ids`. */
const word = (...ids: number[]) => ids.reduce((w, id) => w | (1 << (id - 1)), 0);

const ALL = word(1, 2, 3, 4, 5, 6, 7, 8);

describe("the Tutorial's steps", () => {
  it("are the eight of open point 1's default, in order, 170 Cobbles in all", () => {
    expect(TUTORIAL_STEPS.map((s) => [s.id, s.task, s.target, s.cobbles, s.taskId])).toEqual([
      [1, "layout-saved", 1, 10, null],
      [2, "challenge-finished", 1, 10, 1],
      [3, "attack-settled", 1, 15, 19],
      [4, "attack-won", 1, 15, 21],
      [5, "chest-opened", 1, 20, null],
      [6, "shop-bought", 1, 20, null],
      [7, "milestone-claimed", 1, 30, null],
      [8, "level", 3, 50, null],
    ]);
    expect(TUTORIAL_STEPS.map((s) => s.task)).toEqual(TUTORIAL_TASKS);
    expect(TUTORIAL_COBBLES).toBe(170);
    // The claims fit one word, one bit per step.
    expect(TUTORIAL_STEPS.length).toBeLessThanOrEqual(31);
  });

  it("finds a step by its number, none outside 1 to 8", () => {
    expect(tutorialStep(1)).toBe(TUTORIAL_STEPS[0]);
    expect(tutorialStep(8)).toBe(TUTORIAL_STEPS[7]);
    for (const id of [0, 9, -1, 1.5, Number.NaN]) expect(tutorialStep(id)).toBeNull();
  });
});

describe("the order and the unlocking", () => {
  it("opens step 1 alone for a new player, steps 2 to 8 locked", () => {
    expect(tutorialCompleted(counts())).toBe(0);
    expect(tutorialOpen(counts())?.id).toBe(1);
    expect(tutorialStates(counts(), 0)).toEqual(["open", "locked", "locked", "locked", "locked", "locked", "locked", "locked"]);
  });

  it("opens each next step once the one before is completed, not claimed", () => {
    for (let n = 1; n < TUTORIAL_STEPS.length; n++) {
      expect(tutorialCompleted(upTo(n))).toBe(n);
      expect(tutorialOpen(upTo(n))?.id).toBe(n + 1);
      const states = tutorialStates(upTo(n), 0);
      expect(states.slice(0, n).every((s) => s === "done")).toBe(true);
      expect(states[n]).toBe("open");
      expect(states.slice(n + 1).every((s) => s === "locked")).toBe(true);
    }
  });

  it("completes a step whose action was done before it opened, as soon as it opens", () => {
    // A chest opened and a plan bought first: steps 5 and 6 stay locked behind step 1.
    const early = counts({ "chest-opened": 1, "shop-bought": 2 });
    expect(tutorialStates(early, 0)).toEqual(["open", "locked", "locked", "locked", "locked", "locked", "locked", "locked"]);
    // Steps 1 to 4 done: 5 and 6 are completed as they open, 7 is the one open.
    const later = { ...upTo(4), "chest-opened": 1, "shop-bought": 2 };
    expect(tutorialCompleted(later)).toBe(6);
    expect(tutorialOpen(later)?.id).toBe(7);
    // A player already at level 5: step 8 is completed when it opens.
    expect(tutorialCompleted({ ...upTo(7), level: 5 })).toBe(8);
  });

  it("counts the level as a level reached: 2 is short of step 8, 3 completes it", () => {
    expect(tutorialStates({ ...upTo(7), level: 2 }, 0)[7]).toBe("open");
    expect(tutorialStates({ ...upTo(7), level: 3 }, 0)[7]).toBe("done");
  });

  it("has no step open once every step is completed", () => {
    expect(tutorialOpen(upTo(8))).toBeNull();
    expect(tutorialStates(upTo(8), 0).every((s) => s === "done")).toBe(true);
  });

  it("shows claimed what is claimed, whatever the counts", () => {
    expect(tutorialStates(upTo(3), word(1, 3))).toEqual(["claimed", "done", "claimed", "open", "locked", "locked", "locked", "locked"]);
    expect(tutorialStepClaimed(word(3), 3)).toBe(true);
    expect(tutorialStepClaimed(word(3), 2)).toBe(false);
    for (const id of [0, -1, 1.5]) expect(tutorialStepClaimed(-1, id)).toBe(false);
  });
});

describe("a step's claim", () => {
  it("is allowed for a completed step not claimed yet, at any time, in any order", () => {
    expect(tutorialStepRefusal(1, upTo(1), 0)).toBeNull();
    // A forgotten claim: step 1 claimed after steps 2 to 4 are done.
    expect(tutorialStepRefusal(1, upTo(4), word(2, 3, 4))).toBeNull();
    for (const s of TUTORIAL_STEPS) expect(tutorialStepRefusal(s.id, upTo(8), 0)).toBeNull();
  });

  it("is refused `not-done` for the open step, `locked` for a step after it", () => {
    expect(tutorialStepRefusal(1, counts(), 0)).toBe("not-done");
    for (let id = 2; id <= 8; id++) expect(tutorialStepRefusal(id, counts(), 0)).toBe("locked");
    expect(tutorialStepRefusal(4, upTo(3), 0)).toBe("not-done");
    expect(tutorialStepRefusal(5, upTo(3), 0)).toBe("locked");
    // An action done early does not make its step claimable while it is locked.
    expect(tutorialStepRefusal(5, counts({ "chest-opened": 1 }), 0)).toBe("locked");
  });

  it("is refused `claimed` once claimed", () => {
    expect(tutorialStepRefusal(1, upTo(1), word(1))).toBe("claimed");
    expect(tutorialStepRefusal(8, upTo(8), ALL)).toBe("claimed");
  });

  it("is refused `no-step` outside 1 to 8", () => {
    for (const id of [0, 9, -1, 2.5]) expect(tutorialStepRefusal(id, upTo(8), 0)).toBe("no-step");
  });
});

describe("the Tutorial's end", () => {
  it("counts the steps completed and not claimed", () => {
    expect(tutorialToClaim(counts(), 0)).toBe(0);
    expect(tutorialToClaim(upTo(3), word(2))).toBe(2);
    expect(tutorialToClaim(upTo(8), ALL)).toBe(0);
  });

  it("ends once every step is claimed, not before", () => {
    expect(tutorialFinished(0)).toBe(false);
    expect(tutorialFinished(word(1, 2, 3, 4, 5, 6, 7))).toBe(false);
    expect(tutorialFinished(ALL)).toBe(true);
  });
});
