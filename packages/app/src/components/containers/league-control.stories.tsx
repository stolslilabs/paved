import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState } from "react";
import { fn } from "storybook/test";
import { LEAGUE_FLOORS } from "../../lib/pvp-rules";
import { LeagueControl } from "./league-control";

/** The home's top left, over the village's sky: where the control sits, under the profile (#829). */
function Corner({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-32 flex-col items-start gap-3 bg-gradient-to-b from-background/40 to-board p-2 tablet:p-4">{children}</div>;
}

/** Wood, then each group's floor up to Grand Master, on a loop: the crest turns to each new tier's with a ring's pulse. */
const PROMOTIONS = [0, ...[0, 3, 6, 9, 12, 15, 18, 21].map((i) => LEAGUE_FLOORS[i]!)];
function Promoting() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setI((n) => (n + 1) % PROMOTIONS.length), 1_600);
    return () => clearInterval(timer);
  }, []);
  return (
    <Corner>
      <LeagueControl crowns={PROMOTIONS[i]!} onLeague={fn()} />
    </Corner>
  );
}

/**
 * The League control (#829, the owner's decisions of 2026-10-27): the round League button over the left end of the balances'
 * plate (#828), the crowns at its centre, the league's crest closing its right end (#917: the tier's icon form, the division's
 * numeral); no league name. A tap anywhere opens the
 * League page. `auto` (the home's) is the phone's size below `desktop` and the larger from it: the Viewport toolbar shows both.
 */
const meta = {
  title: "Containers/LeagueControl",
  component: LeagueControl,
  args: { crowns: 1_240, onLeague: fn() },
  render: (args) => (
    <Corner>
      <LeagueControl {...args} />
    </Corner>
  ),
} satisfies Meta<typeof LeagueControl>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Before PvP (no crown, no attack, #917): Unranked's broken planks. */
export const Unranked: Story = { args: { crowns: 0, unranked: true } };
/** Wood (0 crowns after an attack): the wooden shield and its sprout, no numeral. */
export const Wood: Story = { args: { crowns: 0 } };
/** A mid league (1,240 crowns, Bronze I): the copper crest and its numeral, I. */
export const MidLeague: Story = {};
/** Emerald II (2,800 crowns), Platinum's old place (#917): its crest in green, II. */
export const Emerald: Story = { args: { crowns: 2_800 } };
/** The top league: Grand Master's crest. */
export const GrandMaster: Story = { args: { crowns: 5_320 } };
/** WRAP360: a five-digit crown count. */
export const Stress: Story = { args: { crowns: 12_345 } };
/** The League page's header (#859): the crowns and the crest alone, no trophy; a tap brings the carousel back to the player's league. */
export const Page: Story = { args: { variant: "page", label: "Your league: Bronze I, 1,240 crowns. Show it" } };
/** The League page's header before PvP: Unranked's crest. */
export const PageUnranked: Story = { args: { variant: "page", crowns: 0, unranked: true, label: "Your league: Unranked, 0 crowns. Show it" } };
/** Every tier's crest closing the plate (#917), Unranked to Grand Master, a division of each group with its numeral. */
export const Tiers: Story = {
  render: (args) => (
    <Corner>
      <LeagueControl {...args} crowns={0} unranked />
      {[0, 400, 900, 1_400, 2_000, 2_800, 3_500, 4_400, 5_320].map((crowns) => (
        <LeagueControl key={crowns} {...args} crowns={crowns} />
      ))}
    </Corner>
  ),
};
export const PageStress: Story = { args: { variant: "page", crowns: 12_345, label: "Your league: Grand Master, 12,345 crowns. Show it" } };
/** Both fixed sizes, one under the other: the phone's (a 32 px box, 40 px ends) and `desktop`'s (36, 44). */
export const Sizes: Story = {
  render: (args) => (
    <Corner>
      <LeagueControl {...args} size="sm" />
      <LeagueControl {...args} size="md" />
    </Corner>
  ),
};
/** A promotion: the crest turns to the new tier's with a ring's pulse, each group in turn. */
export const Promotion: Story = { render: () => <Promoting />, parameters: { reducedMotion: "never" } };
/** Reduced motion: the crest changes at once, no pulse. */
export const PromotionReducedMotion: Story = { render: () => <Promoting />, parameters: { reducedMotion: "always" } };
