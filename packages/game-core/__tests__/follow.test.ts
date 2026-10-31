import { describe, expect, it } from "vitest";
import {
  EMPTY_GRAPH,
  FOLLOW_LIMIT,
  ONLINE_WINDOW_S,
  SUGGESTION_LIMIT,
  areFriends,
  blockBetween,
  blockPlayer,
  blocksOf,
  byPresence,
  checkFollow,
  checkInvite,
  checkMessage,
  followCounts,
  followPlayer,
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
  type FollowGraph,
  type GraphWrite,
} from "../src";

// The follows, friends and blocks (#954): every rule and limit, allowed and refused.

const A = "0xa1";
const B = "0xb2";
const C = "0xc3";
const D = "0xd4";

/** The graph of a write that must be allowed. */
function ok<R extends string>(write: GraphWrite<R>): FollowGraph {
  if (!write.ok) throw new Error(`refused: ${write.reason}`);
  return write.graph;
}

/** A graph of follows, each `[follower, followed, at]`. */
const graphOf = (...follows: Array<[string, string, number]>): FollowGraph => ({ follows: follows.map(([follower, followed, at]) => ({ follower, followed, at })), blocks: [] });

describe("player keys (#954)", () => {
  it("compares an address whatever its form", () => {
    expect(playerKey("0x00A1")).toBe("0xa1");
    expect(playerKey(" 0XA1 ")).toBe("0xa1");
    expect(playerKey("Not An Id")).toBe("not an id");
    const g = ok(followPlayer(EMPTY_GRAPH, "0x00A1", "0xB2", 1));
    expect(isFollowing(g, A, B)).toBe(true);
    expect(g.follows).toEqual([{ follower: A, followed: B, at: 1 }]);
  });
});

describe("following (#954)", () => {
  it("is one-way and needs no consent", () => {
    const g = ok(followPlayer(EMPTY_GRAPH, A, B, 10));
    expect(isFollowing(g, A, B)).toBe(true);
    expect(isFollowing(g, B, A)).toBe(false);
    expect(areFriends(g, A, B)).toBe(false);
    expect(followingOf(g, A).map((f) => f.followed)).toEqual([B]);
    expect(followersOf(g, B).map((f) => f.follower)).toEqual([A]);
  });

  it("refuses following oneself", () => {
    expect(checkFollow(EMPTY_GRAPH, A, "0x00a1")).toEqual({ ok: false, reason: "self" });
    expect(followPlayer(EMPTY_GRAPH, A, A, 1)).toEqual({ ok: false, reason: "self" });
  });

  it("makes following twice a no-op that keeps the first time", () => {
    const g = ok(followPlayer(EMPTY_GRAPH, A, B, 10));
    const again = followPlayer(g, A, "0x0B2", 20);
    expect(again).toEqual({ ok: true, graph: g, changed: false });
    expect(followingOf(g, A)).toEqual([{ follower: A, followed: B, at: 10 }]);
  });

  it(`allows up to ${FOLLOW_LIMIT} follows and refuses one more, but not a follow already there`, () => {
    const targets = Array.from({ length: FOLLOW_LIMIT }, (_, i) => `0x${(0x1000 + i).toString(16)}`);
    const almost = graphOf(...targets.slice(0, -1).map((t, i): [string, string, number] => [A, t, i]));
    expect(checkFollow(almost, A, targets.at(-1)!)).toEqual({ ok: true });
    const full = ok(followPlayer(almost, A, targets.at(-1)!, 999));
    expect(followCounts(full, A).following).toBe(FOLLOW_LIMIT);
    expect(checkFollow(full, A, B)).toEqual({ ok: false, reason: "limit" });
    expect(followPlayer(full, A, B, 1000)).toEqual({ ok: false, reason: "limit" });
    expect(followPlayer(full, A, targets[0]!, 1000)).toMatchObject({ ok: true, changed: false });
    // Others are not held by A's cap.
    expect(checkFollow(full, B, A)).toEqual({ ok: true });
    // Unfollowing one frees a place.
    expect(checkFollow(ok(unfollowPlayer(full, A, targets[0]!)), A, B)).toEqual({ ok: true });
  });

  it("unfollows, and makes unfollowing a player not followed a no-op", () => {
    const g = ok(followPlayer(EMPTY_GRAPH, A, B, 1));
    const w = unfollowPlayer(g, A, B);
    expect(w).toMatchObject({ ok: true, changed: true });
    expect(isFollowing(ok(w), A, B)).toBe(false);
    expect(unfollowPlayer(EMPTY_GRAPH, A, B)).toEqual({ ok: true, graph: EMPTY_GRAPH, changed: false });
    // B's follow of A is B's own: A's unfollow leaves it.
    const both = ok(followPlayer(g, B, A, 2));
    expect(isFollowing(ok(unfollowPlayer(both, A, B)), B, A)).toBe(true);
  });

  it("never changes a graph in place", () => {
    const g = ok(followPlayer(EMPTY_GRAPH, A, B, 1));
    const frozen = JSON.stringify(g);
    ok(followPlayer(g, A, C, 2));
    ok(unfollowPlayer(g, A, B));
    ok(blockPlayer(g, B, A, 3));
    expect(JSON.stringify(g)).toBe(frozen);
    expect(EMPTY_GRAPH).toEqual({ follows: [], blocks: [] });
  });
});

describe("friends (#954)", () => {
  it("are a mutual follow, from the later of the two follows", () => {
    const g = graphOf([A, B, 10], [B, A, 30], [A, C, 20], [D, A, 5]);
    expect(areFriends(g, A, B)).toBe(true);
    expect(areFriends(g, B, A)).toBe(true);
    expect(areFriends(g, A, C)).toBe(false);
    expect(areFriends(g, A, D)).toBe(false);
    expect(friendsOf(g, A)).toEqual([{ follower: A, followed: B, at: 30 }]);
    expect(friendsOf(g, B)).toEqual([{ follower: B, followed: A, at: 30 }]);
    expect(areFriends(g, A, A)).toBe(false);
  });

  it("end when either one unfollows", () => {
    const g = graphOf([A, B, 1], [B, A, 2]);
    expect(areFriends(ok(unfollowPlayer(g, A, B)), A, B)).toBe(false);
    expect(areFriends(ok(unfollowPlayer(g, B, A)), A, B)).toBe(false);
  });

  it("list oldest friendship first", () => {
    const g = graphOf([A, B, 1], [A, C, 2], [C, A, 3], [B, A, 9]);
    expect(friendsOf(g, A).map((f) => [f.followed, f.at])).toEqual([
      [C, 3],
      [B, 9],
    ]);
  });
});

describe("followers (#954)", () => {
  it("count on every profile", () => {
    const g = graphOf([A, B, 1], [C, B, 2], [B, A, 3]);
    expect(followCounts(g, B)).toEqual({ followers: 2, following: 1 });
    expect(followCounts(g, D)).toEqual({ followers: 0, following: 0 });
  });

  it("are new until seen", () => {
    const g = graphOf([A, B, 10], [C, B, 20], [D, B, 30]);
    expect(newFollowers(g, B, 0).map((f) => f.follower)).toEqual([A, C, D]);
    expect(newFollowers(g, B, 20).map((f) => f.follower)).toEqual([D]);
    expect(newFollowers(g, B, 30)).toEqual([]);
  });

  it("can be removed, which ends their follow alone; removing one who does not follow is a no-op", () => {
    const g = graphOf([A, B, 1], [B, A, 2]);
    const w = removeFollower(g, B, A);
    expect(w).toMatchObject({ ok: true, changed: true });
    expect(isFollowing(ok(w), A, B)).toBe(false);
    expect(isFollowing(ok(w), B, A)).toBe(true);
    expect(removeFollower(g, B, C)).toEqual({ ok: true, graph: g, changed: false });
    // Removed, they may follow again (no block).
    expect(checkFollow(ok(w), A, B)).toEqual({ ok: true });
  });
});

describe("blocks (#954)", () => {
  it("refuse blocking oneself", () => {
    expect(blockPlayer(EMPTY_GRAPH, A, "0x0a1", 1)).toEqual({ ok: false, reason: "self" });
  });

  it("end each player's follow of the other, and leave the others", () => {
    const g = graphOf([A, B, 1], [B, A, 2], [A, C, 3], [C, B, 4]);
    const blocked = ok(blockPlayer(g, A, B, 5));
    expect(isFollowing(blocked, A, B)).toBe(false);
    expect(isFollowing(blocked, B, A)).toBe(false);
    expect(isFollowing(blocked, A, C)).toBe(true);
    expect(isFollowing(blocked, C, B)).toBe(true);
    expect(isBlocking(blocked, A, B)).toBe(true);
    expect(isBlocking(blocked, B, A)).toBe(false);
    expect(blocksOf(blocked, A)).toEqual([{ blocker: A, blocked: B, at: 5 }]);
    expect(blocksOf(blocked, B)).toEqual([]);
  });

  it("make blocking twice a no-op that keeps the first block", () => {
    const g = ok(blockPlayer(EMPTY_GRAPH, A, B, 5));
    expect(blockPlayer(g, A, B, 9)).toEqual({ ok: true, graph: g, changed: false });
  });

  it("stop the blocked player following, messaging or inviting the blocker, with a reason the page keeps to itself", () => {
    const g = ok(blockPlayer(EMPTY_GRAPH, A, B, 1));
    expect(checkFollow(g, B, A)).toEqual({ ok: false, reason: "blocked" });
    expect(followPlayer(g, B, A, 2)).toEqual({ ok: false, reason: "blocked" });
    expect(checkMessage(g, B, A)).toEqual({ ok: false, reason: "blocked" });
    expect(checkInvite(g, B, A)).toEqual({ ok: false, reason: "blocked" });
    expect(blockBetween(g, B, A)).toBe("blocked");
  });

  it("stop the blocker too, until they unblock", () => {
    const g = ok(blockPlayer(EMPTY_GRAPH, A, B, 1));
    expect(checkFollow(g, A, B)).toEqual({ ok: false, reason: "blocking" });
    expect(checkMessage(g, A, B)).toEqual({ ok: false, reason: "blocking" });
    expect(checkInvite(g, A, B)).toEqual({ ok: false, reason: "blocking" });
    expect(blockBetween(g, A, B)).toBe("blocking");
  });

  it("allow a message and an invitation between players with no block, never to oneself", () => {
    const g = ok(blockPlayer(EMPTY_GRAPH, A, B, 1));
    expect(checkMessage(g, A, C)).toEqual({ ok: true });
    expect(checkInvite(g, C, B)).toEqual({ ok: true });
    expect(checkMessage(g, C, C)).toEqual({ ok: false, reason: "self" });
    expect(checkInvite(g, C, C)).toEqual({ ok: false, reason: "self" });
    expect(blockBetween(g, A, C)).toBeNull();
  });

  it("hide the blocked player's messages from the blocker only", () => {
    const g = ok(blockPlayer(EMPTY_GRAPH, A, B, 1));
    expect(hidesMessages(g, A, B)).toBe(true);
    expect(hidesMessages(g, B, A)).toBe(false);
    expect(hidesMessages(g, C, B)).toBe(false);
  });

  it("let each player block the other, and stand until each unblocks", () => {
    const both = ok(blockPlayer(ok(blockPlayer(EMPTY_GRAPH, A, B, 1)), B, A, 2));
    const one = ok(unblockPlayer(both, A, B));
    expect(checkFollow(one, A, B)).toEqual({ ok: false, reason: "blocked" });
    expect(checkFollow(ok(unblockPlayer(one, B, A)), A, B)).toEqual({ ok: true });
  });

  it("unblock, leaving the ended follows ended; unblocking a player not blocked is a no-op", () => {
    const g = ok(blockPlayer(graphOf([A, B, 1], [B, A, 2]), A, B, 3));
    const w = unblockPlayer(g, A, B);
    expect(w).toMatchObject({ ok: true, changed: true });
    expect(ok(w)).toEqual(EMPTY_GRAPH);
    expect(checkFollow(ok(w), B, A)).toEqual({ ok: true });
    expect(unblockPlayer(EMPTY_GRAPH, A, B)).toEqual({ ok: true, graph: EMPTY_GRAPH, changed: false });
    // Only the blocker can lift it.
    expect(unblockPlayer(g, B, A)).toMatchObject({ changed: false });
  });
});

describe("follow suggestions (#954)", () => {
  it("put the followers not followed back first, then each group in its order, each player once", () => {
    const g = graphOf([C, A, 1], [D, A, 2], [A, D, 3]);
    expect(suggestFollows(g, A, [["0xe5", C], ["0xf6", "0xE5"]])).toEqual([C, "0xe5", "0xf6"]);
  });

  it("leave out the player, those they follow, and any player a block stands between", () => {
    const g = ok(blockPlayer(ok(blockPlayer(graphOf([A, B, 1]), C, A, 2)), A, D, 3));
    expect(suggestFollows(g, A, [[A, B, C, D, "0xe5"]])).toEqual(["0xe5"]);
  });

  it(`answer at most the limit, ${SUGGESTION_LIMIT} by default`, () => {
    const many = Array.from({ length: 30 }, (_, i) => `0x${(0x100 + i).toString(16)}`);
    expect(suggestFollows(EMPTY_GRAPH, A, [many])).toHaveLength(SUGGESTION_LIMIT);
    expect(suggestFollows(EMPTY_GRAPH, A, [many], 3)).toEqual(many.slice(0, 3));
    expect(suggestFollows(EMPTY_GRAPH, A, [many], 0)).toEqual([]);
  });
});

describe("the lists' order (#954)", () => {
  it("puts the players online first, then the most recently seen", () => {
    const now = 10_000;
    const players = [
      { id: "away", lastSeen: now - 3_600 },
      { id: "online-a", lastSeen: now - 60 },
      { id: "long-gone", lastSeen: now - 86_400 },
      { id: "online-b", lastSeen: now },
      { id: "just-left", lastSeen: now - ONLINE_WINDOW_S },
    ];
    expect(byPresence(players, now).map((p) => p.id)).toEqual(["online-b", "online-a", "just-left", "away", "long-gone"]);
    expect(players[0]!.id).toBe("away");
  });
});
