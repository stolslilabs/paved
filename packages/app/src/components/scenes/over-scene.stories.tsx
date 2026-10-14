import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { OVER } from "../../mocks/scenes";
import { OverScene } from "./over-scene";
import { at } from "./viewports";

/** The end of a game: final score, metrics, every closing (P7), the reward or its absence. Each state at the four viewports. */
const meta = { title: "Scenes/Over", component: OverScene, args: { onSettle: fn(), onPlayAgain: fn(), onHome: fn() } } satisfies Meta<typeof OverScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Above the threshold, settled: the reward minted; a new best. */
const rewarded: Story = { args: OVER.rewarded };
export const RewardedMobile: Story = at("mobile", rewarded);
export const RewardedTablet: Story = at("tablet", rewarded);
export const RewardedDesktop: Story = at("desktop", rewarded);
export const RewardedWide: Story = at("wide", rewarded);

/** Recorded, its day still open. */
const awaiting: Story = { args: OVER.awaiting };
export const AwaitingTheDayMobile: Story = at("mobile", awaiting);
export const AwaitingTheDayTablet: Story = at("tablet", awaiting);
export const AwaitingTheDayDesktop: Story = at("desktop", awaiting);
export const AwaitingTheDayWide: Story = at("wide", awaiting);

const settle: Story = { args: OVER.settle };
export const ReadyToSettleMobile: Story = at("mobile", settle);
export const ReadyToSettleTablet: Story = at("tablet", settle);
export const ReadyToSettleDesktop: Story = at("desktop", settle);
export const ReadyToSettleWide: Story = at("wide", settle);

/** Under the threshold: the stake lost. */
const below: Story = { args: OVER.below };
export const BelowThresholdMobile: Story = at("mobile", below);
export const BelowThresholdTablet: Story = at("tablet", below);
export const BelowThresholdDesktop: Story = at("desktop", below);
export const BelowThresholdWide: Story = at("wide", below);

/** Not finished within 24 h of the purchase. */
const expired: Story = { args: OVER.expired };
export const ExpiredMobile: Story = at("mobile", expired);
export const ExpiredTablet: Story = at("tablet", expired);
export const ExpiredDesktop: Story = at("desktop", expired);
export const ExpiredWide: Story = at("wide", expired);

/** Training: no stake, no reward. */
const training: Story = { args: OVER.training };
export const TrainingMobile: Story = at("mobile", training);
export const TrainingTablet: Story = at("tablet", training);
export const TrainingDesktop: Story = at("desktop", training);
export const TrainingWide: Story = at("wide", training);

/** Nothing closed: the list says so. */
const noClosing: Story = { args: OVER.noClosing };
export const NoClosingMobile: Story = at("mobile", noClosing);
export const NoClosingTablet: Story = at("tablet", noClosing);
export const NoClosingDesktop: Story = at("desktop", noClosing);
export const NoClosingWide: Story = at("wide", noClosing);
