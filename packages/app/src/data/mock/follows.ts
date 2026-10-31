import {
  byPresence,
  blocksOf,
  followPlayer,
  followersOf,
  followingOf,
  friendsOf,
  isFollowing,
  newFollowers,
  playerKey,
  poseidon,
  type Block,
  type Follow,
  type FollowGraph,
} from "@paved/game-core";
import type { FollowLists, FollowRow, PublicProfile } from "../social-source";
import { community, communityProfile } from "./community";
import { SEEDED_PLAYERS } from "./players";

// The mock's follows (#954, proposal 11): the community's seeded follows, drawn and never stored, so that other players' lists
// have counts; the players' own follows and blocks, stored by the ledger (`StoredFollows`); and the seeded players' follow
// backs. A new player starts with no follows. About half of the seeded players a player follows follow back 3 to 8 seconds
// later (open point 4's default), drawn from Poseidon on the two addresses: the same each time, on every device. Every write
// goes through game-core's rules (`social/follow.ts`).

/** The kinds of the draws ('FOLLOW', 'BACK'). */
const FOLLOW_DRAW = 0x464f4c4c4f57n;
const BACK_DRAW = 0x4241434bn;

/** The seeded follows began within the 60 days before this time (2026-10-01 00:00 UTC). */
const SEEDED_SINCE = 1_790_812_800;
/** Each member of the community follows between this many and twice as many others. */
const SEEDED_MIN_FOLLOWS = 3;
/** A follow back comes this many seconds after the follow at the earliest, and up to 5 seconds later. */
export const FOLLOW_BACK_MIN_S = 3;
const FOLLOW_BACK_SPREAD_S = 6;

/** What the ledger stores of the follows: the players' own (the community's are drawn). */
export interface StoredFollows {
  /** The players' follows, and the follow backs made, in the order they began. */
  follows: Follow[];
  blocks: Block[];
  /** When each player (by key) last saw their followers, in seconds. */
  seen: Record<string, number>;
  /** The follow backs made, `player>member` by key: each comes once, whatever follows after. */
  backed: string[];
}

export const freshFollows = (): StoredFollows => ({ follows: [], blocks: [], seen: {}, backed: [] });

/** A draw in [0, 1). */
const draw = (kind: bigint, a: string, b: bigint): number => Number(poseidon(kind, BigInt(a), b) % 1_000_000n) / 1_000_000;

let seeded: Follow[] | null = null;

/**
 * The community's follows among themselves: each member follows 3 to 6 others, drawn from their address, since a time in the
 * 60 days before `SEEDED_SINCE`. The same at every load.
 */
export function seededFollows(): readonly Follow[] {
  if (seeded) return seeded;
  const members = community();
  const out: Follow[] = [];
  for (const m of members) {
    const count = SEEDED_MIN_FOLLOWS + Math.floor(draw(FOLLOW_DRAW, m.address, 0n) * (SEEDED_MIN_FOLLOWS + 1));
    const chosen = new Set<string>();
    for (let k = 1n; chosen.size < count && k < 64n; k++) {
      const other = members[Math.floor(draw(FOLLOW_DRAW, m.address, k) * members.length)]!;
      if (other.address === m.address || chosen.has(other.address)) continue;
      chosen.add(other.address);
      out.push({ follower: playerKey(m.address), followed: playerKey(other.address), at: SEEDED_SINCE - Math.floor(draw(FOLLOW_DRAW, other.address, k + 64n) * 60 * 86_400) });
    }
  }
  seeded = out.sort((x, y) => x.at - y.at);
  return seeded;
}

/** Whether a member of the community is one of the twenty seeded players (who follow back), not a rival village. */
const isSeededPlayer = (address: string): boolean => SEEDED_PLAYERS.some((p) => playerKey(p.address) === playerKey(address));

/**
 * How many seconds after `player` follows `member` the member follows back, or null when they do not: about half of the
 * seeded players, 3 to 8 seconds later, drawn from the two addresses; a rival village never does.
 */
export function followBackDelay(player: string, member: string): number | null {
  if (!isSeededPlayer(member)) return null;
  let p: bigint;
  try {
    p = BigInt(player);
  } catch {
    return null;
  }
  if (draw(BACK_DRAW, member, p) >= 0.5) return null;
  return FOLLOW_BACK_MIN_S + Math.floor(draw(BACK_DRAW, member, p + 1n) * FOLLOW_BACK_SPREAD_S);
}

const backKey = (player: string, member: string) => `${playerKey(player)}>${playerKey(member)}`;

/** A follow back still to come: the member, the player, and when. */
interface Back {
  member: string;
  player: string;
  at: number;
}

/** The follow backs the stored follows call for and not made yet, in the order they come. */
function backsOf(stored: StoredFollows): Back[] {
  const made = new Set(stored.backed);
  const backs: Back[] = [];
  for (const f of stored.follows) {
    const delay = followBackDelay(f.follower, f.followed);
    if (delay === null || made.has(backKey(f.follower, f.followed))) continue;
    backs.push({ member: f.followed, player: f.follower, at: f.at + delay });
  }
  return backs.sort((x, y) => x.at - y.at);
}

/**
 * The stored follows at `now`, with the follow backs due made (each by game-core's `followPlayer`: no back across a block,
 * none past the cap, none once the player stopped following). A new value; `stored` is left as it is.
 */
export function settleFollows(stored: StoredFollows, now: number): StoredFollows {
  let graph = graphOf(stored);
  const follows = [...stored.follows];
  const backed = [...stored.backed];
  for (const back of backsOf(stored)) {
    if (back.at > now) break;
    backed.push(backKey(back.player, back.member));
    if (!isFollowing(graph, back.player, back.member)) continue;
    const w = followPlayer(graph, back.member, back.player, back.at);
    if (!w.ok || !w.changed) continue;
    graph = w.graph;
    follows.push({ follower: playerKey(back.member), followed: playerKey(back.player), at: back.at });
  }
  return { ...stored, follows, backed };
}

/** The whole graph of a settled state: the community's seeded follows and the players' own. */
export const graphOf = (stored: StoredFollows): FollowGraph => ({ follows: [...seededFollows(), ...stored.follows], blocks: stored.blocks });

/** When `player`'s lists next change by themselves: their next follow back to come after `now`, or null. */
export function nextBackAt(stored: StoredFollows, player: string, now: number): number | null {
  const next = backsOf(stored).find((b) => b.at > now && playerKey(b.player) === playerKey(player));
  return next ? next.at : null;
}

/** The player's lists at `now` from a settled state, each player with their public profile (a player the mock does not know is left out). */
export function listsOf(stored: StoredFollows, player: string, now: number): FollowLists {
  const graph = graphOf(stored);
  const seenAt = stored.seen[playerKey(player)] ?? 0;
  const fresh = new Set(newFollowers(graph, player, seenAt).map((f) => playerKey(f.follower)));
  const rows = (entries: readonly { address: string; at: number }[]): FollowRow[] =>
    entries.flatMap(({ address, at }) => {
      const profile: PublicProfile | null = communityProfile(address, now);
      return profile ? [{ profile, since: at, isNew: false }] : [];
    });
  const sorted = (list: FollowRow[]) => byPresence(list.map((r) => ({ ...r, lastSeen: r.profile.lastSeen })), now).map(({ lastSeen: _, ...r }) => r);
  const followers = rows(followersOf(graph, player).map((f) => ({ address: f.follower, at: f.at }))).map((r) => ({ ...r, isNew: fresh.has(playerKey(r.profile.address)) }));
  return {
    friends: sorted(rows(friendsOf(graph, player).map((f) => ({ address: f.followed, at: f.at })))),
    following: sorted(rows(followingOf(graph, player).map((f) => ({ address: f.followed, at: f.at })))),
    followers: sorted(followers),
    newFollowers: followers.filter((r) => r.isNew).length,
    blocked: rows(blocksOf(graph, player).map((b) => ({ address: b.blocked, at: b.at }))).reverse(),
    nextChangeAt: nextBackAt(stored, player, now),
  };
}

/** A stored state without anything of `player`: their follows, the follows of them, their blocks, the blocks of them. */
export function forgetFollows(stored: StoredFollows, player: string): StoredFollows {
  const key = playerKey(player);
  const seen = { ...stored.seen };
  delete seen[key];
  return {
    follows: stored.follows.filter((f) => f.follower !== key && f.followed !== key),
    blocks: stored.blocks.filter((b) => b.blocker !== key && b.blocked !== key),
    seen,
    backed: stored.backed.filter((b) => !b.startsWith(`${key}>`)),
  };
}
