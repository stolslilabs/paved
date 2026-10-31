// The follows, the friends and the blocks (#954), pure: what the mock enforces today, so that a service or a contract can
// mirror them later (#956 decides where the follows live).
//
// - A follow is one-way and needs no consent, as Cartridge's `followable`. A friend is a mutual follow (open point 1's default).
// - Following oneself is refused, following twice is a no-op, and a player follows at most `FOLLOW_LIMIT` players.
// - A block ends each player's follow of the other. While it stands, neither may follow, message or invite the other; the
//   blocker no longer sees the blocked player's messages. The block is never shown to the blocked player: a page that reads a
//   `blocked` refusal tells them nothing more than that the action is not available.
// - Removing a follower ends their follow, and they are not told.
//
// The graph is two flat lists, as the events that would rebuild it off chain (Cartridge's `Follow` event): who follows whom
// since when, and who blocks whom. Every address is compared by its key (`playerKey`), whatever its form.

import { parsePlayerId } from "./search";

/** The most players one player may follow (open point 3's default). */
export const FOLLOW_LIMIT = 500;

/** One player's follow of another, since `at` (seconds since the epoch). */
export interface Follow {
  follower: string;
  followed: string;
  at: number;
}

/** One player's block of another, since `at` (seconds). */
export interface Block {
  blocker: string;
  blocked: string;
  at: number;
}

/** The follows and the blocks. Never changed in place: each write answers a new graph. */
export interface FollowGraph {
  follows: readonly Follow[];
  blocks: readonly Block[];
}

/** The empty graph: a new player's, before any follow. */
export const EMPTY_GRAPH: FollowGraph = { follows: [], blocks: [] };

/**
 * Why a follow, a message or an invitation is refused:
 * - `self`: the player is the target;
 * - `blocking`: the player blocks the target (they must unblock first);
 * - `blocked`: the target blocks the player. Never shown as such to the player (the block stays hidden);
 * - `limit`: the player already follows `FOLLOW_LIMIT` players (follows only).
 */
export type FollowRefusal = "self" | "blocking" | "blocked" | "limit";

/** Why a block is refused: only a block of oneself. */
export type BlockRefusal = "self";

/** A rule's answer: allowed, or refused with its reason. */
export type Check<R extends string> = { ok: true } | { ok: false; reason: R };

/** A write's answer: the new graph and whether anything changed (false: a no-op), or its refusal. */
export type GraphWrite<R extends string> = { ok: true; graph: FollowGraph; changed: boolean } | { ok: false; reason: R };

/**
 * A player's address as the rules compare it: `0x` and small hex digits with no leading zero (`0x05F1` and `0x5f1` are one
 * player). What is not an ID is kept as it is, in small letters.
 */
export const playerKey = (address: string): string => parsePlayerId(address) ?? address.trim().toLowerCase();

const same = (a: string, b: string): boolean => playerKey(a) === playerKey(b);

/** Whether `player` follows `target`. */
export const isFollowing = (graph: FollowGraph, player: string, target: string): boolean => graph.follows.some((f) => same(f.follower, player) && same(f.followed, target));

/** Whether `a` and `b` are friends: each follows the other. Never a player and themselves. */
export const areFriends = (graph: FollowGraph, a: string, b: string): boolean => !same(a, b) && isFollowing(graph, a, b) && isFollowing(graph, b, a);

/** Whether `player` blocks `target`. */
export const isBlocking = (graph: FollowGraph, player: string, target: string): boolean => graph.blocks.some((b) => same(b.blocker, player) && same(b.blocked, target));

/** The follows of `player`: whom they follow, oldest first. */
export const followingOf = (graph: FollowGraph, player: string): Follow[] => graph.follows.filter((f) => same(f.follower, player));

/** The follows of `player` by others: their followers, oldest first. */
export const followersOf = (graph: FollowGraph, player: string): Follow[] => graph.follows.filter((f) => same(f.followed, player));

/**
 * The friends of `player`: the follows of theirs that are followed back, each with the time the friendship began (the later of
 * the two follows), oldest first.
 */
export function friendsOf(graph: FollowGraph, player: string): Follow[] {
  const back = new Map(followersOf(graph, player).map((f) => [playerKey(f.follower), f.at] as const));
  return followingOf(graph, player)
    .filter((f) => back.has(playerKey(f.followed)))
    .map((f) => ({ ...f, at: Math.max(f.at, back.get(playerKey(f.followed))!) }))
    .sort((x, y) => x.at - y.at);
}

/** The blocks of `player`: whom they block, oldest first. Their own to see only. */
export const blocksOf = (graph: FollowGraph, player: string): Block[] => graph.blocks.filter((b) => same(b.blocker, player));

/** The counts every profile shows (open point 2's default: the counts are public, the lists are the player's own). */
export const followCounts = (graph: FollowGraph, player: string): { followers: number; following: number } => ({
  followers: followersOf(graph, player).length,
  following: followingOf(graph, player).length,
});

/** The followers who began to follow `player` after `seenAt` (seconds): the new ones, marked until seen, counted in the badge. */
export const newFollowers = (graph: FollowGraph, player: string, seenAt: number): Follow[] => followersOf(graph, player).filter((f) => f.at > seenAt);

/** Whether a block, either way, stops `from` reaching `to`: `blocking` (from blocks to), `blocked` (to blocks from), or null. */
export function blockBetween(graph: FollowGraph, from: string, to: string): "blocking" | "blocked" | null {
  if (isBlocking(graph, from, to)) return "blocking";
  if (isBlocking(graph, to, from)) return "blocked";
  return null;
}

/** Whether `from` may message `to` (#955): not themselves, and no block either way. */
export function checkMessage(graph: FollowGraph, from: string, to: string): Check<"self" | "blocking" | "blocked"> {
  if (same(from, to)) return { ok: false, reason: "self" };
  const block = blockBetween(graph, from, to);
  return block ? { ok: false, reason: block } : { ok: true };
}

/** Whether `from` may invite `to` to a guild (#953): not themselves, and no block either way. */
export const checkInvite = checkMessage;

/** Whether `viewer` no longer sees the messages of `author` in the World and guild chats (#955): the viewer blocks them. */
export const hidesMessages = (graph: FollowGraph, viewer: string, author: string): boolean => isBlocking(graph, viewer, author);

/**
 * Whether `player` may follow `target`: not themselves, no block either way, and under `FOLLOW_LIMIT`. A follow already there
 * is allowed (following twice is a no-op), whatever the count.
 */
export function checkFollow(graph: FollowGraph, player: string, target: string): Check<FollowRefusal> {
  if (same(player, target)) return { ok: false, reason: "self" };
  const block = blockBetween(graph, player, target);
  if (block) return { ok: false, reason: block };
  if (isFollowing(graph, player, target)) return { ok: true };
  if (followingOf(graph, player).length >= FOLLOW_LIMIT) return { ok: false, reason: "limit" };
  return { ok: true };
}

/** `player` follows `target` from `at` (seconds); a follow already there keeps its time (no-op). */
export function followPlayer(graph: FollowGraph, player: string, target: string, at: number): GraphWrite<FollowRefusal> {
  const check = checkFollow(graph, player, target);
  if (!check.ok) return check;
  if (isFollowing(graph, player, target)) return { ok: true, graph, changed: false };
  return { ok: true, graph: { ...graph, follows: [...graph.follows, { follower: playerKey(player), followed: playerKey(target), at }] }, changed: true };
}

/** `player` stops following `target`; a follow not there is a no-op. Never refused. */
export function unfollowPlayer(graph: FollowGraph, player: string, target: string): GraphWrite<never> {
  const follows = graph.follows.filter((f) => !(same(f.follower, player) && same(f.followed, target)));
  return follows.length === graph.follows.length ? { ok: true, graph, changed: false } : { ok: true, graph: { ...graph, follows }, changed: true };
}

/** `player` removes `follower`: the follower's follow of them ends, and the follower is not told. A no-op for one who does not follow. */
export const removeFollower = (graph: FollowGraph, player: string, follower: string): GraphWrite<never> => unfollowPlayer(graph, follower, player);

/** `player` blocks `target` from `at`: each one's follow of the other ends. Blocking twice keeps the first block (no-op). */
export function blockPlayer(graph: FollowGraph, player: string, target: string, at: number): GraphWrite<BlockRefusal> {
  if (same(player, target)) return { ok: false, reason: "self" };
  const follows = graph.follows.filter((f) => !((same(f.follower, player) && same(f.followed, target)) || (same(f.follower, target) && same(f.followed, player))));
  const blocked = isBlocking(graph, player, target);
  if (blocked && follows.length === graph.follows.length) return { ok: true, graph, changed: false };
  const blocks = blocked ? graph.blocks : [...graph.blocks, { blocker: playerKey(player), blocked: playerKey(target), at }];
  return { ok: true, graph: { follows, blocks }, changed: true };
}

/** `player` unblocks `target`; the follows the block ended stay ended. A block not there is a no-op. Never refused. */
export function unblockPlayer(graph: FollowGraph, player: string, target: string): GraphWrite<never> {
  const blocks = graph.blocks.filter((b) => !(same(b.blocker, player) && same(b.blocked, target)));
  return blocks.length === graph.blocks.length ? { ok: true, graph, changed: false } : { ok: true, graph: { ...graph, blocks }, changed: true };
}

/** The most suggestions `suggestFollows` answers by default. */
export const SUGGESTION_LIMIT = 10;

/**
 * Whom to suggest `player` follows, at most `limit`: the followers they do not follow back first, then each of `groups` in its
 * order (the guild's members #953, the recent PvP opponents, then the community), each player once. Left out: the player, the
 * players they follow, and any player a block stands between, either way.
 */
export function suggestFollows(graph: FollowGraph, player: string, groups: readonly (readonly string[])[], limit = SUGGESTION_LIMIT): string[] {
  const seen = new Set<string>([playerKey(player)]);
  for (const f of followingOf(graph, player)) seen.add(playerKey(f.followed));
  const out: string[] = [];
  const candidates = [followersOf(graph, player).map((f) => f.follower), ...groups];
  for (const group of candidates) {
    for (const address of group) {
      if (out.length >= limit) return out;
      const key = playerKey(address);
      if (seen.has(key) || blockBetween(graph, player, address)) continue;
      seen.add(key);
      out.push(address);
    }
  }
  return out;
}
