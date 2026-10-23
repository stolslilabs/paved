import { describe, expect, it } from "vitest";
import { CENTER } from "../src/engine";
import { PlanType } from "../src/types/plan";
import { decodeLine } from "../src/story/line";
import { CAMPAIGNS, OPEN_COUNTRY, TUTORIAL } from "../src/story/plan";
import {
  EMPTY_PROGRESS,
  STORY_KEY,
  campaignUnlocked,
  levelResult,
  levelUnlocked,
  loadProgress,
  recordRun,
  saveProgress,
  type StoryProgress,
  type StorySubmission,
} from "../src/story/progress";
import { StoryRun, replaySubmission } from "../src/story/run";
import type { KeyValueStore } from "../src/sessions/storage";

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

const run = (campaignId: number, levelIndex: number): StorySubmission => ({ campaignId, levelIndex, moves: [] });

/** Every level of `campaigns` finished with `stars`. */
function finished(stars: 1 | 2 | 3, campaigns = CAMPAIGNS): StoryProgress {
  let progress = EMPTY_PROGRESS;
  for (const campaign of campaigns) {
    for (const level of campaign.levels) {
      const score = stars === 3 ? level.target : stars === 2 ? Math.ceil(level.target * 0.7) : 0;
      progress = recordRun(progress, level, run(campaign.id, level.id), score);
    }
  }
  return progress;
}

describe("stars", () => {
  const level = { target: 1000, method: "exact" as const };
  it("gives 1 for a finish, 2 from 70 % of the target (rounded up), 3 at the target", () => {
    expect(levelResult(level, 0).stars).toBe(1);
    expect(levelResult(level, 699).stars).toBe(1);
    expect(levelResult(level, 700).stars).toBe(2);
    expect(levelResult(level, 999).stars).toBe(2);
    expect(levelResult(level, 1000).stars).toBe(3);
    expect(levelResult({ target: 321, method: "exact" }, 225).stars).toBe(2);
    expect(levelResult({ target: 321, method: "exact" }, 224).stars).toBe(1);
  });

  it("says when a score beats a best-known target", () => {
    expect(levelResult({ target: 1000, method: "best-known" }, 1001)).toMatchObject({ stars: 3, bestKnown: true, beatsTarget: true });
    expect(levelResult({ target: 1000, method: "best-known" }, 1000).beatsTarget).toBe(false);
  });
});

describe("unlocks", () => {
  it("opens the first level of the Tutorial, and each next level once the one before is finished", () => {
    expect(levelUnlocked(EMPTY_PROGRESS, CAMPAIGNS, TUTORIAL, 1)).toBe(true);
    expect(levelUnlocked(EMPTY_PROGRESS, CAMPAIGNS, TUTORIAL, 2)).toBe(false);
    const one = recordRun(EMPTY_PROGRESS, TUTORIAL.levels[0]!, run(1, 1), 0);
    expect(levelUnlocked(one, CAMPAIGNS, TUTORIAL, 2)).toBe(true);
    expect(levelUnlocked(one, CAMPAIGNS, TUTORIAL, 3)).toBe(false);
  });

  it("opens a campaign at 2 stars per level of the campaigns before it, on average", () => {
    expect(campaignUnlocked(EMPTY_PROGRESS, CAMPAIGNS, TUTORIAL)).toBe(true);
    expect(campaignUnlocked(finished(1, [TUTORIAL]), CAMPAIGNS, OPEN_COUNTRY)).toBe(false);
    expect(campaignUnlocked(finished(2, [TUTORIAL]), CAMPAIGNS, OPEN_COUNTRY)).toBe(true);
    // 3 stars on some levels make up for 1 on others: 22 stars in all
    let mixed = EMPTY_PROGRESS;
    TUTORIAL.levels.forEach((level, index) => {
      const score = index < 6 ? level.target : index < 10 ? 0 : Math.ceil(level.target * 0.7);
      mixed = recordRun(mixed, level, run(1, level.id), score);
    });
    expect(campaignUnlocked(mixed, CAMPAIGNS, OPEN_COUNTRY)).toBe(6 * 3 + 4 + 2 >= 22);
    expect(levelUnlocked(finished(1, [TUTORIAL]), CAMPAIGNS, OPEN_COUNTRY, 1)).toBe(false);
    expect(levelUnlocked(finished(2, [TUTORIAL]), CAMPAIGNS, OPEN_COUNTRY, 1)).toBe(true);
  });
});

describe("progress", () => {
  const level = TUTORIAL.levels[0]!;
  it("keeps the best score and its run, and never lowers the stars", () => {
    const best = recordRun(EMPTY_PROGRESS, level, { ...run(1, 1), moves: [{ discard: true, orientation: 0, x: 0, y: 0 }] }, level.target);
    const worse = recordRun(best, level, run(1, 1), 0);
    expect(worse).toBe(best);
    expect(worse.levels["1-1"]).toMatchObject({ best: level.target, stars: 3 });
    expect(worse.levels["1-1"]?.run.moves).toHaveLength(1);
  });

  it("saves and loads, and drops what is not progress", () => {
    const store = memoryStore();
    const progress = recordRun(EMPTY_PROGRESS, level, run(1, 1), 225);
    expect(saveProgress(progress, () => store)).toBe(true);
    expect(loadProgress(() => store)).toEqual(progress);
    store.setItem(STORY_KEY, JSON.stringify({ v: 1, levels: { "1-1": { best: "x" }, "1-2": progress.levels["1-1"] } }));
    expect(Object.keys(loadProgress(() => store).levels)).toEqual(["1-2"]);
    store.setItem(STORY_KEY, "not json");
    expect(loadProgress(() => store)).toEqual(EMPTY_PROGRESS);
    expect(loadProgress(() => null)).toEqual(EMPTY_PROGRESS);
    expect(saveProgress(progress, () => null)).toBe(false);
  });
});

describe("a story run", () => {
  for (const campaign of CAMPAIGNS) {
    const level = campaign.levels[campaign.id === 1 ? 7 : 0]!;
    it(`plays ${campaign.name} ${level.id}'s stored line move by move, and its submission replays to the same score`, () => {
      const played = new StoryRun(campaign, level);
      for (const move of decodeLine(level.line)) {
        if (move.action === "discard") expect(played.discard()).toBe(true);
        else {
          const orientation = ["North", "East", "South", "West"].indexOf(move.placement.orientation) + 1;
          expect(played.place({ orientation, x: CENTER + move.placement.x, y: CENTER + move.placement.y })).toBe(true);
        }
      }
      expect(played.over).toBe(true);
      expect(played.score).toBe(level.target);
      expect(played.snapshot.state.game?.over).toBe(true);
      const submission = played.submission();
      expect(submission).toMatchObject({ campaignId: campaign.id, levelIndex: level.id });
      expect(replaySubmission(level, submission).score).toBe(level.target);
    });
  }

  it("refuses a move that does not fit, says why, and restarts", () => {
    const level = TUTORIAL.levels[0]!;
    const played = new StoryRun(TUTORIAL, level);
    expect(played.place({ orientation: 1, x: CENTER + 5, y: CENTER + 5 })).toBe(false);
    expect(played.snapshot.state.writeError).toBeTruthy();
    expect(played.slots(1).length).toBeGreaterThan(0);
    expect(played.discard()).toBe(true);
    expect(played.snapshot.moves).toHaveLength(1);
    played.restart();
    expect(played.snapshot.moves).toHaveLength(0);
    expect(played.snapshot.state.hand?.plan).toBeDefined();
  });

  it("gives the next two tiles of the level's order as coming, fewer at its end, none once over (#701)", () => {
    const campaign = CAMPAIGNS[1]!;
    const level = campaign.levels[0]!;
    const plans = level.deck.map((plan) => Object.values(PlanType).indexOf(plan));
    const played = new StoryRun(campaign, level);
    for (let i = 0; i < level.deck.length; i++) {
      const { hand, coming } = played.snapshot.state;
      // The tile in hand is the order's i-th; coming are the two after it (tile ids follow the starter's 1).
      expect(hand).toEqual({ tileId: i + 2, plan: plans[i] });
      expect(coming).toEqual(plans.slice(i + 1, i + 3).map((plan, k) => ({ tileId: i + 3 + k, plan })));
      expect(played.discard()).toBe(true);
    }
    expect(played.over).toBe(true);
    expect(played.snapshot.state.coming).toEqual([]);
    played.restart();
    expect(played.snapshot.state.coming).toEqual(plans.slice(1, 3).map((plan, k) => ({ tileId: 3 + k, plan })));
  });
});
