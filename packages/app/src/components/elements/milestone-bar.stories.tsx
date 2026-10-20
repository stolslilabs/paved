import type { Meta, StoryObj } from "@storybook/react-vite";
import { BIG_NUMBER } from "../../mocks/stress";
import { MilestoneBar } from "./milestone-bar";

/**
 * The milestone bar (#595): the count fills it, each step a node with its reward above and its target below. One story per
 * state of the steps: locked, next, reached (no reward), claimable, claimed.
 */
const meta = {
  title: "Elements/MilestoneBar",
  component: MilestoneBar,
  parameters: { layout: "padded" },
  decorators: [(Story) => <div className="max-w-md rounded-xl border border-border bg-card py-3"><Story /></div>],
  args: {
    unit: "roads and cities scored",
    count: 9,
    milestones: [
      { key: 5, label: "Small Works", target: 4, state: "claimed", cobbles: 5 },
      { key: 6, label: "Public Works", target: 8, state: "claimable", cobbles: 10 },
      { key: 7, label: "Great Works", target: 12, state: "next", cobbles: 15 },
    ],
  },
} satisfies Meta<typeof MilestoneBar>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Three tiers of one task: the first claimed, the second to claim (it glows), the third next. */
export const Tiered: Story = {};

/** Nothing counted yet: the first step is next, the others locked. */
export const Locked: Story = {
  args: {
    count: 0,
    milestones: [
      { key: 8, label: "Woodland Walk", target: 2, state: "next", cobbles: 5 },
      { key: 9, label: "Deep Woods", target: 3, state: "locked", cobbles: 10 },
      { key: 10, label: "Old Growth", target: 4, state: "locked", cobbles: 15 },
    ],
  },
};

/** One target: a bar of one step, part-way. */
export const OneStep: Story = { args: { unit: "points", count: 2_710, milestones: [{ key: 12, label: "Strong Day", target: 5_000, state: "next", cobbles: 10 }] } };

/** One step reached, its Cobbles to claim. */
export const OneStepClaimable: Story = { args: { unit: "Challenge games finished", count: 1, milestones: [{ key: 1, label: "Daily Run", target: 1, state: "claimable", cobbles: 5 }] } };

/** Every step reached and claimed: the bar turns green. */
export const AllClaimed: Story = {
  args: {
    count: 14,
    milestones: [
      { key: 5, label: "Small Works", target: 4, state: "claimed", cobbles: 5 },
      { key: 6, label: "Public Works", target: 8, state: "claimed", cobbles: 10 },
      { key: 7, label: "Great Works", target: 12, state: "claimed", cobbles: 15 },
    ],
  },
};

/** No Cobbles (a network without the ledger): reached steps check, nothing drawn above. */
export const NoRewards: Story = {
  args: {
    milestones: [
      { key: 5, label: "Small Works", target: 4, state: "done" },
      { key: 6, label: "Public Works", target: 8, state: "done" },
      { key: 7, label: "Great Works", target: 12, state: "next" },
    ],
  },
};

/** WRAP360: five steps with large targets and rewards at 360 px. */
export const Stress: Story = {
  args: {
    unit: "points",
    count: BIG_NUMBER / 2,
    milestones: [1, 2, 3, 4, 5].map((i) => ({ key: i, label: `Tier ${i}`, target: (BIG_NUMBER / 5) * i, state: i < 2 ? "claimed" : i === 2 ? "claimable" : i === 3 ? "next" : "locked", cobbles: 1_000 * i }) as const),
  },
};
