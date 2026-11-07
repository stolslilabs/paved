import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { CAMPAIGNS } from "@paved/game-core";
import { appRenders } from "../../mocks/assets";
import { STORY, storyProgressOf } from "../../mocks/story";
import { StoryScene } from "./story-scene";

/**
 * Story mode (`/story`, #546, #592; STORY-PAGE): the body Play's drawer frames (a view in the modes' place, as the stake; `Scenes/Play`'s
 * Story stories show it framed): the campaigns one per view (a lock and a blur until they open), the dots and arrows under them, and the
 * levels of the one in view on a carved list, the last level unlocked on the gold wash with the gold Play in the footer. A level opens
 * once the one before it is finished; every other campaign once the Tutorial is finished. One story per state.
 */
const meta = {
  title: "Scenes/Story",
  component: StoryScene,
  args: { campaigns: CAMPAIGNS, progress: STORY.firstVisit.progress, renders: appRenders, onCampaign: fn(), onLevel: fn() },
  decorators: [
    (Story) => (
      <div className="mx-auto flex max-w-md flex-col bg-secondary p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof StoryScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A first visit: level 1 open (the gold Play), everything else locked. */
export const FirstVisit: Story = { args: STORY.firstVisit };

/** Halfway through the Tutorial, with mixed stars: level 7 to play next. */
export const InProgress: Story = { args: STORY.inProgress };

/** Open Country in view, locked: eight Tutorial levels finished, four left before every other campaign opens. */
export const CampaignLocked: Story = { args: STORY.locked };

/** The Tutorial finished: the other campaigns are open, Open Country's first levels played. */
export const CampaignOpen: Story = { args: { progress: storyProgressOf({ index: 0, levels: 12, stars: 2 }, { index: 1, levels: 3, stars: 2 }) } };

/** The Tutorial just finished: on this first visit since, Open Country's card unlocks on screen, once (Dark Forest's when it comes in view). */
export const JustUnlocked: Story = { args: STORY.unlocking };

/** The same under reduced motion: no animation, the card is open at once. */
export const JustUnlockedReduced: Story = { args: STORY.unlocking, parameters: { reducedMotion: "always" } };

/** The Tutorial complete at 3 stars and in view, Open Country under way: Complete on its card. */
export const Completed: Story = { args: STORY.complete };

/** Every level of the Tutorial and Open Country at 3 stars: Dark Forest open. */
export const AllStars: Story = { args: { progress: storyProgressOf({ index: 0, levels: 12, stars: 3 }, { index: 1, levels: 12, stars: 3 }) } };

/** The browser refuses storage: the stars last for this visit. */
export const StorageOff: Story = { args: STORY.storageOff };
