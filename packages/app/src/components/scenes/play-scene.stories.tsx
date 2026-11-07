import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { CAMPAIGNS } from "@paved/game-core";
import { appRenders } from "../../mocks/assets";
import { PLAY, PURCHASE } from "../../mocks/scenes";
import { STORY } from "../../mocks/story";
import { PlayScene } from "./play-scene";
import { PurchaseScene } from "./purchase-scene";
import { StoryScene } from "./story-scene";

/**
 * Play (`/play`, PLAY-PAGE, the Paved UX Book's "modes", the owner's asks of 2026-11-06): the HUD's drawer, a full page on a phone, a side
 * panel docked at the right from `tablet`. Ranked (Attack), Paid (the Challenge), Free (Training, Story), Limited (coming soon), each
 * mode's gift showing what it pays. One story per state; the Viewport control reframes it.
 */
const meta = {
  title: "Scenes/Play",
  component: PlayScene,
  args: { onBack: fn(), onChallenge: fn(), onChallengeBack: fn(), onStoryBack: fn(), onResume: fn(), onTraining: fn(), onStory: fn(), onAttack: fn() },
} satisfies Meta<typeof PlayScene>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Connected: Story = { args: PLAY.connected };


/** New Challenge games paused: the Challenge is off and says why; Training and Story stay open. */
export const PurchasesPaused: Story = { args: PLAY.paused };
/** The book's "modes-resume": a Challenge game still open, its time left and score, Resume. */
export const Running: Story = { args: PLAY.running };
/** The book's "challenge": the stake, a panel of its own in the modes' place (no sheet from the bottom), Back to the modes. */
export const Stake: Story = { args: { ...PLAY.connected, challenge: <PurchaseScene {...PURCHASE.stake3Referred} /> } };

/** Story's campaigns (STORY-PAGE) in the drawer: a view of its own in the modes' place, "Story" on the header, Back to the modes. */
const story = (state: keyof typeof STORY): Story => ({
  args: { ...PLAY.connected, story: <StoryScene campaigns={CAMPAIGNS} renders={appRenders} onCampaign={fn()} onLevel={fn()} {...STORY[state]} /> },
});
/** Story, the Tutorial under way: level 7, the last unlocked, on the gold wash and in the footer's Play; the levels after it locked. */
export const StoryOpen: Story = story("inProgress");
/** Story, a first visit: level 1 to play, every other level and campaign locked. */
export const StoryFirstVisit: Story = story("firstVisit");
/** Story, Open Country in view and locked: the Tutorial to finish first, on its card, in the carved box and the footer. */
export const StoryLocked: Story = story("locked");
/** Story, the Tutorial just finished: Open Country's card's lock opens and the blur lifts, once. */
export const StoryUnlocking: Story = story("unlocking");
/** Story, the Tutorial complete at 3 stars. */
export const StoryComplete: Story = story("complete");
/** Story with the browser's storage refused: the stars last for this visit. */
export const StoryStorageOff: Story = story("storageOff");
