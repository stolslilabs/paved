import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { PHONE_375, WIDE_1440 } from "../scenes/viewports";
import { DailyMilestonesBar } from "./daily-milestones-bar";

/**
 * The day's milestones of the Missions page as a graph (#869, reworked 2026-10-29): six nodes, an edge per daily done between two,
 * five in all. The nodes at 3 (+10 Cobbles) and 5 (+15) carry a reward: the full node, its Cobbles on it, claimed with a tap once
 * reached; the others are plain and small. One story per state; the four the owner looks at (no reward, reward, claimed, all done)
 * are also pinned at 375 and 1440 px. Claim plays the claim and its burst.
 */
const meta = {
  title: "Containers/DailyMilestonesBar",
  component: DailyMilestonesBar,
  args: { done: 0, claimed: 0, onClaim: fn() },
  decorators: [(Story) => <div className="mx-auto max-w-md p-4"><Story /></div>],
} satisfies Meta<typeof DailyMilestonesBar>;
export default meta;
type Story = StoryObj<typeof meta>;

/** No daily done: both rewards ahead. */
export const None: Story = {};
/** No reward yet: two dailies done, two edges lit, the first reward one daily away. */
export const NoReward: Story = { args: { done: 2 } };
/** A reward reached: three done, the first reward's 10 Cobbles to claim with a tap on its node. */
export const Reward: Story = { args: { done: 3 } };
/** Its claim on its way. */
export const Claiming: Story = { args: { done: 3, claiming: 0 } };
/** Claimed: three done, the first reward's check; the second ahead. */
export const Claimed: Story = { args: { done: 3, claimed: 0b01 } };
/** Five done, the first claimed: the second to claim. */
export const Five: Story = { args: { done: 5, claimed: 0b01 } };
/** All done: the five dailies done, both rewards claimed. */
export const AllDone: Story = { args: { done: 5, claimed: 0b11 } };
/** Both reached, no wallet to sign: the rewards show, nothing can be claimed. */
export const ReadOnly: Story = { args: { done: 5, canClaim: false } };
/** The milestones not served here (the chain before #738): the graph and the Cobbles, no claim. */
export const NotServed: Story = { args: { done: 4, claimed: null } };
/** The Cobbles not read here (the ledger unreadable): the plain nodes alone. */
export const StepsOnly: Story = { args: { done: 2, rewards: false } };

/** No reward, at 375 px. */
export const NoRewardPhone: Story = { ...NoReward, ...PHONE_375 };
/** A reward to claim, at 375 px. */
export const RewardPhone: Story = { ...Reward, ...PHONE_375 };
/** Claimed, at 375 px. */
export const ClaimedPhone: Story = { ...Claimed, ...PHONE_375 };
/** All done, at 375 px. */
export const AllDonePhone: Story = { ...AllDone, ...PHONE_375 };
/** No reward, at 1440 px. */
export const NoRewardWide: Story = { ...NoReward, ...WIDE_1440 };
/** A reward to claim, at 1440 px. */
export const RewardWide: Story = { ...Reward, ...WIDE_1440 };
/** Claimed, at 1440 px. */
export const ClaimedWide: Story = { ...Claimed, ...WIDE_1440 };
/** All done, at 1440 px. */
export const AllDoneWide: Story = { ...AllDone, ...WIDE_1440 };

/** Five done: a tap claims a reward, its Cobbles burst out (still under reduced motion), then its check. */
export const Claim: Story = {
  render: function Render(args) {
    const [claimed, setClaimed] = useState(0);
    return <DailyMilestonesBar {...args} done={5} claimed={claimed} onClaim={(step) => setClaimed((c) => c | (1 << step))} />;
  },
};
