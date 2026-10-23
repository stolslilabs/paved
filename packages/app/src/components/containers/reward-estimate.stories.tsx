import type { Meta, StoryObj } from "@storybook/react-vite";
import { RewardEstimate } from "./reward-estimate";
import { referenceAt, quote } from "../../mocks/economy";
import { BIG_AMOUNT_18, BIG_SCORE } from "../../mocks/stress";

const terms = quote(3);

const meta = {
  title: "Containers/RewardEstimate",
  component: RewardEstimate,
  parameters: { layout: "padded" },
  args: { reference: referenceAt(3), threshold: terms.threshold, slopeBps: terms.slope, cap: terms.cap },
  decorators: [(Story) => <div className="max-w-sm"><Story /></div>],
} satisfies Meta<typeof RewardEstimate>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Stake 3 at the chain's defaults (`c` 1.222, `H` 5): the threshold, 1.25x, 1.5x, 2x, then the cap from 4,706. */
export const Stake3: Story = {};

/** The pool's quote or the guard's rate unread: the rows and bars stand, the figures wait. */
export const Waiting: Story = { args: { reference: null } };

/** A steep slope (`c` 3, `H` 5): the cap comes before 2x the threshold, so the steps past it are left out. */
export const SteepSlope: Story = { args: { slopeBps: 30_000 } };

/** A slope of `H` or more: the cap from the threshold, one row. */
export const CapAtThreshold: Story = { args: { slopeBps: 50_000, cap: 5 } };

/** WRAP360: the widest scores and rewards. */
export const Stress: Story = { args: { reference: BIG_AMOUNT_18, threshold: (BIG_SCORE - 1) * 1000 } };
