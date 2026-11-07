import { CAMPAIGNS, EMPTY_PROGRESS, recordRun, type StoryProgress } from "@paved/game-core";

/**
 * Story progress for the stories (STORY-PAGE): `levels` levels of campaign `index` (from 0) finished, each with `stars` (a score at the
 * level's target for 3, at 70 % of it for 2, 0 for 1, a finished run's least), later parts over earlier ones.
 */
export function storyProgressOf(...parts: { index: number; levels: number; stars: 1 | 2 | 3 }[]): StoryProgress {
  let progress = EMPTY_PROGRESS;
  for (const { index, levels, stars } of parts) {
    const campaign = CAMPAIGNS[index]!;
    for (const level of campaign.levels.slice(0, levels)) {
      const score = stars === 3 ? level.target : stars === 2 ? Math.ceil(level.target * 0.7) : 0;
      progress = recordRun(progress, level, { campaignId: campaign.id, levelIndex: level.id, moves: [] }, score);
    }
  }
  return progress;
}

/** The Story page's states (STORY-PAGE), as `StoryScene`'s props less the campaigns and the renders. */
export const STORY = {
  /** A first visit: level 1 open, everything else locked. */
  firstVisit: { progress: EMPTY_PROGRESS },
  /** Halfway through the Tutorial, with mixed stars: level 7 to play next. */
  inProgress: { progress: storyProgressOf({ index: 0, levels: 4, stars: 3 }, { index: 0, levels: 6, stars: 1 }) },
  /** Eight Tutorial levels finished, Open Country in view: locked until the Tutorial is finished, 4 levels left. */
  locked: { progress: storyProgressOf({ index: 0, levels: 8, stars: 2 }), campaignId: 2 },
  /** The Tutorial just finished: on this first visit since, Open Country and Dark Forest open, Open Country's card in view unlocks, once. */
  unlocking: { progress: storyProgressOf({ index: 0, levels: 12, stars: 2 }), justUnlocked: [2, 3] },
  /** The Tutorial complete, at 3 stars, in view. */
  complete: { progress: storyProgressOf({ index: 0, levels: 12, stars: 3 }, { index: 1, levels: 2, stars: 2 }), campaignId: 1 },
  /** The browser refuses storage: the stars last for this visit. */
  storageOff: { progress: EMPTY_PROGRESS, storageOff: true },
} as const;
