import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { HOUR, MOCK_NOW } from "../../mocks/clock";
import { LONG_LABEL, LONG_SENTENCE } from "../../mocks/stress";
import { MissionTrackCard, type TrackStep } from "./mission-track-card";
import { questText } from "./quest-text";

const step = (id: number, target: number, reached: boolean, reward?: TrackStep["reward"]): TrackStep => ({
  id,
  title: questText(id).title,
  target,
  reached,
  completedAt: reached ? MOCK_NOW - 3 * HOUR : null,
  reward,
});

/**
 * A mission track (#595): the tiers of one task as one bar of steps, or one mission as a bar of one step, with the Cobbles
 * drawn at each step and each reached step's Claim. One story per state.
 */
const meta = {
  title: "Containers/MissionTrackCard",
  component: MissionTrackCard,
  parameters: { layout: "padded" },
  decorators: [(Story) => <div className="max-w-md"><Story /></div>],
  args: {
    title: "Builder",
    icon: "city",
    taskId: 2,
    count: 9,
    steps: [step(5, 4, true, { cobbles: 5, claimed: true }), step(6, 8, true, { cobbles: 10, claimed: false }), step(7, 12, false, { cobbles: 15, claimed: false })],
    onClaim: fn(),
  },
} satisfies Meta<typeof MissionTrackCard>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Three tiers: Small Works claimed, Public Works to claim, Great Works 3 more roads or cities away. */
export const TieredClaimable: Story = {};

/** Its claim on its way. */
export const TieredClaiming: Story = {
  args: { steps: [step(5, 4, true, { cobbles: 5, claimed: true }), step(6, 8, true, { cobbles: 10, claimed: false, claiming: true }), step(7, 12, false, { cobbles: 15, claimed: false })] },
};

/** Nothing counted: the first step next, the others locked. */
export const TieredLocked: Story = { args: { title: "Forester", icon: "tree", taskId: 4, count: 0, steps: [step(8, 2, false, { cobbles: 5, claimed: false }), step(9, 3, false, { cobbles: 10, claimed: false }), step(10, 4, false, { cobbles: 15, claimed: false })] } };

/** Every step reached and claimed. */
export const TieredClaimed: Story = {
  args: { count: 14, steps: [step(5, 4, true, { cobbles: 5, claimed: true }), step(6, 8, true, { cobbles: 10, claimed: true }), step(7, 12, true, { cobbles: 15, claimed: true })] },
};

/** One target: a bar of one step, part-way, with its own countdown (its window ends before the section's). */
export const OneStep: Story = {
  args: { ...questText(12), taskId: 3, count: 2_710, steps: [step(12, 5_000, false, { cobbles: 10, claimed: false })], ends: { at: MOCK_NOW + 9 * HOUR, now: MOCK_NOW, label: "Daily mission ends in" } },
};

/** One step reached, its Cobbles to claim. */
export const OneStepClaimable: Story = { args: { ...questText(1), taskId: 1, count: 1, steps: [step(1, 1, true, { cobbles: 5, claimed: false })] } };

/** No Cobbles: the bar, its steps, no claim. */
export const NoRewards: Story = { args: { steps: [step(5, 4, true), step(6, 8, true), step(7, 12, false)] } };

/** A retired mission: nothing counts any more. */
export const Retired: Story = { args: { ...questText(9), taskId: 4, count: 1, retired: true, steps: [step(9, 3, false)] } };

/** WRAP360: a long name and rule. */
export const Stress: Story = { args: { title: LONG_LABEL, description: LONG_SENTENCE, icon: "city", taskId: 2, count: 9, steps: [step(6, 8, true, { cobbles: 10, claimed: false })] } };
