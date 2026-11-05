import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { GUILD_RANK } from "@paved/game-core";
import { GUILD_FINDER, GUILD_PAGE } from "../../mocks/guilds";
import { FRIENDS_SEARCH } from "../../mocks/social";
import { GuildBrowse, GuildFinder } from "../containers/guild-finder";
import { GuildPage, type GuildPageProps } from "../containers/guild-page";
import { PlayerSearch } from "../containers/player-search";
import { GuildScene } from "./guild-scene";

/**
 * The guild page (`/guild`, #973, the Social page's Guild tab of #953 before; GUILD-PAGE: the HUD's drawer, after the Paved UX Book's
 * "Run my guild"): the finder for a player in no guild; for a member, the guild's header (Chat, the menu), then its tabs:
 * Announcements, Members, Requests (officers and the leader) and Log. The menu, what it opens (Invite a player, Guild settings, Find
 * guilds) and a member's row tapped are views in the drawer, in the page's place, with Back and the red cross. Another guild is a sheet
 * over the page, its header and its members. One story per state; the viewport is the toolbar's (VP): a full page with Back on a phone,
 * a side panel at the right from `tablet`.
 */
const meta = {
  title: "Scenes/Guild",
  component: GuildScene,
  args: { onBack: fn() },
} satisfies Meta<typeof GuildScene>;
export default meta;
type Story = StoryObj<typeof meta>;

const finder = (data: (typeof GUILD_FINDER)[keyof typeof GUILD_FINDER]) => <GuildFinder {...data} onAction={fn()} onOpenGuild={fn()} />;
const { candidate, query, filters, results, suggested, ranking } = GUILD_FINDER.guildless;
/** The menu's views' contents, as the route draws them: the player search, the guild search. */
const invite = <PlayerSearch {...FRIENDS_SEARCH.searching.search} onOpen={fn()} />;
const find = <GuildBrowse candidate={candidate} query={query} filters={filters} results={results} suggested={suggested} ranking={ranking} onOpenGuild={fn()} onQueryChange={fn()} onFiltersChange={fn()} />;
const page = (data: GuildPageProps, over: Partial<GuildPageProps> = {}) => (
  <GuildPage {...data} onAction={fn(async () => {})} onOpenPlayer={fn()} onOpenChat={fn()} invite={invite} find={find} {...over} />
);
/** The first member of `rank` on the guild's roster. */
const memberOf = (data: GuildPageProps, rank: number) => data.guild.roster.find((m) => m.rank === rank)!.profile.address;

/** A guest: the empty state. */
export const Guest: Story = {};
/** A player in no guild: the finder, Create, the search, Suggested or Ranking. */
export const Guildless: Story = { args: { children: finder(GUILD_FINDER.guildless) } };
/** Create a guild, a view in the drawer (GUILD-PAGE): the emblem, its charges and colours six to a row, the join types, the requirements. */
export const GuildlessCreate: Story = { args: { children: <GuildFinder {...GUILD_FINDER.guildless} initialCreating onAction={fn()} onOpenGuild={fn()} /> } };
/** A player in no guild with an invitation waiting. */
export const Invited: Story = { args: { children: finder(GUILD_FINDER.invited) } };

/** A Recruit (GUILD-PAGE's five ranks): the sprout in the header; the menu has no Invite. */
export const Recruit: Story = { args: { children: page(GUILD_PAGE.recruit) } };
/** A Recruit's menu: Find guilds, Leave. */
export const RecruitMenu: Story = { args: { children: page(GUILD_PAGE.recruit, { initialView: "menu" }) } };
/** A Veteran: the medal; the Requests tab and Post, no kick or promotion. */
export const Veteran: Story = { args: { children: page(GUILD_PAGE.veteran, { defaultTab: "requests" }) } };
/** A Member: the header with Chat and the menu, then Members (the first visit's tab), by rank then crowns. No Requests tab. */
export const Member: Story = { args: { children: page(GUILD_PAGE.member) } };
/** A Member with three unread messages in the guild's chat: the header's Chat badged (the book's red count). */
export const MemberChatUnread: Story = { args: { children: page(GUILD_PAGE.member, { chatUnread: 3 }) } };
/** A Member with two unread announcements: the page opens on them, Announcements badged. */
export const MemberAnnouncements: Story = { args: { children: page(GUILD_PAGE.member, { unread: 2 }) } };
/** A Member's menu, a view in the drawer: Invite a player, Find guilds, then Leave apart. */
export const MemberMenu: Story = { args: { children: page(GUILD_PAGE.member, { initialView: "menu" }) } };
/** A Member's tap on another member's row, a view in the drawer: who they are, their Profile, no rank action. */
export const MemberRowActions: Story = { args: { children: page(GUILD_PAGE.member, { initialView: { member: memberOf(GUILD_PAGE.member, GUILD_RANK.officer) } }) } };
/** The menu's Find guilds, a view in the drawer: the search, Suggested or the ranking; a guild found opens in its sheet. */
export const MemberFindGuilds: Story = { args: { children: page(GUILD_PAGE.member, { initialView: "find" }) } };
/** A Member on the Log, newest first. */
export const MemberLog: Story = { args: { children: page(GUILD_PAGE.member, { defaultTab: "log" }) } };

/** An Officer: the Requests tab, badged with the requests waiting, then the invitations sent. */
export const Officer: Story = { args: { children: page(GUILD_PAGE.officer, { defaultTab: "requests" }) } };
/** An Officer on Announcements: Post, and Edit and Delete on their own. */
export const OfficerAnnouncements: Story = { args: { children: page(GUILD_PAGE.officer, { defaultTab: "announcements" }) } };
/** An Officer's menu: Invite a player, Find guilds, Leave. */
export const OfficerMenu: Story = { args: { children: page(GUILD_PAGE.officer, { defaultTab: "requests", initialView: "menu" }) } };
/** The menu's Invite a player, a view in the drawer: the player search; a player found opens their profile, where Invite is. */
export const OfficerInvite: Story = { args: { children: page(GUILD_PAGE.officer, { initialView: "invite" }) } };
/** An Officer's tap on a Member's row: Profile, Promote to Veteran, Demote to Recruit, Kick. */
export const OfficerRowActions: Story = { args: { children: page(GUILD_PAGE.officer, { initialView: { member: memberOf(GUILD_PAGE.officer, GUILD_RANK.member) } }) } };

/** The Leader: Members, every tab. */
export const Leader: Story = { args: { children: page(GUILD_PAGE.leader) } };
/** The Leader's menu: Invite a player, Guild settings, Find guilds; Leave waits for another leader. */
export const LeaderMenu: Story = { args: { children: page(GUILD_PAGE.leader, { initialView: "menu" }) } };
/** The menu's Guild settings, a view in the drawer: the emblem, the description, who can join, the requirements. */
export const LeaderSettings: Story = { args: { children: page(GUILD_PAGE.leader, { initialView: "settings" }) } };
/** The Leader's tap on a Member's row: Profile, Promote to Veteran, Demote to Recruit, Make leader, Kick. */
export const LeaderRowActions: Story = { args: { children: page(GUILD_PAGE.leader, { initialView: { member: memberOf(GUILD_PAGE.leader, GUILD_RANK.member) } }) } };
/** The Leader's tap on an Officer's row: Profile, Demote to Veteran, Make leader, Kick. */
export const LeaderOnOfficer: Story = { args: { children: page(GUILD_PAGE.leader, { initialView: { member: memberOf(GUILD_PAGE.leader, GUILD_RANK.officer) } }) } };
/** A leader alone: the menu's Disband. */
export const LeaderAlone: Story = { args: { children: page(GUILD_PAGE.alone, { initialView: "menu" }) } };

/** Another guild (its sheet over the page): its header and its members, with Join; no tab. */
export const AnotherGuild: Story = { args: { children: page(GUILD_PAGE.join) } };
/** Another guild the player cannot join: why (here, full). */
export const AnotherGuildFull: Story = { args: { children: page(GUILD_PAGE.full) } };
/** Another guild's invitation: Accept or Decline. */
export const AnotherGuildInvited: Story = { args: { children: page(GUILD_PAGE.invited) } };

/** With reduced motion: the page opens without motion. */
export const ReducedMotion: Story = { args: { children: page(GUILD_PAGE.member) }, parameters: { reducedMotion: "always" } };
/** WRAP360: the longest names and the largest figures, the description unfolded, on Members. */
export const Stress: Story = { args: { children: page(GUILD_PAGE.stress, { initialUnfolded: true, unread: 120 }) } };
/** WRAP360 on Announcements, badged. */
export const StressAnnouncements: Story = { args: { children: page(GUILD_PAGE.stress, { defaultTab: "announcements", unread: 120 }) } };
/** WRAP360 on Requests. */
export const StressRequests: Story = { args: { children: page(GUILD_PAGE.stress, { defaultTab: "requests" }) } };
/** WRAP360 on the Log. */
export const StressLog: Story = { args: { children: page(GUILD_PAGE.stress, { defaultTab: "log" }) } };
/** WRAP360: the menu, and a member's row, with the longest names. */
export const StressMenu: Story = { args: { children: page(GUILD_PAGE.stress, { initialView: "menu" }) } };
export const StressRowActions: Story = { args: { children: page(GUILD_PAGE.stress, { initialView: { member: GUILD_PAGE.stress.guild.roster[0]!.profile.address } }) } };
