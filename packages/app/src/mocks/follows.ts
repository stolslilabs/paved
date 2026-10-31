import type { FriendsPanelProps } from "../components/containers/friends-panel";
import type { FollowProfileActionsProps } from "../components/containers/follow-profile";
import { community, communityProfile } from "../data/mock/community";
import { addressKey } from "../data/keys";
import type { FollowLists, FollowRow, FollowStatus, GuildBadge, PublicProfile } from "../data/social-source";
import { DAY, HOUR, MOCK_NOW } from "./clock";
import { GUILD_BADGE } from "./guilds";
import { PUBLIC_PROFILE } from "./social";
import { LONG_ADDRESS, LONG_NAME } from "./stress";
import { generatedLook } from "./avatar";

// The follows' mocks (#954): players of the mock community on the Friends tab's lists, their last-seen times set against
// `MOCK_NOW`, and the states of the tab and of the profile's follow actions.

/** The community's member at `index`, seen `ago` seconds before `MOCK_NOW`. */
const member = (index: number, ago: number): PublicProfile => ({ ...communityProfile(community()[index]!.address, MOCK_NOW)!, lastSeen: MOCK_NOW - ago });
const row = (profile: PublicProfile, since: number, isNew = false): FollowRow => ({ profile, since: MOCK_NOW - since, isNew });

/** Online first, then the most recently seen: the lists' order (game-core's `byPresence`). */
const FRIENDS = [row(member(3, 40), 9 * DAY), row(member(11, 200), 2 * DAY), row(member(7, 3 * HOUR), 5 * DAY), row(member(26, 4 * DAY), 20 * DAY)];
/** Followed and not following back. */
const FOLLOWED_ONLY = [row(member(15, 90), DAY), row(member(31, 9 * HOUR), 3 * DAY)];
/** Following the player, not followed back; the first two new. */
const FOLLOWERS_ONLY = [row(member(18, 30), 600, true), row(member(22, 2 * HOUR), 3_000, true), row(member(9, 6 * DAY), 12 * DAY)];

const suggestions = [member(1, 120), member(4, 5 * HOUR), member(12, 2 * DAY), member(20, 8 * HOUR), member(29, 30), member(33, DAY), member(36, 3 * DAY)];

const lists = (l: Partial<FollowLists>): FollowLists => ({ friends: [], following: [], followers: [], newFollowers: 0, blocked: [], nextChangeAt: null, ...l });

/** The friends are on both of the other lists, as the source answers them. */
const full = lists({
  friends: FRIENDS,
  following: [...FRIENDS, ...FOLLOWED_ONLY],
  followers: [...FOLLOWERS_ONLY.slice(0, 2), ...FRIENDS, ...FOLLOWERS_ONLY.slice(2)],
  newFollowers: 2,
});

/** Guilds for some of them (#953). */
const GUILDS = new Map<string, GuildBadge>([
  [addressKey(FRIENDS[0]!.profile.address), GUILD_BADGE.member],
  [addressKey(FRIENDS[2]!.profile.address), GUILD_BADGE.officer],
  [addressKey(FOLLOWERS_ONLY[0]!.profile.address), GUILD_BADGE.leader],
  [addressKey(suggestions[0]!.address), GUILD_BADGE.member],
]);
const guildOf = (address: string) => GUILDS.get(addressKey(address)) ?? null;

/** WRAP360: the longest name and address, the largest figures. */
const STRESS_PROFILE: PublicProfile = { address: LONG_ADDRESS, name: LONG_NAME, look: generatedLook(LONG_ADDRESS), level: 20, crowns: 5_320, league: 22, score: 123_456_789, lastSeen: MOCK_NOW - 400 * DAY };
const many = (n: number, isNew = false) => Array.from({ length: n }, (_, i) => row({ ...member(i % 40, (i + 1) * HOUR) }, i * HOUR, isNew && i < 120));

type PanelData = Omit<FriendsPanelProps, "onAction" | "onOpenPlayer" | "onListChange" | "onRetry">;
const panel = (data: Partial<PanelData>): PanelData => ({ lists: full, suggestions, list: "friends", now: MOCK_NOW, guildOf, ...data });

/** The Friends tab's states (#954). */
export const FRIENDS_TAB = {
  /** A new player: no follows, the suggestions to start with. */
  noFollows: panel({ lists: lists({}) }),
  /** Friends online and offline, online first. */
  friends: panel({}),
  following: panel({ list: "following" }),
  /** Two new followers, marked, on the list's badge. */
  newFollowers: panel({ list: "followers" }),
  /** A blocked player, in the tab's menu. */
  blocked: panel({ lists: { ...full, blocked: [row(member(17, 2 * DAY), HOUR)] }, initialBlockedOpen: true }),
  /** No one blocked: the menu's empty list. */
  noneBlocked: panel({ lists: lists({}), initialBlockedOpen: true }),
  loading: panel({ lists: null, suggestions: null }),
  failed: panel({ lists: null, suggestions: [], error: "The social source did not answer: try again in a moment." }),
  /** WRAP360: the longest name and address, four-digit counts, 120 new followers. */
  stress: panel({
    list: "followers",
    lists: lists({ friends: many(1_200), following: many(1_500), followers: [row(STRESS_PROFILE, 60, true), ...many(1_999, true)], newFollowers: 120, blocked: [row(STRESS_PROFILE, HOUR)] }),
    suggestions: [STRESS_PROFILE, ...suggestions],
    guildOf: (address) => (address === LONG_ADDRESS ? GUILD_BADGE.stress : guildOf(address)),
  }),
} satisfies Record<string, PanelData>;

const status = (s: Partial<FollowStatus>): FollowStatus => ({ following: false, followsYou: false, friend: false, blocking: false, followers: 14, followed: 5, ...s });

/** Another player as the viewer sees them (#954). */
export const FOLLOW_STATUS = {
  none: status({}),
  following: status({ following: true, followers: 15 }),
  followsYou: status({ followsYou: true }),
  friend: status({ following: true, followsYou: true, friend: true, followers: 15 }),
  blocking: status({ blocking: true, followers: 13, followed: 4 }),
  stress: status({ following: true, followsYou: true, friend: true, followers: 1_234_567, followed: 500 }),
} satisfies Record<string, FollowStatus>;

/** The profile's follow actions, by where the viewer stands. */
export const FOLLOW_ACTIONS = {
  follow: { status: FOLLOW_STATUS.none, name: PUBLIC_PROFILE.online.name },
  followBack: { status: FOLLOW_STATUS.followsYou, name: PUBLIC_PROFILE.online.name },
  following: { status: FOLLOW_STATUS.following, name: PUBLIC_PROFILE.online.name },
  friend: { status: FOLLOW_STATUS.friend, name: PUBLIC_PROFILE.online.name },
  blocking: { status: FOLLOW_STATUS.blocking, name: PUBLIC_PROFILE.online.name },
  stress: { status: FOLLOW_STATUS.stress, name: LONG_NAME },
} satisfies Record<string, Omit<FollowProfileActionsProps, "onAction">>;
