import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { PVP_LEAGUE } from "../../mocks/pvp";
import { PvpLeagueScene } from "./pvp-league-scene";
import { PHONE_320, PHONE_375, WIDE_1440 } from "./viewports";
import { inPanel } from "../../stories/in-panel";
import { scrolledToEnd } from "../../stories/scrolled-to-end";

/**
 * The league (#647): the League control in the header (#859, no balance there; a tap brings the carousel back to the player's
 * league), a carousel of the 23 leagues opening on the player's (#785), one card size for every league, the card standing alone
 * between the arrows and over the dots (#833, #859: the first-time bonus's icon, the range of crowns, the season's Cobbles; no
 * crowns' count, no back icon), the season's end and, in one line, what the player's league gives at it (#859), and the latest
 * attacks and defences as cards (#786, no shield's card since #859), each opening its match. No Attack button (#833). The arrows,
 * a swipe, the arrow keys and the dots move it; reduced motion cuts instead of sliding. On fakes.
 */
const meta = {
  title: "Scenes/PvP/League",
  component: PvpLeagueScene,
  parameters: { layout: "fullscreen" },
  args: { ...PVP_LEAGUE.bronze, onBack: fn(), onNavigate: fn(), onOpenMatch: fn(), onRetryMatches: fn() },
} satisfies Meta<typeof PvpLeagueScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The player's league, Bronze II, 28 crowns from Bronze I; the season ends in 4 days. */
export const Bronze: Story = { args: PVP_LEAGUE.bronze };
/** The carousel on a higher league (Silver II): its range, its bonus out of reach; the header's League control brings it back. */
export const Higher: Story = { args: PVP_LEAGUE.higher };
/** The carousel on a lower league (Iron II): its bonus had (crossed out). */
export const Lower: Story = { args: PVP_LEAGUE.lower };
/** Bronze II's first-time bonus paid and not yet celebrated: its icon active, with a glow (#833). */
export const BonusReady: Story = { args: PVP_LEAGUE.bonusReady };
/** The season's last day: its timer. */
export const LastDay: Story = { args: PVP_LEAGUE.lastDay };
/** The top league: the next arrow stops there. */
export const GrandMaster: Story = { args: PVP_LEAGUE.grandmaster };
/** No attack yet: Wood, the first view; the previous arrow stops there. */
export const Wood: Story = { args: PVP_LEAGUE.wood };
/** Dropped to Wood (200 crowns) after reaching Bronze I this season: on Bronze II, its bonus stays had, not locked. */
export const Demoted: Story = { args: PVP_LEAGUE.demoted };
export const DemotedPhone: Story = { ...Demoted, ...PHONE_375 };
/** The season has ended: its rewards on their way. */
export const Ended: Story = { args: PVP_LEAGUE.ended };
/** The season's reward with 2 of its 5 attacks made: the attacks still needed under it (#859). */
export const AttacksBelow: Story = { args: PVP_LEAGUE.attacksBelow };
/** One attack left: "1 more time". */
export const AttacksOneLeft: Story = { args: PVP_LEAGUE.attacksOneLeft };
/** 7 attacks made, past the 5 needed: the reward's line alone. */
export const AttacksAbove: Story = { args: PVP_LEAGUE.attacksAbove };
/** 26 matches: the first 20, then "Show more" (open point 3). */
export const MatchesMany: Story = { args: PVP_LEAGUE.matchesMany };
/** v1 (the chain before step 3): no snapshot, so no village behind the cards, and no rewards known. */
export const MatchesNoSnapshot: Story = { args: PVP_LEAGUE.matchesNoSnapshot };
/** No match yet. */
export const MatchesEmpty: Story = { args: PVP_LEAGUE.matchesEmpty };
/** The matches on their way. */
export const MatchesLoading: Story = { args: PVP_LEAGUE.matchesLoading };
/** The matches' read failed: Try again in place. */
export const MatchesFailed: Story = { args: PVP_LEAGUE.matchesFailed };

/** In the phone's bar (#763): the League current at 375 px; from 1440 px in the home's side panel, laid out as on a phone (#762). */
export const BronzePhone: Story = { ...Bronze, ...PHONE_375 };
export const BronzeWide: Story = { ...Bronze, ...WIDE_1440, decorators: [inPanel("League")] };
export const HigherPhone: Story = { ...Higher, ...PHONE_375 };
export const HigherWide: Story = { ...Higher, ...WIDE_1440, decorators: [inPanel("League")] };
export const LowerPhone: Story = { ...Lower, ...PHONE_375 };
export const LowerWide: Story = { ...Lower, ...WIDE_1440, decorators: [inPanel("League")] };
export const WoodPhone: Story = { ...Wood, ...PHONE_375 };
export const WoodWide: Story = { ...Wood, ...WIDE_1440, decorators: [inPanel("League")] };
export const GrandMasterPhone: Story = { ...GrandMaster, ...PHONE_375 };
export const MatchesManyPhone: Story = { ...MatchesMany, ...PHONE_375 };
export const MatchesNoSnapshotPhone: Story = { ...MatchesNoSnapshot, ...PHONE_375 };
export const GrandMasterWide: Story = { ...GrandMaster, ...WIDE_1440, decorators: [inPanel("League")] };
/** The narrowest phone (320 px): the League control in the header, beside the title, never under it. */
export const BronzeSmall: Story = { ...Bronze, ...PHONE_320 };
export const HigherSmall: Story = { ...Higher, ...PHONE_320 };
export const WoodSmall: Story = { ...Wood, ...PHONE_320 };
export const GrandMasterSmall: Story = { ...GrandMaster, ...PHONE_320 };
export const AttacksBelowSmall: Story = { ...AttacksBelow, ...PHONE_320 };
export const AttacksBelowPhone: Story = { ...AttacksBelow, ...PHONE_375 };
export const AttacksBelowWide: Story = { ...AttacksBelow, ...WIDE_1440, decorators: [inPanel("League")] };
export const AttacksAboveSmall: Story = { ...AttacksAbove, ...PHONE_320 };
export const AttacksAbovePhone: Story = { ...AttacksAbove, ...PHONE_375 };
export const AttacksAboveWide: Story = { ...AttacksAbove, ...WIDE_1440, decorators: [inPanel("League")] };

/** A tap on the header's League control, the carousel on Silver II: it glides back to the player's league, Bronze II (#859). */
const showMine: Story["play"] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const inView = () => within(canvas.getByRole("region", { name: "Leagues" })).getByRole("group");
  await expect(inView()).toHaveAccessibleName("Silver II");
  await userEvent.click(canvas.getByRole("button", { name: /^Your league: Bronze II, [\d,]+ crowns\. Show it$/ }));
  await waitFor(() => expect(inView()).toHaveAccessibleName("Bronze II"));
};
export const ShowMinePhone: Story = { ...HigherPhone, play: showMine };
export const ShowMineSmall: Story = { ...HigherSmall, play: showMine };
export const ShowMineWide: Story = { ...HigherWide, play: showMine };
/** The same under reduced motion: the carousel cuts back. */
export const ShowMineReduced: Story = { ...ShowMinePhone, parameters: { ...ShowMinePhone.parameters, reducedMotion: "always" } };

/** Reduced motion: the arrows cut from league to league. */
export const ReducedMotion: Story = { ...BronzePhone, parameters: { ...BronzePhone.parameters, reducedMotion: "always" } };
/** PAGES-SCROLL (#782): at 375 px the page scrolls in its region to the last league, the header sticky above it. */
export const BronzePhoneScrolled: Story = { ...BronzePhone, play: scrolledToEnd };
/** PAGES-SCROLL (#782): at 1440 px the panel's body scrolls to the last league; no close button (a click outside or Escape). */
export const BronzeWideScrolled: Story = { ...BronzeWide, play: scrolledToEnd };

export const BonusReadyPhone: Story = { ...BonusReady, ...PHONE_375 };
export const BonusReadyWide: Story = { ...BonusReady, ...WIDE_1440, decorators: [inPanel("League")] };
/** A tap on the active bonus: the moment plays (the Cobbles burst out, "+10" rises), then the icon is crossed out. */
export const BonusMoment: Story = {
  ...BonusReadyPhone,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /First-time bonus, \+10 Cobbles: earned/ }));
    await expect(canvas.getByRole("status")).toBeInTheDocument();
  },
};
/** The moment under reduced motion: still, the figure shown, then the icon crossed out. */
export const BonusMomentReduced: Story = {
  ...BonusMoment,
  parameters: { ...BonusMoment.parameters, reducedMotion: "always" },
  play: async (context) => {
    await BonusMoment.play!(context);
    const canvas = within(context.canvasElement);
    await waitFor(() => expect(canvas.getByRole("img", { name: /First-time bonus, \+10 Cobbles: had this season/ })).toBeInTheDocument(), { timeout: 4_000 });
  },
};
