import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { GUILD_FINDER, GUILD_PAGE } from "../../mocks/guilds";
import { GuildCard } from "./guild-card";

const ranking = GUILD_FINDER.guildless.ranking.guilds!;
const named = (name: string) => ranking.find((g) => g.name === name)!;

/** A guild as the search, the suggestions and the ranking show it (#953): a tap opens its page. */
const meta = {
  title: "Containers/GuildCard",
  component: GuildCard,
  args: { guild: named("Ashford Lanterns"), onOpen: fn() },
} satisfies Meta<typeof GuildCard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {};
export const ByRequest: Story = { args: { guild: named("Hollow Oak") } };
export const InviteOnly: Story = { args: { guild: named("Iron Quay Wardens") } };
/** In the ranking: its place. */
export const Ranked: Story = { args: { guild: ranking[0]!, place: 1 } };
/** Full: why the player cannot join. */
export const Full: Story = { args: { guild: GUILD_PAGE.full.guild, player: { level: 20, crowns: 2_000 } } };
/** Requirements not met: which one. */
export const RequirementsNotMet: Story = { args: { guild: named("Thistle Watch"), player: { level: 1, crowns: 0 } } };
/** WRAP360: the longest name and tag, the largest figures, ranked 30th. */
export const Stress: Story = { args: { guild: GUILD_PAGE.stress.guild, place: 30, player: { level: 1, crowns: 0 } } };
