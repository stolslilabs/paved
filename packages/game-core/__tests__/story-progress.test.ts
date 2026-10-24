import { describe, expect, it } from "vitest";
import { CENTER } from "../src/engine";
import { OrientationType } from "../src/types/orientation";
import { PlanType } from "../src/types/plan";
import { decodeLine } from "../src/story/line";
import { CAMPAIGNS, DARK_FOREST, OPEN_COUNTRY, TUTORIAL } from "../src/story/plan";
import {
  EMPTY_PROGRESS,
  STORY_KEY,
  campaignRequirement,
  campaignUnlocked,
  currentProgress,
  deckFingerprint,
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
    // 3 stars on some levels make up for 1 on others: 24 stars in all (6 x 3, 6 x 1)
    let mixed = EMPTY_PROGRESS;
    TUTORIAL.levels.forEach((level, index) => {
      mixed = recordRun(mixed, level, run(1, level.id), index < 6 ? level.target : 0);
    });
    expect(campaignUnlocked(mixed, CAMPAIGNS, OPEN_COUNTRY)).toBe(true);
    const short = recordRun(EMPTY_PROGRESS, TUTORIAL.levels[0]!, run(1, 1), 0);
    expect(campaignUnlocked({ v: 1, levels: { ...mixed.levels, "1-1": short.levels["1-1"]! } }, CAMPAIGNS, OPEN_COUNTRY)).toBe(false);
    expect(levelUnlocked(finished(1, [TUTORIAL]), CAMPAIGNS, OPEN_COUNTRY, 1)).toBe(false);
    expect(levelUnlocked(finished(2, [TUTORIAL]), CAMPAIGNS, OPEN_COUNTRY, 1)).toBe(true);
  });

  it("opens Open Country at 24 stars and Dark Forest at 48: 2 per level of the 12-level campaigns before (#721)", () => {
    expect(campaignRequirement(CAMPAIGNS, OPEN_COUNTRY).needed).toBe(24);
    expect(campaignRequirement(CAMPAIGNS, DARK_FOREST).needed).toBe(48);
    expect(campaignUnlocked(finished(2, [TUTORIAL]), CAMPAIGNS, DARK_FOREST)).toBe(false);
    expect(campaignUnlocked(finished(2, [TUTORIAL, OPEN_COUNTRY]), CAMPAIGNS, DARK_FOREST)).toBe(true);
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
    const second = recordRun(EMPTY_PROGRESS, TUTORIAL.levels[1]!, run(1, 2), 0);
    store.setItem(STORY_KEY, JSON.stringify({ v: 1, levels: { "1-1": { best: "x" }, "1-2": second.levels["1-2"] } }));
    expect(Object.keys(loadProgress(() => store).levels)).toEqual(["1-2"]);
    store.setItem(STORY_KEY, "not json");
    expect(loadProgress(() => store)).toEqual(EMPTY_PROGRESS);
    expect(loadProgress(() => null)).toEqual(EMPTY_PROGRESS);
    expect(saveProgress(progress, () => null)).toBe(false);
  });
});

describe("deck fingerprints (#721)", () => {
  /** Progress as the device saved it before #721: no fingerprint. */
  const unmarked = (progress: StoryProgress): StoryProgress => ({
    v: 1,
    levels: Object.fromEntries(Object.entries(progress.levels).map(([key, { deck: _deck, ...held }]) => [key, held])),
  });

  it("tells decks apart: every level of the plan has its own fingerprint, and a changed deck changes it", () => {
    const prints = CAMPAIGNS.flatMap((c) => c.levels.map(deckFingerprint));
    expect(new Set(prints).size).toBe(prints.length);
    for (const print of prints) expect(print).toMatch(/^[0-9a-f]{8}$/);
    const level = TUTORIAL.levels[1]!;
    expect(deckFingerprint({ deck: [...level.deck].reverse() })).not.toBe(deckFingerprint(level));
    expect(deckFingerprint({ deck: level.deck.slice(1) })).not.toBe(deckFingerprint(level));
    expect(deckFingerprint({ deck: level.deck, placed: [{ plan: PlanType.WFFFFFFFF, orientation: OrientationType.North, x: 0, y: -1 }] })).not.toBe(deckFingerprint(level));
  });

  it("records the fingerprint with each level, and keeps what was played on today's decks", () => {
    const progress = finished(3);
    for (const campaign of CAMPAIGNS) for (const level of campaign.levels) expect(progress.levels[`${campaign.id}-${level.id}`]?.deck).toBe(deckFingerprint(level));
    expect(currentProgress(progress)).toEqual(progress);
  });

  it("drops a level whose deck changed since it was played, and one the plan no longer has", () => {
    const progress = finished(3, [TUTORIAL]);
    const changed = { ...progress, levels: { ...progress.levels, "1-3": { ...progress.levels["1-3"]!, deck: "00000000" }, "1-13": progress.levels["1-1"]! } };
    const kept = currentProgress(changed);
    expect(kept.levels["1-3"]).toBeUndefined();
    expect(kept.levels["1-13"]).toBeUndefined();
    expect(Object.keys(kept.levels)).toHaveLength(TUTORIAL.levels.length - 1);
  });

  it("keeps progress saved before #721 on the levels whose deck did not change: Tutorial 1-1 to 1-9 only", () => {
    const kept = currentProgress(unmarked(finished(3)));
    expect(Object.keys(kept.levels)).toEqual(["1-1", "1-2", "1-3", "1-4", "1-5", "1-6", "1-7", "1-8", "1-9"]);
    // Kept with its fingerprint, so the next save carries it.
    expect(kept.levels["1-1"]?.deck).toBe(deckFingerprint(TUTORIAL.levels[0]!));
  });

  it("loads only the current decks, and a best on another deck is replaced by the next run, its stars included", () => {
    const store = memoryStore();
    const level = TUTORIAL.levels[0]!;
    const stale = { best: 9999, stars: 3 as const, run: run(1, 1), deck: "00000000" };
    store.setItem(STORY_KEY, JSON.stringify({ v: 1, levels: { "1-1": stale } }));
    expect(loadProgress(() => store)).toEqual(EMPTY_PROGRESS);
    const replaced = recordRun({ v: 1, levels: { "1-1": stale } }, level, run(1, 1), 0);
    expect(replaced.levels["1-1"]).toMatchObject({ best: 0, stars: 1, deck: deckFingerprint(level) });
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

  it("shows the next two tiles of the level's order after the one in hand, fewer at its end, none once over (#701)", () => {
    const level = CAMPAIGNS.flatMap((c) => c.levels).find((l) => l.deck.length >= 5)!;
    const played = new StoryRun({ id: 1 }, level);
    const plans = level.deck.map((p) => Object.values(PlanType).indexOf(p));
    expect(played.snapshot.state.hand).toEqual({ tileId: 2, plan: plans[0] });
    expect(played.snapshot.state.coming).toEqual([
      { tileId: 3, plan: plans[1] },
      { tileId: 4, plan: plans[2] },
    ]);
    while (!played.over) {
      const n = played.snapshot.moves.length;
      expect(played.snapshot.state.hand?.plan).toBe(plans[n]);
      expect(played.snapshot.state.coming?.map((t) => t.plan)).toEqual(plans.slice(n + 1, n + 3));
      expect(played.discard()).toBe(true);
    }
    expect(played.snapshot.state.coming).toEqual([]);
    // A refused move keeps them; a restart starts them again.
    played.restart();
    expect(played.place({ orientation: 1, x: CENTER + 5, y: CENTER + 5 })).toBe(false);
    expect(played.snapshot.state.coming?.map((t) => t.plan)).toEqual(plans.slice(1, 3));
  });

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
});
