import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { PVP_LEAGUE } from "../../mocks/pvp";
import { PvpLeagueScene } from "./pvp-league-scene";
import { PHONE_375, WIDE_1440 } from "./viewports";
import { inPanel } from "../../stories/in-panel";
import { scrolledToEnd } from "../../stories/scrolled-to-end";

/**
 * The league (#647): a carousel of the 23 leagues opening on the player's (#785), the details of the one in view, the season's
 * end and its rewards, Attack, and the latest attacks and defences as cards (#786, in place of the defence log), each opening
 * its match. The arrows, a swipe and the arrow keys move it; reduced motion cuts instead of sliding. On fakes.
 */
const meta = {
  title: "Scenes/PvP/League",
  component: PvpLeagueScene,
  parameters: { layout: "fullscreen" },
  args: { ...PVP_LEAGUE.gold, onBack: fn(), onNavigate: fn(), onAttack: fn(), onOpenMatch: fn(), onRetryMatches: fn() },
} satisfies Meta<typeof PvpLeagueScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The player's league, Silver II, 28 crowns from Silver I; the season ends in 4 days. */
export const Gold: Story = { args: PVP_LEAGUE.gold };
/** The carousel on a higher league (Gold II): its floor, the crowns to go, its rewards; "Back to my league". */
export const Higher: Story = { args: PVP_LEAGUE.higher };
/** The carousel on a lower league (Bronze II): reached. */
export const Lower: Story = { args: PVP_LEAGUE.lower };
/** The season's last day: its timer. */
export const LastDay: Story = { args: PVP_LEAGUE.lastDay };
/** The top league: the next arrow stops there. */
export const Legend: Story = { args: PVP_LEAGUE.legend };
/** No attack yet: Unranked, the first view; the previous arrow stops there. */
export const Unranked: Story = { args: PVP_LEAGUE.unranked };
/** The season has ended: its rewards on their way. */
export const Ended: Story = { args: PVP_LEAGUE.ended };
/** The matches with no shield: the village can be attacked. Attacks and defences mixed, newest first. */
export const MatchesOpen: Story = { args: PVP_LEAGUE.matchesOpen };
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
export const GoldPhone: Story = { ...Gold, ...PHONE_375 };
export const GoldWide: Story = { ...Gold, ...WIDE_1440, decorators: [inPanel("League")] };
export const HigherPhone: Story = { ...Higher, ...PHONE_375 };
export const HigherWide: Story = { ...Higher, ...WIDE_1440, decorators: [inPanel("League")] };
export const LowerPhone: Story = { ...Lower, ...PHONE_375 };
export const LowerWide: Story = { ...Lower, ...WIDE_1440, decorators: [inPanel("League")] };
export const UnrankedPhone: Story = { ...Unranked, ...PHONE_375 };
export const UnrankedWide: Story = { ...Unranked, ...WIDE_1440, decorators: [inPanel("League")] };
export const LegendPhone: Story = { ...Legend, ...PHONE_375 };
export const MatchesOpenPhone: Story = { ...MatchesOpen, ...PHONE_375 };
export const MatchesOpenWide: Story = { ...MatchesOpen, ...WIDE_1440, decorators: [inPanel("League")] };
export const MatchesManyPhone: Story = { ...MatchesMany, ...PHONE_375 };
export const MatchesNoSnapshotPhone: Story = { ...MatchesNoSnapshot, ...PHONE_375 };
export const LegendWide: Story = { ...Legend, ...WIDE_1440, decorators: [inPanel("League")] };
/** Reduced motion: the arrows cut from league to league. */
export const ReducedMotion: Story = { ...GoldPhone, parameters: { ...GoldPhone.parameters, reducedMotion: "always" } };
/** PAGES-SCROLL (#782): at 375 px the page scrolls in its region to the last league, the header sticky above it. */
export const GoldPhoneScrolled: Story = { ...GoldPhone, play: scrolledToEnd };
/** PAGES-SCROLL (#782): at 1440 px the panel's body scrolls to the last league; no close button (a click outside or Escape). */
export const GoldWideScrolled: Story = { ...GoldWide, play: scrolledToEnd };
