import type { ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { MOCK_NOW } from "../../mocks/clock";
import { FOLLOW_ACTIONS, FOLLOW_STATUS } from "../../mocks/follows";
import { GUILD_ACTIONS, GUILD_BADGE } from "../../mocks/guilds";
import { FollowProfileActions } from "./follow-profile";
import { PROGRESS } from "../../mocks/players";
import { HALL_OF_FAME, RECORDS } from "../../mocks/profile-records";
import { PUBLIC_PROFILES } from "../../mocks/social";
import { GuildLine, GuildMemberActions } from "./guild-profile";
import { Button } from "../ui/button";
import { MessageButton } from "./message-button";
import { PublicProfileSheet } from "./public-profile-sheet";

/**
 * Another player's public profile (#952; FRIENDS-PAGE, the owner's ask of 2026-11-05: the player's own Profile page): the HUD's drawer,
 * a full page with Back on a phone, a side panel docked at the left from `tablet` (the Viewport control). The avatar in its league's
 * rim, the name, online or last seen and the Friends or Follows you mark, the player ID (a tap copies it), the guild line; the Level,
 * the League, the village score and the follow counts; the actions as the Profile's tiles (#953 to #955: Message, Following, Block).
 */
const meta = {
  title: "Containers/PublicProfileSheet",
  component: PublicProfileSheet,
  args: { open: true, state: PUBLIC_PROFILES.online, progress: PROGRESS.nearlyFull, hallOfFame: HALL_OF_FAME, records: RECORDS, now: MOCK_NOW, onOpenChange: fn(), onCopy: fn(async () => {}), onRetry: fn() },
} satisfies Meta<typeof PublicProfileSheet>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The actions as the app gives them: Message for any player the viewer does not block (no follow needed, #955), then the follows'. */
const tiles = (follow: (typeof FOLLOW_ACTIONS)[keyof typeof FOLLOW_ACTIONS], guild?: ReactNode) => (
  <>
    {!follow.status.blocking && <MessageButton name={follow.name} onMessage={fn()} />}
    <FollowProfileActions {...follow} onAction={fn(async () => {})} />
    {guild && <div className="basis-full">{guild}</div>}
  </>
);

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
/** A Member of the viewer's guild, seen by its Leader (#953): the guild line, and the tiles Promote, Demote, Leader and Kick after the others (GUILD-PAGE's five ranks). */
export const GuildMember: Story = {
  args: {
    follow: FOLLOW_STATUS.none,
    guild: <GuildLine badge={GUILD_BADGE.member} onOpen={fn()} />,
    actions: tiles(FOLLOW_ACTIONS.follow, <GuildMemberActions {...GUILD_ACTIONS.leaderOnMember} look="tiles" onAction={fn(async () => {})} />),
  },
};
/** A guildless player, seen by an Officer (#953): the Invite tile. */
export const GuildInvite: Story = {
  args: { follow: FOLLOW_STATUS.none, actions: tiles(FOLLOW_ACTIONS.follow, <GuildMemberActions {...GUILD_ACTIONS.invite} look="tiles" onAction={fn(async () => {})} />) },
};
/** Not followed (#954): Message all the same (no follow needed), Follow, Block, and their counts. */
export const Follow: Story = { args: { follow: FOLLOW_STATUS.none, actions: tiles(FOLLOW_ACTIONS.follow) } };
/** They follow the viewer: the Follows you mark, Message, and Follow back. */
export const FollowsYou: Story = { args: { follow: FOLLOW_STATUS.followsYou, actions: tiles(FOLLOW_ACTIONS.followBack) } };
/** A friend (each follows the other): the Friends mark, Message, the Following tile, and their guild's line. */
export const Friend: Story = { args: { follow: FOLLOW_STATUS.friend, guild: <GuildLine badge={GUILD_BADGE.member} onOpen={fn()} />, actions: tiles(FOLLOW_ACTIONS.friend) } };
/** A friend's profile: Message (#955) opens the private conversation; the Profile's tiles, Message, Following and Block. */
export const Message: Story = { args: { follow: FOLLOW_STATUS.friend, actions: tiles(FOLLOW_ACTIONS.friend) } };
/** A player the viewer blocks: Unblock only (no Message). */
export const Blocking: Story = { args: { follow: FOLLOW_STATUS.blocking, actions: tiles(FOLLOW_ACTIONS.blocking) } };
/** WRAP360 with the follows: the largest counts, the mark beside the presence. */
export const FollowStress: Story = { args: { state: PUBLIC_PROFILES.stress, progress: PROGRESS.maxLevel, follow: FOLLOW_STATUS.stress, actions: tiles(FOLLOW_ACTIONS.stress) } };
export const Loading: Story = { args: { state: PUBLIC_PROFILES.loading } };
/** An ID no player has (a typed `/player/:id`). */
export const NotFound: Story = { args: { state: PUBLIC_PROFILES.missing } };
export const Failed: Story = { args: { state: PUBLIC_PROFILES.error } };
/** No social source on the network (the chain, until a service serves it). */
export const Unavailable: Story = { args: { state: PUBLIC_PROFILES.unavailable } };
/** With reduced motion: the sheet opens without its slide. */
export const ReducedMotion: Story = { parameters: { reducedMotion: "always" } };
/** WRAP360: the longest name and address, the top league, the largest figures. */
export const Stress: Story = { args: { state: PUBLIC_PROFILES.stress, progress: PROGRESS.maxLevel } };
