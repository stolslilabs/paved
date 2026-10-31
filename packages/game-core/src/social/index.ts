// The social rules (#952, #957), pure: what the mock enforces today, so that a contract or a service can mirror them later
// (#956). The base (#952): the player search and who shows as online. The guilds (#953), the follows (#954) and the
// messages (#955) add theirs here.

export { ONLINE_WINDOW_S, isOnline } from "./presence";
export { SEARCH_LIMIT, nameMatches, normalQuery, parsePlayerId, searchPlayers, wordStarts } from "./search";
export type { Searchable } from "./search";
