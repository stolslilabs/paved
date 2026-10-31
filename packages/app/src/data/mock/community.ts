import { levelStatus, poseidon, searchPlayers, xpFloor, type LayoutTile } from "@paved/game-core";
import { LEAGUE_FLOORS } from "../../lib/pvp-rules";
import { generatedLook } from "../../mocks/avatar";
import type { PublicProfile } from "../social-source";
import { SEEDED_PLAYERS, seededPlayer, type SeededPlayer } from "./players";
import { mockRivalV2, mockRivalsV2 } from "./v2";

// The mock's community (#952): the other players a player meets on the device, one list of the twenty seeded players
// (`players.ts`, #927) and the PvP's rival villages (`v2.ts`, open point 2's default), each with the address the PvP and the
// leaderboard already know them by, the mock's avatar (`generatedLook`), a name, a level, crowns and their league, and a village
// score. Their last-seen times are drawn from Poseidon on their address and the mock's clock, the same on every device at the
// same time, as the seeded players' Challenge days are (`seededDay`). Nothing of it is kept: it is drawn again at each read.

/** The kind of the last-seen draws ('SEEN'). */
const SEEN_DRAW = 0x5345454en;
/** The clock's slots, in seconds: in each, a player comes once or not at all. */
export const SEEN_SLOT_S = 1_200;
/** How far back a last-seen time is looked for: 3 days of slots. Past it, the player is seen at its start. */
const SEEN_LOOKBACK = (3 * 86_400) / SEEN_SLOT_S;

/** The league of a crown count (`league_of`). */
export const leagueIndex = (crowns: number): number => LEAGUE_FLOORS.filter((f) => f <= crowns).length;

/** A level's status at its floor's XP: a seeded player's. */
export const levelAt = (level: number) => levelStatus(xpFloor(level));

/**
 * A seeded player's village: the layout of a rival of its level or below (the highest such level, then the seeded player's turn
 * among that level's rivals), as `freeVillage` shows it.
 */
export function seededVillage(seeded: SeededPlayer): { tiles: readonly LayoutTile[]; score: number } {
  const fits = mockRivalsV2().filter((r) => r.level <= seeded.level);
  const top = Math.max(...fits.map((r) => r.level));
  const same = fits.filter((r) => r.level === top);
  const layout = same[seeded.index % same.length]!;
  return { tiles: layout.tiles, score: layout.score };
}

/** A player of the community, before their last-seen time. */
export interface CommunityMember {
  address: string;
  name: string;
  level: number;
  crowns: number;
  /** Their village's score. */
  score: number;
}

let members: CommunityMember[] | null = null;

/** The community: the seeded players (by index), then the rivals (by crowns). The same at every load. */
export function community(): readonly CommunityMember[] {
  members ??= [
    ...SEEDED_PLAYERS.map((p) => ({ address: p.address, name: p.name, level: p.level, crowns: p.crowns, score: seededVillage(p).score })),
    ...mockRivalsV2().map((r) => ({ address: r.address, name: r.name, level: r.level, crowns: r.crowns, score: r.score })),
  ];
  return members;
}

/** A member of the community by address (any form of it), or null. */
export function communityMember(address: string): CommunityMember | null {
  const seeded = seededPlayer(address);
  const rival = seeded ? null : mockRivalV2(address);
  const found = seeded?.address ?? rival?.address;
  return found ? (community().find((m) => m.address === found) ?? null) : null;
}

/** A draw in [0, 1) of a player's slot (`slot` -1: their own pace). */
const drawOf = (address: string, slot: number, k: number): number => Number(poseidon(SEEN_DRAW, BigInt(address), BigInt(slot + 1) * 4n + BigInt(k)) % 1_000_000n) / 1_000_000;

/** The slots drawn, by `address:slot`: a visit's start and end, or null when the player did not come. */
const visits = new Map<string, readonly [number, number] | null>();
/** How often each player comes: a slot's chance, by address. */
const paces = new Map<string, number>();

/** The visit of a player in a slot, if they came: between 1 in 12 and 2 in 5 slots, each player at their own pace. */
function visitOf(address: string, slot: number): readonly [number, number] | null {
  const key = `${address}:${slot}`;
  if (visits.has(key)) return visits.get(key)!;
  let pace = paces.get(address);
  if (pace === undefined) paces.set(address, (pace = 0.08 + 0.32 * drawOf(address, -1, 0)));
  let visit: readonly [number, number] | null = null;
  if (drawOf(address, slot, 0) < pace) {
    // A visit starts within the slot's first half and lasts 2 to 15 minutes.
    const start = slot * SEEN_SLOT_S + Math.floor(drawOf(address, slot, 1) * (SEEN_SLOT_S / 2));
    visit = [start, start + 120 + Math.floor(drawOf(address, slot, 2) * 780)];
  }
  // A bound on the memory, for a page left open for days.
  if (visits.size > 20_000) visits.clear();
  visits.set(key, visit);
  return visit;
}

/**
 * When a player was last seen at `now` (seconds): `now` during a visit, else the end of their last visit. A function of the
 * address and the time alone, so two devices at the same time agree.
 */
export function lastSeenOf(address: string, now: number): number {
  const current = Math.floor(now / SEEN_SLOT_S);
  for (let slot = current; slot > current - SEEN_LOOKBACK; slot--) {
    const visit = visitOf(address, slot);
    if (!visit) continue;
    const [start, end] = visit;
    if (now >= end) return end;
    if (now >= start) return now;
  }
  return (current - SEEN_LOOKBACK + 1) * SEEN_SLOT_S;
}

/** A member's public profile at `now` (seconds). */
export const profileOf = (member: CommunityMember, now: number): PublicProfile => ({
  address: member.address,
  name: member.name,
  look: generatedLook(member.address),
  level: member.level,
  crowns: member.crowns,
  league: leagueIndex(member.crowns),
  score: member.score,
  lastSeen: lastSeenOf(member.address, Math.floor(now)),
});

/** The public profile of `address` at `now`, or null when no member has that ID. */
export function communityProfile(address: string, now: number): PublicProfile | null {
  const member = communityMember(address);
  return member ? profileOf(member, now) : null;
}

/** The members `query` finds (game-core's `searchPlayers`), as public profiles at `now`. */
export function searchCommunity(query: string, now: number): PublicProfile[] {
  return searchPlayers(community(), query).map((m) => profileOf(m, now));
}
