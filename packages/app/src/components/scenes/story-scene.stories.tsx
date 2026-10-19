import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { CAMPAIGNS, EMPTY_PROGRESS, recordRun, type StoryProgress } from "@paved/game-core";
import { appRenders } from "../../mocks/assets";
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
 * Story mode (`/story`, #546, #592): the campaigns as cards (their own tiles behind, a lock and a blur until they open) and the
 * levels of the chosen one. A level opens once the one before it is finished; the second campaign once the Tutorial holds 2
 * stars per level on average. One story per state; the Viewport control reframes it. The layout: the carousel (the default,
 * built) swipes the cards on a phone and turns into the grid from tablet up; `LayoutGrid` is the other proposal, a wrapping
 * grid at every width.
 */
const meta = {
  title: "Scenes/Story",
  component: StoryScene,
  args: { campaigns: CAMPAIGNS, progress: EMPTY_PROGRESS, renders: appRenders, onBack: fn(), onCampaign: fn(), onLevel: fn() },
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

/** The Tutorial just brought to 2 stars a level: on this first visit since, Open Country's card unlocks on screen, once. */
export const JustUnlocked: Story = { args: { progress: progressOf({ index: 0, levels: 11, stars: 2 }), justUnlocked: [2] } };

/** The same under reduced motion: no animation, the card is open at once. */
export const JustUnlockedReduced: Story = { args: { progress: progressOf({ index: 0, levels: 11, stars: 2 }), justUnlocked: [2] }, parameters: { reducedMotion: "always" } };

/** The Tutorial complete at 3 stars and chosen, Open Country under way: the complete card's badge. */
export const Completed: Story = { args: { progress: progressOf({ index: 0, levels: 11, stars: 3 }, { index: 1, levels: 2, stars: 2 }), campaignId: 1 } };

/** The other layout proposed (#592): a wrapping grid at every width, one card a row on a phone. */
export const LayoutGrid: Story = { args: { layout: "grid", progress: progressOf({ index: 0, levels: 4, stars: 3 }) } };

/** Every level at 3 stars. */
export const AllStars: Story = { args: { progress: progressOf({ index: 0, levels: 11, stars: 3 }, { index: 1, levels: 11, stars: 3 }) } };

/** The browser refuses storage: the stars last for this visit. */
export const StorageOff: Story = { args: { storageOff: true } };
