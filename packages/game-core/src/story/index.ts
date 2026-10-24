// Story mode (#546): the campaigns and their levels, a level's run on the engine, and the progress kept on the device.
// The searches that set the targets (`engine/solver.ts`, `engine/beam.ts`) stay out: the client never runs them.

export { CAMPAIGNS, DARK_FOREST, OPEN_COUNTRY, TUTORIAL, twoStars } from "./plan";
export type { StoryCampaign, StoryLevel, TargetMethod } from "./plan";
export { decodeLine, encodeLine, replayLine } from "./line";
export type { LineMove } from "./line";
export { seededDeck } from "./deck";
export {
  EMPTY_PROGRESS,
  STORY_KEY,
  campaignRequirement,
  campaignStars,
  campaignUnlocked,
  levelKey,
  levelProgress,
  levelResult,
  levelUnlocked,
  loadProgress,
  recordRun,
  saveProgress,
} from "./progress";
export type { LevelProgress, Stars, StoryMoveInput, StoryProgress, StorySubmission } from "./progress";
export { StoryRun, replaySubmission, startLevel } from "./run";
export type { StorySnapshot } from "./run";
