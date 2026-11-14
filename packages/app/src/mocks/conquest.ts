import { GUILD_RANK, conquestDayStart, conquestOf, conquestStart } from "@paved/game-core";
import type { ConquestCard, PlayModesProps } from "../components/containers/play-modes";
import type { ConquestSceneProps } from "../components/scenes/conquest-scene";
import type { ConquestState } from "../data/conquest-source";
import { communityProfile } from "../data/mock/community";
import { freshConquest, membersOf, optionsOf, rankingOf, stateOf, zoneOf, type StoredConquest } from "../data/mock/conquest";
import { seededGuildWorld, type StoredGuild } from "../data/mock/guilds";
import type { PublicProfile } from "../data/social-source";
import { MOCK_NOW } from "./clock";

// The Conquest's mocks (the season's finale, the design proposal of 8 and 9 November 2026), drawn from the mock's own Conquest (the
// community's allegiances, `data/mock/conquest.ts`), so every figure holds together: the registration, Awakening's day 9 as an
// Officer of the Quarrymen (the page, the map with a cell picked, the tree, the ranking, the members), a rest day with Foundation's
// result, the results, a player with no allegiance, and the Play card.

/** A scene's data without its callbacks. */
type Data<P> = { [K in keyof P as K extends `on${string}` ? never : K]: P[K] };

const N = conquestOf(MOCK_NOW);
const HOUR = 3_600;
/** The mocks' clocks: the registration's first day, the first rest day, Awakening's day 9 at 15:00, the results' second day. */
export const CONQUEST_REGISTRATION_NOW = conquestStart(N) + 2 * HOUR;
export const CONQUEST_REST_NOW = conquestDayStart(N, 7) + 10 * HOUR;
export const CONQUEST_NOW = conquestDayStart(N, 9) + 15 * HOUR;
export const CONQUEST_RESULTS_NOW = conquestDayStart(N, 22) + 9 * HOUR;

/** The viewer: a device's account, an Officer of the first allegiance. */
export const CONQUEST_ME = "0x51a7c0";
const people = (address: string): PublicProfile => communityProfile(address, MOCK_NOW) ?? { address, name: "Mason", look: null, level: 12, crowns: 640, league: 3, score: 4_210, lastSeen: MOCK_NOW };

const SEEDED = seededGuildWorld().guilds;
const GUILDS: StoredGuild[] = SEEDED.map((g, i) => (i === 0 ? { ...g, members: [...g.members, { address: CONQUEST_ME, rank: GUILD_RANK.officer, joinedAt: g.createdAt + HOUR, lastKick: null }] } : g));
const OURS = GUILDS[0]!.id;
/** The viewer's Offerings: every evening of the days played so far. */
const STORED: StoredConquest = { ...freshConquest(), acts: { [N]: [1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 15, 16].map((day) => ({ at: conquestDayStart(N, day) + 20 * HOUR, guild: OURS, by: CONQUEST_ME, kind: "offer" as const, since: 0 })) } };
/** The viewer's spare tiles: two of each plan. */
const SPARE = Array<number>(19).fill(2);
const seen = (now: number, viewer: string | null = CONQUEST_ME, guilds: readonly StoredGuild[] = GUILDS) => ({ stored: STORED, guilds, peaks: new Map<number, number>(), people, now, viewer, spare: viewer === null ? null : SPARE });

// In the order of their clocks: the mock plays its Conquest on, never back.
const registration = stateOf(seen(CONQUEST_REGISTRATION_NOW));
const rest = stateOf(seen(CONQUEST_REST_NOW));
const hub = stateOf(seen(CONQUEST_NOW));
const guest = stateOf(seen(CONQUEST_NOW, CONQUEST_ME, SEEDED));
const zone = zoneOf(seen(CONQUEST_NOW), hub.home!)!;
/** A cell beside the allegiance's tiles: the first of the frontier with no request on it. */
const spot = zone.frontier.find((c) => !zone.requests.some((r) => r.x === c.x && r.y === c.y)) ?? null;
const options = spot ? optionsOf(seen(CONQUEST_NOW), spot.x, spot.y) : null;
const ranking = rankingOf(seen(CONQUEST_NOW));
const members = membersOf(seen(CONQUEST_NOW));
const results = stateOf(seen(CONQUEST_RESULTS_NOW));

export const CONQUEST = {
  registration: { state: registration, now: CONQUEST_REGISTRATION_NOW },
  hub: { state: hub, now: CONQUEST_NOW },
  offered: { state: hub, now: CONQUEST_NOW, notice: { kind: "offer", knowledge: 3, order: true } },
  rest: { state: rest, now: CONQUEST_REST_NOW },
  results: { state: results, now: CONQUEST_RESULTS_NOW },
  noAllegiance: { state: guest, now: CONQUEST_NOW },
  loading: { state: null, now: CONQUEST_NOW },
  failed: { state: null, now: CONQUEST_NOW, error: "The Conquest could not be read." },
  map: { state: hub, now: CONQUEST_NOW, view: "map", zone },
  asking: { state: hub, now: CONQUEST_NOW, view: "map", zone, cell: spot, options },
  tree: { state: hub, now: CONQUEST_NOW, view: "tree" },
  ranking: { state: hub, now: CONQUEST_NOW, view: "ranking", ranking },
  members: { state: hub, now: CONQUEST_NOW, view: "members", members },
} satisfies Record<string, Data<ConquestSceneProps>>;

const card = (state: ConquestState): ConquestCard => ({
  phase: state.phase,
  day: state.day,
  rest: state.rest,
  phaseEndsAt: state.phaseEndsAt,
  registered: state.registered.length,
  mine: state.allegiance ? { place: state.allegiance.place, orders: state.allegiance.orders.left, waiting: state.me?.waiting ?? 0 } : null,
});

/** Play's Conquest card: the registration, a day of play, the results, and a player with no allegiance. */
export const CONQUEST_CARD = {
  registration: { conquestCard: card(registration), now: CONQUEST_REGISTRATION_NOW },
  playing: { conquestCard: card(hub), now: CONQUEST_NOW },
  results: { conquestCard: card(results), now: CONQUEST_RESULTS_NOW },
  noAllegiance: { conquestCard: card(guest), now: CONQUEST_NOW },
} satisfies Record<string, Pick<PlayModesProps, "conquestCard" | "now">>;

/** The containers' states, from the same Conquest. */
export const CONQUEST_PARTS = {
  world: { side: hub.side, zones: hub.zones, selected: hub.home },
  zone: { zone, leads: true, orders: hub.allegiance!.orders.left, cell: null, options: null },
  zoneAsking: { zone, leads: true, orders: hub.allegiance!.orders.left, cell: spot, options },
  zoneMember: { zone, leads: false, orders: hub.allegiance!.orders.left, cell: null, options: null },
  tree: { levels: hub.allegiance!.levels, knowledge: hub.allegiance!.knowledge, leads: true, open: true },
  treeMember: { levels: hub.allegiance!.levels, knowledge: hub.allegiance!.knowledge, leads: false, open: true },
  ranking,
  members,
  phase: rest.results[0]!,
  final: results.final!,
};
