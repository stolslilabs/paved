import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { GUILD_FINDER } from "../../mocks/guilds";
import { GuildFinder } from "./guild-finder";

/**
 * The Guild tab of a player in no guild (#953): their invitations and request, Create, the search by name or `#` tag with its
 * filters, and the guilds suggested to them or the ranking.
 */
const meta = {
  title: "Containers/GuildFinder",
  component: GuildFinder,
  args: { ...GUILD_FINDER.guildless, onQueryChange: fn(), onFiltersChange: fn(), onOpenGuild: fn(), onAction: fn(async () => {}) },
} satisfies Meta<typeof GuildFinder>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Guildless: Create, the search, the guilds they may join. */
export const Guildless: Story = {};
/** An invitation waits: Accept or Decline. */
export const Invited: Story = { args: GUILD_FINDER.invited };
/** A request waits at Hollow Oak: Cancel. */
export const Requested: Story = { args: GUILD_FINDER.requested };
/** A new player: the cards say which requirement they miss. */
export const RequirementsNotMet: Story = { args: GUILD_FINDER.requirementsNotMet };
export const Searching: Story = { args: GUILD_FINDER.searching };
export const Filtered: Story = { args: GUILD_FINDER.filtered };
export const NoResults: Story = { args: GUILD_FINDER.none };
export const Loading: Story = { args: GUILD_FINDER.loading };
export const Failed: Story = { args: GUILD_FINDER.error };
