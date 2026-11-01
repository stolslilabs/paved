import { TUTORIAL_TASKS, emptyTutorialCounts } from "@paved/game-core";
import { trackerState, type TrackerState } from "../components/containers/missions-tracker-lines";
import { QUESTS_TODAY, QUESTS_TODAY_ALL_DONE, QUESTS_TODAY_FRESH } from "./quests";
import { MOCK_NOW } from "./clock";

/**
 * The home's missions tracker (#978), its lines as `trackerState` ranks them from the Missions page's mocks: the Tutorial's steps
 * (`done` steps counted, `claimed` their bits) and today's quests (`mocks/quests.ts`), on the mocks' clock.
 */
const tutorial = (done: number, claimed: number) => {
  const counts = { ...emptyTutorialCounts(), level: done >= 8 ? 3 : 1 };
  TUTORIAL_TASKS.slice(0, Math.min(done, 7)).forEach((t) => (counts[t] = 1));
  return { counts, claimed };
};

export const TRACKER = {
  /** A new player: Builder (the Tutorial's step 1, 0 / 1), then Daily Run and Public Works, nothing counted (a tie: the day's first). */
  newPlayer: trackerState({ quests: QUESTS_TODAY_FRESH, tutorial: tutorial(0, 0), now: MOCK_NOW }),
  /** Mid-way: Raider done and not claimed (Claim), Victor open (0 / 1), then Weekly Builder, 22 / 30, the quest the furthest along. */
  midWay: trackerState({ quests: QUESTS_TODAY, tutorial: tutorial(3, 0b11), now: MOCK_NOW }),
  /** The Tutorial claimed whole: the three quests the furthest along, Weekly Builder, Weekly Points (12.4K / 20K) and Weekly Forester. */
  questsOnly: trackerState({ quests: QUESTS_TODAY, tutorial: tutorial(8, 0b11111111), now: MOCK_NOW }),
  /** Three steps done and none claimed: three Claims, nothing else fits. */
  threeToClaim: trackerState({ quests: QUESTS_TODAY, tutorial: tutorial(3, 0), now: MOCK_NOW }),
  /** One mission left: the five dailies done, the Tutorial claimed, the weeklies done but Weekly Stars. */
  oneLeft: trackerState({
    quests: { ...QUESTS_TODAY_ALL_DONE, quests: QUESTS_TODAY_ALL_DONE.quests.map((q) => (q.questId === 21 ? QUESTS_TODAY.quests.find((t) => t.questId === 21)! : q)) },
    tutorial: tutorial(8, 0b11111111),
    now: MOCK_NOW,
  }),
  /** Everything done: one line, "All done", with the countdown to the day's reset. */
  allDone: trackerState({ quests: QUESTS_TODAY_ALL_DONE, tutorial: tutorial(8, 0b11111111), now: MOCK_NOW }),
  /** A guest, or the quests not read: a plain line to the Missions page. */
  none: { kind: "none" },
} satisfies Record<string, TrackerState>;
