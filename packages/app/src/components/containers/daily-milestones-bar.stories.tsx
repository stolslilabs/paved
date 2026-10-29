import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { PHONE_375, WIDE_1440 } from "../scenes/viewports";
import { DailyMilestonesBar } from "./daily-milestones-bar";

/**
 * The day's milestones of the Missions page as a graph (#869, reworked 2026-10-29): six nodes, an edge per daily done between two,
 * five in all. The nodes at 3 (+10 Cobbles) and 5 (+15) carry a reward: a small gift, no figure on it, lit and shaking once reached;
 * a tap claims it and, once the claim lands, the gift opens and its Cobbles rise out of it; claimed, it stays open with a check. The
 * others are plain and smaller. One story per state; the node's states (no reward, gift closed, gift opening, claimed) and all done
 * are also pinned at 375 and 1440 px. Claim plays the claims, their openings and their bursts.
 */
const meta = {
  title: "Containers/DailyMilestonesBar",
  component: DailyMilestonesBar,
  args: { done: 0, claimed: 0, onClaim: fn() },
  decorators: [(Story) => <div className="mx-auto max-w-md p-4" style={{ paddingTop: "2.5rem" }}><Story /></div>],
} satisfies Meta<typeof DailyMilestonesBar>;
export default meta;
type Story = StoryObj<typeof meta>;

/** No daily done: both gifts ahead, greyed. */
export const None: Story = {};
/** No reward yet: two dailies done, two edges lit, the first gift one daily away. */
export const NoReward: Story = { args: { done: 2 } };
/** A gift closed and reached: three done, the first gift lit and shaking, its 10 Cobbles to claim with a tap on it. */
export const Reward: Story = { args: { done: 3 } };
/** Its claim on its way: the gift shakes fast. */
export const Claiming: Story = { args: { done: 3, claiming: 0 } };
/** The claim landed: the gift opening, its 10 Cobbles above it (the reveal's last frame, held). */
export const Opening: Story = { args: { done: 3, claimed: 0b01, revealing: 0 } };
/** The last gift opening: its 15 Cobbles keep to the graph's right edge. */
export const OpeningLast: Story = { args: { done: 5, claimed: 0b11, revealing: 1 } };
/** Claimed: three done, the first gift open with its check; the second ahead. */
export const Claimed: Story = { args: { done: 3, claimed: 0b01 } };
/** Five done, the first claimed: the second gift to open. */
export const Five: Story = { args: { done: 5, claimed: 0b01 } };
/** All done: the five dailies done, both gifts open. */
export const AllDone: Story = { args: { done: 5, claimed: 0b11 } };
/** Both reached, no wallet to sign: the gifts lit and still, nothing can be claimed. */
export const ReadOnly: Story = { args: { done: 5, canClaim: false } };
/** The milestones not served here (the chain before #738): the graph and the gifts, no claim. */
export const NotServed: Story = { args: { done: 4, claimed: null } };
/** The Cobbles not read here (the ledger unreadable): the plain nodes alone. */
export const StepsOnly: Story = { args: { done: 2, rewards: false } };

/** No reward, at 375 px. */
export const NoRewardPhone: Story = { ...NoReward, ...PHONE_375 };
/** A gift to open, at 375 px. */
export const RewardPhone: Story = { ...Reward, ...PHONE_375 };
/** A gift opening, at 375 px. */
export const OpeningPhone: Story = { ...Opening, ...PHONE_375 };
/** Claimed, at 375 px. */
export const ClaimedPhone: Story = { ...Claimed, ...PHONE_375 };
/** All done, at 375 px. */
export const AllDonePhone: Story = { ...AllDone, ...PHONE_375 };
/** No reward, at 1440 px. */
export const NoRewardWide: Story = { ...NoReward, ...WIDE_1440 };
/** A gift to open, at 1440 px. */
export const RewardWide: Story = { ...Reward, ...WIDE_1440 };
/** A gift opening, at 1440 px. */
export const OpeningWide: Story = { ...Opening, ...WIDE_1440 };
/** Claimed, at 1440 px. */
export const ClaimedWide: Story = { ...Claimed, ...WIDE_1440 };
/** All done, at 1440 px. */
export const AllDoneWide: Story = { ...AllDone, ...WIDE_1440 };

/**
 * Five done: a tap claims a gift; a moment later (the claim's way, faked) it opens, its Cobbles rise and burst out (still under
 * reduced motion), then it stays open with its check.
 */
export const Claim: Story = {
  render: function Render(args) {
    const [claimed, setClaimed] = useState(0);
    const [claiming, setClaiming] = useState<number | null>(null);
    return (
      <DailyMilestonesBar
        {...args}
        done={5}
        claimed={claimed}
        claiming={claiming}
        onClaim={(step) => {
          setClaiming(step);
          setTimeout(() => {
            setClaiming(null);
            setClaimed((c) => c | (1 << step));
          }, 900);
        }}
      />
    );
  },
};
