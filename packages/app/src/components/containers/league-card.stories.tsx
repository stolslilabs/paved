import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { LEAGUES } from "../../lib/pvp-rules";
import { ME } from "../../mocks/pvp";
import { LeagueCard } from "./league-card";

const YEOMAN_II = LEAGUES[5]!;

/**
 * A league's card (#833): one height for every league, Wood included. The back icon at the top left away from the player's
 * league, the first-time bonus's icon at the top right, the crest and the name, the range of crowns, the season's Cobbles, then
 * the way to the next league (the player's) or what it takes (another).
 */
const meta = {
  title: "Containers/LeagueCard",
  component: LeagueCard,
  parameters: { layout: "padded" },
  args: { league: YEOMAN_II, mine: YEOMAN_II, crowns: ME.crowns, bonus: "had", onBack: fn(), onCelebrate: fn(), onCelebrated: fn(), className: "bg-card" },
  decorators: [(Story) => <div className="max-w-xs"><Story /></div>],
} satisfies Meta<typeof LeagueCard>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The player's own: the bar to Bronze I, no back icon, its bonus had. */
export const Own: Story = {};
/** A league above: the crowns to go, its bonus not reached; the back icon. */
export const Higher: Story = { args: { league: LEAGUES[8]!, bonus: "locked" } };
/** A league below: reached, its bonus had. */
export const Lower: Story = { args: { league: LEAGUES[2]! } };
/** Wood: no season reward, no bonus. */
export const Wood: Story = { args: { league: LEAGUES[0]! } };
/** Grand Master, the player's: the top league, "5,000+". */
export const GrandMaster: Story = { args: { league: LEAGUES[22]!, mine: LEAGUES[22]!, crowns: 5_320 } };
/** The bonus to celebrate: active. */
export const BonusReady: Story = { args: { bonus: "ready" } };
/** The bonus's moment over the card, as it starts. */
export const Celebrating: Story = { args: { bonus: "ready", celebrating: true } };

/** Every league's card side by side, the player in Bronze II: the same height for all 23. */
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
