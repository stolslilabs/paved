import {
  BASE_PLAN_CODES,
  CONQUEST_ELIGIBLE_DAYS,
  CONQUEST_LAST_DAY,
  CONQUEST_PHASES,
  CONQUEST_PHASE_DAYS,
  CONQUEST_PHASE_ELIGIBLE_DAYS,
  CONQUEST_PROVINCE,
  Conquest,
  GUILD_RANK,
  JOUST_START_RATING,
  baseCopies,
  conquestCrest,
  conquestDayOf,
  conquestDayStart,
  conquestEndsAt,
  conquestFinalCobbles,
  conquestGiftCobbles,
  conquestLeads,
  conquestLevelCost,
  conquestOf,
  conquestOpensAt,
  conquestPhaseCobbles,
  conquestPhaseOfDay,
  conquestPlayDay,
  conquestRestDay,
  conquestStart,
  conquestForestEdge,
  rarityOf,
  type ConquestBranch,
  type ConquestPlayPhase,
  type ConquestRequest,
  type ConquestScored,
  type ConquestZone,
  type Rarity,
} from "@paved/game-core";
import type {
  ConquestAllegianceState,
  ConquestAreaState,
  ConquestFinal,
  ConquestGiven,
  ConquestGuild,
  ConquestMemberRow,
  ConquestOptions,
  ConquestPhaseResult,
  ConquestRankRow,
  ConquestRanking,
  ConquestRequestState,
  ConquestScoredState,
  ConquestState,
  ConquestZoneState,
  ConquestZoneSummary,
} from "../conquest-source";
import { addressKey } from "../keys";
import { communityMember } from "./community";
import type { GuildPeople, StoredGuild } from "./guilds";
import { guildOf } from "./joust";

// The mock's Conquest (the season's finale, game-core's `conquest.ts`), the whole event on the device. Every allegiance of the
// guilds' world is in each Conquest: one led by the community registers by itself during the three days, one led by an account is
// registered by that account or, failing that, as the registration closes (the event stays reachable, the owner's rule). They are
// seated by their season's peak Joust rating. The community's members play their part: they make their Offerings, explore, buy the
// tree's levels, ask for tiles and give them, at times drawn for each day. The device's accounts' acts are stored and played again
// among the community's by their times: a Conquest is played from its day 1 to the ledger's clock, kept in memory and moved on as
// the clock does. Pure functions on the stored state and the guilds: `MockLedger` runs them under its lock, as `colossus.ts`'s.

/** An act of an account, as stored: played again in time order among the community's. */
export interface StoredConquestAct {
  at: number;
  guild: number;
  by: string;
  kind: "offer" | "explore" | "request" | "give" | "research";
  /** `offer`: when they joined the allegiance. */
  since?: number;
  /** `explore`, `request`, `give`: the cell. */
  x?: number;
  y?: number;
  /** `request`: the tile. */
  plan?: number;
  orientation?: number;
  /** `research`: the branch. */
  branch?: ConquestBranch;
}

/** A part of a Conquest an account claims: a phase's Cobbles or the final rank's. */
type ClaimPart = ConquestPlayPhase | "final";

/** The mock's Conquest as stored: the accounts' acts and the allegiances they registered by Conquest, and each account's claims. */
export interface StoredConquest {
  acts: Record<string, StoredConquestAct[]>;
  registrations: Record<string, number[]>;
  claims: Record<string, Record<string, ClaimPart[]>>;
}

export const freshConquest = (): StoredConquest => ({ acts: {}, registrations: {}, claims: {} });

/** A draw in [0, 1) from whole numbers: a cheap mix (a Conquest is played again from its start at the first read). */
function draw(...parts: number[]): number {
  let h = 0x9e3779b9;
  for (const part of parts) {
    h = Math.imul(h ^ (part | 0), 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
  }
  return (h >>> 0) / 4_294_967_296;
}

const numberOf = (address: string): number => Number(BigInt(address) & 0x7fffffffn);
const shown = (guild: StoredGuild): ConquestGuild => ({ id: guild.id, name: guild.name, emblem: guild.settings.emblem });
const leaderOf = (guild: StoredGuild): string | null => guild.members.find((m) => m.rank === GUILD_RANK.leader)?.address ?? null;

/** The share of the community's members who hold a spare tile of a rarity, each Conquest. */
const HOLDS: Record<Rarity, number> = { common: 0.8, uncommon: 0.45, mythic: 0.12 };
/** Whether a member of the community holds a spare tile of `plan` in a Conquest. */
const holds = (address: string, plan: number, conquest: number): boolean => communityMember(address) !== null && draw(7, numberOf(address), plan, conquest) < HOLDS[rarityOf(plan)];
/** A request waits this long before a member of the community gives its tile: an account has the time to give theirs. */
const GIFT_WAIT_S = 600;
/** The requests an allegiance of the community keeps open at once. */
const OPEN_REQUESTS = 3;

/**
 * Whether `guild` is registered for `conquest` at `at`: an account registered it, or its leader is one of the community's (they
 * register during the three days, at a time drawn), or the registration closed (every allegiance of the mock is in).
 */
export function registeredBy(stored: StoredConquest, guild: StoredGuild, conquest: number, at: number): boolean {
  const opens = conquestOpensAt(conquest);
  if (guild.createdAt >= opens || at < conquestStart(conquest)) return false;
  if (at >= opens || stored.registrations[conquest]?.includes(guild.id)) return true;
  const leader = leaderOf(guild);
  if (!leader || !communityMember(leader)) return false;
  return at >= conquestStart(conquest) + Math.floor(draw(1, guild.id, conquest) * (opens - conquestStart(conquest) - 3_600));
}

/** The allegiances registered at `at`, the best season's Joust rating first (`peaks`, by id; a tie to the older allegiance). */
function entrants(stored: StoredConquest, guilds: readonly StoredGuild[], peaks: ReadonlyMap<number, number>, conquest: number, at: number): StoredGuild[] {
  const peak = (g: StoredGuild) => peaks.get(g.id) ?? JOUST_START_RATING;
  return guilds.filter((g) => registeredBy(stored, g, conquest, at)).sort((a, b) => peak(b) - peak(a) || a.id - b.id);
}

// --- The simulation -------------------------------------------------------------------------------------------------------

/** A visit of a member of the community: they do what they can then. */
interface Visit {
  at: number;
  guild: number;
  address: string;
  leads: boolean;
  since: number;
  /** Its number among the Conquest's visits: the visit's own draws. */
  n: number;
}

/** A Conquest being played: its world at `at`, the community's visits to come, the accounts' acts applied. */
interface Sim {
  key: string;
  world: Conquest;
  at: number;
  visits: Visit[];
  next: number;
  applied: number;
  /** The last act applied, to tell a stored list that is no longer this one's. */
  last: StoredConquestAct | null;
}

const sims = new Map<number, Sim>();

/** The community's visits of a Conquest: about three members in four come on a day, one to three times. */
function visitsOf(conquest: number, guilds: readonly StoredGuild[]): Visit[] {
  const visits: Omit<Visit, "n">[] = [];
  for (const guild of guilds)
    for (const member of guild.members) {
      if (!communityMember(member.address)) continue;
      const who = numberOf(member.address);
      for (let day = 1; day <= CONQUEST_LAST_DAY; day++) {
        if (draw(2, who, conquest, day) >= 0.75) continue;
        const count = 1 + Math.floor(draw(3, who, conquest, day) * 3);
        for (let k = 0; k < count; k++) visits.push({ at: conquestDayStart(conquest, day) + Math.floor(draw(4, who, conquest, day, k) * 86_400), guild: guild.id, address: member.address, leads: conquestLeads(member.rank), since: member.joinedAt });
      }
    }
  return visits.sort((a, b) => a.at - b.at || a.guild - b.guild || (a.address < b.address ? -1 : 1)).map((v, n) => ({ ...v, n }));
}

/** The fog cells of `zones` beside an explored cell or a tile, those beside a tile of `guild` apart. */
function fogOf(world: Conquest, guild: number, zones: readonly ConquestZone[]): { near: { x: number; y: number }[]; all: { x: number; y: number }[] } {
  const near: { x: number; y: number }[] = [];
  const all: { x: number; y: number }[] = [];
  for (const zone of zones)
    for (let y = zone.y0; y < zone.y0 + CONQUEST_PROVINCE; y++)
      for (let x = zone.x0; x < zone.x0 + CONQUEST_PROVINCE; x++) {
        if (world.isExplored(x, y) || world.tileAt(x, y)) continue;
        let known = false;
        let own = false;
        for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]] as const) {
          const tile = world.tileAt(x + dx, y + dy);
          if (tile?.guild === guild) own = true;
          if (tile || world.isExplored(x + dx, y + dy)) known = true;
        }
        if (own) near.push({ x, y });
        if (known) all.push({ x, y });
      }
  return { near, all };
}

/** What a member of the community does on a visit: their Offerings, the tree, their exploration, requests, a gift. */
function visit(world: Conquest, v: Visit): void {
  const conquest = world.conquest;
  const allegiance = world.allegiances.get(v.guild);
  if (!allegiance) return;
  const home = world.zones[allegiance.zone]!;
  const day = conquestDayOf(v.at);
  if (world.waiting(v.guild, v.address, v.at).count > 0) world.offer(v.guild, v.address, v.at, v.since);
  if (v.leads) {
    // The cheapest next level, a kind of structure before Devotion on a tie, in an order of the allegiance's own.
    const kinds = ["cities", "roads", "forests", "wonders"] as const;
    const branches: ConquestBranch[] = [...kinds.map((_, i) => kinds[(i + v.guild) % kinds.length]!), "devotion"];
    for (let bought = 0; bought < 3; bought++) {
      const next = branches.map((branch) => ({ branch, cost: conquestLevelCost(allegiance.levels[branch]) })).filter((b): b is { branch: ConquestBranch; cost: number } => b.cost !== null).sort((a, b) => a.cost - b.cost)[0];
      if (!next || next.cost > allegiance.knowledge) break;
      world.research(v.guild, next.branch, v.at);
    }
  }
  if (!conquestPlayDay(day)) return;
  if (world.member(v.guild, v.address).exploredDay !== day) {
    // Next to the allegiance's tiles first; in Frontiers, sometimes in the free zones round the province.
    const out = conquestPhaseOfDay(day) === "frontiers" && draw(5, v.n) < 0.4;
    const zones = out ? world.zones.filter((z) => !z.province && Math.abs(z.col - home.col) + Math.abs(z.row - home.row) === 1) : [home];
    const fog = fogOf(world, v.guild, zones);
    const cells = fog.near.length > 0 && draw(6, v.n) < 0.7 ? fog.near : fog.all.length > 0 ? fog.all : fogOf(world, v.guild, [home]).all;
    const cell = cells[Math.floor(draw(8, v.n) * cells.length)];
    if (cell) world.explore(v.guild, v.address, cell.x, cell.y, v.at);
  }
  const open = () => [...world.requests.values()].filter((r) => r.guild === v.guild);
  if (v.leads) {
    // A request where the tile closes the most: the cells with the most tiles round them, a plan that opens few new roads or cities.
    const wanted = Math.min(OPEN_REQUESTS, world.ordersLeft(v.guild, v.at) + 1) - open().length;
    const frontier = world.frontier(v.guild, v.at).filter((c) => !open().some((r) => r.x === c.x && r.y === c.y));
    for (let k = 0; k < wanted && frontier.length > 0; k++) {
      let best: { x: number; y: number; plan: number; orientation: number; score: number } | null = null;
      for (let sample = 0; sample < 6; sample++) {
        const cell = frontier[Math.floor(draw(9, v.n, k, sample) * frontier.length)]!;
        for (const { plan, orientations } of world.fitting(v.guild, cell.x, cell.y, v.at)) {
          // A mythic plan is asked for now and then only: few members hold one.
          if (rarityOf(plan) === "mythic" && draw(11, v.n, k, sample, plan) >= 0.08) continue;
          for (const orientation of orientations) {
            let score = draw(10, v.n, k, sample, plan, orientation) + Math.min(2, baseCopies(plan) / 4);
            for (const [side, dx, dy] of [[2, 0, 1], [4, 1, 0], [6, 0, -1], [8, -1, 0]] as const) {
              if (world.tileAt(cell.x + dx, cell.y + dy)) score += 3;
              else if (!conquestForestEdge(plan, orientation, side)) score -= 0.6;
            }
            if (!best || score > best.score) best = { ...cell, plan, orientation, score };
          }
        }
      }
      if (!best) break;
      world.request(v.guild, v.address, best, v.at);
      frontier.splice(frontier.findIndex((c) => c.x === best!.x && c.y === best!.y), 1);
    }
  }
  // A gift: the oldest request whose tile they hold, once it has waited.
  for (const request of open().sort((a, b) => a.at - b.at)) {
    if (world.ordersLeft(v.guild, v.at) < 1) break;
    if (v.at - request.at < GIFT_WAIT_S || !holds(v.address, request.plan, conquest)) continue;
    if (world.buildRefusal(v.guild, request, v.at) !== null) {
      world.requests.delete(request.id);
      continue;
    }
    world.give(v.guild, v.address, request.id, v.at);
    break;
  }
}

/** An account's stored act, played; one the world refuses now (its allegiance changed since) is passed over. */
function act(world: Conquest, a: StoredConquestAct): void {
  try {
    if (a.kind === "offer") world.offer(a.guild, a.by, a.at, a.since);
    else if (a.kind === "explore") world.explore(a.guild, a.by, a.x!, a.y!, a.at);
    else if (a.kind === "request") world.request(a.guild, a.by, { x: a.x!, y: a.y!, plan: a.plan!, orientation: a.orientation! }, a.at);
    else if (a.kind === "research") world.research(a.guild, a.branch!, a.at);
    else {
      const request = [...world.requests.values()].find((r) => r.guild === a.guild && r.x === a.x && r.y === a.y);
      if (request) world.give(a.guild, a.by, request.id, a.at);
    }
  } catch {
    // Refused: nothing happens.
  }
}

/**
 * Conquest `conquest` played to `now` (its end at most): the community's visits and the accounts' acts in time order, a visit
 * before an act of the same second. Null before its day 1, or with no allegiance. Kept in memory: played on from where it was,
 * or again from day 1 when the clock went back, the allegiances changed or the stored acts are no longer those applied.
 */
export function playedTo(stored: StoredConquest, guilds: readonly StoredGuild[], peaks: ReadonlyMap<number, number>, conquest: number, now: number): Conquest | null {
  const opens = conquestOpensAt(conquest);
  if (now < opens) return null;
  const seated = entrants(stored, guilds, peaks, conquest, opens);
  if (seated.length === 0) return null;
  const until = Math.min(now, conquestEndsAt(conquest));
  const acts = stored.acts[conquest] ?? [];
  const key = seated.map((g) => `${g.id}:${g.members.map((m) => `${m.address}.${m.rank}`).join(",")}`).join("|");
  let sim = sims.get(conquest);
  if (!sim || sim.key !== key || until < sim.at || acts.length < sim.applied || (sim.applied > 0 && acts[sim.applied - 1] !== sim.last && JSON.stringify(acts[sim.applied - 1]) !== JSON.stringify(sim.last))) {
    sim = { key, world: new Conquest(conquest, seated.map((g) => g.id)), at: opens, visits: visitsOf(conquest, seated), next: 0, applied: 0, last: null };
    sims.set(conquest, sim);
    for (const old of sims.keys()) if (old < conquest - 1) sims.delete(old);
  }
  for (;;) {
    const v = sim.visits[sim.next];
    const a = acts[sim.applied];
    const visitDue = v !== undefined && v.at <= until;
    const actDue = a !== undefined && a.at <= until;
    if (visitDue && (!actDue || v.at <= a.at)) {
      visit(sim.world, v);
      sim.next += 1;
    } else if (actDue) {
      act(sim.world, a);
      sim.applied += 1;
      sim.last = a;
    } else break;
  }
  sim.at = until;
  return sim.world;
}

/** Forgets the Conquests kept in memory (the tests, between two ledgers). */
export const forgetConquests = (): void => sims.clear();

// --- What a viewer sees -----------------------------------------------------------------------------------------------------

interface Seen {
  stored: StoredConquest;
  guilds: readonly StoredGuild[];
  peaks: ReadonlyMap<number, number>;
  people: GuildPeople;
  now: number;
  viewer: string | null;
  /** The viewer's spare tiles by plan (their inventory less their active village); null: no account. */
  spare: readonly number[] | null;
}

const guildShown = (guilds: readonly StoredGuild[], id: number): ConquestGuild => {
  const guild = guilds.find((g) => g.id === id);
  return guild ? shown(guild) : { id, name: "A fallen allegiance", emblem: { icon: 0, primary: 0, secondary: 0 } };
};

function rows(world: Conquest, guilds: readonly StoredGuild[], mine: number | null, phase?: ConquestPlayPhase): ConquestRankRow[] {
  return world.ranking(phase).map(({ guild }, i) => {
    const score = world.allegiances.get(guild)!.score;
    return { place: i + 1, guild: guildShown(guilds, guild), foundation: score.foundation, awakening: score.awakening, frontiers: score.frontiers, total: score.foundation + score.awakening + score.frontiers, members: guilds.find((g) => g.id === guild)?.members.length ?? 0, mine: guild === mine };
  });
}

/** The roster's members who hold a spare `plan`, the viewer among them. */
function holdersOf(guild: StoredGuild, plan: number, conquest: number, s: Seen): number {
  return guild.members.filter((m) => holds(m.address, plan, conquest)).length + ((s.spare?.[plan - 1] ?? 0) > 0 ? 1 : 0);
}

function requestShown(world: Conquest, guild: StoredGuild, r: ConquestRequest, s: Seen): ConquestRequestState {
  const zone = world.zoneAt(r.x, r.y)!;
  return { id: r.id, x: r.x, y: r.y, zone: zone.index, zoneName: zone.name, plan: r.plan, orientation: r.orientation, rarity: rarityOf(r.plan), cobbles: conquestGiftCobbles(r.plan), by: s.people(r.by), at: r.at, held: s.spare?.[r.plan - 1] ?? 0, holders: holdersOf(guild, r.plan, world.conquest, s) };
}

function scoredShown(guilds: readonly StoredGuild[], mine: number, scored: ConquestScored): ConquestScoredState {
  return {
    kind: scored.kind,
    size: scored.size,
    own: scored.counts.find(([g]) => g === mine)?.[1] ?? 0,
    rival: Math.max(0, ...scored.counts.filter(([g]) => g !== mine).map(([, n]) => n)),
    winner: scored.winner === null ? null : guildShown(guilds, scored.winner),
    won: scored.winner === mine,
    points: scored.points,
    day: scored.day,
  };
}

function zoneShown(world: Conquest, guilds: readonly StoredGuild[], zone: ConquestZone, mine: number | null, now: number): ConquestZoneSummary {
  const tiles = world.tiles.filter((t) => t.kind === "tile" && world.zoneAt(t.x, t.y) === zone);
  return {
    index: zone.index,
    name: zone.name,
    col: zone.col,
    row: zone.row,
    province: zone.province,
    guild: zone.guild === 0 ? null : guildShown(guilds, zone.guild),
    mine: mine !== null && zone.guild === mine,
    open: mine !== null && world.allegiances.has(mine) && world.openTo(mine, zone, now),
    tiles: tiles.length,
    own: tiles.filter((t) => t.guild === mine).length,
    explored: world.exploredIn(zone).length,
  };
}

/** A Conquest's world as numbered for the players: the first of the client's is World 1. */
const worldNumber = (conquest: number): number => Math.max(1, conquest + 1);

const claimedOf = (stored: StoredConquest, viewer: string | null, conquest: number): readonly ClaimPart[] => (viewer === null ? [] : (stored.claims[addressKey(viewer)]?.[conquest] ?? []));

/** A viewer's days of Offerings in a Conquest, within `[first, last]`. */
const daysOf = (world: Conquest, guild: number, viewer: string | null, first: number, last: number): number =>
  viewer === null ? 0 : (world.allegiances.get(guild)?.members.get(addressKey(viewer))?.offeringDays.filter((d) => d >= first && d <= last).length ?? 0);

/** The phases over at `now` for the viewer's allegiance. */
function resultsOf(world: Conquest, guild: number, s: Seen): ConquestPhaseResult[] {
  const day = s.now >= conquestEndsAt(world.conquest) ? CONQUEST_LAST_DAY + 1 : conquestDayOf(s.now);
  const claimed = claimedOf(s.stored, s.viewer, world.conquest);
  return CONQUEST_PHASES.filter((phase) => day >= CONQUEST_PHASE_DAYS[phase].result).map((phase) => {
    const ranked = rows(world, s.guilds, guild, phase);
    const own = ranked.find((r) => r.mine)!;
    const days = daysOf(world, guild, s.viewer, CONQUEST_PHASE_DAYS[phase].first, CONQUEST_PHASE_DAYS[phase].result);
    const eligible = days >= CONQUEST_PHASE_ELIGIBLE_DAYS;
    const part = (s.viewer === null ? undefined : world.allegiances.get(guild)?.members.get(addressKey(s.viewer))?.parts[phase]) ?? { tiles: 0, explored: 0, knowledge: 0 };
    return { phase, place: own.place, of: ranked.length, score: own[phase], podium: ranked.slice(0, 3), guild: own.guild, part: { ...part }, days, eligible, cobbles: eligible ? conquestPhaseCobbles(own.place) : 0, claimed: claimed.includes(phase) };
  });
}

/** A Conquest's final result for the viewer's allegiance; null before its D21, or when the allegiance was not in it. */
function finalOf(world: Conquest | null, guild: number | null, s: Seen): ConquestFinal | null {
  if (!world || guild === null || !world.allegiances.has(guild)) return null;
  if (s.now < conquestDayStart(world.conquest, CONQUEST_LAST_DAY + 1)) return null;
  const ranked = rows(world, s.guilds, guild);
  const own = ranked.find((r) => r.mine)!;
  const days = daysOf(world, guild, s.viewer, 1, CONQUEST_LAST_DAY);
  const eligible = days >= CONQUEST_ELIGIBLE_DAYS;
  const claimed = claimedOf(s.stored, s.viewer, world.conquest);
  const cobbles = eligible ? conquestFinalCobbles(own.place) : 0;
  const phases = resultsOf(world, guild, s);
  return {
    conquest: world.conquest,
    world: worldNumber(world.conquest),
    guild: own.guild,
    phases: phases.map((p) => ({ phase: p.phase, score: p.score, place: p.place })),
    place: own.place,
    of: ranked.length,
    score: own.total,
    foundation: own.foundation,
    awakening: own.awakening,
    frontiers: own.frontiers,
    crest: conquestCrest(own.place),
    podium: ranked.slice(0, 3),
    days,
    eligible,
    cobbles,
    claimed: claimed.includes("final"),
    toClaim: (claimed.includes("final") ? 0 : cobbles) + phases.reduce((sum, p) => sum + (p.claimed ? 0 : p.cobbles), 0),
  };
}

/** `ConquestSource.state`. */
export function stateOf(s: Seen): ConquestState {
  const { stored, guilds, peaks, now, viewer } = s;
  const conquest = conquestOf(now);
  const day = conquestDayOf(now);
  const phase = conquestPhaseOfDay(day);
  const mine = guildOf(guilds, viewer);
  const id = mine?.guild.id ?? null;
  const world = playedTo(stored, guilds, peaks, conquest, now);
  const allegiance = world && id !== null ? (world.allegiances.get(id) ?? null) : null;
  const registered = entrants(stored, guilds, peaks, conquest, now).map(shown);
  const ranked = world ? rows(world, guilds, id) : [];
  const own = ranked.find((r) => r.mine) ?? null;
  const results = world && allegiance ? resultsOf(world, allegiance.guild, s) : [];
  const final = finalOf(world, id, s);
  const key = viewer === null ? null : addressKey(viewer);
  const member = key !== null && allegiance ? (allegiance.members.get(key) ?? null) : null;
  const waiting = world && allegiance && key !== null ? world.waiting(allegiance.guild, key, now) : null;
  const phaseEndsAt = phase === "registration" ? conquestOpensAt(conquest) : phase === "results" ? conquestEndsAt(conquest) : conquestDayStart(conquest, CONQUEST_PHASE_DAYS[phase].result + (phase === "frontiers" ? 0 : 1));
  const allegianceState: ConquestAllegianceState | null =
    world && allegiance && own
      ? {
          place: own.place,
          of: ranked.length,
          score: own.total,
          knowledge: allegiance.knowledge,
          earned: allegiance.earned,
          levels: { ...allegiance.levels },
          orders: { given: allegiance.orders.day === day ? allegiance.orders.given : 0, used: allegiance.orders.day === day ? allegiance.orders.used : 0, left: world.ordersLeft(allegiance.guild, now) },
          tiles: allegiance.tiles,
          explored: allegiance.explored,
          closed: allegiance.closed,
          members: mine!.guild.members.length,
        }
      : null;
  const previousWorld = playedTo(stored, guilds, peaks, conquest - 1, now);
  return {
    conquest,
    world: worldNumber(conquest),
    phase,
    day,
    rest: conquestRestDay(day),
    phaseEndsAt,
    nextDayAt: (Math.floor(now / 86_400) + 1) * 86_400,
    endsAt: conquestEndsAt(conquest),
    registered,
    guild: mine ? shown(mine.guild) : null,
    rank: mine?.member.rank ?? null,
    leads: mine ? conquestLeads(mine.member.rank) : false,
    entered: world ? allegiance !== null : registered.some((g) => g.id === id),
    side: world?.side ?? 0,
    zones: world ? world.zones.map((z) => zoneShown(world, guilds, z, id, now)) : [],
    home: allegiance?.zone ?? null,
    allegiance: allegianceState,
    me:
      waiting && allegiance
        ? { waiting: waiting.count, nextAt: waiting.nextAt, every: waiting.every, orderToday: member?.orderDay === day, exploredToday: member?.exploredDay === day, days: member?.offeringDays.length ?? 0, knowledge: member?.knowledge ?? 0, tiles: member?.tiles ?? 0, explored: member?.explored ?? 0 }
        : null,
    requests: world && allegiance ? [...world.requests.values()].filter((r) => r.guild === allegiance.guild).map((r) => requestShown(world, mine!.guild, r, s)) : [],
    scored: world && allegiance ? world.scored.filter((c) => c.counts.some(([g]) => g === allegiance.guild)).slice(-5).reverse().map((c) => scoredShown(guilds, allegiance.guild, c)) : [],
    results,
    final,
    toClaim: final ? final.toClaim : results.reduce((sum, r) => sum + (r.claimed ? 0 : r.cobbles), 0),
    previous: finalOf(previousWorld, id, s),
  };
}

/** `ConquestSource.zone`; null: the world has no such zone (or is not drawn yet). */
export function zoneOf(s: Seen, index: number): ConquestZoneState | null {
  const conquest = conquestOf(s.now);
  const world = playedTo(s.stored, s.guilds, s.peaks, conquest, s.now);
  const zone = world?.zones[index];
  if (!world || !zone) return null;
  const mine = guildOf(s.guilds, s.viewer);
  const id = mine && world.allegiances.has(mine.guild.id) ? mine.guild.id : null;
  const inside = (c: { x: number; y: number }) => world.zoneAt(c.x, c.y) === zone;
  const day = conquestDayOf(s.now);
  return {
    conquest,
    zone: zoneShown(world, s.guilds, zone, id, s.now),
    x0: zone.x0,
    y0: zone.y0,
    size: CONQUEST_PROVINCE,
    tiles: world.tiles.filter(inside).map((t) => ({ x: t.x, y: t.y, plan: t.plan, orientation: t.orientation, kind: t.kind, guild: t.guild === 0 ? null : guildShown(s.guilds, t.guild), mine: t.guild !== 0 && t.guild === id, by: t.by === null ? null : (s.people(t.by).name ?? null) })),
    explored: world.exploredIn(zone),
    frontier: id === null ? [] : world.frontier(id, s.now).filter(inside),
    requests: id === null ? [] : [...world.requests.values()].filter((r) => r.guild === id && inside(r)).map((r) => requestShown(world, mine!.guild, r, s)),
    canExplore: id !== null && s.viewer !== null && conquestPlayDay(day) && world.openTo(id, zone, s.now) && world.allegiances.get(id)!.members.get(addressKey(s.viewer))?.exploredDay !== day,
  };
}

/** The band of the neighbouring zones an area shows round its zone: half a zone. */
const AREA_MARGIN = Math.ceil(CONQUEST_PROVINCE / 2);

/** `ConquestSource.area`; null: the world has no such zone (or is not drawn yet). */
export function areaOf(s: Seen, index: number): ConquestAreaState | null {
  const conquest = conquestOf(s.now);
  const world = playedTo(s.stored, s.guilds, s.peaks, conquest, s.now);
  const zone = world?.zones[index];
  if (!world || !zone) return null;
  const mine = guildOf(s.guilds, s.viewer);
  const id = mine && world.allegiances.has(mine.guild.id) ? mine.guild.id : null;
  const x0 = Math.max(0, zone.x0 - AREA_MARGIN);
  const y0 = Math.max(0, zone.y0 - AREA_MARGIN);
  const x1 = Math.min(world.size - 1, zone.x0 + CONQUEST_PROVINCE - 1 + AREA_MARGIN);
  const y1 = Math.min(world.size - 1, zone.y0 + CONQUEST_PROVINCE - 1 + AREA_MARGIN);
  const inside = (c: { x: number; y: number }) => c.x >= x0 && c.x <= x1 && c.y >= y0 && c.y <= y1;
  const explored: { x: number; y: number }[] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (world.isExplored(x, y)) explored.push({ x, y });
  return {
    conquest,
    zone: zoneShown(world, s.guilds, zone, id, s.now),
    x0,
    y0,
    x1,
    y1,
    tiles: world.tiles.filter(inside).map((t) => ({ x: t.x, y: t.y, plan: t.plan, orientation: t.orientation, kind: t.kind, guild: t.guild === 0 ? null : guildShown(s.guilds, t.guild), mine: t.guild !== 0 && t.guild === id, by: t.by === null ? null : (s.people(t.by).name ?? null) })),
    explored,
    frontier: id === null ? [] : world.frontier(id, s.now).filter(inside),
    requests: id === null ? [] : [...world.requests.values()].filter((r) => r.guild === id && inside(r)).map((r) => requestShown(world, mine!.guild, r, s)),
  };
}

/** `ConquestSource.options`: the plans that fit a cell for the viewer's allegiance. */
export function optionsOf(s: Seen, x: number, y: number): ConquestOptions {
  const conquest = conquestOf(s.now);
  const world = playedTo(s.stored, s.guilds, s.peaks, conquest, s.now);
  const mine = guildOf(s.guilds, s.viewer);
  if (!world || !mine || !world.allegiances.has(mine.guild.id)) return { x, y, plans: [] };
  return {
    x,
    y,
    plans: world
      .fitting(mine.guild.id, x, y, s.now)
      .map(({ plan, orientations }) => ({ plan, orientations, rarity: rarityOf(plan), cobbles: conquestGiftCobbles(plan), held: s.spare?.[plan - 1] ?? 0, holders: holdersOf(mine.guild, plan, conquest, s) }))
      .sort((a, b) => b.holders - a.holders || a.plan - b.plan),
  };
}

/** `ConquestSource.ranking`. */
export function rankingOf(s: Seen): ConquestRanking {
  const conquest = conquestOf(s.now);
  const world = playedTo(s.stored, s.guilds, s.peaks, conquest, s.now);
  return { conquest, rows: world ? rows(world, s.guilds, guildOf(s.guilds, s.viewer)?.guild.id ?? null) : [] };
}

/** `ConquestSource.members`: the viewer's allegiance, by tiles given, then by Knowledge brought. */
export function membersOf(s: Seen): ConquestMemberRow[] {
  const world = playedTo(s.stored, s.guilds, s.peaks, conquestOf(s.now), s.now);
  const mine = guildOf(s.guilds, s.viewer);
  const allegiance = world && mine ? world.allegiances.get(mine.guild.id) : undefined;
  if (!mine || !allegiance) return [];
  const key = addressKey(s.viewer!);
  return mine.guild.members
    .map((m) => {
      const part = allegiance.members.get(m.address);
      return { profile: s.people(m.address), rank: m.rank, tiles: part?.tiles ?? 0, explored: part?.explored ?? 0, knowledge: part?.knowledge ?? 0, days: part?.offeringDays.length ?? 0, me: m.address === key };
    })
    .sort((a, b) => b.tiles - a.tiles || b.knowledge - a.knowledge);
}

// --- The accounts' writes ---------------------------------------------------------------------------------------------------

interface Wrote {
  stored: StoredConquest;
  guilds: readonly StoredGuild[];
  peaks: ReadonlyMap<number, number>;
  now: number;
  player: string;
}

/** The player's allegiance in the Conquest of `now`, its world played to `now` (each refusal thrown). */
function playing(w: Wrote) {
  const conquest = conquestOf(w.now);
  const mine = guildOf(w.guilds, w.player);
  if (!mine) throw new Error("Conquest: not in an allegiance");
  const world = playedTo(w.stored, w.guilds, w.peaks, conquest, w.now);
  if (!world) throw new Error("Conquest: not open yet");
  if (!world.allegiances.has(mine.guild.id)) throw new Error("Conquest: the allegiance is not registered");
  return { conquest, world, guild: mine.guild, member: mine.member, key: addressKey(w.player) };
}

/** Records an act just played on the world kept in memory, so that the next read plays on from it. */
function record(w: Wrote, conquest: number, a: StoredConquestAct): void {
  (w.stored.acts[conquest] ??= []).push(a);
  for (const old of Object.keys(w.stored.acts)) if (Number(old) < conquest - 1) delete w.stored.acts[old];
  const sim = sims.get(conquest);
  if (sim) {
    sim.applied = w.stored.acts[conquest]!.length;
    sim.last = a;
  }
}

/** Registers the player's allegiance (each refusal thrown): during the registration, by an Officer or the Leader, once. */
export function register(w: Wrote): { conquest: number; guild: number } {
  const conquest = conquestOf(w.now);
  if (conquestDayOf(w.now) !== 0) throw new Error("Conquest: the registration is closed");
  const mine = guildOf(w.guilds, w.player);
  if (!mine) throw new Error("Conquest: not in an allegiance");
  if (!conquestLeads(mine.member.rank)) throw new Error("Conquest: only an Officer or the Leader registers");
  if (registeredBy(w.stored, mine.guild, conquest, w.now)) throw new Error("Conquest: already registered");
  (w.stored.registrations[conquest] ??= []).push(mine.guild.id);
  return { conquest, guild: mine.guild.id };
}

/** The player's Offerings that wait. */
export function offer(w: Wrote): { conquest: number; knowledge: number; order: boolean } {
  const { conquest, world, guild, member, key } = playing(w);
  const done = world.offer(guild.id, key, w.now, member.joinedAt);
  record(w, conquest, { at: w.now, guild: guild.id, by: key, kind: "offer", since: member.joinedAt });
  return { conquest, ...done };
}

/** The player's exploration of the day. */
export function explore(w: Wrote, x: number, y: number): { conquest: number; knowledge: number } {
  const { conquest, world, guild, key } = playing(w);
  const done = world.explore(guild.id, key, x, y, w.now);
  record(w, conquest, { at: w.now, guild: guild.id, by: key, kind: "explore", x, y });
  return { conquest, ...done };
}

/** A build request, by an Officer or the Leader. */
export function request(w: Wrote, tile: { x: number; y: number; plan: number; orientation: number }): { conquest: number; id: number } {
  const { conquest, world, guild, member, key } = playing(w);
  if (!conquestLeads(member.rank)) throw new Error("Conquest: only an Officer or the Leader opens a request");
  const { id } = world.request(guild.id, key, tile, w.now);
  record(w, conquest, { at: w.now, guild: guild.id, by: key, kind: "request", x: tile.x, y: tile.y, plan: tile.plan, orientation: tile.orientation });
  return { conquest, id };
}

/** A request's tile given from the player's `spare` tiles (by plan): built at once. The caller takes the tile and pays the Cobbles. */
export function give(w: Wrote, id: number, spare: readonly number[]): { conquest: number; plan: number; given: ConquestGiven } {
  const { conquest, world, guild, key } = playing(w);
  const wanted = world.requests.get(id);
  if (!wanted || wanted.guild !== guild.id) throw new Error("Conquest: no such request");
  if ((spare[wanted.plan - 1] ?? 0) < 1) throw new Error("Conquest: you hold no spare tile of this plan");
  const { tile, scored, cobbles } = world.give(guild.id, key, id, w.now);
  record(w, conquest, { at: w.now, guild: guild.id, by: key, kind: "give", x: tile.x, y: tile.y });
  return { conquest, plan: tile.plan, given: { cobbles, scored: scored.map((c) => scoredShown(w.guilds, guild.id, c)), ordersLeft: world.ordersLeft(guild.id, w.now) } };
}

/** A branch's next level, by an Officer or the Leader. */
export function research(w: Wrote, branch: ConquestBranch): { conquest: number; level: number; cost: number } {
  const { conquest, world, guild, member, key } = playing(w);
  if (!conquestLeads(member.rank)) throw new Error("Conquest: only an Officer or the Leader buys a level");
  const done = world.research(guild.id, branch, w.now);
  record(w, conquest, { at: w.now, guild: guild.id, by: key, kind: "research", branch });
  return { conquest, ...done };
}

/**
 * The Cobbles `player` claims for `conquest` at `now` (each refusal thrown), the claim recorded: the phases over and, from D21, the
 * final rank, each once. This Conquest or the one before it.
 */
export function claim(w: Wrote, people: GuildPeople, conquest: number, only?: ClaimPart): number {
  const current = conquestOf(w.now);
  if (conquest !== current && conquest !== current - 1) throw new Error("Conquest: nothing to claim");
  const mine = guildOf(w.guilds, w.player);
  const world = playedTo(w.stored, w.guilds, w.peaks, conquest, w.now);
  if (!mine || !world || !world.allegiances.has(mine.guild.id)) throw new Error("Conquest: nothing to claim");
  const seen: Seen = { stored: w.stored, guilds: w.guilds, peaks: w.peaks, people, now: w.now, viewer: w.player, spare: null };
  const key = addressKey(w.player);
  let parts: [ClaimPart, number][] = resultsOf(world, mine.guild.id, seen).filter((r) => !r.claimed && r.cobbles > 0).map((r) => [r.phase, r.cobbles]);
  const final = finalOf(world, mine.guild.id, seen);
  if (final && !final.claimed && final.cobbles > 0) parts.push(["final", final.cobbles]);
  if (only) parts = parts.filter(([part]) => part === only);
  if (parts.length === 0) throw new Error("Conquest: nothing to claim");
  const claimed = ((w.stored.claims[key] ??= {})[conquest] ??= []);
  for (const [part] of parts) claimed.push(part);
  return parts.reduce((sum, [, cobbles]) => sum + cobbles, 0);
}

/** The plans an account can give: their inventory less the tiles of their active village (those stay theirs). */
export function spareOf(inventory: readonly number[], layout: readonly { plan: number }[] | null): number[] {
  const spare = BASE_PLAN_CODES.map((plan) => inventory[plan - 1] ?? 0);
  for (const tile of layout ?? []) if (spare[tile.plan - 1]! > 0) spare[tile.plan - 1]! -= 1;
  return spare;
}
