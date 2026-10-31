import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { MOCK_NOW } from "../../mocks/clock";
import { FOLLOW_ACTIONS, FOLLOW_STATUS } from "../../mocks/follows";
import { GUILD_ACTIONS, GUILD_BADGE } from "../../mocks/guilds";
import { FollowProfileActions } from "./follow-profile";
import { PUBLIC_PROFILES } from "../../mocks/social";
import { GuildLine, GuildMemberActions } from "./guild-profile";
import { Button } from "../ui/button";
import { MessageButton } from "./message-button";
import { PublicProfileSheet } from "./public-profile-sheet";

/**
 * Another player's public profile (#952): a bottom sheet on a phone, a panel from the right from `desktop` (the Viewport
 * control). The avatar, the name, online or last seen, the league, the level, the crowns and the village score, Copy player ID;
 * the guild line and the actions come with their issues (#953 to #955).
 */
const meta = {
  title: "Containers/PublicProfileSheet",
  component: PublicProfileSheet,
  args: { open: true, state: PUBLIC_PROFILES.online, now: MOCK_NOW, onOpenChange: fn(), onCopy: fn(async () => {}), onRetry: fn() },
} satisfies Meta<typeof PublicProfileSheet>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A seeded player seen a minute ago: online. */
export const Online: Story = {};
/** A rival village's owner, last seen two days ago. */
export const Offline: Story = { args: { state: PUBLIC_PROFILES.offline } };
/** No name: their short address. */
export const NoName: Story = { args: { state: PUBLIC_PROFILES.noName } };
/** Where #953 to #955 put theirs: the guild line, and actions above Copy player ID (stand-ins here). */
export const WithActions: Story = {
  args: {
    guild: <p className="text-center text-sm text-muted-foreground">Guild line</p>,
    actions: <Button variant="outline">Action</Button>,
  },
};
/** A Member of the viewer's guild, seen by its Leader (#953): the guild line, and Promote, Make leader and Kick. */
export const GuildMember: Story = {
  args: {
    guild: <GuildLine badge={GUILD_BADGE.member} onOpen={fn()} />,
    actions: <GuildMemberActions {...GUILD_ACTIONS.leaderOnMember} onAction={fn(async () => {})} />,
  },
};
/** A guildless player, seen by an Officer (#953): Invite. */
export const GuildInvite: Story = { args: { actions: <GuildMemberActions {...GUILD_ACTIONS.invite} onAction={fn(async () => {})} /> } };
/** Not followed (#954): Follow, Block, and their counts. */
export const Follow: Story = { args: { follow: FOLLOW_STATUS.none, actions: <FollowProfileActions {...FOLLOW_ACTIONS.follow} onAction={fn(async () => {})} /> } };
/** They follow the viewer: the Follows you mark, and Follow back. */
export const FollowsYou: Story = { args: { follow: FOLLOW_STATUS.followsYou, actions: <FollowProfileActions {...FOLLOW_ACTIONS.followBack} onAction={fn(async () => {})} /> } };
/** A friend (each follows the other): the Friend mark, Following, and their guild's line. */
export const Friend: Story = {
  args: {
    follow: FOLLOW_STATUS.friend,
    guild: <GuildLine badge={GUILD_BADGE.member} onOpen={fn()} />,
    actions: <FollowProfileActions {...FOLLOW_ACTIONS.friend} onAction={fn(async () => {})} />,
  },
};
/** A player the viewer blocks: Unblock only. */
/** A friend's profile with Message (#955), which opens the private conversation, above the follow actions. */
export const Message: Story = {
  args: {
    follow: FOLLOW_STATUS.friend,
    actions: (
      <>
        <MessageButton name={FOLLOW_ACTIONS.friend.name} onMessage={fn()} />
        <FollowProfileActions {...FOLLOW_ACTIONS.friend} onAction={fn(async () => {})} />
      </>
    ),
  },
};
export const Blocking: Story = { args: { follow: FOLLOW_STATUS.blocking, actions: <FollowProfileActions {...FOLLOW_ACTIONS.blocking} onAction={fn(async () => {})} /> } };
/** WRAP360 with the follows: the largest counts, the mark beside the presence. */
export const FollowStress: Story = { args: { state: PUBLIC_PROFILES.stress, follow: FOLLOW_STATUS.stress, actions: <FollowProfileActions {...FOLLOW_ACTIONS.stress} onAction={fn(async () => {})} /> } };
export const Loading: Story = { args: { state: PUBLIC_PROFILES.loading } };
/** An ID no player has (a typed `/player/:id`). */
export const NotFound: Story = { args: { state: PUBLIC_PROFILES.missing } };
export const Failed: Story = { args: { state: PUBLIC_PROFILES.error } };
/** No social source on the network (the chain, until a service serves it). */
export const Unavailable: Story = { args: { state: PUBLIC_PROFILES.unavailable } };
/** With reduced motion: the sheet opens without its slide. */
export const ReducedMotion: Story = { parameters: { reducedMotion: "always" } };
/** WRAP360: the longest name and address, the top league, the largest figures. */
export const Stress: Story = { args: { state: PUBLIC_PROFILES.stress } };
