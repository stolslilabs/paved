import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { GUILD_FINDER } from "../../mocks/guilds";
import { FRIENDS_SEARCH } from "../../mocks/social";
import { GuildFindSheet, GuildInviteSheet } from "./guild-page-sheets";

/**
 * The guild page's menu sheets (#973): Invite a player (officers and the leader), the player search, a result opening the
 * player's profile where Invite is; Find guilds, the guild search, Suggested and the ranking (#953). A member's row's sheet is in
 * `Scenes/Guild` (the RowActions stories).
 */
const meta = {
  title: "Containers/GuildPageSheets",
  component: GuildInviteSheet,
  args: { open: true, onOpenChange: fn(), guildName: "The Quarrymen", search: FRIENDS_SEARCH.idle.search, onOpenPlayer: fn() },
} satisfies Meta<typeof GuildInviteSheet>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Invite a player: the search, empty. */
export const Invite: Story = {};
/** Invite a player: players found; a tap opens their profile. */
export const InviteSearching: Story = { args: { search: FRIENDS_SEARCH.searching.search } };
/** WRAP360: the longest names. */
export const InviteStress: Story = { args: { guildName: "W".repeat(20), search: FRIENDS_SEARCH.stress.search } };

const { candidate, query, filters, results, suggested, ranking } = GUILD_FINDER.guildless;
/** Find guilds: Suggested, or the ranking; a card opens that guild's page. */
export const FindGuilds: Story = {
  render: () => <GuildFindSheet open onOpenChange={fn()} candidate={candidate} query={query} filters={filters} results={results} suggested={suggested} ranking={ranking} onOpenGuild={fn()} onQueryChange={fn()} onFiltersChange={fn()} />,
};
