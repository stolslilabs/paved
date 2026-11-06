import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { PLAY, PURCHASE } from "../../mocks/scenes";
import { PlayScene } from "./play-scene";
import { PurchaseScene } from "./purchase-scene";

/**
 * Play (`/play`, PLAY-PAGE, the Paved UX Book's "modes", the owner's asks of 2026-11-06): the HUD's drawer, a full page on a phone, a side
 * panel docked at the right from `tablet`. Ranked (Attack), Paid (the Challenge), Free (Training, Story), Limited (coming soon), each
 * mode's gift showing what it pays. One story per state; the Viewport control reframes it.
 */
const meta = {
  title: "Scenes/Play",
  component: PlayScene,
  args: { onBack: fn(), onChallenge: fn(), onChallengeBack: fn(), onResume: fn(), onTraining: fn(), onStory: fn(), onAttack: fn(), onConnect: fn() },
} satisfies Meta<typeof PlayScene>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Connected: Story = { args: PLAY.connected };

/** No wallet: the Challenge and Attack ask to connect. */
export const Guest: Story = { args: PLAY.guest };

/** New Challenge games paused: the Challenge is off and says why; Training and Story stay open. */
export const PurchasesPaused: Story = { args: PLAY.paused };
/** The book's "modes-resume": a Challenge game still open, its time left and score, Resume. */
export const Running: Story = { args: PLAY.running };
/** The book's "challenge": the stake, a panel of its own in the modes' place (no sheet from the bottom), Back to the modes. */
export const Stake: Story = { args: { ...PLAY.connected, challenge: <PurchaseScene {...PURCHASE.stake3Referred} /> } };
