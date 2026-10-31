import type { PlayerSearchProps } from "../components/containers/player-search";
import type { PublicProfileState } from "../components/containers/public-profile-sheet";
import { communityProfile, searchCommunity } from "../data/mock/community";
import { SEEDED_PLAYERS } from "../data/mock/players";
import { mockRivalsV2 } from "../data/mock/v2";
import type { PublicProfile } from "../data/social-source";
import { generatedLook } from "./avatar";
import { MOCK_NOW } from "./clock";
import { LONG_ADDRESS, LONG_NAME } from "./stress";

// The social base's mocks (#952): players of the mock community (`data/mock/community.ts`) as their public profiles show them,
// their last-seen times set against `MOCK_NOW`, and the states of the public profile and of the player search.

/** A member's profile, seen `ago` seconds before `MOCK_NOW`. */
const seen = (address: string, ago: number): PublicProfile => ({ ...communityProfile(address, MOCK_NOW)!, lastSeen: MOCK_NOW - ago });

export const PUBLIC_PROFILE = {
  /** A seeded player seen a minute ago: online. */
  online: seen(SEEDED_PLAYERS[7]!.address, 60),
  /** A rival village's owner seen two days ago. */
  offline: seen(mockRivalsV2()[20]!.address, 2 * 86_400 + 600),
  /** A player without a name: their short address. */
  noName: { ...seen(SEEDED_PLAYERS[0]!.address, 7_200), name: null },
  /** WRAP360: the longest name and address, the top league, the largest figures. */
  stress: { address: LONG_ADDRESS, name: LONG_NAME, look: generatedLook(LONG_ADDRESS), level: 20, crowns: 5_320, league: 22, score: 123_456_789, lastSeen: MOCK_NOW - 400 * 86_400 },
} satisfies Record<string, PublicProfile>;

/** The public profile's states. */
export const PUBLIC_PROFILES = {
  online: { status: "ready", profile: PUBLIC_PROFILE.online },
  offline: { status: "ready", profile: PUBLIC_PROFILE.offline },
  noName: { status: "ready", profile: PUBLIC_PROFILE.noName },
  stress: { status: "ready", profile: PUBLIC_PROFILE.stress },
  loading: { status: "loading" },
  missing: { status: "missing" },
  error: { status: "error", message: "The social source did not answer: try again in a moment." },
  unavailable: { status: "unavailable" },
} satisfies Record<string, PublicProfileState>;

/** The players a search finds, their times against `MOCK_NOW`. */
const found = (query: string): PublicProfile[] => searchCommunity(query, MOCK_NOW);

/** The player search's states. */
export const SEARCH = {
  idle: { query: "", results: null },
  loading: { query: "wren", results: null },
  /** By name: "c" finds every word that starts with it, in the seeded players' and the rivals' names. */
  results: { query: "c", results: found("c") },
  /** By player ID: the one player of that ID. */
  byId: { query: SEEDED_PLAYERS[4]!.address, results: found(SEEDED_PLAYERS[4]!.address) },
  none: { query: "zzz", results: [] },
  error: { query: "wren", results: null, error: "The social source did not answer: try again in a moment." },
  unavailable: { query: "", results: null, unavailable: true },
  /** WRAP360: the longest name and the largest figures in a result. */
  stress: { query: "stonemaster", results: [PUBLIC_PROFILE.stress, PUBLIC_PROFILE.noName] },
} satisfies Record<string, PlayerSearchProps>;
