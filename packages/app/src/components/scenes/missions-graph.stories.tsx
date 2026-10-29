import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { MISSIONS } from "../../mocks/scenes";
import { MissionsScene } from "./missions-scene";
import { PHONE_375, WIDE_1440 } from "./viewports";

/**
 * The day's milestones graph (#869, reworked 2026-10-29) in its page, Missions, for the owner: each state of the graph (no reward,
 * reward, claimed, all done) pinned at 375 and 1440 px. `Scenes/Missions` keeps one story per state at the toolbar's width.
 */
const meta = {
  title: "Scenes/MissionsGraph",
  component: MissionsScene,
  args: { onClaimQuest: fn(), onClaimMilestone: fn(), onClaimAchievement: fn(), onClaimBonus: fn(), onConnect: fn(), onRetry: fn(), onBack: fn(), onNavigate: fn() },
} satisfies Meta<typeof MissionsScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** No reward yet: two dailies done, at 375 px. */
export const NoRewardPhone: Story = { args: MISSIONS.milestonesTwo, ...PHONE_375 };
/** A reward to claim: three done, at 375 px. */
export const RewardPhone: Story = { args: MISSIONS.milestoneThree, ...PHONE_375 };
/** The first reward claimed, at 375 px. */
export const ClaimedPhone: Story = { args: MISSIONS.milestoneThreeClaimed, ...PHONE_375 };
/** All done: five done, both rewards claimed, at 375 px. */
export const AllDonePhone: Story = { args: MISSIONS.milestonesAllClaimed, ...PHONE_375 };
/** No reward yet, at 1440 px. */
export const NoRewardWide: Story = { args: MISSIONS.milestonesTwo, ...WIDE_1440 };
/** A reward to claim, at 1440 px. */
export const RewardWide: Story = { args: MISSIONS.milestoneThree, ...WIDE_1440 };
/** The first reward claimed, at 1440 px. */
export const ClaimedWide: Story = { args: MISSIONS.milestoneThreeClaimed, ...WIDE_1440 };
/** All done, at 1440 px. */
export const AllDoneWide: Story = { args: MISSIONS.milestonesAllClaimed, ...WIDE_1440 };
