import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { PVP_LEAGUE } from "../../mocks/pvp";
import { PvpLeagueScene } from "./pvp-league-scene";
import { PHONE_320, PHONE_375, WIDE_1440 } from "./viewports";
import { scrolledToEnd } from "../../stories/scrolled-to-end";

/**
 * The league (#647). LEAGUE-PAGE (the Paved UX Book's League): the HUD's drawer, a full page with Back on a phone, a side panel
 * docked at the left from `tablet`. The League control at the header's end (#859, a tap brings the carousel back to the player's
 * league); the carousel of the 23 leagues opening on the player's (#785), Wood for an Unranked player (#917, no slide of its own since
 * UNRANKED-PLACEHOLDER), each card the crest beside its name and its range, between two thin arrows (no dots); the season in one row (its calendar, the player's league's Cobbles, its time
 * left, #859); the battle logs (#786), each row opening its match, its score, XP and chest behind a rule. No Attack button (#833).
 * The arrows, a swipe and the arrow keys move it; reduced motion cuts instead of sliding. On fakes.
 */
const meta = {
  title: "Scenes/PvP/League",
  component: PvpLeagueScene,
  parameters: { layout: "fullscreen" },
  args: { ...PVP_LEAGUE.bronze, onBack: fn(), onOpenMatch: fn(), onRetryMatches: fn() },
} satisfies Meta<typeof PvpLeagueScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The player's league, Bronze II, 28 crowns from Bronze I; the season ends in 4 days. */
export const Bronze: Story = { args: PVP_LEAGUE.bronze };
/** The carousel on a higher league (Silver II): its range; the header's League control brings it back. */
export const Higher: Story = { args: PVP_LEAGUE.higher };
/** The carousel on a lower league (Iron II). */
export const Lower: Story = { args: PVP_LEAGUE.lower };
/** The season's last day: its timer. */
export const LastDay: Story = { args: PVP_LEAGUE.lastDay };
/** The top league: the next arrow stops there. */
export const GrandMaster: Story = { args: PVP_LEAGUE.grandmaster };
/**
 * No attack yet: Unranked (#917), the header's League control alone says it, with Unranked's placeholder crest; the carousel opens on
 * Wood, the league a first attack enters, none of the slides marked as the player's; the previous arrow stops there.
 */
export const Unranked: Story = { args: PVP_LEAGUE.unranked };
/** In Wood after a first attack (120 crowns, 0 – 399): Wood's card is the player's, the first. */
export const Wood: Story = { args: PVP_LEAGUE.wood };
/** Dropped to Wood (200 crowns), the carousel opened on Bronze I. */
export const Demoted: Story = { args: PVP_LEAGUE.demoted };
export const DemotedPhone: Story = { ...Demoted, ...PHONE_375 };
/** The season has ended: its rewards on their way. */
export const Ended: Story = { args: PVP_LEAGUE.ended };
/** 26 matches: the first 20, then "Show more" (open point 3). */
export const MatchesMany: Story = { args: PVP_LEAGUE.matchesMany };
/** v1 (the chain before step 3): no snapshot, so no rewards known. */
export const MatchesNoSnapshot: Story = { args: PVP_LEAGUE.matchesNoSnapshot };
/** No match yet. */
export const MatchesEmpty: Story = { args: PVP_LEAGUE.matchesEmpty };
/** The matches on their way. */
export const MatchesLoading: Story = { args: PVP_LEAGUE.matchesLoading };
/** The matches' read failed: Try again in place. */
export const MatchesFailed: Story = { args: PVP_LEAGUE.matchesFailed };

/** At 375 px a full page with Back; from 1440 px the side panel at the left, laid out as on a phone. */
export const BronzePhone: Story = { ...Bronze, ...PHONE_375 };
export const BronzeWide: Story = { ...Bronze, ...WIDE_1440 };
export const HigherPhone: Story = { ...Higher, ...PHONE_375 };
export const HigherWide: Story = { ...Higher, ...WIDE_1440 };
export const LowerPhone: Story = { ...Lower, ...PHONE_375 };
export const LowerWide: Story = { ...Lower, ...WIDE_1440 };
export const UnrankedPhone: Story = { ...Unranked, ...PHONE_375 };
export const UnrankedWide: Story = { ...Unranked, ...WIDE_1440 };
export const WoodPhone: Story = { ...Wood, ...PHONE_375 };
export const WoodWide: Story = { ...Wood, ...WIDE_1440 };
export const GrandMasterPhone: Story = { ...GrandMaster, ...PHONE_375 };
export const MatchesManyPhone: Story = { ...MatchesMany, ...PHONE_375 };
export const MatchesNoSnapshotPhone: Story = { ...MatchesNoSnapshot, ...PHONE_375 };
export const GrandMasterWide: Story = { ...GrandMaster, ...WIDE_1440 };
/** The narrowest phone (320 px): the League control in the header, beside the title, never under it. */
export const BronzeSmall: Story = { ...Bronze, ...PHONE_320 };
export const HigherSmall: Story = { ...Higher, ...PHONE_320 };
export const UnrankedSmall: Story = { ...Unranked, ...PHONE_320 };
export const WoodSmall: Story = { ...Wood, ...PHONE_320 };
export const GrandMasterSmall: Story = { ...GrandMaster, ...PHONE_320 };

/** A tap on the header's League control, the carousel on Silver II: it glides back to the player's league, Bronze II (#859). */
const showMine: Story["play"] = async ({ canvasElement }) => {
  // The panel (1440 px) is in a portal, out of the canvas.
  const canvas = within(canvasElement.ownerDocument.body);
  const inView = () => within(canvas.getByRole("region", { name: "Leagues" })).getByRole("group");
  await waitFor(() => expect(inView()).toHaveAccessibleName("Silver II"));
  // The panel slides in (no pointer events until it lands): the tap waits for it.
  await waitFor(() => userEvent.click(canvas.getByRole("button", { name: /^Your league: Bronze II, [\d,]+ crowns\. Show it$/ })));
  await waitFor(() => expect(inView()).toHaveAccessibleName("Bronze II"));
};
export const ShowMinePhone: Story = { ...HigherPhone, play: showMine };
export const ShowMineSmall: Story = { ...HigherSmall, play: showMine };
export const ShowMineWide: Story = { ...HigherWide, play: showMine };
/** The same under reduced motion: the carousel cuts back. */
export const ShowMineReduced: Story = { ...ShowMinePhone, parameters: { ...ShowMinePhone.parameters, reducedMotion: "always" } };

/**
 * The page scrolled to the end of 26 matches, the carousel on Silver II: the tap brings the carousel back into view in the drawer's
 * body, never under its header band (the card's crest in sight), then on Bronze II.
 */
const showMineScrolled: Story["play"] = async (context) => {
  await scrolledToEnd(context);
  const page = within(context.canvasElement.ownerDocument.body);
  const carousel = page.getByRole("region", { name: "Leagues" });
  await expect(within(carousel).getByRole("group")).toHaveAccessibleName("Silver II");
  await userEvent.click(page.getByRole("button", { name: /^Your league: Bronze II, [\d,]+ crowns\. Show it$/ }));
  await waitFor(() => expect(within(carousel).getByRole("group")).toHaveAccessibleName("Bronze II"));
  const body = carousel.closest("[data-hud-drawer-body]")!;
  await waitFor(() => expect(carousel.getBoundingClientRect().top).toBeGreaterThanOrEqual(body.getBoundingClientRect().top), { timeout: 3_000 });
};
const scrolledArgs = { ...PVP_LEAGUE.matchesMany, opensOn: 8 };
export const ShowMineScrolledPhone: Story = { ...MatchesManyPhone, args: scrolledArgs, play: showMineScrolled };
export const ShowMineScrolledReduced: Story = { ...ShowMineScrolledPhone, parameters: { ...ShowMineScrolledPhone.parameters, reducedMotion: "always" } };
export const ShowMineScrolledWide: Story = { ...MatchesMany, ...WIDE_1440, args: scrolledArgs, play: showMineScrolled };

/** Reduced motion: the arrows cut from league to league. */
export const ReducedMotion: Story = { ...BronzePhone, parameters: { ...BronzePhone.parameters, reducedMotion: "always" } };
/** PAGES-SCROLL (#782): at 375 px the drawer's body scrolls to the last row, the header band above it. */
export const BronzePhoneScrolled: Story = { ...BronzePhone, play: scrolledToEnd };
/** PAGES-SCROLL (#782): at 1440 px the side panel's body scrolls to the last row; its close the red cross. */
export const BronzeWideScrolled: Story = { ...BronzeWide, play: scrolledToEnd };

export const Unavailable: Story = { ...PHONE_375, args: { wait: { kind: "unavailable" } } };
export const Loading: Story = { ...PHONE_375, args: { wait: { kind: "loading" } } };
export const Failed: Story = { ...PHONE_375, args: { wait: { kind: "error", message: "The league could not load.", onRetry: fn() } } };
export const FailedWide: Story = { ...Failed, ...WIDE_1440 };
