import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { RewardPanel } from "./reward-panel";
import { BIG_AMOUNT_18, BIG_SCORE } from "../../mocks/stress";

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
/** WRAP360: the largest reward, stake and scores. */
export const Stress: Story = { args: { reward: BIG_AMOUNT_18, stake: 999, score: BIG_SCORE, threshold: BIG_SCORE - 1 } };
