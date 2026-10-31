import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { GUILD_ACTIONS, GUILD_BADGE } from "../../mocks/guilds";
import { GuildLine, GuildMemberActions } from "./guild-profile";

/**
 * The guild on a profile (#953): the guild line (emblem, name, rank), and the actions the viewer's rank allows on the player:
 * Invite; Promote, Demote, Kick (with a reason) and Make leader. Each one asks to confirm.
 */
const meta = {
  title: "Containers/GuildProfile",
  component: GuildMemberActions,
  args: { ...GUILD_ACTIONS.leaderOnMember, onAction: fn(async () => {}) },
} satisfies Meta<typeof GuildMemberActions>;
export default meta;
type Story = StoryObj<typeof meta>;

export const LeaderOnMember: Story = {};
export const LeaderOnOfficer: Story = { args: GUILD_ACTIONS.leaderOnOfficer };
/** An Officer on a Member: Kick only. */
export const OfficerOnMember: Story = { args: GUILD_ACTIONS.officerOnMember };
/** An Officer kicked lately: the next kick waits. */
export const OfficerCooldown: Story = { args: GUILD_ACTIONS.officerCooldown };
/** An Officer on the Leader, a Member on anyone: no action. */
export const OfficerOnLeader: Story = { args: GUILD_ACTIONS.officerOnLeader };
export const MemberOnMember: Story = { args: GUILD_ACTIONS.memberOnMember };
/** An Officer on a guildless player: Invite. */
export const Invite: Story = { args: GUILD_ACTIONS.invite };
export const InvitedAlready: Story = { args: GUILD_ACTIONS.invited };
/** The guild line of a Member, an Officer, the Leader, and the longest name. */
export const Line: Story = {
  render: () => (
    <div className="flex flex-col gap-2">
      {Object.values(GUILD_BADGE).map((b) => (
        <GuildLine key={`${b.rank}-${b.name}`} badge={b} onOpen={fn()} />
      ))}
    </div>
  ),
};
/** WRAP360: the longest names. */
export const Stress: Story = { args: GUILD_ACTIONS.stress };
