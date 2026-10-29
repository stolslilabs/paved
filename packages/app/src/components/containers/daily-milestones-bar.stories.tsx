import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { DailyMilestonesBar } from "./daily-milestones-bar";

/**
 * The day's progress bar of the Missions page (#869): a step per daily done, five in all, and the milestones' Cobbles under steps 3
 * (+10) and 5 (+15), claimed with a tap once reached. One story per state; Claim plays the claim and its burst.
 */
const meta = {
  title: "Containers/DailyMilestonesBar",
  component: DailyMilestonesBar,
  args: { done: 0, claimed: 0, onClaim: fn() },
  decorators: [(Story) => <div className="max-w-md p-4"><Story /></div>],
} satisfies Meta<typeof DailyMilestonesBar>;
export default meta;
type Story = StoryObj<typeof meta>;

/** No daily done: both milestones ahead. */
export const None: Story = {};
/** Two done: the first milestone one daily away. */
export const Two: Story = { args: { done: 2 } };
/** Three done: the first milestone to claim. */
export const Three: Story = { args: { done: 3 } };
/** Its claim on its way. */
export const Claiming: Story = { args: { done: 3, claiming: 0 } };
/** Three done, the first claimed. */
export const ThreeClaimed: Story = { args: { done: 3, claimed: 0b01 } };
/** Five done, the first claimed: the second to claim. */
export const Five: Story = { args: { done: 5, claimed: 0b01 } };
/** Five done, both claimed. */
export const AllClaimed: Story = { args: { done: 5, claimed: 0b11 } };
/** Both reached, no wallet to sign: the markers show, nothing can be claimed. */
export const ReadOnly: Story = { args: { done: 5, canClaim: false } };
/** The milestones not served here (the chain before #738): the steps and the Cobbles, no claim. */
export const NotServed: Story = { args: { done: 4, claimed: null } };
/** The Cobbles not read here (the ledger unreadable): the steps alone. */
export const StepsOnly: Story = { args: { done: 2, rewards: false } };

/** Five done: a tap claims a milestone, its Cobbles burst out (still under reduced motion), then its check. */
export const Claim: Story = {
  render: function Render(args) {
    const [claimed, setClaimed] = useState(0);
    return <DailyMilestonesBar {...args} done={5} claimed={claimed} onClaim={(step) => setClaimed((c) => c | (1 << step))} />;
  },
};
