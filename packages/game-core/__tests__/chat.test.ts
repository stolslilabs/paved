import { describe, expect, it } from "vitest";
import {
  CHAT_FILTER_MASK,
  CHAT_INTERVAL_S,
  CHAT_KEPT,
  CHAT_MESSAGE_MAX,
  CHAT_WORLD_INTERVAL_S,
  CHAT_WORLD_MIN_LEVEL,
  CHAT_WORLD_PER_MINUTE,
  GUILD_RANK,
  WORLD_CONVERSATION,
  answerRequestRefusal,
  chatBadge,
  chatLength,
  chatPage,
  deleteRefusal,
  filterWords,
  guildConversation,
  hiddenFrom,
  isMuted,
  keepMessages,
  mayRead,
  messageTextRefusal,
  muteRefusal,
  nextSendAt,
  normalMessage,
  otherPlayer,
  parseConversation,
  privateConversation,
  privateRefusal,
  privateStanding,
  rateRefusal,
  reachesDirectly,
  reportRefusal,
  sendRefusal,
  sortConversations,
  unreadMessages,
  type PrivatePair,
  type SentMessage,
} from "../src";

// The messaging rules (#955): each rule allowed and refused, with its typed reason.

const A = "0x0a";
const B = "0xb";
const C = "0xc";
const T = 1_793_448_000;
const side = (accepted = false, declined = false) => ({ accepted, declined });
const pair = (over: Partial<PrivatePair> = {}): PrivatePair => ({ related: false, mine: side(), theirs: side(), theyWrote: false, block: null, ...over });
const sent = (...ago: number[]): SentMessage[] => ago.map((s, i) => ({ at: T - s, text: `line ${i}` }));

describe("conversations' IDs", () => {
  it("name the World, a guild's and one private conversation per pair, whatever the order and the form of the addresses", () => {
    expect(parseConversation(WORLD_CONVERSATION)).toEqual({ kind: "world" });
    expect(parseConversation(guildConversation(20_001))).toEqual({ kind: "guild", guild: 20_001 });
    const dm = privateConversation("0x00A", B);
    expect(dm).toBe(privateConversation(B, A));
    expect(dm).toBe("dm:0xa:0xb");
    expect(parseConversation(dm)).toEqual({ kind: "private", players: ["0xa", "0xb"] });
    expect(otherPlayer(dm, "0x0A")).toBe("0xb");
    expect(otherPlayer(dm, C)).toBeNull();
    expect(otherPlayer(WORLD_CONVERSATION, A)).toBeNull();
  });

  it("refuse what is not an ID: an unknown kind, a pair out of order, a player with themselves", () => {
    for (const id of ["", "worlds", "guild:", "guild:x", "dm:0xb:0xa", "dm:0xa:0xa", "dm:0xA:0xb", "dm:0xa"]) expect(parseConversation(id)).toBeNull();
  });
});

describe("a message's text", () => {
  it("is one line of plain text, trimmed, its control characters dropped", () => {
    expect(normalMessage("  hello \n\t world  ")).toBe("hello world");
    expect(normalMessage("a\u0000b‮c")).toBe("abc");
    // Links stay as typed: the pages show them as plain text.
    expect(normalMessage("see https://example.com/x?y=1 or 0x5f1")).toBe("see https://example.com/x?y=1 or 0x5f1");
  });

  it("allows up to 200 characters, an emoji counting once, and refuses a blank or longer one", () => {
    expect(messageTextRefusal("gg")).toBeNull();
    expect(messageTextRefusal("x".repeat(CHAT_MESSAGE_MAX))).toBeNull();
    expect(messageTextRefusal("🙂".repeat(CHAT_MESSAGE_MAX))).toBeNull();
    expect(chatLength("🙂🙂")).toBe(2);
    expect(messageTextRefusal("x".repeat(CHAT_MESSAGE_MAX + 1))).toBe("too-long");
    expect(messageTextRefusal("   \n ")).toBe("empty");
  });

  it("has its listed words masked, whole words only, whatever their case", () => {
    const words = ["darn", "heck", "dang it"];
    expect(filterWords("Darn this HECK, dang it!", words)).toBe(`${CHAT_FILTER_MASK} this ${CHAT_FILTER_MASK}, ${CHAT_FILTER_MASK}!`);
    expect(filterWords("darned hecklers", words)).toBe("darned hecklers");
    expect(filterWords("a.b", ["a.b"])).toBe(CHAT_FILTER_MASK);
    expect(filterWords("anything", [])).toBe("anything");
  });
});

describe("the rate limits", () => {
  it("allow the first message anywhere", () => {
    for (const kind of ["world", "guild", "private"] as const) {
      expect(rateRefusal(kind, [], "hi", T)).toBeNull();
      expect(nextSendAt(kind, [], T)).toBe(T);
    }
  });

  it("in the World: one per 5 seconds", () => {
    expect(rateRefusal("world", sent(CHAT_WORLD_INTERVAL_S - 1), "hi", T)).toBe("too-fast");
    expect(nextSendAt("world", sent(CHAT_WORLD_INTERVAL_S - 1), T)).toBe(T + 1);
    expect(rateRefusal("world", sent(CHAT_WORLD_INTERVAL_S), "hi", T)).toBeNull();
  });

  it("in the World: at most 10 in a minute", () => {
    const ten = sent(...Array.from({ length: CHAT_WORLD_PER_MINUTE }, (_, i) => 5 + i * 5));
    expect(rateRefusal("world", ten, "hi", T)).toBe("per-minute");
    // The 10th latest was sent 50 s ago: the next comes 10 s on.
    expect(nextSendAt("world", ten, T)).toBe(T + 10);
    expect(rateRefusal("world", sent(...Array.from({ length: CHAT_WORLD_PER_MINUTE - 1 }, (_, i) => 5 + i * 5)), "hi", T)).toBeNull();
    expect(rateRefusal("world", sent(...Array.from({ length: CHAT_WORLD_PER_MINUTE }, (_, i) => 15 + i * 5)), "hi", T)).toBeNull();
  });

  it("in the World: the same text twice in a row is refused, whatever its case and spaces", () => {
    const last = [{ at: T - 60, text: "Hello all" }];
    expect(rateRefusal("world", last, " hello   ALL ", T)).toBe("repeat");
    expect(rateRefusal("world", [...last, { at: T - 30, text: "other" }], "hello all", T)).toBeNull();
    // Elsewhere a repeat is allowed.
    expect(rateRefusal("guild", last, "Hello all", T)).toBeNull();
  });

  it("in a guild's and a private conversation: one per 2 seconds, no per-minute cap", () => {
    for (const kind of ["guild", "private"] as const) {
      expect(rateRefusal(kind, sent(CHAT_INTERVAL_S - 1), "hi", T)).toBe("too-fast");
      expect(rateRefusal(kind, sent(CHAT_INTERVAL_S), "hi", T)).toBeNull();
      expect(rateRefusal(kind, sent(...Array.from({ length: 20 }, (_, i) => 2 + i * 2)), "hi", T)).toBeNull();
      expect(nextSendAt(kind, sent(0), T)).toBe(T + CHAT_INTERVAL_S);
    }
  });
});

describe("private conversations", () => {
  it("are open between friends or guildmates, and once the player wrote or accepted", () => {
    expect(privateStanding(pair({ related: true }))).toBe("open");
    expect(privateStanding(pair({ mine: side(true) }))).toBe("open");
    expect(privateStanding(pair({ related: true, mine: side(false, true) }))).toBe("open");
  });

  it("from a stranger wait in Requests, and a declined one goes away", () => {
    expect(privateStanding(pair({ theyWrote: true }))).toBe("request");
    expect(privateStanding(pair({ theyWrote: true, mine: side(false, true) }))).toBe("declined");
    expect(privateStanding(pair())).toBe("none");
  });

  it("reach the other directly when related or accepted on their side, else as a request", () => {
    expect(reachesDirectly(pair({ related: true }))).toBe(true);
    expect(reachesDirectly(pair({ theirs: side(true) }))).toBe(true);
    expect(reachesDirectly(pair())).toBe(false);
  });

  it("refuse a block either way, and a request the other declined", () => {
    expect(privateRefusal(pair())).toBeNull();
    expect(privateRefusal(pair({ block: "blocking" }))).toBe("blocking");
    expect(privateRefusal(pair({ related: true, block: "blocked" }))).toBe("blocked");
    expect(privateRefusal(pair({ theirs: side(false, true) }))).toBe("declined");
    // Once friends, a declined request no longer stops them.
    expect(privateRefusal(pair({ related: true, theirs: side(false, true) }))).toBeNull();
  });

  it("answer only a request waiting for the player", () => {
    expect(answerRequestRefusal(pair({ theyWrote: true }))).toBeNull();
    expect(answerRequestRefusal(pair({ theyWrote: true, mine: side(true) }))).toBe("not-a-request");
    expect(answerRequestRefusal(pair({ theyWrote: true, related: true }))).toBe("not-a-request");
    expect(answerRequestRefusal(pair())).toBe("not-a-request");
    expect(answerRequestRefusal(pair({ theyWrote: true, mine: side(false, true) }))).toBe("not-a-request");
  });
});

describe("who may write where", () => {
  const world = { kind: "world" } as const;
  const guild = { kind: "guild", guild: 7 } as const;
  const dm = parseConversation(privateConversation(A, B))!;

  it("the World from level 2", () => {
    expect(sendRefusal(world, { level: CHAT_WORLD_MIN_LEVEL, guild: null }, "hi", [], T)).toBeNull();
    expect(sendRefusal(world, { level: CHAT_WORLD_MIN_LEVEL - 1, guild: null }, "hi", [], T)).toBe("level-low");
  });

  it("a guild's for its members only, at any level", () => {
    expect(sendRefusal(guild, { level: 1, guild: 7 }, "hi", [], T)).toBeNull();
    expect(sendRefusal(guild, { level: 20, guild: 8 }, "hi", [], T)).toBe("not-in-guild");
    expect(sendRefusal(guild, { level: 20, guild: null }, "hi", [], T)).toBe("not-in-guild");
  });

  it("a private one by its pair's rule", () => {
    expect(sendRefusal(dm, { level: 1, guild: null }, "hi", [], T, pair())).toBeNull();
    expect(sendRefusal(dm, { level: 1, guild: null }, "hi", [], T, pair({ block: "blocked" }))).toBe("blocked");
    expect(sendRefusal(dm, { level: 1, guild: null }, "hi", [], T)).toBe("not-found");
  });

  it("the text first, then who, then the rate", () => {
    expect(sendRefusal(world, { level: 1, guild: null }, "", [], T)).toBe("empty");
    expect(sendRefusal(world, { level: 5, guild: null }, "hi", sent(1), T)).toBe("too-fast");
    expect(sendRefusal(guild, { level: 5, guild: 7 }, "hi", sent(1), T)).toBe("too-fast");
  });

  it("reading: the World anyone, a guild's its members, a private one its two players", () => {
    expect(mayRead(world, C, null)).toBe(true);
    expect(mayRead(guild, C, 7)).toBe(true);
    expect(mayRead(guild, C, 8)).toBe(false);
    expect(mayRead(dm, "0x0b", null)).toBe(true);
    expect(mayRead(dm, C, null)).toBe(false);
  });
});

describe("deleting a message", () => {
  const mine = { author: A, deleted: false };
  const theirs = { author: B, deleted: false };

  it("the sender their own, anywhere", () => {
    for (const kind of ["world", "guild", "private"] as const) expect(deleteRefusal(kind, { address: "0x00a" }, mine)).toBeNull();
    expect(deleteRefusal("world", { address: A }, { ...mine, deleted: true })).toBe("deleted");
  });

  it("no one another's in the World or in private", () => {
    expect(deleteRefusal("world", { address: A, rank: GUILD_RANK.leader }, theirs)).toBe("not-author");
    expect(deleteRefusal("private", { address: A }, theirs)).toBe("not-author");
  });

  it("in a guild's: an officer or the leader, a member they rank strictly above", () => {
    expect(deleteRefusal("guild", { address: A, rank: GUILD_RANK.officer, authorRank: GUILD_RANK.member }, theirs)).toBeNull();
    expect(deleteRefusal("guild", { address: A, rank: GUILD_RANK.leader, authorRank: GUILD_RANK.officer }, theirs)).toBeNull();
    expect(deleteRefusal("guild", { address: A, rank: GUILD_RANK.officer, authorRank: GUILD_RANK.officer }, theirs)).toBe("rank-not-above");
    expect(deleteRefusal("guild", { address: A, rank: GUILD_RANK.officer, authorRank: GUILD_RANK.leader }, theirs)).toBe("rank-not-above");
    expect(deleteRefusal("guild", { address: A, rank: GUILD_RANK.member, authorRank: GUILD_RANK.member }, theirs)).toBe("not-author");
    expect(deleteRefusal("guild", { address: A, rank: null, authorRank: GUILD_RANK.member }, theirs)).toBe("not-author");
    // A former member ranks below everyone.
    expect(deleteRefusal("guild", { address: A, rank: GUILD_RANK.officer, authorRank: null }, theirs)).toBeNull();
  });
});

describe("reporting a message", () => {
  it("another's, not deleted, for a listed reason, once", () => {
    const m = { author: B, deleted: false };
    for (const reason of ["spam", "scam", "harassment", "other"]) expect(reportRefusal(A, m, reason, false)).toBeNull();
    expect(reportRefusal("0xB", m, "spam", false)).toBe("self");
    expect(reportRefusal(A, { ...m, deleted: true }, "spam", false)).toBe("deleted");
    expect(reportRefusal(A, m, "rude", false)).toBe("reason");
    expect(reportRefusal(A, m, "spam", true)).toBe("reported-already");
  });
});

describe("mutes and what is hidden", () => {
  it("a mute is the muter's, of another player only", () => {
    const mutes = [{ muter: A, muted: B, at: T }];
    expect(isMuted(mutes, "0x00a", "0xB")).toBe(true);
    expect(isMuted(mutes, B, A)).toBe(false);
    expect(muteRefusal(A, B)).toBeNull();
    expect(muteRefusal(A, "0x0A")).toBe("self");
  });

  it("hides a muted player in the World and the guild, not in private; a blocked one everywhere; never the viewer's own", () => {
    expect(hiddenFrom("world", A, B, { blocking: false, muted: true })).toBe(true);
    expect(hiddenFrom("guild", A, B, { blocking: false, muted: true })).toBe(true);
    expect(hiddenFrom("private", A, B, { blocking: false, muted: true })).toBe(false);
    for (const kind of ["world", "guild", "private"] as const) expect(hiddenFrom(kind, A, B, { blocking: true, muted: false })).toBe(true);
    expect(hiddenFrom("world", A, B, { blocking: false, muted: false })).toBe(false);
    expect(hiddenFrom("world", A, A, { blocking: true, muted: true })).toBe(false);
  });
});

describe("keeping, unread, the badge and the order", () => {
  it("keeps the World's last 200, a guild's last 500, every private message", () => {
    const many = Array.from({ length: 600 }, (_, i) => ({ at: i }));
    expect(keepMessages("world", many)).toHaveLength(CHAT_KEPT.world);
    expect(keepMessages("world", many)[0]!.at).toBe(400);
    expect(keepMessages("guild", many)).toHaveLength(CHAT_KEPT.guild);
    expect(keepMessages("private", many)).toHaveLength(600);
  });

  it("counts the others' messages after the read time, not the deleted ones nor the events", () => {
    const list = [
      { at: 10, author: B },
      { at: 20, author: A },
      { at: 30, author: B, deleted: true },
      { at: 40, author: null },
      { at: 50, author: "0x0B" },
    ];
    expect(unreadMessages(list, A, 0)).toBe(2);
    expect(unreadMessages(list, A, 10)).toBe(1);
    expect(unreadMessages(list, A, 50)).toBe(0);
  });

  it("badges the guild's and the private messages and the requests, never the World", () => {
    expect(chatBadge({ guild: 2, private: [1, 3], requests: 1 })).toBe(7);
    expect(chatBadge({ guild: 0, private: [], requests: 0 })).toBe(0);
  });

  it("lists the World, the guild's, then the private ones by their last message", () => {
    const list = [
      { id: "p1", kind: "private" as const, lastAt: 10 },
      { id: "g", kind: "guild" as const, lastAt: 5 },
      { id: "p2", kind: "private" as const, lastAt: 30 },
      { id: "p3", kind: "private" as const, lastAt: null },
      { id: "w", kind: "world" as const, lastAt: 1 },
    ];
    expect(sortConversations(list).map((c) => c.id)).toEqual(["w", "g", "p2", "p1", "p3"]);
  });

  it("pages the latest first, then the older ones before a cursor, with no message lost or read twice", () => {
    const list = Array.from({ length: 12 }, (_, i) => ({ at: Math.floor(i / 3), id: `m${String(i).padStart(2, "0")}` }));
    const first = chatPage(list, null, 5);
    expect(first.messages.map((m) => m.id)).toEqual(["m07", "m08", "m09", "m10", "m11"]);
    const second = chatPage(list, first.before, 5);
    expect(second.messages.map((m) => m.id)).toEqual(["m02", "m03", "m04", "m05", "m06"]);
    const third = chatPage(list, second.before, 5);
    expect(third.messages.map((m) => m.id)).toEqual(["m00", "m01"]);
    expect(third.before).toBeNull();
    expect(chatPage([], null).messages).toEqual([]);
  });
});
