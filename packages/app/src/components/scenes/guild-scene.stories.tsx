import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ALLIANCE_BADGE, ALLIANCE_LISTS, ALLIANCE_PAGE, PLAYER_ALLIANCE } from "../../mocks/alliances";
import { GUILD_FINDER, GUILD_PAGE } from "../../mocks/guilds";
import { FRIENDS_SEARCH } from "../../mocks/social";
import { GuildPicker, NoAlliance, type NoAllianceProps } from "../containers/alliance-finder";
import { AlliancePage, type AlliancePageProps } from "../containers/alliance-page";
import { AllianceGuildActions, AllianceLine, AllianceTile, type AllianceGuildState } from "../containers/alliance-parts";
import { GuildBrowse, GuildFinder } from "../containers/guild-finder";
import { GuildPage, type GuildPageProps } from "../containers/guild-page";
import { PlayerSearch } from "../containers/player-search";
import { GuildScene } from "./guild-scene";

/**
 * The guild page (`/guild`, #973, the Social page's Guild tab of #953 before; GUILD-PAGE: the HUD's drawer, after the Paved UX Book's
 * "Run my guild"): the finder for a player in no guild; for a member, the guild's header (Chat, the menu), then its tabs:
 * Announcements, Members, Requests (a Veteran and above) and Log. The menu and what it opens (Invite a player, Guild settings, Find
 * guilds) are views in the drawer, in the page's place, with Back and the red cross; a member's row opens their profile. Another guild is a sheet
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

/** The empty state. */
export const Empty: Story = {};
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

/** The Leader: Members, every tab. */
export const Leader: Story = { args: { children: page(GUILD_PAGE.leader) } };
/** The Leader's menu: Invite a player, Guild settings, Find guilds; Leave waits for another leader. */
export const LeaderMenu: Story = { args: { children: page(GUILD_PAGE.leader, { initialView: "menu" }) } };
/** The menu's Guild settings, a view in the drawer: the emblem, the description, who can join, the requirements. */
export const LeaderSettings: Story = { args: { children: page(GUILD_PAGE.leader, { initialView: "settings" }) } };
/** A leader alone: the menu's Disband. */
export const LeaderAlone: Story = { args: { children: page(GUILD_PAGE.alone, { initialView: "menu" }) } };

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
/** WRAP360: the menu with the longest names. */
export const StressMenu: Story = { args: { children: page(GUILD_PAGE.stress, { initialView: "menu" }) } };

// --- The alliances (ALLIANCES): an alliance's page, a view of the guild page's drawer --------------------------------------

/** Invite a guild's content, as the route draws it: the guild search, every guild by score while empty. */
const guildPicker = <GuildPicker query="" guilds={ranking.guilds} onOpenGuild={fn()} onQueryChange={fn()} />;

const alliance = (data: Pick<AlliancePageProps, "alliance" | "myGuild" | "now" | "apply">, over: Partial<AlliancePageProps> = {}) => <AlliancePage {...data} onAction={fn(async () => {})} onOpenGuild={fn()} onClose={fn()} invite={guildPicker} {...over} />;

/** The alliance's leader (the head guild's): the menu, the guilds (the head first, theirs in gold), the requests and the invitations sent. */
export const AllianceLeader: Story = { args: { children: alliance(ALLIANCE_PAGE.leader) } };
/** The alliance's leader's menu: Invite a guild, Alliance settings; Leave waits for another head. */
export const AllianceLeaderMenu: Story = { args: { children: alliance(ALLIANCE_PAGE.leader, { initialView: "menu" }) } };
/** A member guild's leader: the menu holds Leave. */
export const AllianceMemberLeader: Story = { args: { children: alliance(ALLIANCE_PAGE.memberLeader) } };
/** A player of a member guild: the page, no menu. */
export const AllianceMember: Story = { args: { children: alliance(ALLIANCE_PAGE.member) } };
/** Another alliance, seen by a guild leader in none: Request to join at the drawer's foot. */
export const AllianceVisitor: Story = { args: { children: alliance(ALLIANCE_PAGE.visitor) } };
/** The guild's request waiting: Cancel. */
export const AllianceRequested: Story = { args: { children: alliance(ALLIANCE_PAGE.requested) } };
/** The alliance invites the guild: Decline or Accept. */
export const AllianceInvited: Story = { args: { children: alliance(ALLIANCE_PAGE.invited) } };
/** The alliance's leader's menu's Invite a guild: the guild search; a guild found opens its page, where Invite is. */
export const AllianceLeaderInvite: Story = { args: { children: alliance(ALLIANCE_PAGE.leader, { initialView: "invite" }) } };
/** The alliance's leader's Alliance settings: the emblem on its laurel, the guild emblems' picker, the description. */
export const AllianceLeaderSettings: Story = { args: { children: alliance(ALLIANCE_PAGE.leader, { initialView: "settings" }) } };
/** A member guild's leader's menu: Leave the alliance. */
export const AllianceMemberLeaderMenu: Story = { args: { children: alliance(ALLIANCE_PAGE.memberLeader, { initialView: "menu" }) } };
/** The only guild's leader: the menu's Disband. */
export const AllianceAloneMenu: Story = { args: { children: alliance(ALLIANCE_PAGE.alone, { initialView: "menu" }) } };
/** The guild's request waiting at another alliance: why not, the controls in their places. */
export const AllianceRequestedElsewhere: Story = { args: { children: alliance(ALLIANCE_PAGE.requestedElsewhere) } };
/** The alliance full: why not. */
export const AllianceFull: Story = { args: { children: alliance(ALLIANCE_PAGE.full) } };
/** Anyone (no guild): the page alone. */
export const AllianceAnyone: Story = { args: { children: alliance(ALLIANCE_PAGE.anyone) } };
/** WRAP360: the longest names, the largest figures, the description unfolded. */
export const AllianceStress: Story = { args: { children: alliance(ALLIANCE_PAGE.stress, { initialUnfolded: true }) } };

const noAlliance = (player: NoAllianceProps["player"], over: Partial<NoAllianceProps> = {}) => (
  <NoAlliance player={player} query="" list={{ alliances: ALLIANCE_LISTS.ranking }} onAction={fn(async () => {})} onOpenAlliance={fn()} onQueryChange={fn()} onClose={fn()} {...over} />
);
/** A guild's leader in no alliance: "No alliance", Create an alliance, Find an alliance. */
export const NoAllianceLeader: Story = { args: { children: noAlliance(PLAYER_ALLIANCE.free) } };
/** Their guild invited: the invitation with Accept and Decline. */
export const NoAllianceInvited: Story = { args: { children: noAlliance(PLAYER_ALLIANCE.invited) } };
/** Their guild's request waiting: Cancel. */
export const NoAllianceRequested: Story = { args: { children: noAlliance(PLAYER_ALLIANCE.requested) } };
/** A player of a guild in none who does not lead it: one line. */
export const NoAllianceMember: Story = { args: { children: noAlliance(PLAYER_ALLIANCE.none) } };
/** Create an alliance, a view in the drawer. */
export const NoAllianceCreate: Story = { args: { children: noAlliance(PLAYER_ALLIANCE.free, { initialView: "create" }) } };
/** Find an alliance, a view in the drawer: the search, the alliances by score. */
export const NoAllianceFind: Story = { args: { children: noAlliance(PLAYER_ALLIANCE.free, { initialView: "find" }) } };
/** Find an alliance, a search: found by name. */
export const NoAllianceSearch: Story = { args: { children: noAlliance(PLAYER_ALLIANCE.free, { initialView: "find", query: "nor", list: { alliances: ALLIANCE_LISTS.search } }) } };

/** The guild page with its alliance: its line under the tag, the Alliance tile beside Chat with what waits (a request). */
export const LeaderInAlliance: Story = { args: { children: page(GUILD_PAGE.leader, { alliance: <AllianceLine badge={ALLIANCE_BADGE.head} onOpen={fn()} />, allianceTile: <AllianceTile count={1} onOpen={fn()} /> }) } };
/** A member's guild in no alliance: "No alliance" written out, the tile. */
export const MemberNoAlliance: Story = { args: { children: page(GUILD_PAGE.member, { alliance: <AllianceLine badge={null} />, allianceTile: <AllianceTile onOpen={fn()} /> }) } };
/** WRAP360 with the longest alliance name and a large count. */
export const StressAlliance: Story = { args: { children: page(GUILD_PAGE.stress, { alliance: <AllianceLine badge={ALLIANCE_BADGE.stress} onOpen={fn()} />, allianceTile: <AllianceTile count={120} onOpen={fn()} /> }) } };

/** Another guild's page as the alliance's leader sees it: its alliance (or none) under its tag, and what they may do to it. */
const otherGuild = (state: AllianceGuildState, badge: typeof ALLIANCE_BADGE.member | null) =>
  page({ ...GUILD_PAGE.join, apply: undefined }, { alliance: <AllianceLine badge={badge} onOpen={fn()} />, allianceActions: <AllianceGuildActions alliance="Stone Pact" guild={GUILD_PAGE.join.guild.name} state={state} onAction={fn(async () => {})} /> });
/** A guild in no alliance: Invite to Stone Pact. */
export const OtherGuildInvite: Story = { args: { children: otherGuild({ kind: "invite", refused: null }, null) } };
/** The invitation out: Invited, dimmed. */
export const OtherGuildInvited: Story = { args: { children: otherGuild({ kind: "invited" }, null) } };
/** A guild in another alliance: why not. */
export const OtherGuildInAlliance: Story = { args: { children: otherGuild({ kind: "invite", refused: "This guild is in an alliance already." }, ALLIANCE_BADGE.member) } };
/** A guild of the alliance: Make head and Remove. */
export const OtherGuildMember: Story = { args: { children: otherGuild({ kind: "member" }, { ...ALLIANCE_BADGE.head, role: "member" }) } };
