import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { FRIENDS_TAB } from "../../mocks/follows";
import { GUILD_FINDER, GUILD_PAGE } from "../../mocks/guilds";
import { FriendsPanel } from "../containers/friends-panel";
import { SOCIAL } from "../../mocks/social";
import { GuildFinder } from "../containers/guild-finder";
import { GuildPage } from "../containers/guild-page";
import { SocialScene } from "./social-scene";

/**
 * The Social page (`/social`, #952): the player search and three tabs, Guild, Friends and Chat, each with its badge. Each tab
 * shows its empty state until its issue fills it (#953, #954, #955). One story per state; the viewport is the toolbar's (VP).
 */
const meta = {
  title: "Scenes/Social",
  component: SocialScene,
  args: { ...SOCIAL.guild, onTabChange: fn(), onBack: fn(), onNavigate: fn() },
} satisfies Meta<typeof SocialScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The Guild tab, empty until the guilds (#953). */
export const Guild: Story = {};
/** The Friends tab with nothing drawn in it: its empty state, as a guest sees it. */
export const Friends: Story = { args: SOCIAL.friends };
/** The Chat tab, empty until the messages (#955). */
export const Chat: Story = { args: SOCIAL.chat };
/** What waits in each tab, on its badge. */
export const Badges: Story = { args: SOCIAL.badges };
/** The search's results above the tabs: a tap opens the player's profile. */
export const Searching: Story = { args: SOCIAL.searching };
/** No social source on this network. */
export const Unavailable: Story = { args: SOCIAL.unavailable };
/** With reduced motion: the tabs change without the highlight's slide. */
export const ReducedMotion: Story = { args: SOCIAL.badges, parameters: { reducedMotion: "always" } };
/** WRAP360: three-digit badges on every tab, the longest name. */
export const Stress: Story = { args: SOCIAL.stress };
/** The Guild tab of a player in no guild (#953), with an invitation waiting on its badge. */
export const GuildTabGuildless: Story = {
  args: { badges: { guild: 1, friends: 0, chat: 0 }, renderTab: (tab) => (tab === "guild" ? <GuildFinder {...GUILD_FINDER.invited} onAction={fn()} onOpenGuild={fn()} /> : null) },
};
/** The Guild tab of an Officer (#953): their guild's page, two requests on the badge. */
export const GuildTabOfficer: Story = {
  args: { badges: { guild: 2, friends: 0, chat: 0 }, renderTab: (tab) => (tab === "guild" ? <GuildPage {...GUILD_PAGE.officer} onAction={fn()} onOpenPlayer={fn()} /> : null) },
};
/** The Friends tab (#954): friends online and offline, two new followers on its badge. */
export const FriendsTab: Story = {
  args: { tab: "friends", badges: { guild: 0, friends: 2, chat: 0 }, renderTab: (tab) => (tab === "friends" ? <FriendsPanel {...FRIENDS_TAB.friends} onAction={fn()} onOpenPlayer={fn()} /> : null) },
};
/** The Friends tab of a new player (#954): no follows, players to follow. */
export const FriendsTabEmpty: Story = {
  args: { tab: "friends", renderTab: (tab) => (tab === "friends" ? <FriendsPanel {...FRIENDS_TAB.noFollows} onAction={fn()} onOpenPlayer={fn()} /> : null) },
};
