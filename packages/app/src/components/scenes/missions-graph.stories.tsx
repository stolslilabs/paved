import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { MISSIONS } from "../../mocks/scenes";
import { MissionsScene } from "./missions-scene";
import { PHONE_320, PHONE_375, WIDE_1440 } from "./viewports";

/**
 * The milestones graphs in their page, Missions, for the owner: the day's (#869, reworked 2026-10-29), each state of the graph and
 * its gift nodes (no reward, gift closed, gift opening, claimed, all done), and the week's (#976: none, three and five done, a gift
 * claimed, a gift opening), pinned at 375 and 1440 px, the week's also at 320. The week's gifts are the day's size (the owner's
 * decision of 2026-11-01), told apart by their ribbon: the river blue with a gold seam, where the day's is red. `Scenes/Missions` keeps one story per state at the toolbar's width.
 */
const meta = {
  title: "Scenes/MissionsGraph",
  component: MissionsScene,
  args: { onClaimQuest: fn(), onClaimMilestone: fn(), onClaimWeeklyMilestone: fn(), onClaimAchievement: fn(), onConnect: fn(), onRetry: fn(), onBack: fn(), onNavigate: fn() },
} satisfies Meta<typeof MissionsScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** No reward yet: two dailies done, at 375 px. */
export const NoRewardPhone: Story = { args: MISSIONS.milestonesTwo, ...PHONE_375 };
/** A reward to claim: three done, at 375 px. */
export const RewardPhone: Story = { args: MISSIONS.milestoneThree, ...PHONE_375 };
/** The first gift opening, its 10 Cobbles above it, at 375 px. */
export const OpeningPhone: Story = { args: MISSIONS.milestoneOpening, ...PHONE_375 };
/** The first reward claimed, at 375 px. */
export const ClaimedPhone: Story = { args: MISSIONS.milestoneThreeClaimed, ...PHONE_375 };
/** All done: five done, both rewards claimed, at 375 px. */
export const AllDonePhone: Story = { args: MISSIONS.milestonesAllClaimed, ...PHONE_375 };
/** No reward yet, at 1440 px. */
export const NoRewardWide: Story = { args: MISSIONS.milestonesTwo, ...WIDE_1440 };
/** A reward to claim, at 1440 px. */
export const RewardWide: Story = { args: MISSIONS.milestoneThree, ...WIDE_1440 };
/** The first gift opening, at 1440 px. */
export const OpeningWide: Story = { args: MISSIONS.milestoneOpening, ...WIDE_1440 };
/** The first reward claimed, at 1440 px. */
export const ClaimedWide: Story = { args: MISSIONS.milestoneThreeClaimed, ...WIDE_1440 };
/** All done, at 1440 px. */
export const AllDoneWide: Story = { args: MISSIONS.milestonesAllClaimed, ...WIDE_1440 };

/** The week (#976): no weekly done, both gifts ahead, at 320 px. */
export const WeekNoneSmall: Story = { args: MISSIONS.weekNone, ...PHONE_320 };
/** The week: three done, the first gift to claim, at 320 px. */
export const WeekThreeSmall: Story = { args: MISSIONS.weekThree, ...PHONE_320 };
/** The week: five done, both gifts to claim, at 320 px. */
export const WeekFiveSmall: Story = { args: MISSIONS.weekFive, ...PHONE_320 };
/** The week: a gift claimed, at 320 px. */
export const WeekClaimedSmall: Story = { args: MISSIONS.weekClaimed, ...PHONE_320 };
/** The week: a gift opening, at 320 px. */
export const WeekOpeningSmall: Story = { args: MISSIONS.weekOpening, ...PHONE_320 };
/** The week (#976): no weekly done, both gifts ahead, at 375 px. */
export const WeekNonePhone: Story = { args: MISSIONS.weekNone, ...PHONE_375 };
/** The week: three done, the first gift to claim, at 375 px. */
export const WeekThreePhone: Story = { args: MISSIONS.weekThree, ...PHONE_375 };
/** The week: five done, both gifts to claim, at 375 px. */
export const WeekFivePhone: Story = { args: MISSIONS.weekFive, ...PHONE_375 };
/** The week: a gift claimed, open with its check, at 375 px. */
export const WeekClaimedPhone: Story = { args: MISSIONS.weekClaimed, ...PHONE_375 };
/** The week: a gift opening, its 50 Cobbles above it, at 375 px. */
export const WeekOpeningPhone: Story = { args: MISSIONS.weekOpening, ...PHONE_375 };
/** The week: no weekly done, at 1440 px. */
export const WeekNoneWide: Story = { args: MISSIONS.weekNone, ...WIDE_1440 };
/** The week: three done, at 1440 px. */
export const WeekThreeWide: Story = { args: MISSIONS.weekThree, ...WIDE_1440 };
/** The week: five done, at 1440 px. */
export const WeekFiveWide: Story = { args: MISSIONS.weekFive, ...WIDE_1440 };
/** The week: a gift claimed, at 1440 px. */
export const WeekClaimedWide: Story = { args: MISSIONS.weekClaimed, ...WIDE_1440 };
/** The week: a gift opening, at 1440 px. */
export const WeekOpeningWide: Story = { args: MISSIONS.weekOpening, ...WIDE_1440 };
