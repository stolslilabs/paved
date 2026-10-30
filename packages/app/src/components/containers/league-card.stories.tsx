import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { LEAGUES } from "../../lib/pvp-rules";
import { LeagueCard } from "./league-card";

const YEOMAN_II = LEAGUES[5]!;

/**
 * A league's card (#833), standing alone (#859): one height for every league, Wood included. The first-time bonus's icon at the
 * top right, the league's standard (#917: the crest over the plate, its name, over the banner), the range of crowns, the season's
 * Cobbles; no crowns' count and no back icon (#859).
 */
const meta = {
  title: "Containers/LeagueCard",
  component: LeagueCard,
  parameters: { layout: "padded" },
  args: { league: YEOMAN_II, bonus: "had", onCelebrate: fn(), onCelebrated: fn() },
  decorators: [(Story) => <div className="max-w-xs"><Story /></div>],
} satisfies Meta<typeof LeagueCard>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Bronze II, its bonus had: the copper standard. */
export const Own: Story = {};
/** A league above: its bonus not reached. */
export const Higher: Story = { args: { league: LEAGUES[8]!, bonus: "locked" } };
/** Emerald III (#917, Platinum renamed): the longest name on the plate, the green standard. */
export const Emerald: Story = { args: { league: LEAGUES[13]!, bonus: "locked" } };
/** A league below: its bonus had. */
export const Lower: Story = { args: { league: LEAGUES[2]! } };
/** Wood: no season reward, no bonus; the wooden standard. */
export const Wood: Story = { args: { league: LEAGUES[0]! } };
/** Grand Master: the top league, "5,000+", its winged standard. */
export const GrandMaster: Story = { args: { league: LEAGUES[22]! } };
/** The bonus to celebrate: active. */
export const BonusReady: Story = { args: { bonus: "ready" } };
/** The bonus's moment over the card, as it starts. */
export const Celebrating: Story = { args: { bonus: "ready", celebrating: true } };

/** Every league's card side by side: the same height for all 23, each tier's standard. */
export const AllLeagues: Story = {
  decorators: [(Story) => <Story />],
  render: (args) => (
    <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(14rem, 1fr))" }}>
      {LEAGUES.map((league) => (
        <LeagueCard key={league.index} {...args} league={league} bonus={league.index > 6 ? "locked" : league.index === 5 ? "ready" : "had"} />
      ))}
    </div>
  ),
};
