import { rankAmongFriends, rankPlayers } from "@paved/game-core";
import type { LeaderboardSceneProps } from "../components/scenes/leaderboard-scene";
import { community, communityProfile } from "../data/mock/community";
import type { GuildSummary, PlayerRanking, PublicProfile } from "../data/social-source";
import { generatedLook } from "./avatar";
import { MOCK_NOW } from "./clock";
import { FRIENDS_TAB, TWO_FIGURE_LEVELS } from "./follows";
import { GUILD_FINDER } from "./guilds";
import { LONG_ADDRESS, LONG_NAME } from "./stress";

// The Leaderboard's mocks (LEADERBOARD-PAGE): the mock community (`data/mock/community.ts`) ranked by crowns as the ledger ranks it
// (game-core's `rankPlayers`), the guilds' ranking of the guilds' mocks (`mocks/guilds.ts`, by score, the sum of the members' crowns),
// the viewer among their friends (the Friends tab's, `mocks/follows.ts`, by game-core's `rankAmongFriends`), and the scene's states:
// the viewer in view, out of it, past the list; Guilds; Friends, and none; loading, empty, failed, unavailable; the longest.

/** A scene's data without its callbacks. */
type Data<P> = { [K in keyof P as K extends `on${string}` ? never : K]: P[K] };

/** The community's players at `MOCK_NOW`, by crowns. */
const RANKED: readonly PublicProfile[] = rankPlayers(community().map((m) => communityProfile(m.address, MOCK_NOW)!));

/** The ranking as `viewer` (a place, 1 first) reads it. */
const rankingAt = (place: number): PlayerRanking => ({ players: [...RANKED], me: { place, profile: RANKED[place - 1]! } });

/** The viewer's friends (the Friends tab's mock, `mocks/follows.ts`). */
const FRIENDS = (FRIENDS_TAB.friends.lists?.friends ?? []).map((r) => r.profile);

/** The viewer (a place among the community) among their friends. */
const friendsAt = (place: number): PlayerRanking => rankAmongFriends(FRIENDS, RANKED[place - 1]!);

/** A new player, no crowns yet, past the community: their place after the list's last. */
const NEW_PLAYER: PublicProfile = { address: "0x7e3b0001", name: "Ada", look: generatedLook("0x7e3b0001"), level: 2, crowns: 0, league: 0, score: 0, lastSeen: MOCK_NOW };

/** The guilds by score; the viewer in The Quarrymen. */
const GUILDS = GUILD_FINDER.guildless.ranking.guilds!;
const QUARRY = GUILDS.find((g) => g.name === "The Quarrymen")!.id;

/** A guild of the viewer's ranked past the list's end (the source answers its first `GUILD_LIST_LIMIT`): its place in the whole ranking. */
const LOW_GUILD: GuildSummary = { ...GUILDS[GUILDS.length - 1]!, id: 4_242, tag: "#4242", name: "Mossy Kerb", members: 2, score: 12 };
const LOW_PLACE = { place: 42, guild: LOW_GUILD };

/** The ranking with the levels at 9, 10, 20 and 15 in turn (#1065), the viewer second. */
const TWO_FIGURES: readonly PublicProfile[] = RANKED.map((p, i) => ({ ...p, level: TWO_FIGURE_LEVELS[i % TWO_FIGURE_LEVELS.length]! }));

/** WRAP360: the longest name and address, the largest figures. */
const STRESS_PLAYER: PublicProfile = { address: LONG_ADDRESS, name: LONG_NAME, look: null, level: 120, crowns: 123_456, league: 22, score: 0, lastSeen: MOCK_NOW };
/** Another long address (its own row and key), no name. */
const STRESS_NO_NAME: PublicProfile = { ...STRESS_PLAYER, address: `0x07f9${LONG_ADDRESS.slice(6)}`, name: null, crowns: 99_999 };

const read = <T,>(data: T | null) => ({ data, error: null });
const FAILED = { data: null, error: "The ranking could not be read: the social source did not answer.", errorDetail: { code: "SocialError", version: "0.1.0", at: Date.UTC(2026, 10, 7, 9, 30) } };

/** The Leaderboard's states (LEADERBOARD-PAGE), one story each. */
export const LEADERBOARD = {
  /** Players: the viewer fourth, their row in view on the gold wash. */
  playersInView: { tab: "players", players: read(rankingAt(4)), guilds: read(GUILDS), friends: read(friendsAt(4)), myGuild: QUARRY },
  /** Players: the viewer thirtieth, out of view at first: their row pinned over the tabs. */
  playersOutOfView: { tab: "players", players: read(rankingAt(30)), guilds: read(GUILDS), friends: read(friendsAt(30)), myGuild: QUARRY },
  /** Players: a new player past the list's end, pinned at the foot with their place. */
  playersPastList: { tab: "players", players: read({ players: [...RANKED], me: { place: RANKED.length + 1, profile: NEW_PLAYER } }), guilds: read(GUILDS), friends: read(rankAmongFriends(FRIENDS, NEW_PLAYER)), myGuild: null },
  /** Guilds: by score, the viewer's guild in gold. */
  guilds: { tab: "guilds", players: read(rankingAt(4)), guilds: read(GUILDS), friends: read(friendsAt(4)), myGuild: QUARRY },
  /** Guilds: the viewer's guild ranked past the list's end, 42nd: pinned at the foot with its place; a tap opens its page. */
  guildsPastList: { tab: "guilds", players: read(rankingAt(4)), guilds: read(GUILDS), friends: read(friendsAt(4)), myGuild: LOW_GUILD.id, myGuildPlace: LOW_PLACE },
  /** Friends: the viewer among their four friends by crowns, their row in gold. */
  friends: { tab: "friends", players: read(rankingAt(30)), guilds: read(GUILDS), friends: read(friendsAt(30)), myGuild: QUARRY },
  /** Friends: none yet, nothing to rank against. */
  noFriends: { tab: "friends", players: read(rankingAt(30)), guilds: read(GUILDS), friends: read({ players: [], me: null }), myGuild: QUARRY },
  /** Both on their way. */
  loading: { tab: "players", players: read(null), guilds: read(null), friends: read(null), myGuild: null },
  /** No player and no guild ranked yet. */
  empty: { tab: "players", players: read({ players: [], me: null }), guilds: read([]), friends: read({ players: [], me: null }), myGuild: null },
  /** The read failed: why, and Retry. */
  error: { tab: "players", players: FAILED, guilds: FAILED, friends: FAILED, myGuild: null },
  /** No social source on this network. */
  unavailable: { tab: "players", players: read(null), guilds: read(null), friends: read(null), myGuild: null, unavailable: true },
  /** Two-figure levels (#1065): the players at levels 9, 10, 20 and 15 in turn, the star holding both figures. */
  twoFigures: { tab: "players", players: read({ players: [...TWO_FIGURES], me: { place: 2, profile: TWO_FIGURES[1]! } }), guilds: read(GUILDS), friends: read(friendsAt(4)), myGuild: QUARRY },
  /** WRAP360: the longest name, a long address with no name, the largest figures. */
  stress: { tab: "players", players: read({ players: [STRESS_PLAYER, STRESS_NO_NAME, ...RANKED.slice(0, 98)], me: { place: 1, profile: STRESS_PLAYER } }), guilds: read(GUILDS), friends: read(rankAmongFriends([STRESS_NO_NAME, ...FRIENDS], STRESS_PLAYER)), myGuild: QUARRY },
} satisfies Record<string, Data<LeaderboardSceneProps>>;
