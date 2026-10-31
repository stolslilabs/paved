// The social rules (#952, #957), pure: what the mock enforces today, so that a contract or a service can mirror them later
// (#956). The base (#952): the player search and who shows as online. The follows, friends and blocks (#954). The guilds
// (#953) and the messages (#955) add theirs here.

export { ONLINE_WINDOW_S, byPresence, isOnline } from "./presence";
export { SEARCH_LIMIT, nameMatches, normalQuery, parsePlayerId, searchPlayers, wordStarts } from "./search";
export type { Searchable } from "./search";
export {
  EMPTY_GRAPH,
  FOLLOW_LIMIT,
  SUGGESTION_LIMIT,
  areFriends,
  blockPlayer,
  blockBetween,
  blocksOf,
  checkFollow,
  checkInvite,
  checkMessage,
  followPlayer,
  followCounts,
  followersOf,
  followingOf,
  friendsOf,
  hidesMessages,
  isBlocking,
  isFollowing,
  newFollowers,
  playerKey,
  removeFollower,
  suggestFollows,
  unblockPlayer,
  unfollowPlayer,
} from "./follow";
export type { Block, BlockRefusal, Check, Follow, FollowGraph, FollowRefusal, GraphWrite } from "./follow";
