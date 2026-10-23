import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { rewardAt } from "../../mocks/economy";
import { RewardEstimateTable } from "./reward-estimate";

const meta = {
  title: "Containers/RewardEstimate",
  component: RewardEstimateTable,
  parameters: { layout: "padded" },
  args: { estimate: rewardAt(1) },
  decorators: [(Story) => <div className="max-w-sm rounded-xl bg-card p-4"><Story /></div>],
} satisfies Meta<typeof RewardEstimateTable>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The smallest stake: 1 x 2 USDC. */
export const SmallStake: Story = {};
/** The largest stake: 10 x 2 USDC, boosted by 10 %. */
export const LargeStake: Story = { args: { estimate: rewardAt(10) } };
/** A cap of 2: the cap is paid from 1.64x the threshold, so the 2x row gives way to it. */
export const CapReached: Story = { args: { estimate: rewardAt(1, { terms: { cap: 2 } }) } };
/** The pool pays more than 110 % of the guard's rate: the guard's figure counts. */
export const Guarded: Story = { args: { estimate: rewardAt(3, { paved: 100n }) } };
/** The quotes are being read: the rows keep their place. */
export const Loading: Story = { args: { estimate: null } };
/** A quote could not be read: why, and Retry. */
export const ReadFailed: Story = { args: { estimate: null, error: "Economy.rate: the node did not answer.", onRetry: fn() } };
