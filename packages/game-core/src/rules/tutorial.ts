// The Tutorial's steps (#977, the owner's decisions of 2026-11-01): a mission category before the Daily, whose steps are done in
// order, each unlocked by the completion of the one before, each paying its Cobbles once. Open points' defaults: the eight steps
// below, 170 Cobbles in all (points 1 and 2); the next step opens when the one before is completed, not claimed, so a forgotten
// claim never blocks the player (point 3); an action done before its step opened counts, so such a step is completed as soon as
// it opens (point 4); the category ends once every step is claimed (point 5). The mock applies these rules (`data/mock/ledger.ts`
// of the app) and the contracts are to mirror them (#738): each step a quest that never resets, the one before as its condition.

/**
 * What a step counts, each a first action of the game's loop: a layout saved with a tile placed, a Challenge game finished (task 1
 * of the contracts, `TASK_GAME_FINISHED`), a PvP attack settled (task 19), an attack won with a star or more (task 21), a chest
 * opened, a plan bought in the shop, a gift of the day's bar claimed, and the player's level (a level, not a count of actions).
 */
export type TutorialTask = "layout-saved" | "challenge-finished" | "attack-settled" | "attack-won" | "chest-opened" | "shop-bought" | "milestone-claimed" | "level";

/** The tasks, in the steps' order. */
export const TUTORIAL_TASKS: readonly TutorialTask[] = ["layout-saved", "challenge-finished", "attack-settled", "attack-won", "chest-opened", "shop-bought", "milestone-claimed", "level"];

/** A step of the Tutorial: its number (1 first), what it counts and how much, its Cobbles, and the contracts' task where one exists. */
export interface TutorialStep {
  id: number;
  task: TutorialTask;
  /** The count that completes the step: a count of actions, or the level to reach. */
  target: number;
  cobbles: number;
  /** The task id of the contracts (`TaskId`, `constants.cairo`) that counts it today; null: a task #738 has to add. */
  taskId: number | null;
}

/** The eight steps (#977 open point 1's default), in order: from the village to level 3. */
export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  { id: 1, task: "layout-saved", target: 1, cobbles: 10, taskId: null },
  { id: 2, task: "challenge-finished", target: 1, cobbles: 10, taskId: 1 },
  { id: 3, task: "attack-settled", target: 1, cobbles: 15, taskId: 19 },
  { id: 4, task: "attack-won", target: 1, cobbles: 15, taskId: 21 },
  { id: 5, task: "chest-opened", target: 1, cobbles: 20, taskId: null },
  { id: 6, task: "shop-bought", target: 1, cobbles: 20, taskId: null },
  { id: 7, task: "milestone-claimed", target: 1, cobbles: 30, taskId: null },
  { id: 8, task: "level", target: 3, cobbles: 50, taskId: null },
];

/** The Tutorial's Cobbles in all (#977 open point 2's default: 170). */
export const TUTORIAL_COBBLES = TUTORIAL_STEPS.reduce((sum, s) => sum + s.cobbles, 0);

/** A player's count of each task, whenever it was done: before its step opened included (open point 4). */
export type TutorialCounts = Readonly<Record<TutorialTask, number>>;

/** No action done yet, level 0: a player the mock has not seen. */
export const emptyTutorialCounts = (): Record<TutorialTask, number> => ({
  "layout-saved": 0,
  "challenge-finished": 0,
  "attack-settled": 0,
  "attack-won": 0,
  "chest-opened": 0,
  "shop-bought": 0,
  "milestone-claimed": 0,
  level: 0,
});

/**
 * Where a step stands: locked (a step before it is not completed), open (the step to do now, not completed), done (completed, its
 * Cobbles to claim) or claimed.
 */
export type TutorialStepState = "locked" | "open" | "done" | "claimed";

/** Why a step's Cobbles cannot be claimed: no such step, a step before it not completed, the step itself not completed, or claimed. */
export type TutorialStepRefusal = "no-step" | "locked" | "not-done" | "claimed";

/** The step numbered `id`, or null. */
export const tutorialStep = (id: number): TutorialStep | null => (Number.isInteger(id) ? (TUTORIAL_STEPS[id - 1] ?? null) : null);

/** Bit `id - 1` of the claimed word: step `id`'s Cobbles claimed. */
export const tutorialStepClaimed = (claimed: number, id: number): boolean => Number.isInteger(id) && id >= 1 && ((claimed >>> (id - 1)) & 1) === 1;

const reached = (step: TutorialStep, counts: TutorialCounts): boolean => (counts[step.task] ?? 0) >= step.target;

/** How many steps are completed, in order: the steps before the first whose count is short. 8: every step completed. */
export function tutorialCompleted(counts: TutorialCounts): number {
  const short = TUTORIAL_STEPS.findIndex((s) => !reached(s, counts));
  return short === -1 ? TUTORIAL_STEPS.length : short;
}

/** The step open now (the first not completed), or null once every step is completed. At the start only step 1 is open. */
export function tutorialOpen(counts: TutorialCounts): TutorialStep | null {
  return TUTORIAL_STEPS[tutorialCompleted(counts)] ?? null;
}

/** Each step's state, in order, for `counts` and `claimed` (a word, bit `id - 1` per step). */
export function tutorialStates(counts: TutorialCounts, claimed: number): TutorialStepState[] {
  const completed = tutorialCompleted(counts);
  return TUTORIAL_STEPS.map((s, i) => (tutorialStepClaimed(claimed, s.id) ? "claimed" : i < completed ? "done" : i === completed ? "open" : "locked"));
}

/** Why step `id`'s Cobbles cannot be claimed for `counts` and `claimed`; null when they can. */
export function tutorialStepRefusal(id: number, counts: TutorialCounts, claimed: number): TutorialStepRefusal | null {
  const step = tutorialStep(id);
  if (!step) return "no-step";
  if (tutorialStepClaimed(claimed, id)) return "claimed";
  const completed = tutorialCompleted(counts);
  if (id - 1 > completed) return "locked";
  if (id - 1 === completed) return "not-done";
  return null;
}

/** The steps completed and not claimed yet (for the home's Missions count). */
export function tutorialToClaim(counts: TutorialCounts, claimed: number): number {
  return tutorialStates(counts, claimed).filter((s) => s === "done").length;
}

/** Whether every step is claimed: the Tutorial's section then goes (open point 5). */
export function tutorialFinished(claimed: number): boolean {
  return TUTORIAL_STEPS.every((s) => tutorialStepClaimed(claimed, s.id));
}
