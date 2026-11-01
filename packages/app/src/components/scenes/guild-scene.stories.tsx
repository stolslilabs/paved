import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { GUILD_FINDER, GUILD_PAGE } from "../../mocks/guilds";
import { GuildFinder } from "../containers/guild-finder";
import { GuildPage } from "../containers/guild-page";
import { GuildScene } from "./guild-scene";

/**
 * The guild page (`/guild`, #973, the Social page's Guild tab of #953 before): the finder for a player in no guild, the player's
 * guild for a member. One story per state; the viewport is the toolbar's (VP). Its header, menu and tabs are #973's third step.
 */
const meta = {
  title: "Scenes/Guild",
  component: GuildScene,
  args: { onBack: fn(), onNavigate: fn() },
} satisfies Meta<typeof GuildScene>;
export default meta;
type Story = StoryObj<typeof meta>;

const finder = (data: (typeof GUILD_FINDER)[keyof typeof GUILD_FINDER]) => <GuildFinder {...data} onAction={fn()} onOpenGuild={fn()} />;
const page = (data: (typeof GUILD_PAGE)[keyof typeof GUILD_PAGE]) => <GuildPage {...data} onAction={fn()} onOpenPlayer={fn()} />;

/** A guest: the empty state. */
export const Guest: Story = {};
/** A player in no guild: the finder, Create, the search, Suggested or Ranking. */
export const Guildless: Story = { args: { children: finder(GUILD_FINDER.guildless) } };
/** A player in no guild with an invitation waiting. */
export const Invited: Story = { args: { children: finder(GUILD_FINDER.invited) } };
/** A member: their guild's page. */
export const Member: Story = { args: { children: page(GUILD_PAGE.member) } };
/** An officer: the requests and the invitations sent too. */
export const Officer: Story = { args: { children: page(GUILD_PAGE.officer) } };
/** The leader: the settings and Leave at the end. */
export const Leader: Story = { args: { children: page(GUILD_PAGE.leader) } };
/** With reduced motion: the page opens without motion. */
export const ReducedMotion: Story = { args: { children: page(GUILD_PAGE.member) }, parameters: { reducedMotion: "always" } };
/** WRAP360: the longest names and the largest figures. */
export const Stress: Story = { args: { children: page(GUILD_PAGE.stress) } };
