import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { CAMPAIGNS, EMPTY_PROGRESS, recordRun, type StoryProgress } from "@paved/game-core";
import { StoryScene } from "./story-scene";

/** `levels` levels of campaign `index` finished, each with `stars` (scores at the target, at 70 %, or 0). */
function progressOf(...parts: { index: number; levels: number; stars: 1 | 2 | 3 }[]): StoryProgress {
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

/**
 * Story mode (`/story`, #546): the campaigns and their levels, stars and locks. A level opens once the one before it is finished;
 * the second campaign once the Tutorial holds 2 stars per level on average. One story per state; the Viewport control reframes it.
 */
const meta = {
  title: "Scenes/Story",
  component: StoryScene,
  args: { campaigns: CAMPAIGNS, progress: EMPTY_PROGRESS, onBack: fn(), onLevel: fn() },
} satisfies Meta<typeof StoryScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A first visit: level 1 open, everything else locked, the second campaign's requirement stated. */
export const FirstVisit: Story = {};

/** Halfway through the Tutorial, with mixed stars. */
export const InProgress: Story = { args: { progress: progressOf({ index: 0, levels: 4, stars: 3 }, { index: 0, levels: 6, stars: 1 }) } };

/** The Tutorial finished with 1 star each: 11 stars, short of the 22 the second campaign asks for. */
export const CampaignLocked: Story = { args: { progress: progressOf({ index: 0, levels: 11, stars: 1 }) } };

/** The Tutorial at 2 stars a level: the second campaign is open, its first level playable. */
export const CampaignOpen: Story = { args: { progress: progressOf({ index: 0, levels: 11, stars: 2 }, { index: 1, levels: 3, stars: 2 }) } };

/** Every level at 3 stars. */
export const AllStars: Story = { args: { progress: progressOf({ index: 0, levels: 11, stars: 3 }, { index: 1, levels: 11, stars: 3 }) } };

/** The browser refuses storage: the stars last for this visit. */
export const StorageOff: Story = { args: { storageOff: true } };
