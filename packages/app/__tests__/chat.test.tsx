import { act, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CHAT_FILTER_MASK,
  CHAT_KEPT,
  CHAT_WORLD_INTERVAL_S,
  CHAT_WORLD_MIN_LEVEL,
  GUILD_RANK,
  WORLD_CONVERSATION,
  guildConversation,
  privateConversation,
  xpFloor,
  type GuildDraft,
} from "@paved/game-core";
import { chatKeys, chatRefusal, useChatMutes, useChatOverview, useChatWrites, useConversation } from "../src/data/chat";
import { MOCK_REPLY_MIN_S, MOCK_REQUEST_S, WORLD_SLOT_S } from "../src/data/mock/chat";
import { community } from "../src/data/mock/community";
import { followBackDelay } from "../src/data/mock/follows";
import { seededGuildWorld } from "../src/data/mock/guilds";
import { MockLedger, MOCK_KEY } from "../src/data/mock/ledger";
import { mockSocial } from "../src/data/mock/overlay";
import { SEEDED_PLAYERS } from "../src/data/mock/players";
import { freshV2 } from "../src/data/mock/v2";
import type { ChatEvent, ChatSource, GuildSource, SocialSource } from "../src/data/social-source";
import { fakeSources, memoryStore, renderData } from "./data-fakes";

// The messages on the mock (#955): the World, a guild's and the private conversations on the ledger, by game-core's rules; the
// flows of the acceptance (writing, a friend, a stranger's request accepted and declined, report, mute, delete, an officer's
// delete), the rate limits and the level rule, what the mock's community writes when due, the subscriptions, and the hooks.

/** 2026-10-31 12:00 UTC. */
const T0 = 1_793_448_000;

/** Device players, outside the community. */
const ME = "0xabc001";
const OTHER = "0xabc002";
const THIRD = "0xabc003";

type Social = SocialSource & GuildSource & { chat: ChatSource };

/** A ledger on its own store, its clock in `clock.now` (seconds). */
function world(start = T0, now?: () => number) {
  const store = memoryStore();
  const clock = { now: start };
  const ledger = new MockLedger({ store: () => store, seller: "0x3", latencyMs: 0, now: now ?? (() => clock.now) });
  const social = mockSocial(ledger) as Social;
  return { ledger, store, clock, social, chat: social.chat };
}

/** Puts device players at `level` in the stored state (their XP), so that they may write in the World. */
function levelUp(store: ReturnType<typeof memoryStore>, level: number, ...players: string[]) {
  const state = JSON.parse(store.getItem(MOCK_KEY) ?? JSON.stringify({ version: 1, players: {}, vault: { assets: "1", supply: "1" }, transactions: 0 }));
  for (const p of players) {
    state.players[BigInt(p).toString(16).replace(/^/, "0x")] = {
      cobbles: 0,
      credits: 0,
      achievementsClaimed: "0",
      days: {},
      weeks: {},
      owned: {},
      active: [],
      shares: "0",
      paved: "0",
      usdc: "0",
      v2: { ...freshV2(), xp: xpFloor(level) },
    };
  }
  store.setItem(MOCK_KEY, JSON.stringify(state));
}

const refused = (reason: string) => expect.objectContaining({ name: "ChatRefusedError", reason });
const draft = (over: Partial<GuildDraft> = {}): GuildDraft => ({ name: "Stone Road", emblem: { icon: 1, primary: 2, secondary: 3 }, description: "We pave.", joinType: "open", requirements: { level: 0, crowns: 0 }, ...over });
/** A community player who follows back, and one in no seeded guild who is a rival (a stranger). */
const backer = SEEDED_PLAYERS.find((p) => followBackDelay(ME, p.address) !== null)!.address;
const inGuild = new Set(seededGuildWorld().guilds.flatMap((g) => g.members.map((m) => m.address)));
const stranger = community().find((m) => !SEEDED_PLAYERS.some((p) => p.address === m.address) && !inGuild.has(BigInt(m.address).toString(16).replace(/^/, "0x")))!.address;

/** Every message of a conversation, all its pages. */
async function allOf(chat: ChatSource, player: string, id: string) {
  const out = [];
  let before: string | null = null;
  do {
    const page = (await chat.conversation(player, id, before))!;
    out.unshift(...page.messages);
    before = page.before;
  } while (before !== null);
  return out;
}

afterEach(() => vi.useRealTimers());

describe("the World on the mock (#955)", () => {
  it("is the community's lines drawn from the clock, the same on every device for the same minute, by players of level 2 and up", async () => {
    const a = world();
    const b = world();
    const pageA = (await a.chat.conversation(ME, WORLD_CONVERSATION))!;
    const pageB = (await b.chat.conversation(OTHER, WORLD_CONVERSATION))!;
    expect(pageA.messages.length).toBeGreaterThan(10);
    expect(pageA.messages.map((m) => [m.id, m.text, m.at, m.author?.address])).toEqual(pageB.messages.map((m) => [m.id, m.text, m.at, m.author?.address]));
    for (const m of pageA.messages) {
      expect(m.author!.level).toBeGreaterThanOrEqual(CHAT_WORLD_MIN_LEVEL);
      expect(m.at).toBeLessThanOrEqual(T0);
      expect(m.mayDelete).toBe(false);
      expect(m.mayReport).toBe(true);
    }
    // A member of a guild shows its tag.
    expect(pageA.messages.some((m) => m.author!.guildTag !== null)).toBe(true);
    // Kept: its last 200, paged 50 at a time, the latest first.
    const all = await allOf(a.chat, ME, WORLD_CONVERSATION);
    expect(all.length).toBeLessThanOrEqual(CHAT_KEPT.world);
    expect(all.length).toBeGreaterThan(pageA.messages.length);
    expect(all.map((m) => m.at)).toEqual([...all.map((m) => m.at)].sort((x, y) => x - y));
    expect(new Set(all.map((m) => m.id)).size).toBe(all.length);
    expect(all.slice(-pageA.messages.length)).toEqual(pageA.messages);
  });

  it("refuses a player under level 2 with its reason, and lets one of level 2 write", async () => {
    const { chat, store } = world();
    expect((await chat.conversation(ME, WORLD_CONVERSATION))!.writeRefusal).toBe("level-low");
    await expect(chat.send(ME, WORLD_CONVERSATION, "hello")).rejects.toEqual(refused("level-low"));
    levelUp(store, CHAT_WORLD_MIN_LEVEL, ME);
    expect((await chat.conversation(ME, WORLD_CONVERSATION))!.writeRefusal).toBeNull();
    const sent = await chat.send(ME, WORLD_CONVERSATION, "  hello   all  ");
    expect(sent).toMatchObject({ text: "hello all", mine: true, mayDelete: true, mayReport: false, at: T0 });
    expect((await chat.conversation(ME, WORLD_CONVERSATION))!.messages.at(-1)!.id).toBe(sent.id);
  });

  it("holds the rate limits: one per 5 seconds, no repeat, 10 a minute, each with its reason and when to retry", async () => {
    const { chat, store, clock } = world();
    levelUp(store, 2, ME);
    await chat.send(ME, WORLD_CONVERSATION, "first");
    clock.now += CHAT_WORLD_INTERVAL_S - 1;
    await expect(chat.send(ME, WORLD_CONVERSATION, "second")).rejects.toEqual(expect.objectContaining({ reason: "too-fast", retryAt: T0 + CHAT_WORLD_INTERVAL_S }));
    expect((await chat.conversation(ME, WORLD_CONVERSATION))!.nextSendAt).toBe(T0 + CHAT_WORLD_INTERVAL_S);
    clock.now += 1;
    await expect(chat.send(ME, WORLD_CONVERSATION, "FIRST")).rejects.toEqual(refused("repeat"));
    for (let i = 0; i < 9; i++) {
      await chat.send(ME, WORLD_CONVERSATION, `line ${i}`);
      clock.now += CHAT_WORLD_INTERVAL_S;
    }
    // Ten within the last minute: the eleventh waits for the first to be a minute old.
    await expect(chat.send(ME, WORLD_CONVERSATION, "eleventh")).rejects.toEqual(expect.objectContaining({ reason: "per-minute", retryAt: T0 + 60 }));
    clock.now = T0 + 60;
    await expect(chat.send(ME, WORLD_CONVERSATION, "eleventh")).resolves.toMatchObject({ text: "eleventh" });
  });

  it("masks the listed words and keeps links and addresses as plain text", async () => {
    const { chat, store } = world();
    levelUp(store, 2, ME);
    expect((await chat.send(ME, WORLD_CONVERSATION, "what the FUCK, see https://paved.example/x and 0x05f1")).text).toBe(`what the ${CHAT_FILTER_MASK}, see https://paved.example/x and 0x05f1`);
    await expect(chat.send(ME, WORLD_CONVERSATION, "x".repeat(201))).rejects.toEqual(refused("too-long"));
    await expect(chat.send(ME, WORLD_CONVERSATION, "   ")).rejects.toEqual(refused("empty"));
  });

  it("keeps the player's messages with the ledger, and deleting one shows it deleted to everyone", async () => {
    const { chat, store, clock } = world();
    levelUp(store, 2, ME, OTHER);
    const sent = await chat.send(ME, WORLD_CONVERSATION, "keep me");
    const again = mockSocial(new MockLedger({ store: () => store, seller: "0x3", latencyMs: 0, now: () => clock.now })) as Social;
    expect((await again.chat.conversation(OTHER, WORLD_CONVERSATION))!.messages.find((m) => m.id === sent.id)).toMatchObject({ text: "keep me", mine: false, mayDelete: false, mayReport: true });
    await expect(chat.deleteMessage(OTHER, WORLD_CONVERSATION, sent.id)).rejects.toEqual(refused("not-author"));
    await chat.deleteMessage(ME, WORLD_CONVERSATION, sent.id);
    const seen = (await again.chat.conversation(OTHER, WORLD_CONVERSATION))!.messages.find((m) => m.id === sent.id)!;
    expect(seen).toMatchObject({ deleted: true, text: "", mayReport: false });
    await expect(chat.deleteMessage(ME, WORLD_CONVERSATION, sent.id)).rejects.toEqual(refused("deleted"));
  });

  it("records a report once, for a listed reason, never of one's own message", async () => {
    const { chat, store } = world();
    levelUp(store, 2, ME);
    const line = (await chat.conversation(ME, WORLD_CONVERSATION))!.messages.at(-1)!;
    await chat.report(ME, WORLD_CONVERSATION, line.id, "scam");
    expect(JSON.parse(store.getItem(MOCK_KEY)!).chat.reports).toEqual([expect.objectContaining({ reporter: ME, message: line.id, reason: "scam", text: line.text })]);
    expect((await chat.conversation(ME, WORLD_CONVERSATION))!.messages.at(-1)!.mayReport).toBe(false);
    await expect(chat.report(ME, WORLD_CONVERSATION, line.id, "spam")).rejects.toEqual(refused("reported-already"));
    const own = await chat.send(ME, WORLD_CONVERSATION, "mine");
    await expect(chat.report(ME, WORLD_CONVERSATION, own.id, "spam")).rejects.toEqual(refused("self"));
    await expect(chat.report(ME, WORLD_CONVERSATION, "w0", "spam")).rejects.toEqual(refused("not-found"));
  });

  it("hides a muted player's lines from the muter only, until unmuted; a blocked one's too", async () => {
    const { chat, social } = world();
    const lines = (await chat.conversation(ME, WORLD_CONVERSATION))!.messages;
    const talker = lines.at(-1)!.author!.address;
    await chat.mute(ME, talker);
    expect((await chat.mutes(ME)).map((p) => p.address)).toEqual([talker]);
    expect((await allOf(chat, ME, WORLD_CONVERSATION)).some((m) => m.author?.address === talker)).toBe(false);
    expect((await chat.conversation(OTHER, WORLD_CONVERSATION))!.messages.some((m) => m.author?.address === talker)).toBe(true);
    await chat.unmute(ME, talker);
    expect((await chat.conversation(ME, WORLD_CONVERSATION))!.messages.some((m) => m.author?.address === talker)).toBe(true);
    await expect(chat.mute(ME, ME)).rejects.toEqual(refused("self"));
    await expect(chat.mute(ME, "0xdead")).rejects.toEqual(refused("unknown-player"));
    await social.follows!.block(ME, talker);
    expect((await allOf(chat, ME, WORLD_CONVERSATION)).some((m) => m.author?.address === talker)).toBe(false);
  });

  it("counts its unread lines but never badges them", async () => {
    const { chat } = world();
    const overview = await chat.overview(ME);
    expect(overview.conversations.map((c) => c.kind)).toEqual(["world"]);
    expect(overview.conversations[0]!.unread).toBeGreaterThan(0);
    expect(overview.badge).toBe(0);
    await chat.markRead(ME, WORLD_CONVERSATION);
    expect((await chat.overview(ME)).conversations[0]!.unread).toBe(0);
  });
});

describe("a guild's conversation on the mock (#955)", () => {
  const quarry = () => seededGuildWorld().guilds.find((g) => g.name === "The Quarrymen")!;

  it("is for its members only: its community's lines, its log's events and its latest announcement pinned", async () => {
    const { chat, social } = world();
    const g = quarry();
    const id = guildConversation(g.id);
    expect(await chat.conversation(ME, id)).toBeNull();
    await expect(chat.send(ME, id, "hi")).rejects.toEqual(refused("not-in-guild"));
    await social.joinGuild(ME, g.id);
    const page = (await chat.conversation(ME, id))!;
    expect(page.pinned).toMatchObject({ text: g.announcements[0]!.text });
    const members = new Set(g.members.map((m) => m.address));
    const said = page.messages.filter((m) => m.kind === "message");
    expect(said.length).toBeGreaterThan(5);
    for (const m of said) expect(members.has(m.author!.address)).toBe(true);
    // The player's own join is a line of the conversation.
    expect(page.messages.at(-1)).toMatchObject({ kind: "event", author: null, event: expect.objectContaining({ kind: "joined", actor: ME }) });
    // A member at any level may write; the overview lists it after the World.
    expect(await chat.send(ME, id, "hello quarry")).toMatchObject({ mine: true });
    expect((await chat.overview(ME)).conversations.map((c) => c.kind)).toEqual(["world", "guild"]);
    // A member deletes no one else's line.
    await expect(chat.deleteMessage(ME, id, said.at(-1)!.id)).rejects.toEqual(refused("not-author"));
  });

  it("lets an officer or the leader delete a message of a member below them, not of one at or above", async () => {
    const { chat, social } = world();
    const gid = await social.createGuild(ME, draft());
    const id = guildConversation(gid);
    await social.joinGuild(OTHER, gid);
    await social.joinGuild(THIRD, gid);
    await social.promote(ME, OTHER);
    const lead = await chat.send(ME, id, "from the leader");
    const officer = await chat.send(OTHER, id, "from the officer");
    const member = await chat.send(THIRD, id, "from a member");
    expect((await chat.conversation(OTHER, id))!.messages.find((m) => m.id === member.id)!.mayDelete).toBe(true);
    expect((await chat.conversation(OTHER, id))!.messages.find((m) => m.id === lead.id)!.mayDelete).toBe(false);
    await expect(chat.deleteMessage(OTHER, id, lead.id)).rejects.toEqual(refused("rank-not-above"));
    await expect(chat.deleteMessage(THIRD, id, officer.id)).rejects.toEqual(refused("not-author"));
    await chat.deleteMessage(OTHER, id, member.id);
    await chat.deleteMessage(ME, id, officer.id);
    const shown = (await chat.conversation(THIRD, id))!.messages;
    expect(shown.find((m) => m.id === member.id)).toMatchObject({ deleted: true, text: "" });
    expect(shown.find((m) => m.id === officer.id)).toMatchObject({ deleted: true });
    expect(shown.find((m) => m.id === lead.id)).toMatchObject({ deleted: false });
    // The promotion is a line of the conversation.
    expect(shown.some((m) => m.event?.kind === "promoted" && m.event.target === OTHER)).toBe(true);
    expect((await social.playerGuild(OTHER)).guild!.rank).toBe(GUILD_RANK.officer);
  });

  it("hides a muted member's messages there, and badges what the player has not read", async () => {
    const { chat, social, clock } = world();
    const gid = await social.createGuild(ME, draft());
    const id = guildConversation(gid);
    await social.joinGuild(OTHER, gid);
    clock.now += 1;
    await chat.send(OTHER, id, "one");
    clock.now += 2;
    await chat.send(OTHER, id, "two");
    expect((await chat.overview(ME)).badge).toBe(2);
    await chat.mute(ME, OTHER);
    expect((await chat.conversation(ME, id))!.messages.some((m) => m.kind === "message")).toBe(false);
    expect((await chat.overview(ME)).badge).toBe(0);
    await chat.unmute(ME, OTHER);
    await chat.markRead(ME, id);
    expect((await chat.overview(ME)).badge).toBe(0);
  });
});

describe("private conversations on the mock (#955)", () => {
  it("with a friend: open at once, answered a few seconds later", async () => {
    const { chat, social, clock } = world();
    await social.follows!.follow(ME, backer);
    clock.now += 10;
    expect((await social.follows!.status(ME, backer)).friend).toBe(true);
    const id = privateConversation(ME, backer);
    const before = (await chat.conversation(ME, id))!;
    expect(before).toMatchObject({ standing: "open", awaitsReply: false, writeRefusal: null, messages: [] });
    await chat.send(ME, id, "hello friend");
    clock.now += MOCK_REPLY_MIN_S - 1;
    expect((await chat.conversation(ME, id))!.messages).toHaveLength(1);
    clock.now += 6;
    const after = (await chat.conversation(ME, id))!.messages;
    expect(after).toHaveLength(2);
    expect(after[1]).toMatchObject({ mine: false, author: expect.objectContaining({ address: backer }) });
    const overview = await chat.overview(ME);
    expect(overview.conversations.map((c) => c.id)).toEqual([WORLD_CONVERSATION, id]);
    expect(overview.conversations[1]).toMatchObject({ unread: 1, other: expect.objectContaining({ address: backer }) });
    expect(overview.badge).toBe(1);
    // The other's message the player may report, not delete; a mute leaves private messages be.
    expect(after[1]).toMatchObject({ mayReport: true, mayDelete: false });
    await chat.mute(ME, backer);
    expect((await chat.conversation(ME, id))!.messages).toHaveLength(2);
  });

  it("to a stranger: it waits in their Requests, and is refused once they declined", async () => {
    const { chat, store, clock } = world();
    levelUp(store, 1, ME, OTHER);
    const id = privateConversation(OTHER, ME);
    await chat.send(OTHER, id, "hi, nice village");
    expect((await chat.conversation(OTHER, id))!).toMatchObject({ standing: "open", awaitsReply: true });
    const waiting = await chat.overview(ME);
    expect(waiting.conversations.map((c) => c.id)).toEqual([WORLD_CONVERSATION]);
    expect(waiting.requests.map((c) => c.id)).toEqual([id]);
    expect(waiting.badge).toBe(1);
    expect((await chat.conversation(ME, id))!.standing).toBe("request");
    await chat.answerRequest(ME, id, false);
    const declined = await chat.overview(ME);
    expect(declined.requests).toEqual([]);
    expect(declined.badge).toBe(0);
    clock.now += 5;
    await expect(chat.send(OTHER, id, "hello?")).rejects.toEqual(refused("declined"));
    await expect(chat.answerRequest(ME, id, true)).rejects.toEqual(refused("not-a-request"));
  });

  it("from a stranger, accepted or answered: it opens", async () => {
    const { chat, store, clock } = world();
    levelUp(store, 1, ME, OTHER, THIRD);
    const a = privateConversation(OTHER, ME);
    const b = privateConversation(THIRD, ME);
    await chat.send(OTHER, a, "hi");
    await chat.send(THIRD, b, "hey");
    await chat.answerRequest(ME, a, true);
    clock.now += 3;
    await chat.send(ME, b, "hello back");
    const overview = await chat.overview(ME);
    expect(overview.requests).toEqual([]);
    expect(overview.conversations.map((c) => c.id).sort()).toEqual([WORLD_CONVERSATION, a, b].sort());
    expect((await chat.conversation(OTHER, a))!.awaitsReply).toBe(false);
  });

  it("from the mock's stranger, a request comes after the first visit to the Chat tab", async () => {
    const { chat, clock } = world();
    await chat.visitChat(ME);
    clock.now += MOCK_REQUEST_S - 1;
    expect((await chat.overview(ME)).requests).toEqual([]);
    clock.now += 1;
    const [request] = (await chat.overview(ME)).requests;
    expect(request).toMatchObject({ kind: "private", unread: 1, other: expect.objectContaining({ address: expect.stringMatching(/^0x/) }) });
    // A second visit brings no second request.
    await chat.visitChat(ME);
    clock.now += MOCK_REQUEST_S * 2;
    expect((await chat.overview(ME)).requests).toHaveLength(1);
    expect((await chat.overview(ME)).noticeSeen).toBe(false);
    await chat.seeNotice(ME);
    expect((await chat.overview(ME)).noticeSeen).toBe(true);
  });

  it("is refused across a block, either way, never naming the block to the blocked player", async () => {
    const { chat, social } = world();
    const id = privateConversation(ME, stranger);
    await social.follows!.block(ME, stranger);
    expect((await chat.conversation(ME, id))!.writeRefusal).toBe("blocking");
    await expect(chat.send(ME, id, "hi")).rejects.toEqual(refused("blocking"));
    await social.follows!.unblock(ME, stranger);
    await expect(chat.send(ME, id, "hi")).resolves.toMatchObject({ mine: true });
  });

  it("is only its two players', of a player the mock knows", async () => {
    const { chat } = world();
    expect(await chat.conversation(THIRD, privateConversation(ME, stranger))).toBeNull();
    await expect(chat.send(ME, privateConversation(ME, "0xdead"), "hi")).rejects.toEqual(refused("unknown-player"));
    await expect(chat.send(THIRD, privateConversation(ME, stranger), "hi")).rejects.toEqual(refused("not-yours"));
    await expect(chat.send(ME, "nowhere", "hi")).rejects.toEqual(refused("not-found"));
  });
});

describe("the mock's subscriptions (#955)", () => {
  it("deliver the community's lines when due, the player's own at once, and stop when stopped", async () => {
    vi.useFakeTimers({ now: T0 * 1000, toFake: ["setTimeout", "clearTimeout", "Date"] });
    const { chat, store } = world(T0, () => Date.now() / 1000);
    levelUp(store, 2, ME);
    const heard: ChatEvent[] = [];
    const stop = chat.subscribe(ME, WORLD_CONVERSATION, (e) => heard.push(e));
    await vi.advanceTimersByTimeAsync(10 * WORLD_SLOT_S * 1000);
    const drawn = heard.filter((e) => e.type === "message");
    expect(drawn.length).toBeGreaterThan(0);
    for (const e of drawn) if (e.type === "message") expect(e.message.at).toBeGreaterThan(T0);
    // What came is what a read finds.
    const ids = new Set((await chat.conversation(ME, WORLD_CONVERSATION))!.messages.map((m) => m.id));
    for (const e of drawn) if (e.type === "message") expect(ids.has(e.message.id)).toBe(true);
    heard.length = 0;
    const sent = await chat.send(ME, WORLD_CONVERSATION, "live");
    expect(heard).toEqual([{ type: "message", message: expect.objectContaining({ id: sent.id, mine: true }) }]);
    await chat.deleteMessage(ME, WORLD_CONVERSATION, sent.id);
    expect(heard.at(-1)).toEqual({ type: "deleted", conversation: WORLD_CONVERSATION, id: sent.id });
    stop();
    heard.length = 0;
    await vi.advanceTimersByTimeAsync(10 * WORLD_SLOT_S * 1000);
    expect(heard).toEqual([]);
  });

  it("bring a private answer, and every conversation's news to the overview's subscriber", async () => {
    vi.useFakeTimers({ now: T0 * 1000, toFake: ["setTimeout", "clearTimeout", "Date"] });
    const { chat } = world(T0, () => Date.now() / 1000);
    const id = privateConversation(ME, stranger);
    const heard: ChatEvent[] = [];
    const stop = chat.subscribe(ME, id, (e) => heard.push(e));
    const all: ChatEvent[] = [];
    const stopAll = chat.subscribe(ME, null, (e) => all.push(e));
    await chat.send(ME, id, "hello");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(heard.map((e) => e.type === "message" && e.message.mine)).toEqual([true, false]);
    expect(all.some((e) => e.type === "message" && e.message.conversation === id && !e.message.mine)).toBe(true);
    stop();
    stopAll();
  });
});

describe("the chat hooks (#955)", () => {
  it("answer unavailable without a chat source", () => {
    const { result } = renderData(() => ({ overview: useChatOverview(ME), conversation: useConversation(ME, WORLD_CONVERSATION), writes: useChatWrites(ME) }), fakeSources().sources);
    expect(result.current.overview).toMatchObject({ unavailable: true, data: undefined, isPending: false });
    expect(result.current.conversation).toMatchObject({ unavailable: true, messages: [] });
    expect(result.current.writes.unavailable).toBe(true);
  });

  it("read the overview and a conversation, load the older pages, and show a write at once", async () => {
    const { social, store } = world();
    levelUp(store, 2, ME);
    const { sources } = fakeSources({ social });
    const { result } = renderData(() => ({ overview: useChatOverview(ME), conversation: useConversation(ME, WORLD_CONVERSATION), writes: useChatWrites(ME), mutes: useChatMutes(ME) }), sources);
    await waitFor(() => expect(result.current.overview.data?.conversations[0]?.kind).toBe("world"));
    await waitFor(() => expect(result.current.conversation.messages.length).toBeGreaterThan(0));
    const first = result.current.conversation.messages.length;
    expect(result.current.conversation.data).toMatchObject({ writeRefusal: null, standing: null });
    expect(result.current.conversation.hasOlder).toBe(true);
    act(() => result.current.conversation.loadOlder());
    await waitFor(() => expect(result.current.conversation.messages.length).toBeGreaterThan(first));
    const ats = result.current.conversation.messages.map((m) => m.at);
    expect(ats).toEqual([...ats].sort((a, b) => a - b));
    await act(() => result.current.writes.run((c, me) => c.send(me, WORLD_CONVERSATION, "from the hook")));
    await waitFor(() => expect(result.current.conversation.messages.at(-1)?.text).toBe("from the hook"));
    expect(result.current.mutes.data).toEqual([]);
  });

  it("keep a refusal with its reason and when to retry, and make the player's chat reads stale", async () => {
    const { social, store } = world();
    levelUp(store, 2, ME);
    const { sources } = fakeSources({ social });
    const { result, client } = renderData(() => useChatWrites(ME), sources);
    await act(() => result.current.run((c, me) => c.send(me, WORLD_CONVERSATION, "one")));
    const spy = vi.spyOn(client, "invalidateQueries");
    await act(() => result.current.run((c, me) => c.send(me, WORLD_CONVERSATION, "two")).catch(() => undefined));
    await waitFor(() => expect(result.current.refusal).toBe("too-fast"));
    expect(result.current.retryAt).toBe(T0 + CHAT_WORLD_INTERVAL_S);
    expect(chatRefusal(result.current.error)).toBe("too-fast");
    expect(spy).toHaveBeenCalledWith({ queryKey: chatKeys.all(ME) });
  });
});
