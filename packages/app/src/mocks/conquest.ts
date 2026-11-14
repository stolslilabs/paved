import { GUILD_RANK, conquestDayStart, conquestOf, conquestStart } from "@paved/game-core";
import type { ConquestCard, PlayModesProps } from "../components/containers/play-modes";
import type { ConquestMapSceneProps } from "../components/scenes/conquest-map-scene";
import type { ConquestSceneProps } from "../components/scenes/conquest-scene";
import type { ConquestState } from "../data/conquest-source";
import { communityProfile } from "../data/mock/community";
import { areaOf, freshConquest, membersOf, optionsOf, rankingOf, stateOf, zoneOf, type StoredConquest } from "../data/mock/conquest";
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
const area = areaOf(seen(CONQUEST_NOW), hub.home!)!;
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
  tree: { state: hub, now: CONQUEST_NOW, view: "tree" },
  requests: { state: hub, now: CONQUEST_NOW, view: "requests" },
  rules: { state: hub, now: CONQUEST_NOW, view: "rules" },
  phaseOver: { state: rest, now: CONQUEST_REST_NOW, view: "result", result: "foundation" },
  conquestOver: { state: results, now: CONQUEST_RESULTS_NOW, view: "result", result: "final" },
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
  tree: { levels: hub.allegiance!.levels, knowledge: hub.allegiance!.knowledge, earned: hub.allegiance!.earned, leads: true, open: true },
  treeMember: { levels: hub.allegiance!.levels, knowledge: hub.allegiance!.knowledge, earned: hub.allegiance!.earned, leads: false, open: true },
  ranking,
  members,
  phase: rest.results[0]!,
  final: results.final!,
};

/** A free zone beside the viewer's province: where the view is once it has left home. */
const beside = hub.zones.find((z) => !z.province && Math.abs(z.col - hub.zones[hub.home!]!.col) + Math.abs(z.row - hub.zones[hub.home!]!.row) === 1)!.index;

/**
 * The map's scene (`/conquest`), on the same Conquest. Without a `canvas` (the stories' and the tests' states) the zone is drawn as a
 * grid; the story of the 3D board gives its own.
 */
export const CONQUEST_MAP = {
  home: { state: hub, area, zone, focus: hub.home },
  asking: { state: hub, area, zone, focus: hub.home, cell: spot, options },
  explored: { state: hub, area, zone, focus: hub.home, notice: { title: "+40 Knowledge", text: "A rare find! The cell is open for building." } },
  away: { state: hub, area, zone, focus: beside },
  world: { state: hub, area, zone, focus: hub.home, world: true },
  reading: { state: hub, area: null, zone: null, focus: hub.home },
  registration: { state: registration, area: null, focus: null },
  failed: { state: null, area: null, focus: null, error: "The world could not be read." },
} satisfies Record<string, Data<ConquestMapSceneProps>>;
