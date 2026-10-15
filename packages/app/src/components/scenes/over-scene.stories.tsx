import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { OVER } from "../../mocks/scenes";
import { OverScene } from "./over-scene";

/** The end of a game: final score, metrics, every closing (P7), the reward or its absence. One story per state; the Viewport control reframes it. */
const meta = { title: "Scenes/Over", component: OverScene, args: { onSettle: fn(), onPlayAgain: fn(), onHome: fn() } } satisfies Meta<typeof OverScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Above the threshold, settled: the reward minted; a new best. */
export const Rewarded: Story = { args: OVER.rewarded };

/** Recorded, its day still open. */
export const AwaitingTheDay: Story = { args: OVER.awaiting };

export const ReadyToSettle: Story = { args: OVER.settle };

/** Under the threshold: the stake lost. */
export const BelowThreshold: Story = { args: OVER.below };

/** Not finished within 24 h of the purchase. */
export const Expired: Story = { args: OVER.expired };

/** Training: no stake, no reward. */
export const Training: Story = { args: OVER.training };

/** Nothing closed: the list says so. */
export const NoClosing: Story = { args: OVER.noClosing };
/** WRAP360: long names and sentences, full addresses, large figures. */
export const Stress: Story = { args: OVER.stress };
