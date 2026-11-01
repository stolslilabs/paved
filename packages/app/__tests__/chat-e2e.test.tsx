import { describe, expect, it } from "vitest";
import { guildConversation, playerKey, privateConversation, type GuildDraft } from "@paved/game-core";
import { checkCommitment, hexToBytes, openEpoch, safetyCode } from "@paved/game-core/e2e";
import { MOCK_REPLY_MIN_S, MOCK_REQUEST_S, type StoredChat, type StoredChatV1 } from "../src/data/mock/chat";
import { REPLY_LINES, REQUEST_LINES } from "../src/data/mock/chat-lines";
import { followBackDelay } from "../src/data/mock/follows";
import { seededGuildWorld } from "../src/data/mock/guilds";
import { MockLedger, MOCK_KEY, type MockChatSource } from "../src/data/mock/ledger";
import { mockSocial } from "../src/data/mock/overlay";
import { SEEDED_PLAYERS } from "../src/data/mock/players";
import type { GuildSource, SocialSource } from "../src/data/social-source";
import { memoryStore } from "./data-fakes";

// End-to-end encryption on the mock (#997, PR 1): the messaging keys and the directory, the private and guild messages stored
// sealed and opened on each read, both ways and the community's answers and requests included; the guild's epochs at each
// joining, kick and leave; the unreadable message; the reports that reveal, each commitment checked; the key's change; and
// version 1 of the stored chat sealed in place.

/** 2026-10-31 12:00 UTC. */
const T0 = 1_793_448_000;
const ME = "0xabc001";
const OTHER = "0xabc002";
const THIRD = "0xabc003";

type Social = SocialSource & GuildSource;

function world(start = T0) {
  const store = memoryStore();
  const clock = { now: start };
  const ledger = new MockLedger({ store: () => store, seller: "0x3", latencyMs: 0, now: () => clock.now });
  const social = mockSocial(ledger) as Social;
  const chat = social.chat as MockChatSource;
  /** The chat as the ledger stores it. */
  const stored = (): StoredChat => JSON.parse(store.getItem(MOCK_KEY)!).chat;
  const restore = (change: (c: StoredChat) => void) => {
    const state = JSON.parse(store.getItem(MOCK_KEY)!);
    change(state.chat);
    store.setItem(MOCK_KEY, JSON.stringify(state));
  };
  /** The same device's ledger, read afresh from its store. */
  const reopen = () => mockSocial(new MockLedger({ store: () => store, seller: "0x3", latencyMs: 0, now: () => clock.now })) as Social;
  return { ledger, store, clock, social, chat, stored, restore, reopen };
}

/** Device players known to the ledger (its stored players), so that they may write in private. */
function known(store: ReturnType<typeof memoryStore>, ...players: string[]) {
  const state = JSON.parse(store.getItem(MOCK_KEY) ?? JSON.stringify({ version: 1, players: {}, vault: { assets: "1", supply: "1" }, transactions: 0 }));
  for (const p of players)
    state.players[p] = { cobbles: 0, credits: 0, achievementsClaimed: "0", days: {}, weeks: {}, owned: {}, active: [], shares: "0", paved: "0", usdc: "0" };
  store.setItem(MOCK_KEY, JSON.stringify(state));
}

const draft = (over: Partial<GuildDraft> = {}): GuildDraft => ({ name: "Stone Road", emblem: { icon: 1, primary: 2, secondary: 3 }, description: "We pave.", joinType: "open", requirements: { level: 0, crowns: 0 }, ...over });
const backer = SEEDED_PLAYERS.find((p) => followBackDelay(ME, p.address) !== null)!.address;
const refused = (reason: string) => expect.objectContaining({ name: "ChatRefusedError", reason });
const messagesOf = async (chat: MockChatSource, player: string, id: string) => (await chat.conversation(player, id))!.messages.filter((m) => m.kind === "message");

describe("private messages, sealed end to end (#997)", () => {
  it("go both ways between two device players, and the stored state holds none of their texts", async () => {
    const { chat, store, clock, stored } = world();
    known(store, ME, OTHER);
    const id = privateConversation(ME, OTHER);
    await chat.send(ME, id, "the secret is under the third cobble");
    await chat.answerRequest(OTHER, id, true);
    clock.now += 3;
    await chat.send(OTHER, id, "thanks, keep it between us");
    for (const viewer of [ME, OTHER]) expect((await messagesOf(chat, viewer, id)).map((m) => m.text)).toEqual(["the secret is under the third cobble", "thanks, keep it between us"]);
    const raw = JSON.stringify(stored());
    expect(raw).not.toContain("third cobble");
    expect(raw).not.toContain("between us");
    for (const m of stored().messages[id]!) {
      expect(m.text).toBeUndefined();
      expect(m.sealed).toMatchObject({ header: { conversation: id, sender: m.author, at: m.at }, nonce: expect.stringMatching(/^[0-9a-f]{48}$/) });
    }
    // Each sender's counter, from 1.
    expect(stored().messages[id]!.map((m) => m.sealed!.header.counter)).toEqual([1, 1]);
  });

  it("are answered by the community, whose answers and requests are stored sealed too", async () => {
    const { chat, social, clock, stored } = world();
    await social.follows!.follow(ME, backer);
    clock.now += 10;
    const id = privateConversation(ME, backer);
    await chat.send(ME, id, "hello friend");
    clock.now += MOCK_REPLY_MIN_S + 6;
    const [, reply] = await messagesOf(chat, ME, id);
    expect(REPLY_LINES).toContain(reply!.text);
    await chat.visitChat(ME);
    clock.now += MOCK_REQUEST_S;
    const [request] = (await chat.overview(ME)).requests;
    expect(REQUEST_LINES).toContain(request!.last!.text);
    const raw = JSON.stringify(stored());
    for (const line of [...REPLY_LINES, ...REQUEST_LINES, "hello friend"]) expect(raw).not.toContain(line);
    // The community's key is derived from its ID, never stored: every device derives the same.
    expect(stored().keys[playerKey(backer)]).toBeUndefined();
  });

  it("open on another load of the device, from its key ring kept in the ledger's state", async () => {
    const { chat, store, clock, reopen, stored } = world();
    known(store, ME, OTHER);
    const id = privateConversation(ME, OTHER);
    await chat.send(ME, id, "persisted");
    clock.now += 1;
    expect((await messagesOf(reopen().chat as MockChatSource, OTHER, id))[0]!.text).toBe("persisted");
    expect(Object.keys(stored().keys).sort()).toEqual([ME, OTHER]);
    expect(stored().keys[ME]).toEqual([expect.objectContaining({ version: 1, secretKey: expect.stringMatching(/^[0-9a-f]{64}$/), publicKey: expect.stringMatching(/^[0-9a-f]{64}$/) })]);
  });

  it("show a message this device cannot open as unreadable, in the place of its text: a key it lacks, a changed ciphertext", async () => {
    const { chat, store, clock, restore } = world();
    known(store, ME, OTHER);
    const id = privateConversation(ME, OTHER);
    const first = await chat.send(ME, id, "first");
    clock.now += 2;
    const second = await chat.send(ME, id, "second");
    restore((c) => {
      const m = c.messages[id]!.find((x) => x.id === second.id)!;
      const ct = m.sealed!.ciphertext;
      m.sealed!.ciphertext = (ct[0] === "0" ? "1" : "0") + ct.slice(1);
    });
    const shown = await messagesOf(chat, OTHER, id);
    expect(shown.find((m) => m.id === first.id)).toMatchObject({ text: "first", unreadable: false });
    expect(shown.find((m) => m.id === second.id)).toMatchObject({ text: "", unreadable: true, deleted: false, mayReport: false });
    await expect(chat.report(OTHER, id, second.id, "spam")).rejects.toEqual(refused("not-found"));
    // The device loses OTHER's ring (another device): their history cannot be read here, and a new key is made.
    restore((c) => delete c.keys[OTHER]);
    expect((await messagesOf(chat, OTHER, id)).every((m) => m.unreadable && m.text === "")).toBe(true);
    // A commitment that does not match makes the message unreadable too.
    const { chat: c2, store: s2, restore: r2 } = world();
    known(s2, ME, OTHER);
    const sent = await c2.send(ME, id, "committed");
    r2((c) => {
      const m = c.messages[id]!.find((x) => x.id === sent.id)!;
      m.sealed!.commitment = "00".repeat(32);
    });
    expect((await messagesOf(c2, OTHER, id))[0]).toMatchObject({ unreadable: true, text: "" });
  });

  it("filter the listed words after opening, and seal the text as typed", async () => {
    const { chat, store } = world();
    known(store, ME, OTHER);
    const id = privateConversation(ME, OTHER);
    const sent = await chat.send(ME, id, "what the   fuck");
    expect(sent.text).toBe("what the •••");
    expect((await messagesOf(chat, OTHER, id))[0]!.text).toBe("what the •••");
  });

  it("say what is encrypted, with the same safety code for both players", async () => {
    const { chat, store } = world();
    known(store, ME, OTHER);
    const id = privateConversation(ME, OTHER);
    await chat.send(ME, id, "hi");
    const mine = (await chat.conversation(ME, id))!.encryption;
    const theirs = (await chat.conversation(OTHER, id))!.encryption;
    expect(mine).toMatchObject({ mode: "private", safetyCode: expect.stringMatching(/^\d{5} \d{5} \d{5} \d{5}$/), keyChanges: [] });
    expect(theirs.safetyCode).toBe(mine.safetyCode);
    expect((await chat.conversation(ME, "world"))!.encryption).toEqual({ mode: "public", safetyCode: null, keyChanges: [] });
  });
});

describe("the key's change (#997, point 10)", () => {
  it("makes a new version in the directory, lists it in the other's conversation, changes the code and keeps the history readable", async () => {
    const { chat, store, clock, stored } = world();
    known(store, ME, OTHER);
    const id = privateConversation(ME, OTHER);
    await chat.send(ME, id, "before");
    const code = (await chat.conversation(OTHER, id))!.encryption.safetyCode;
    clock.now += 5;
    await chat.rotateKeys(ME);
    expect(stored().keys[ME]!.map((k) => k.version)).toEqual([1, 2]);
    const head = (await chat.conversation(OTHER, id))!.encryption;
    expect(head.keyChanges).toEqual([{ at: T0 + 5, version: 2 }]);
    expect(head.safetyCode).not.toBe(code);
    // ME's own view lists no change of their own key.
    expect((await chat.conversation(ME, id))!.encryption.keyChanges).toEqual([]);
    clock.now += 2;
    await chat.send(ME, id, "after");
    expect(stored().messages[id]!.map((m) => m.sealed!.header)).toEqual([expect.objectContaining({ versions: expect.arrayContaining([1]) }), expect.objectContaining({ versions: expect.arrayContaining([2]) })]);
    for (const viewer of [ME, OTHER]) expect((await messagesOf(chat, viewer, id)).map((m) => m.text)).toEqual(["before", "after"]);
  });

  it("of a community player: their next answers are sealed with the new version", async () => {
    const { chat, social, clock, stored } = world();
    await social.follows!.follow(ME, backer);
    clock.now += 10;
    const id = privateConversation(ME, backer);
    await chat.rotateKeys(backer);
    expect(stored().rotations[backer]).toBe(2);
    await chat.send(ME, id, "new key?");
    clock.now += 10;
    expect((await messagesOf(chat, ME, id)).map((m) => m.unreadable)).toEqual([false, false]);
    // Both envelopes name the community player's version 2: ME's, from the directory, and their answer.
    const backerAt = id.split(":")[1] === playerKey(backer) ? 0 : 1;
    const headers = stored().messages[id]!.map((m) => m.sealed!.header);
    expect(headers).toHaveLength(2);
    for (const h of headers) expect("versions" in h && h.versions[backerAt]).toBe(2);
  });
});

describe("the guild's conversation, sealed with its epochs (#997, point 4)", () => {
  it("goes both ways between members, sealed with the epoch's key, its texts never stored", async () => {
    const { chat, social, clock, stored } = world();
    const gid = await social.createGuild(ME, draft());
    const id = guildConversation(gid);
    await social.joinGuild(OTHER, gid);
    clock.now += 1;
    await chat.send(ME, id, "raid at eight");
    clock.now += 2;
    await chat.send(OTHER, id, "see you there");
    for (const viewer of [ME, OTHER]) expect((await messagesOf(chat, viewer, id)).map((m) => m.text)).toEqual(["raid at eight", "see you there"]);
    const raw = JSON.stringify(stored());
    expect(raw).not.toContain("raid at eight");
    expect(raw).not.toContain("see you there");
    const epochs = stored().epochs[id]!;
    expect(epochs.at(-1)!.members.sort()).toEqual([ME, OTHER].sort());
    expect(stored().messages[id]!.every((m) => m.sealed && "epoch" in m.sealed.header && m.sealed.header.epoch === epochs.at(-1)!.epoch)).toBe(true);
  });

  it("starts a new epoch at each joining, kick and leave: a kicked member cannot open the next, a joiner reads from their joining on", async () => {
    const { chat, social, clock, stored } = world();
    const gid = await social.createGuild(ME, draft());
    const id = guildConversation(gid);
    await social.joinGuild(OTHER, gid);
    clock.now += 1;
    await chat.send(ME, id, "before THIRD");
    const epochOf = () => stored().epochs[id]!.at(-1)!;
    const ringOf = (player: string) => stored().keys[player]!.map((k) => ({ version: k.version, secretKey: hexToBytes(k.secretKey), publicKey: hexToBytes(k.publicKey) }));
    const beforeJoin = epochOf();
    clock.now += 60;
    await social.joinGuild(THIRD, gid);
    await chat.overview(ME);
    const joined = epochOf();
    expect(joined.epoch).toBe(beforeJoin.epoch + 1);
    expect(joined.creator).toBe(THIRD);
    expect(openEpoch(beforeJoin, THIRD, ringOf(THIRD))).toBeNull();
    expect(openEpoch(joined, THIRD, ringOf(THIRD))).not.toBeNull();
    // The joiner sees nothing from before their joining.
    expect((await messagesOf(chat, THIRD, id)).map((m) => m.text)).toEqual([]);
    clock.now += 5;
    await chat.send(ME, id, "welcome THIRD");
    expect((await messagesOf(chat, THIRD, id)).map((m) => m.text)).toEqual(["welcome THIRD"]);
    // A kick: the next epoch leaves the kicked member out.
    clock.now += 60;
    await social.kick(ME, THIRD, "");
    await chat.overview(ME);
    const kicked = epochOf();
    expect(kicked.epoch).toBe(joined.epoch + 1);
    expect(kicked.members).not.toContain(THIRD);
    expect(kicked.creator).toBe(ME);
    expect(openEpoch(kicked, THIRD, ringOf(THIRD))).toBeNull();
    expect(await chat.conversation(THIRD, id)).toBeNull();
    // A leave: the next epoch too.
    clock.now += 60;
    await social.leaveGuild(OTHER);
    await chat.overview(ME);
    const left = epochOf();
    expect(left.epoch).toBe(kicked.epoch + 1);
    expect(left.members).toEqual([ME]);
    expect(openEpoch(left, OTHER, ringOf(OTHER))).toBeNull();
    // The members who stayed read the whole history.
    expect((await messagesOf(chat, ME, id)).map((m) => m.text)).toEqual(["before THIRD", "welcome THIRD"]);
  });

  it("covers the community's members, whose keys the directory derives, and starts again when a member changes key", async () => {
    const { chat, social, stored } = world();
    const g = seededGuildWorld().guilds.find((x) => x.name === "The Quarrymen")!;
    expect(g.members.length).toBeGreaterThan(3);
    await social.joinGuild(ME, g.id);
    await chat.overview(ME);
    const id = guildConversation(g.id);
    const epoch = stored().epochs[id]!.at(-1)!;
    expect(epoch.members).toContain(ME);
    expect(epoch.members.length).toBeGreaterThan(3);
    await chat.rotateKeys(ME);
    expect(stored().epochs[id]!.at(-1)!.epoch).toBe(epoch.epoch + 1);
    expect(stored().epochs[id]!.at(-1)!.wraps[ME]!.version).toBe(2);
  });
});

describe("the review's cases (#997)", () => {
  it("makes an epoch at each leave and each rejoin, even with no chat read between them", async () => {
    const { chat, social, clock, stored } = world();
    const gid = await social.createGuild(ME, draft());
    const id = guildConversation(gid);
    await social.joinGuild(OTHER, gid);
    clock.now += 1;
    await chat.send(ME, id, "in the first epoch");
    const first = stored().epochs[id]!.at(-1)!.epoch;
    await social.leaveGuild(OTHER);
    expect(stored().epochs[id]!.at(-1)!).toMatchObject({ epoch: first + 1, members: [ME] });
    await social.joinGuild(OTHER, gid);
    expect(stored().epochs[id]!.at(-1)!.epoch).toBe(first + 2);
    await chat.overview(ME);
    expect(stored().epochs[id]!.at(-1)!).toMatchObject({ epoch: first + 2, creator: OTHER });
    expect(stored().epochs[id]!.at(-1)!.members.sort()).toEqual([ME, OTHER].sort());
  });

  it("makes an epoch at each membership change it finds since the latest, whichever write made them", async () => {
    const { chat, social, clock, stored, store } = world();
    const gid = await social.createGuild(ME, draft());
    const id = guildConversation(gid);
    await social.joinGuild(OTHER, gid);
    clock.now += 1;
    await chat.overview(ME);
    const first = stored().epochs[id]!.at(-1)!.epoch;
    // A leave at +10 and a rejoin at +20 written straight to the state, as a settle of the guilds would: no write of the chat's.
    const state = JSON.parse(store.getItem(MOCK_KEY)!);
    const g = state.guilds.guilds.find((x: { id: number }) => x.id === gid);
    const m = g.members.find((x: { address: string }) => x.address === OTHER);
    state.chat.departed = [...(state.chat.departed ?? []), { guild: gid, address: OTHER, joinedAt: m.joinedAt, leftAt: T0 + 10 }];
    m.joinedAt = T0 + 20;
    store.setItem(MOCK_KEY, JSON.stringify(state));
    clock.now = T0 + 30;
    await chat.overview(ME);
    const epochs = stored().epochs[id]!;
    expect(epochs.map((e) => e.epoch).slice(-3)).toEqual([first, first + 1, first + 2]);
    expect(epochs.at(-2)).toMatchObject({ at: T0 + 10, members: [ME] });
    expect(epochs.at(-1)!.at).toBe(T0 + 20);
    expect(epochs.at(-1)!.members.sort()).toEqual([ME, OTHER].sort());
  });

  it("refuses a sealed message stored twice under another ID, or with another time, in a guild and in private", async () => {
    const { chat, social, store, clock, restore } = world();
    known(store, ME, OTHER);
    const gid = await social.createGuild(ME, draft());
    const guild = guildConversation(gid);
    await social.joinGuild(OTHER, gid);
    clock.now += 1;
    const original = await chat.send(ME, guild, "original message");
    const dm = privateConversation(ME, OTHER);
    const said = await chat.send(ME, dm, "pay me once");
    restore((c) => {
      for (const [id, m] of [[guild, original.id], [dm, said.id]] as const) {
        const stored = c.messages[id]!.find((x) => x.id === m)!;
        c.messages[id]!.push({ ...structuredClone(stored), id: "replayed" });
        c.messages[id]!.push({ ...structuredClone(stored), id: "moved", at: stored.at + 1 });
      }
    });
    clock.now += 5;
    for (const [id, first, text] of [[guild, original.id, "original message"], [dm, said.id, "pay me once"]] as const) {
      const shown = await messagesOf(chat, OTHER, id);
      expect(shown.find((m) => m.id === first)).toMatchObject({ text, unreadable: false });
      expect(shown.find((m) => m.id === "replayed")).toMatchObject({ text: "", unreadable: true });
      expect(shown.find((m) => m.id === "moved")).toMatchObject({ text: "", unreadable: true });
    }
  });

  it("lets no forged counter hide the sender's next messages: only envelopes that open move the counters", async () => {
    const { chat, social, store, clock, restore } = world();
    known(store, ME, OTHER);
    const dm = privateConversation(ME, OTHER);
    const gid = await social.createGuild(ME, draft());
    const guild = guildConversation(gid);
    await social.joinGuild(OTHER, gid);
    const sent: Record<string, string[]> = { [dm]: [], [guild]: [] };
    for (const id of [dm, guild]) {
      clock.now += 2;
      sent[id]!.push((await chat.send(ME, id, "first authentic message")).id);
      clock.now += 2;
      sent[id]!.push((await chat.send(ME, id, "second authentic message")).id);
    }
    restore((c) => {
      for (const id of [dm, guild]) c.messages[id]!.find((m) => m.id === sent[id]![0])!.sealed!.header.counter = Number.MAX_SAFE_INTEGER;
    });
    for (const id of [dm, guild]) {
      const shown = await messagesOf(chat, OTHER, id);
      expect(shown.find((m) => m.id === sent[id]![0])).toMatchObject({ text: "", unreadable: true });
      expect(shown.find((m) => m.id === sent[id]![1])).toMatchObject({ text: "second authentic message", unreadable: false });
    }
  });

  it("still sees a copy of a deleted message as a replay", async () => {
    const { chat, store, clock, restore } = world();
    known(store, ME, OTHER);
    const id = privateConversation(ME, OTHER);
    const sent = await chat.send(ME, id, "delete me");
    await chat.deleteMessage(ME, id, sent.id);
    restore((c) => {
      const stored = c.messages[id]!.find((x) => x.id === sent.id)!;
      c.messages[id]!.push({ ...structuredClone(stored), id: "copy", deleted: false });
    });
    clock.now += 1;
    const shown = await messagesOf(chat, OTHER, id);
    expect(shown.find((m) => m.id === sent.id)).toMatchObject({ deleted: true, text: "" });
    expect(shown.find((m) => m.id === "copy")).toMatchObject({ text: "", unreadable: true });
  });

  it("stops opening a guild's messages once the reader's key is gone, though their key was used before in the same process", async () => {
    const { chat, social, clock, restore, stored } = world();
    const gid = await social.createGuild(ME, draft());
    const id = guildConversation(gid);
    await social.joinGuild(OTHER, gid);
    clock.now += 1;
    await chat.send(ME, id, "guild secret");
    expect((await messagesOf(chat, OTHER, id))[0]).toMatchObject({ text: "guild secret", unreadable: false });
    const before = stored().keys[OTHER]![0]!.publicKey;
    restore((c) => delete c.keys[OTHER]);
    expect((await messagesOf(chat, OTHER, id))[0]).toMatchObject({ text: "", unreadable: true });
    // A replacement key was made, and the next epoch covers it.
    expect(stored().keys[OTHER]![0]!.publicKey).not.toBe(before);
    clock.now += 2;
    await chat.send(ME, id, "for the new key");
    expect((await messagesOf(chat, OTHER, id)).map((m) => [m.text, m.unreadable])).toEqual([
      ["", true],
      ["for the new key", false],
    ]);
  });
});

describe("reports that reveal (#997, point 7)", () => {
  it("keep the reported message and the 5 before it, decrypted, each commitment checked as a moderator will", async () => {
    const { chat, store, clock, stored } = world();
    known(store, ME, OTHER);
    const id = privateConversation(ME, OTHER);
    await chat.answerRequest(OTHER, id, true).catch(() => undefined);
    const sent = [];
    for (let i = 0; i < 8; i++) {
      clock.now += 2;
      sent.push(await chat.send(i % 2 === 0 ? OTHER : ME, id, `line ${i}`));
    }
    await chat.report(ME, id, sent[6]!.id, "scam");
    const [report] = stored().reports;
    expect(report).toMatchObject({ reporter: ME, conversation: id, message: sent[6]!.id, author: OTHER, reason: "scam" });
    expect(report!.revealed.map((r) => r.text)).toEqual(["line 1", "line 2", "line 3", "line 4", "line 5", "line 6"]);
    for (const r of report!.revealed) {
      expect(r.checked).toBe(true);
      expect(r.frankingKey).toMatch(/^[0-9a-f]{64}$/);
      expect(checkCommitment({ text: r.text, frankingKey: r.frankingKey!, conversation: id, sender: r.author, at: r.at }, r.commitment!)).toBe(true);
      expect(checkCommitment({ text: `${r.text}!`, frankingKey: r.frankingKey!, conversation: id, sender: r.author, at: r.at }, r.commitment!)).toBe(false);
    }
    // Only what the report reveals is in clear: the messages after it are not.
    const raw = JSON.stringify(stored());
    expect(raw).not.toContain("line 0");
    expect(raw).not.toContain("line 7");
  });

  it("never reach past the 5 lines before the reported one: a deleted or unreadable line in the window is left out, not replaced", async () => {
    const { chat, store, clock, stored, restore } = world();
    known(store, ME, OTHER);
    const id = privateConversation(ME, OTHER);
    const sent = [];
    for (let i = 0; i < 8; i++) {
      clock.now += 2;
      sent.push(await chat.send(i % 2 === 0 ? OTHER : ME, id, `line ${i}`));
    }
    await chat.deleteMessage(ME, id, sent[5]!.id);
    restore((c) => {
      const m = c.messages[id]!.find((x) => x.id === sent[4]!.id)!;
      m.sealed!.commitment = "00".repeat(32);
    });
    await chat.report(ME, id, sent[6]!.id, "scam");
    const [report] = stored().reports;
    // The window is lines 1 to 6; line 4 is unreadable and line 5 deleted, so they are out, and line 0 does not come in.
    expect(report!.revealed.map((r) => r.text)).toEqual(["line 1", "line 2", "line 3", "line 6"]);
    expect(JSON.stringify(stored())).not.toContain("line 0");
  });

  it("of the review's case: lines 0 to 7, line 5 deleted, line 7 reported, reveal lines 2 to 7 but 5", async () => {
    const { chat, store, clock, stored } = world();
    known(store, ME, OTHER);
    const id = privateConversation(ME, OTHER);
    const sent = [];
    for (let i = 0; i < 8; i++) {
      clock.now += 2;
      sent.push(await chat.send(i % 2 === 0 ? ME : OTHER, id, `line ${i}`));
    }
    // Line 5 is OTHER's (the odd lines are).
    await chat.deleteMessage(OTHER, id, sent[5]!.id);
    await chat.report(ME, id, sent[7]!.id, "spam");
    expect(stored().reports[0]!.revealed.map((r) => r.text)).toEqual(["line 2", "line 3", "line 4", "line 6", "line 7"]);
  });

  it("in a guild, of the messages the reporter can read", async () => {
    const { chat, social, clock, stored } = world();
    const gid = await social.createGuild(ME, draft());
    const id = guildConversation(gid);
    await social.joinGuild(OTHER, gid);
    clock.now += 1;
    const said = await chat.send(OTHER, id, "buy my cobbles at a discount");
    await chat.report(ME, id, said.id, "scam");
    expect(stored().reports[0]!.revealed).toEqual([expect.objectContaining({ id: said.id, text: "buy my cobbles at a discount", checked: true })]);
  });
});

describe("the stored chat's version 2 (#997, point 5)", () => {
  it("seals version 1's private and guild texts in place on load, keeps the World's, and converts its reports", async () => {
    const { chat, social, store, clock, stored } = world();
    known(store, ME, OTHER);
    const gid = await social.createGuild(ME, draft());
    await social.joinGuild(OTHER, gid);
    const dm = privateConversation(ME, OTHER);
    const guild = guildConversation(gid);
    const v1: StoredChatV1 = {
      version: 1,
      nextId: 4,
      messages: {
        world: [{ id: "m1", author: ME, text: "public line", at: T0 - 30, deleted: false }],
        [dm]: [
          { id: "m2", author: ME, text: "old private line", at: T0 - 20, deleted: false },
          { id: "m4", author: OTHER, text: "old answer", at: T0 - 15, deleted: false },
        ],
        [guild]: [{ id: "m3", author: OTHER, text: "old guild line", at: T0 - 10, deleted: false }],
      },
      deleted: {},
      sides: { [`${dm}|${ME}`]: { accepted: true, declined: false }, [`${dm}|${OTHER}`]: { accepted: true, declined: false } },
      reads: {},
      mutes: [],
      reports: [{ reporter: OTHER, conversation: dm, message: "m2", author: ME, text: "old private line", reason: "spam", at: T0 - 5 }],
      players: {},
    };
    const state = JSON.parse(store.getItem(MOCK_KEY)!);
    state.chat = v1;
    // The guild member since before the messages, so that its old line is theirs to read.
    for (const g of state.guilds.guilds) for (const m of g.members) if (g.id === gid) m.joinedAt = T0 - 100;
    store.setItem(MOCK_KEY, JSON.stringify(state));
    clock.now += 1;
    expect((await messagesOf(chat, OTHER, dm)).map((m) => m.text)).toEqual(["old private line", "old answer"]);
    expect((await messagesOf(chat, ME, guild)).map((m) => m.text)).toEqual(["old guild line"]);
    const now = stored();
    expect(now.version).toBe(2);
    const raw = JSON.stringify({ ...now, reports: [] });
    expect(raw).not.toContain("old private line");
    expect(raw).not.toContain("old answer");
    expect(raw).not.toContain("old guild line");
    expect(now.messages.world).toEqual(v1.messages.world);
    expect(now.reports).toEqual([expect.objectContaining({ message: "m2", revealed: [expect.objectContaining({ id: "m2", text: "old private line", checked: null })] })]);
  });
});

describe("the encryption's cost", () => {
  it("opens a page of 50 messages, the keys cached after the first read", async () => {
    const { chat, store, clock } = world();
    known(store, ME, OTHER);
    const id = privateConversation(ME, OTHER);
    for (let i = 0; i < 60; i++) {
      clock.now += 2;
      await chat.send(i % 2 === 0 ? ME : OTHER, id, `message ${i} ${"x".repeat(150)}`);
    }
    await chat.conversation(OTHER, id);
    const start = performance.now();
    const page = (await chat.conversation(OTHER, id))!;
    const ms = performance.now() - start;
    expect(page.messages).toHaveLength(50);
    expect(page.messages.every((m) => !m.unreadable)).toBe(true);
    // A loose ceiling against a regression (the PR states the measured figure); the acceptance's is 20 ms.
    expect(ms).toBeLessThan(1_000);
  });
});

it("safety codes agree with game-core's for the directory's keys", async () => {
  const { chat, store, stored } = world();
  known(store, ME, OTHER);
  const id = privateConversation(ME, OTHER);
  await chat.send(ME, id, "hi");
  const keys = stored().keys;
  expect((await chat.conversation(ME, id))!.encryption.safetyCode).toBe(safetyCode(hexToBytes(keys[ME]![0]!.publicKey), hexToBytes(keys[OTHER]![0]!.publicKey)));
});
