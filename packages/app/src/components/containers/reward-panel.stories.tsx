import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { RewardPanel } from "./reward-panel";
import { BIG_AMOUNT_18, BIG_SCORE } from "../../mocks/stress";
import { CURVE_PLAYING } from "../../mocks/games";

const meta = {
  title: "Containers/RewardPanel",
  component: RewardPanel,
  parameters: { layout: "padded" },
  args: { state: "rewarded", reward: 8_420_000_000_000_000_000n, stake: 3, score: 1270, threshold: 1150, onSettle: fn() },
  decorators: [(Story) => <div className="max-w-md"><Story /></div>],
} satisfies Meta<typeof RewardPanel>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Rewarded: Story = {};
export const AwaitingTheDay: Story = { args: { state: "awaiting" } };
export const ReadyToSettle: Story = { args: { state: "settle" } };
export const Settling: Story = { args: { state: "settle", settling: true } };
export const BelowThreshold: Story = { args: { state: "below", score: 940 } };
export const Expired: Story = { args: { state: "expired" } };
export const Training: Story = { args: { state: "free", stake: undefined, threshold: undefined } };
/** #705: its day open, what the score earns at the day's prior mean, "≈", with that threshold. */
export const AwaitingEstimate: Story = { args: { state: "awaiting", threshold: undefined, curve: CURVE_PLAYING } };
/** #705: under the day's prior threshold, the estimate is 0 and says by how much the score misses it. */
export const AwaitingEstimateBelow: Story = { args: { state: "awaiting", threshold: undefined, score: 940, curve: CURVE_PLAYING } };
/** #705: its day's mean fixed, not settled: the reward a settle mints, exact. */
export const ReadyToSettleExact: Story = { args: { state: "settle", curve: CURVE_PLAYING } };
/** WRAP360: the largest reward, stake and scores. */
export const Stress: Story = { args: { reward: BIG_AMOUNT_18, stake: 999, score: BIG_SCORE, threshold: BIG_SCORE - 1 } };
/** WRAP360: the widest estimate, its threshold and the score's margin. */
export const EstimateStress: Story = {
  args: { state: "awaiting", stake: 999, score: BIG_SCORE, threshold: undefined, curve: { ...CURVE_PLAYING, reference: BIG_AMOUNT_18, threshold: (BIG_SCORE - 1) * 1000 } },
};
