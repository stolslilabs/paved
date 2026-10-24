// Story progress on the device (#546): the best score and stars of each level, and the moves of the best run in the
// shape of the future end-of-run submission (`StorySubmission`, one transaction at the end of a run). The stars and the
// unlock rules are the owner's: 1 star = finished, 2 = at least 70 % of the target, 3 = the target; a level unlocks once
// the one before it is finished; a campaign unlocks once the levels of every campaign before it hold 2 stars on average.
// Each level's progress carries the fingerprint of the deck it was played on (`deckFingerprint`): a level whose deck changed
// since loses its best, stars and run on load (#721), an unchanged one keeps them.

import { browserStore, type KeyValueStore } from "../sessions/storage";
import { CAMPAIGNS, twoStars, type StoryCampaign, type StoryLevel } from "./plan";

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
  /** The fingerprint of the deck it was played on (`deckFingerprint`); absent on progress saved before #721. */
  readonly deck?: string;
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

/**
 * A level's deck as 8 hex digits: FNV-1a (32-bit) over its draw order and its placed tiles. Two levels deal the same game
 * exactly when their fingerprints match (the starter is the same for all).
 */
export function deckFingerprint(level: Pick<StoryLevel, "deck" | "placed">): string {
  const placed = (level.placed ?? []).map((t) => `${t.plan}@${t.x},${t.y},${t.orientation}`);
  const text = `${level.deck.join(",")};${placed.join(",")}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * The fingerprints of the decks before #721, for progress saved without one: Tutorial 1-1 to 1-9 kept their decks, 1-10
 * lost its placed tiles, 1-11 became 1-12, and Open Country's levels were cut to 9 to 16 tiles.
 */
const DECKS_BEFORE_721: Readonly<Record<string, string>> = {
  "1-1": "92d9fa40",
  "1-2": "3d04c06e",
  "1-3": "188404b2",
  "1-4": "753af18d",
  "1-5": "383506d6",
  "1-6": "d61379cb",
  "1-7": "e556dcec",
  "1-8": "afd589c2",
  "1-9": "24fa00a7",
  "1-10": "a4c9babb",
  "1-11": "1b859c7b",
  "2-1": "d6ffe10d",
  "2-2": "b3fa71b9",
  "2-3": "240e5d05",
  "2-4": "f8212d4d",
  "2-5": "971b46cc",
  "2-6": "b8726a95",
  "2-7": "43f43c9a",
  "2-8": "1dca4df9",
  "2-9": "29d55dba",
  "2-10": "e88fc167",
  "2-11": "15120cf1",
};

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
export function recordRun(
  progress: StoryProgress,
  level: Pick<StoryLevel, "target" | "method" | "deck" | "placed">,
  run: StorySubmission,
  score: number,
): StoryProgress {
  const key = levelKey(run.campaignId, run.levelIndex);
  const deck = deckFingerprint(level);
  // A best of another deck is not this level's: it is replaced.
  const held = progress.levels[key]?.deck === deck ? progress.levels[key] : undefined;
  const stars = levelResult(level, score).stars;
  if (held && held.best >= score) {
    return held.stars >= stars ? progress : { ...progress, levels: { ...progress.levels, [key]: { ...held, stars } } };
  }
  return { ...progress, levels: { ...progress.levels, [key]: { best: score, stars: Math.max(stars, held?.stars ?? 0) as Stars, run, deck } } };
}

/**
 * `progress` with only what was played on today's decks of `campaigns` (#721): a level whose fingerprint differs from its
 * deck's, or that the plan no longer has, is dropped; one saved before fingerprints is kept, and given its fingerprint,
 * when its deck is the one it had then.
 */
export function currentProgress(progress: StoryProgress, campaigns: readonly StoryCampaign[] = CAMPAIGNS): StoryProgress {
  const levels: Record<string, LevelProgress> = {};
  for (const campaign of campaigns) {
    for (const level of campaign.levels) {
      const key = levelKey(campaign.id, level.id);
      const held = progress.levels[key];
      if (!held) continue;
      const deck = deckFingerprint(level);
      if ((held.deck ?? DECKS_BEFORE_721[key]) === deck) levels[key] = held.deck ? held : { ...held, deck };
    }
  }
  return { v: 1, levels };
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
    l.run.moves.every(isMove) &&
    (l.deck === undefined || typeof l.deck === "string")
  );
}

/**
 * The progress saved on this device, kept to the decks of `campaigns` (`currentProgress`); empty when none, when storage is
 * off, or when the value is not progress (its bad levels dropped).
 */
export function loadProgress(store: () => KeyValueStore | null = browserStore, campaigns: readonly StoryCampaign[] = CAMPAIGNS): StoryProgress {
  try {
    const raw = store()?.getItem(STORY_KEY);
    if (!raw) return EMPTY_PROGRESS;
    const value = JSON.parse(raw) as Partial<StoryProgress>;
    if (value.v !== 1 || typeof value.levels !== "object" || value.levels === null) return EMPTY_PROGRESS;
    const levels: Record<string, LevelProgress> = {};
    for (const [key, level] of Object.entries(value.levels)) {
      if (/^\d+-\d+$/.test(key) && isLevel(level)) levels[key] = level;
    }
    return currentProgress({ v: 1, levels }, campaigns);
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
