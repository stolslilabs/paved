import { useState, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { PHONE_320, PHONE_375, WIDE_1440 } from "../scenes/viewports";
import { MilestonesBar } from "./milestones-bar";

/**
 * A period's milestones of the Missions page as a graph, the day's (#869, reworked 2026-10-29) and the week's (#976, `Week*`
 * stories): six nodes, an edge per quest done between two, five in all. The week's gifts (+50 and +100) are the day's size (the
 * owner's decision of 2026-11-01): their ribbon tells them apart, the river blue with a gold seam where the day's is red, in every
 * state (`DayAndWeek*` sets both bars side by side). The nodes at 3 (+10 Cobbles) and 5 (+15) carry a reward: a small gift, no figure on it, lit and shaking once reached;
 * a tap claims it and, once the claim lands, the gift opens and its Cobbles rise out of it; claimed, it stays open with a check. The
 * others are plain and smaller. One story per state; the node's states (no reward, gift closed, gift opening, claimed) and all done
 * are also pinned at 375 and 1440 px. Claim plays the claims, their openings and their bursts. The `Tip*` stories hold a gift's
 * tooltip open (#989), in each state, on both bars.
 */
const meta = {
  title: "Containers/MilestonesBar",
  component: MilestonesBar,
  args: { done: 0, claimed: 0, onClaim: fn() },
  decorators: [(Story) => <div className="mx-auto max-w-md p-4" style={{ paddingTop: "2.5rem" }}><Story /></div>],
} satisfies Meta<typeof MilestonesBar>;
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

/** The week (#976): no weekly done, both gifts (+50 at 3 done, +100 at 5) ahead, greyed, the day's size, their ribbon's seam kept. */
export const WeekNone: Story = { args: { period: "weekly" } };
/** The week: three weeklies done, the first gift lit and shaking (its blue and gold ribbon), its 50 Cobbles to claim with a tap on it. */
export const WeekThree: Story = { args: { period: "weekly", done: 3 } };
/** The week: the first gift's claim on its way, shaking fast. */
export const WeekClaiming: Story = { args: { period: "weekly", done: 3, claiming: 0 } };
/** The week: five weeklies done, both gifts to claim. */
export const WeekFive: Story = { args: { period: "weekly", done: 5 } };
/** The week: both reached, no wallet to sign: the gifts lit and still. */
export const WeekReadOnly: Story = { args: { period: "weekly", done: 5, canClaim: false } };
/** The week: its first gift claimed, open with its check; the second to claim. */
export const WeekClaimed: Story = { args: { period: "weekly", done: 5, claimed: 0b01 } };
/** The week: the last gift opening, its 100 Cobbles above it, kept to the graph's right edge. */
export const WeekOpening: Story = { args: { period: "weekly", done: 5, claimed: 0b11, revealing: 1 } };
/** The week: both gifts open. */
export const WeekAllDone: Story = { args: { period: "weekly", done: 5, claimed: 0b11 } };
/** The week's gift opening under reduced motion: open at once, nothing shakes or flies, the same size and ribbon. */
export const WeekReducedMotion: Story = { ...WeekOpening, name: "Week, reduced motion on", parameters: { reducedMotion: "always" } };
/** The week's none done, at 320 px. */
export const WeekNoneSmall: Story = { ...WeekNone, ...PHONE_320 };
/** The week's three done, at 320 px. */
export const WeekThreeSmall: Story = { ...WeekThree, ...PHONE_320 };
/** The week's gift opening, at 320 px. */
export const WeekOpeningSmall: Story = { ...WeekOpening, ...PHONE_320 };
/** The week's none done, at 375 px. */
export const WeekNonePhone: Story = { ...WeekNone, ...PHONE_375 };
/** The week's three done, at 375 px. */
export const WeekThreePhone: Story = { ...WeekThree, ...PHONE_375 };
/** The week's five done, at 375 px. */
export const WeekFivePhone: Story = { ...WeekFive, ...PHONE_375 };
/** The week's gift claimed, at 375 px. */
export const WeekClaimedPhone: Story = { ...WeekClaimed, ...PHONE_375 };
/** The week's gift opening, at 375 px. */
export const WeekOpeningPhone: Story = { ...WeekOpening, ...PHONE_375 };
/** The week's none done, at 1440 px. */
export const WeekNoneWide: Story = { ...WeekNone, ...WIDE_1440 };
/** The week's three done, at 1440 px. */
export const WeekThreeWide: Story = { ...WeekThree, ...WIDE_1440 };
/** The week's five done, at 1440 px. */
export const WeekFiveWide: Story = { ...WeekFive, ...WIDE_1440 };
/** The week's gift claimed, at 1440 px. */
export const WeekClaimedWide: Story = { ...WeekClaimed, ...WIDE_1440 };
/** The week's gift opening, at 1440 px. */
export const WeekOpeningWide: Story = { ...WeekOpening, ...WIDE_1440 };

/**
 * The day's bar above the week's, in the same state (the owner's decision of 2026-11-01): the gifts the same size on both, the week's
 * told apart by their ribbon, blue with a gold seam, where the day's is red. Both bars take the story's `done` and `claimed`.
 */
export const DayAndWeek: Story = {
  args: { done: 3, claimed: 0 },
  render: (args) => (
    <div className="grid gap-8">
      <MilestonesBar {...args} />
      <MilestonesBar {...args} period="weekly" />
    </div>
  ),
};
/** Both bars, five done, the first gift of each claimed, the second to claim. */
export const DayAndWeekClaimed: Story = { ...DayAndWeek, args: { done: 5, claimed: 0b01 } };
/** Both bars, none done: the gifts greyed, the week's seam still tells them apart. */
export const DayAndWeekNone: Story = { ...DayAndWeek, args: { done: 0, claimed: 0 } };
/** Both bars, at 320 px. */
export const DayAndWeekSmall: Story = { ...DayAndWeek, ...PHONE_320 };
/** Both bars, at 375 px. */
export const DayAndWeekPhone: Story = { ...DayAndWeek, ...PHONE_375 };
/** Both bars, a gift claimed, at 375 px. */
export const DayAndWeekClaimedPhone: Story = { ...DayAndWeekClaimed, ...PHONE_375 };
/** Both bars, at 1440 px. */
export const DayAndWeekWide: Story = { ...DayAndWeek, ...WIDE_1440 };
/** Both bars, a gift claimed, at 1440 px. */
export const DayAndWeekClaimedWide: Story = { ...DayAndWeekClaimed, ...WIDE_1440 };

/** Room above the bar for a gift's tooltip, which opens above the gift (it flips under it when there is none). */
const ROOM = (Story: () => ReactNode) => (
  <div style={{ paddingTop: "4.5rem" }}>
    <Story />
  </div>
);

/**
 * The gifts' tooltip (#989), held open: what the gift holds (one line per item, Cobbles today), what reaches it and where it stands.
 * It opens on hover after 300 ms with a mouse, on focus with the keyboard, and on a tap on a gift that does not claim on a touch
 * screen; a tap or a click on a reached gift claims it at once. Locked: one daily done, the first gift two dailies away.
 */
export const TipLocked: Story = { args: { done: 1, tip: 0 }, decorators: [ROOM] };
/** The tooltip of a reached gift: ready to claim. */
export const TipReady: Story = { args: { done: 3, tip: 0 }, decorators: [ROOM] };
/** The tooltip of a claimed gift. */
export const TipClaimed: Story = { args: { done: 3, claimed: 0b01, tip: 0 }, decorators: [ROOM] };
/** The last gift's tooltip, one daily away: the gift at the bar's right edge, its tooltip shifted left to stay 16 px inside the screen. */
export const TipLast: Story = { args: { done: 4, tip: 1 }, decorators: [ROOM] };
/** A reached gift where the milestones are not served (the chain before #738): reached, no claim. */
export const TipNotServed: Story = { args: { done: 3, claimed: null, tip: 0 }, decorators: [ROOM] };
/** The tooltip under reduced motion: it shows at once, no fade. */
export const TipReducedMotion: Story = { ...TipReady, name: "Tip, reduced motion on", parameters: { reducedMotion: "always" } };
/** The week's locked gift: +50 Cobbles, two weeklies away. */
export const WeekTipLocked: Story = { args: { period: "weekly", done: 1, tip: 0 }, decorators: [ROOM] };
/** The week's reached gift. */
export const WeekTipReady: Story = { args: { period: "weekly", done: 3, tip: 0 }, decorators: [ROOM] };
/** The week's claimed gift. */
export const WeekTipClaimed: Story = { args: { period: "weekly", done: 5, claimed: 0b01, tip: 0 }, decorators: [ROOM] };
/** The week's last gift, +100 Cobbles, reached: its tooltip shifted left. */
export const WeekTipLast: Story = { args: { period: "weekly", done: 5, claimed: 0b01, tip: 1 }, decorators: [ROOM] };
/** A locked gift's tooltip, at 375 px. */
export const TipLockedPhone: Story = { ...TipLocked, ...PHONE_375 };
/** A reached gift's tooltip, at 375 px. */
export const TipReadyPhone: Story = { ...TipReady, ...PHONE_375 };
/** A claimed gift's tooltip, at 375 px. */
export const TipClaimedPhone: Story = { ...TipClaimed, ...PHONE_375 };
/** The last gift's tooltip, at 375 px: shifted left, inside the screen. */
export const TipLastPhone: Story = { ...TipLast, ...PHONE_375 };
/** The week's last gift's tooltip, at 375 px. */
export const WeekTipLastPhone: Story = { ...WeekTipLast, ...PHONE_375 };
/** A locked gift's tooltip, at 1440 px. */
export const TipLockedWide: Story = { ...TipLocked, ...WIDE_1440 };
/** The last gift's tooltip, at 1440 px. */
export const TipLastWide: Story = { ...TipLast, ...WIDE_1440 };
/** The week's last gift's tooltip, at 1440 px. */
export const WeekTipLastWide: Story = { ...WeekTipLast, ...WIDE_1440 };

/**
 * Five done: a tap claims a gift; a moment later (the claim's way, faked) it opens, its Cobbles rise and burst out (still under
 * reduced motion), then it stays open with its check.
 */
export const Claim: Story = {
  render: function Render(args) {
    const [claimed, setClaimed] = useState(0);
    const [claiming, setClaiming] = useState<number | null>(null);
    return (
      <MilestonesBar
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

/** The week's claims played: a tap claims a gift of the week, it opens and its 50 or 100 Cobbles burst out. */
export const WeekClaim: Story = { ...Claim, args: { period: "weekly" } };
