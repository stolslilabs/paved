import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { GUILD_PAGE } from "../../mocks/guilds";
import { GuildPage } from "./guild-page";

/**
 * A guild's page (#953; its header, menu and tabs since #973). Each rank sees only what its rank allows: a Member the tabs
 * Announcements, Members and Log; an Officer also Requests (the requests, the invitations sent), Post and Invite a player; the
 * Leader also every announcement's Edit and Delete and the settings. A player outside sees the header and the members, with
 * Join, Request, the invitation's answer, or why not. Each tab and the menu: `Scenes/Guild`.
 */
const meta = {
  title: "Containers/GuildPage",
  component: GuildPage,
  args: { ...GUILD_PAGE.member, onAction: fn(async () => {}), onOpenPlayer: fn() },
} satisfies Meta<typeof GuildPage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Member: Story = {};
export const Officer: Story = { args: GUILD_PAGE.officer };
export const Leader: Story = { args: GUILD_PAGE.leader };
/** The leader alone: leaving disbands the guild. */
export const LeaderAlone: Story = { args: GUILD_PAGE.alone };
/** Outside an Open guild: Join. */
export const VisitorJoin: Story = { args: GUILD_PAGE.join };
/** Outside a By-request guild: Request, with a message. */
export const VisitorRequest: Story = { args: GUILD_PAGE.request };
export const Requested: Story = { args: GUILD_PAGE.requested };
/** Invited: Accept or Decline, the requirements waived. */
export const Invited: Story = { args: GUILD_PAGE.invited };
/** Invite only, without an invitation. */
export const InviteOnly: Story = { args: GUILD_PAGE.inviteOnly };
/** A full guild: why the player cannot join. */
export const FullGuild: Story = { args: GUILD_PAGE.full };
/** Requirements not met: which one. */
export const RequirementsNotMet: Story = { args: GUILD_PAGE.requirementsNotMet };
/** A refused write keeps its dialog with why (Leave and Join, here). */
export const Refused: Story = { args: { ...GUILD_PAGE.join, onAction: fn(async () => Promise.reject(new Error("The guild is full."))) } };
/** WRAP360: the longest name, description, announcement, request and log line; the largest figures. */
export const Stress: Story = { args: GUILD_PAGE.stress };
