import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { PVP_LEAGUE } from "../../mocks/pvp";
import { PvpLeagueScene } from "./pvp-league-scene";
import { PHONE_375, WIDE_1440 } from "./viewports";
import { inPanel } from "../../stories/in-panel";
import { scrolledToEnd } from "../../stories/scrolled-to-end";

/**
 * The league (#647): a carousel of the 23 leagues opening on the player's (#785), one card size for every league (#833: the back
 * icon, the first-time bonus's icon, the range of crowns, the season's Cobbles), the dots, the season's end and its rewards, and
 * the latest attacks and defences as cards (#786), each opening its match. No Attack button (#833). The arrows, a swipe, the arrow
 * keys and the dots move it; reduced motion cuts instead of sliding. On fakes.
 */
const meta = {
  title: "Scenes/PvP/League",
  component: PvpLeagueScene,
  parameters: { layout: "fullscreen" },
  args: { ...PVP_LEAGUE.yeoman, onBack: fn(), onNavigate: fn(), onOpenMatch: fn(), onRetryMatches: fn() },
} satisfies Meta<typeof PvpLeagueScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The player's league, Yeoman II, 28 crowns from Yeoman I; the season ends in 4 days. */
export const Yeoman: Story = { args: PVP_LEAGUE.yeoman };
/** The carousel on a higher league (Squire II): its range, the crowns to go, its bonus out of reach; the back icon. */
export const Higher: Story = { args: PVP_LEAGUE.higher };
/** The carousel on a lower league (Peasant II): reached, its bonus had (crossed out); the back icon. */
export const Lower: Story = { args: PVP_LEAGUE.lower };
/** Yeoman II's first-time bonus paid and not yet celebrated: its icon active, with a glow (#833). */
export const BonusReady: Story = { args: PVP_LEAGUE.bonusReady };
/** The season's last day: its timer. */
export const LastDay: Story = { args: PVP_LEAGUE.lastDay };
/** The top league: the next arrow stops there. */
export const Sovereign: Story = { args: PVP_LEAGUE.sovereign };
/** No attack yet: Wanderer, the first view; the previous arrow stops there. */
export const Wanderer: Story = { args: PVP_LEAGUE.wanderer };
/** Dropped to Wanderer (200 crowns) after reaching Yeoman I this season: on Yeoman II, its bonus stays had, not locked. */
export const Demoted: Story = { args: PVP_LEAGUE.demoted };
export const DemotedPhone: Story = { ...Demoted, ...PHONE_375 };
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
export const YeomanPhone: Story = { ...Yeoman, ...PHONE_375 };
export const YeomanWide: Story = { ...Yeoman, ...WIDE_1440, decorators: [inPanel("League")] };
export const HigherPhone: Story = { ...Higher, ...PHONE_375 };
export const HigherWide: Story = { ...Higher, ...WIDE_1440, decorators: [inPanel("League")] };
export const LowerPhone: Story = { ...Lower, ...PHONE_375 };
export const LowerWide: Story = { ...Lower, ...WIDE_1440, decorators: [inPanel("League")] };
export const WandererPhone: Story = { ...Wanderer, ...PHONE_375 };
export const WandererWide: Story = { ...Wanderer, ...WIDE_1440, decorators: [inPanel("League")] };
export const SovereignPhone: Story = { ...Sovereign, ...PHONE_375 };
export const MatchesOpenPhone: Story = { ...MatchesOpen, ...PHONE_375 };
export const MatchesOpenWide: Story = { ...MatchesOpen, ...WIDE_1440, decorators: [inPanel("League")] };
export const MatchesManyPhone: Story = { ...MatchesMany, ...PHONE_375 };
export const MatchesNoSnapshotPhone: Story = { ...MatchesNoSnapshot, ...PHONE_375 };
export const SovereignWide: Story = { ...Sovereign, ...WIDE_1440, decorators: [inPanel("League")] };
/** Reduced motion: the arrows cut from league to league. */
export const ReducedMotion: Story = { ...YeomanPhone, parameters: { ...YeomanPhone.parameters, reducedMotion: "always" } };
/** PAGES-SCROLL (#782): at 375 px the page scrolls in its region to the last league, the header sticky above it. */
export const YeomanPhoneScrolled: Story = { ...YeomanPhone, play: scrolledToEnd };
/** PAGES-SCROLL (#782): at 1440 px the panel's body scrolls to the last league; no close button (a click outside or Escape). */
export const YeomanWideScrolled: Story = { ...YeomanWide, play: scrolledToEnd };

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
