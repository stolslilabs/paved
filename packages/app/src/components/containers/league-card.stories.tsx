import type { Meta, StoryObj } from "@storybook/react-vite";
import { LEAGUES } from "../../lib/pvp-rules";
import { LeagueCard } from "./league-card";

const YEOMAN_II = LEAGUES[5]!;

/**
 * A league's card (#833), standing alone (#859): one height for every league, Wood included. The league's crest (#917) in its
 * division's version, the range of crowns, the season's Cobbles, then its plate; no crowns' count and no back icon (#859), no
 * first-time bonus (#917: a lifetime league mission instead).
 */
const meta = {
  title: "Containers/LeagueCard",
  component: LeagueCard,
  parameters: { layout: "padded" },
  args: { league: YEOMAN_II },
  decorators: [(Story) => <div className="max-w-xs"><Story /></div>],
} satisfies Meta<typeof LeagueCard>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Bronze II: the copper crest, its numeral II. */
export const Own: Story = {};
/** A league above: Silver II. */
export const Higher: Story = { args: { league: LEAGUES[8]! } };
/** Emerald III (#917, Platinum renamed): the longest name on the plate, the green crest. */
export const Emerald: Story = { args: { league: LEAGUES[13]! } };
/** A league below: Iron II. */
export const Lower: Story = { args: { league: LEAGUES[2]! } };
/** Wood: no season reward; the wooden crest, no numeral. */
export const Wood: Story = { args: { league: LEAGUES[0]! } };
/** Grand Master: the top league, "5,000+", its winged crest. */
export const GrandMaster: Story = { args: { league: LEAGUES[22]! } };

/** Every league's card side by side: the same height for all 23, each tier's crest. */
export const AllLeagues: Story = {
  decorators: [(Story) => <Story />],
  render: (args) => (
    <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(14rem, 1fr))" }}>
      {LEAGUES.map((league) => (
        <LeagueCard key={league.index} {...args} league={league} />
      ))}
    </div>
  ),
};
