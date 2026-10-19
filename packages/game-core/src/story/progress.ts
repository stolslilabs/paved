// Story progress on the device (#546): the best score and stars of each level, and the moves of the best run in the
// shape of the future end-of-run submission (`StorySubmission`, one transaction at the end of a run). The stars and the
// unlock rules are the owner's: 1 star = finished, 2 = at least 70 % of the target, 3 = the target; a level unlocks once
// the one before it is finished; a campaign unlocks once the levels of every campaign before it hold 2 stars on average.

import { browserStore, type KeyValueStore } from "../sessions/storage";
import { twoStars, type StoryCampaign, type StoryLevel } from "./plan";

export type Stars = 0 | 1 | 2 | 3;

/** One move of a run as the chain will take it: a placement in the chain's coordinates (the starter at `CENTER`), or a discard. */
export interface StoryMoveInput {
  readonly discard: boolean;
  /** 1 North to 4 West; 0 for a discard. */
  readonly orientation: number;
  /** The chain's coordinates; 0 for a discard. */
  readonly x: number;
  readonly y: number;
}

/** A finished run as `submit_run` will take it: the campaign, the level's index in it (from 1), and every move in order. */
export interface StorySubmission {
  readonly campaignId: number;
  readonly levelIndex: number;
  readonly moves: readonly StoryMoveInput[];
}

export interface LevelProgress {
  /** The best final score. */
  readonly best: number;
  readonly stars: Stars;
  /** The run that scored `best`. */
  readonly run: StorySubmission;
}

export interface StoryProgress {
  readonly v: 1;
  /** By `levelKey`. */
  readonly levels: Readonly<Record<string, LevelProgress>>;
}

export const STORY_KEY = "paved:story:v1";

export const EMPTY_PROGRESS: StoryProgress = { v: 1, levels: {} };

export function levelKey(campaignId: number, levelIndex: number): string {
  return `${campaignId}-${levelIndex}`;
}

/** What a finished run of `level` scoring `score` is worth: its stars, and the thresholds they were read against. */
export function levelResult(
  level: Pick<StoryLevel, "target" | "method">,
  score: number,
): { stars: Stars; target: number; twoStars: number; bestKnown: boolean; beatsTarget: boolean } {
  const two = twoStars(level.target);
  const stars: Stars = score >= level.target ? 3 : score >= two ? 2 : 1;
  return { stars, target: level.target, twoStars: two, bestKnown: level.method === "best-known", beatsTarget: score > level.target };
}

export function levelProgress(progress: StoryProgress, campaignId: number, levelIndex: number): LevelProgress | null {
  return progress.levels[levelKey(campaignId, levelIndex)] ?? null;
}

/** The stars held over every level of `campaign`. */
export function campaignStars(progress: StoryProgress, campaign: StoryCampaign): number {
  return campaign.levels.reduce((n, level) => n + (levelProgress(progress, campaign.id, level.id)?.stars ?? 0), 0);
}

/** The stars `campaign` needs, held over the campaigns before it: 2 per level of those campaigns. */
export function campaignRequirement(campaigns: readonly StoryCampaign[], campaign: StoryCampaign): { needed: number; held: (p: StoryProgress) => number } {
  const before = campaigns.filter((c) => c.id < campaign.id);
  return {
    needed: 2 * before.reduce((n, c) => n + c.levels.length, 0),
    held: (p) => before.reduce((n, c) => n + campaignStars(p, c), 0),
  };
}

/** Whether `campaign` is open: total stars over every level of the campaigns before it >= 2 x their number of levels. */
export function campaignUnlocked(progress: StoryProgress, campaigns: readonly StoryCampaign[], campaign: StoryCampaign): boolean {
  const { needed, held } = campaignRequirement(campaigns, campaign);
  return held(progress) >= needed;
}

/** Whether level `levelIndex` of `campaign` can be played: its campaign is open and the level before it is finished. */
export function levelUnlocked(
  progress: StoryProgress,
  campaigns: readonly StoryCampaign[],
  campaign: StoryCampaign,
  levelIndex: number,
): boolean {
  if (!campaignUnlocked(progress, campaigns, campaign)) return false;
  if (levelIndex <= 1) return true;
  return (levelProgress(progress, campaign.id, levelIndex - 1)?.stars ?? 0) >= 1;
}

/** `progress` with a finished run of `level` recorded: the best score and its run kept, the stars never lowered. */
export function recordRun(progress: StoryProgress, level: Pick<StoryLevel, "target" | "method">, run: StorySubmission, score: number): StoryProgress {
  const key = levelKey(run.campaignId, run.levelIndex);
  const held = progress.levels[key];
  const stars = levelResult(level, score).stars;
  if (held && held.best >= score) {
    return held.stars >= stars ? progress : { ...progress, levels: { ...progress.levels, [key]: { ...held, stars } } };
  }
  return { ...progress, levels: { ...progress.levels, [key]: { best: score, stars: Math.max(stars, held?.stars ?? 0) as Stars, run } } };
}

function isMove(value: unknown): value is StoryMoveInput {
  const m = value as StoryMoveInput;
  return (
    typeof m === "object" &&
    m !== null &&
    typeof m.discard === "boolean" &&
    Number.isInteger(m.orientation) &&
    Number.isInteger(m.x) &&
    Number.isInteger(m.y)
  );
}

function isLevel(value: unknown): value is LevelProgress {
  const l = value as LevelProgress;
  return (
    typeof l === "object" &&
    l !== null &&
    Number.isInteger(l.best) &&
    [1, 2, 3].includes(l.stars) &&
    typeof l.run === "object" &&
    l.run !== null &&
    Number.isInteger(l.run.campaignId) &&
    Number.isInteger(l.run.levelIndex) &&
    Array.isArray(l.run.moves) &&
    l.run.moves.every(isMove)
  );
}

/** The progress saved on this device; empty when none, when storage is off, or when the value is not progress (its bad levels dropped). */
export function loadProgress(store: () => KeyValueStore | null = browserStore): StoryProgress {
  try {
    const raw = store()?.getItem(STORY_KEY);
    if (!raw) return EMPTY_PROGRESS;
    const value = JSON.parse(raw) as Partial<StoryProgress>;
    if (value.v !== 1 || typeof value.levels !== "object" || value.levels === null) return EMPTY_PROGRESS;
    const levels: Record<string, LevelProgress> = {};
    for (const [key, level] of Object.entries(value.levels)) {
      if (/^\d+-\d+$/.test(key) && isLevel(level)) levels[key] = level;
    }
    return { v: 1, levels };
  } catch {
    return EMPTY_PROGRESS;
  }
}

/** Saves the progress; false when storage refused (the progress then lives for this page only). */
export function saveProgress(progress: StoryProgress, store: () => KeyValueStore | null = browserStore): boolean {
  try {
    const s = store();
    if (!s) return false;
    s.setItem(STORY_KEY, JSON.stringify(progress));
    return true;
  } catch {
    return false;
  }
}
