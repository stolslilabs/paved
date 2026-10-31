import { act, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FOLLOW_LIMIT, GUILD_RANK, ONLINE_WINDOW_S, isOnline, playerKey } from "@paved/game-core";
import type { GuildSource } from "../src/data/social-source";
import { FollowRefusedError, useFollowActions, useFollowLists, useFollowStatus, useFollowSuggestions, type FollowSource, type SocialSource } from "../src/data/social";
import { community } from "../src/data/mock/community";
import { FOLLOW_BACK_MIN_S, followBackDelay, seededFollows } from "../src/data/mock/follows";
import { MOCK_KEY, MockLedger } from "../src/data/mock/ledger";
import { MOCK_ACCEPT_S, MOCK_INVITATION_S, MOCK_INVITE_ANSWER_S, MOCK_SEED_REQUEST_S, seededGuildWorld } from "../src/data/mock/guilds";
import { mockSocial } from "../src/data/mock/overlay";
import { usePlayerGuild } from "../src/data/guilds";
import { SEEDED_PLAYERS } from "../src/data/mock/players";
import { freshV2, mockRivalsV2 } from "../src/data/mock/v2";
import { dataOf, fakeSources, memoryStore, renderData } from "./data-fakes";

// The follows, friends and blocks on the mock (#954, PR 1): the community's seeded follows, a new player's empty lists, the
// seeded players' follow backs, and each write through game-core's rules; then the hooks on the social source's `follows`.

/** 2026-10-31 12:00 UTC. */
const NOW = 1_793_448_000;
/** A player of this device, not of the community. */
const ME = "0x7e3a00ff0001";
const OTHER_ME = "0x7e3a00ff0002";

function mock(store = memoryStore()) {
  const clock = { now: NOW };
  const ledger = new MockLedger({ store: () => store, seller: "0x3", latencyMs: 0, now: () => clock.now });
  const social = mockSocial(ledger);
  return { clock, ledger, store, social, follows: social.follows! };
}

const addressesOf = (rows: readonly { profile: { address: string } }[]) => rows.map((r) => playerKey(r.profile.address));
const backers = SEEDED_PLAYERS.filter((p) => followBackDelay(ME, p.address) !== null);
const nonBackers = SEEDED_PLAYERS.filter((p) => followBackDelay(ME, p.address) === null);
const rival = mockRivalsV2()[2]!;

describe("the community's follows on the mock (#954)", () => {
  it("are seeded among its members, 3 to 6 each, never of oneself nor twice, before now", () => {
    const follows = seededFollows();
    const members = new Set(community().map((m) => playerKey(m.address)));
    for (const m of members) {
      const own = follows.filter((f) => f.follower === m);
      expect(own.length).toBeGreaterThanOrEqual(3);
      expect(own.length).toBeLessThanOrEqual(6);
      expect(new Set(own.map((f) => f.followed)).size).toBe(own.length);
      expect(own.every((f) => f.followed !== m && members.has(f.followed) && f.at < NOW)).toBe(true);
    }
    // The same at every load.
    expect(seededFollows()).toBe(follows);
  });

  it("give other players' profiles counts, and the player's lists stay their own", async () => {
    const { follows } = mock();
    const counts = await Promise.all(community().map((m) => follows.status(ME, m.address)));
    expect(counts.some((c) => c.followers > 0)).toBe(true);
    expect(counts.every((c) => c.followed >= 3)).toBe(true);
    expect(counts.every((c) => !c.following && !c.followsYou && !c.friend && !c.blocking)).toBe(true);
  });

  it("start a new player with no follows, no followers and nothing blocked", async () => {
    const { follows } = mock();
    expect(await follows.lists(ME)).toEqual({ friends: [], following: [], followers: [], newFollowers: 0, blocked: [], nextChangeAt: null });
    expect(await follows.status(ME, ME)).toMatchObject({ followers: 0, followed: 0 });
  });
});

describe("the follow back on the mock (#954, open point 4)", () => {
  it("comes from about half of the seeded players, 3 to 8 seconds later, the same each time, never from a rival", () => {
    expect(backers.length).toBeGreaterThanOrEqual(5);
    expect(nonBackers.length).toBeGreaterThanOrEqual(5);
    for (const p of backers) {
      const delay = followBackDelay(ME, p.address)!;
      expect(delay).toBeGreaterThanOrEqual(FOLLOW_BACK_MIN_S);
      expect(delay).toBeLessThanOrEqual(8);
      expect(followBackDelay(ME, p.address)).toBe(delay);
    }
    expect(mockRivalsV2().every((r) => followBackDelay(ME, r.address) === null)).toBe(true);
  });

  it("turns a follow into a friend once due, read again when due", async () => {
    const { clock, follows } = mock();
    const backer = backers[0]!;
    const delay = followBackDelay(ME, backer.address)!;
    await follows.follow(ME, backer.address);
    const before = await follows.lists(ME);
    expect(addressesOf(before.following)).toEqual([playerKey(backer.address)]);
    expect(before.friends).toEqual([]);
    expect(before.nextChangeAt).toBe(NOW + delay);
    expect(await follows.status(ME, backer.address)).toMatchObject({ following: true, followsYou: false, friend: false });

    clock.now = NOW + delay;
    const after = await follows.lists(ME);
    expect(addressesOf(after.friends)).toEqual([playerKey(backer.address)]);
    expect(after.friends[0]!.since).toBe(NOW + delay);
    expect(addressesOf(after.followers)).toEqual([playerKey(backer.address)]);
    expect(after.followers[0]!.isNew).toBe(true);
    expect(after.newFollowers).toBe(1);
    expect(after.nextChangeAt).toBeNull();
    expect(await follows.status(ME, backer.address)).toMatchObject({ following: true, followsYou: true, friend: true });
  });

  it("never comes from a player who does not follow back, nor once the player stopped following", async () => {
    const { clock, follows } = mock();
    await follows.follow(ME, nonBackers[0]!.address);
    await follows.follow(ME, rival.address);
    expect((await follows.lists(ME)).nextChangeAt).toBeNull();
    const backer = backers[0]!;
    await follows.follow(ME, backer.address);
    await follows.unfollow(ME, backer.address);
    clock.now = NOW + 60;
    const lists = await follows.lists(ME);
    expect(lists.followers).toEqual([]);
    expect(addressesOf(lists.following).sort()).toEqual([nonBackers[0]!.address, rival.address].map(playerKey).sort());
  });

  it("comes once: a removed follower does not follow back again", async () => {
    const { clock, follows } = mock();
    const backer = backers[1]!;
    await follows.follow(ME, backer.address);
    clock.now = NOW + 60;
    await follows.removeFollower(ME, backer.address);
    await follows.unfollow(ME, backer.address);
    await follows.follow(ME, backer.address);
    clock.now = NOW + 120;
    const lists = await follows.lists(ME);
    expect(lists.followers).toEqual([]);
    expect(addressesOf(lists.following)).toEqual([playerKey(backer.address)]);
  });
});

describe("the follow writes on the mock (#954)", () => {
  it("follow and unfollow, counted on the followed player's profile; twice is a no-op", async () => {
    const { follows } = mock();
    const target = nonBackers[0]!.address;
    const before = (await follows.status(ME, target)).followers;
    await follows.follow(ME, target);
    await follows.follow(ME, target);
    expect(await follows.status(ME, target)).toMatchObject({ following: true, followers: before + 1 });
    expect((await follows.lists(ME)).following).toHaveLength(1);
    await follows.unfollow(ME, target);
    await follows.unfollow(ME, target);
    expect(await follows.status(ME, target)).toMatchObject({ following: false, followers: before });
  });

  it("refuse following oneself or a player the mock does not know, with a typed reason", async () => {
    const { follows } = mock();
    await expect(follows.follow(ME, "0x1234")).rejects.toMatchObject({ reason: "unknown-player" });
    await expect(follows.block(ME, "0x1234")).rejects.toBeInstanceOf(FollowRefusedError);
    // The connected player is no member of the community: their own ID is unknown too, and the rule refuses it first for a member.
    await expect(follows.follow(ME, ME)).rejects.toMatchObject({ reason: "unknown-player" });
    const member = SEEDED_PLAYERS[0]!.address;
    await expect(follows.follow(member, member)).rejects.toMatchObject({ reason: "self" });
    expect((await follows.lists(ME)).following).toEqual([]);
  });

  it(`refuse a follow past ${FOLLOW_LIMIT}, through game-core's rule`, async () => {
    const { follows, store } = mock();
    // A state stored with the player following 500 players.
    const at = NOW - 10;
    const filler = Array.from({ length: FOLLOW_LIMIT }, (_, i) => ({ follower: playerKey(ME), followed: `0x${(0x9000 + i).toString(16)}`, at }));
    store.setItem(MOCK_KEY, JSON.stringify({ version: 1, players: {}, vault: { assets: "0", supply: "0" }, transactions: 0, follows: { follows: filler, blocks: [], seen: {}, backed: [] } }));
    await expect(follows.follow(ME, SEEDED_PLAYERS[0]!.address)).rejects.toMatchObject({ reason: "limit" });
    await follows.unfollow(ME, filler[0]!.followed);
    await expect(follows.follow(ME, SEEDED_PLAYERS[0]!.address)).resolves.toBeUndefined();
  });

  it("remove a follower, who is not told: the player's follow of them stays", async () => {
    const { clock, follows } = mock();
    const backer = backers[0]!;
    await follows.follow(ME, backer.address);
    clock.now = NOW + 60;
    await follows.removeFollower(ME, backer.address);
    const lists = await follows.lists(ME);
    expect(lists.followers).toEqual([]);
    expect(lists.friends).toEqual([]);
    expect(addressesOf(lists.following)).toEqual([playerKey(backer.address)]);
  });

  it("block: both follows end, the follow is refused both ways until unblocked, and the block is listed for the blocker alone", async () => {
    const { clock, follows } = mock();
    const backer = backers[0]!;
    await follows.follow(ME, backer.address);
    clock.now = NOW + 60;
    await follows.block(ME, backer.address);
    const lists = await follows.lists(ME);
    expect([lists.friends, lists.following, lists.followers]).toEqual([[], [], []]);
    expect(addressesOf(lists.blocked)).toEqual([playerKey(backer.address)]);
    expect(lists.blocked[0]!.since).toBe(NOW + 60);
    expect(await follows.status(ME, backer.address)).toMatchObject({ blocking: true, following: false, followsYou: false });
    await expect(follows.follow(ME, backer.address)).rejects.toMatchObject({ reason: "blocking" });

    await follows.unblock(ME, backer.address);
    expect((await follows.lists(ME)).blocked).toEqual([]);
    await follows.follow(ME, backer.address);
    expect(await follows.status(ME, backer.address)).toMatchObject({ blocking: false, following: true });
  });

  it("refuse a blocked player's follow with `blocked`, a reason the page keeps to itself, and say nothing of the block in the status", async () => {
    const { follows, store } = mock();
    const member = SEEDED_PLAYERS[2]!;
    // A state where a member blocks the player (the mock's members write nothing: a stored block stands in for one).
    store.setItem(MOCK_KEY, JSON.stringify({ version: 1, players: {}, vault: { assets: "0", supply: "0" }, transactions: 0, follows: { follows: [], blocks: [{ blocker: playerKey(member.address), blocked: playerKey(ME), at: NOW - 5 }], seen: {}, backed: [] } }));
    await expect(follows.follow(ME, member.address)).rejects.toMatchObject({ reason: "blocked" });
    expect(await follows.status(ME, member.address)).toMatchObject({ following: false, followsYou: false, blocking: false });
    expect((await follows.lists(ME)).blocked).toEqual([]);
    expect((await follows.suggestions(ME)).map((p) => playerKey(p.address))).not.toContain(playerKey(member.address));
  });

  it("stop a guild's invitation across a block, either way (#953)", async () => {
    const { follows, social, store } = mock();
    const guilds = social as SocialSource & GuildSource;
    await guilds.createGuild(ME, { name: "Stone Road", emblem: { icon: 1, primary: 2, secondary: 3 }, description: "We pave.", joinType: "open", requirements: { level: 0, crowns: 0 } });
    const [blocked, blocker, free] = [SEEDED_PLAYERS[10]!, SEEDED_PLAYERS[11]!, SEEDED_PLAYERS[12]!].map((p) => p.address);
    await follows.block(ME, blocked);
    // A member's block of the player (the mock's members write nothing: added to the stored state).
    const state = JSON.parse(store.getItem(MOCK_KEY)!);
    state.follows.blocks.push({ blocker: playerKey(blocker), blocked: playerKey(ME), at: NOW });
    store.setItem(MOCK_KEY, JSON.stringify(state));
    for (const target of [blocked, blocker]) await expect(guilds.invite(ME, target)).rejects.toMatchObject({ name: "GuildRefusedError", reason: "blocked" });
    await follows.unblock(ME, blocked);
    await expect(guilds.invite(ME, blocked)).resolves.toBeUndefined();
    await expect(guilds.invite(ME, free)).resolves.toBeUndefined();
  });

  it("hold back the mock's own guild invitation from a blocked leader while the block stands, either way (#953)", async () => {
    const leader = seededGuildWorld().guilds.find((g) => g.name === "Iron Quay Wardens")!.members.find((m) => m.rank === GUILD_RANK.leader)!.address;
    // The player blocks the leader, then opens the Guild tab.
    const { clock, follows, social } = mock();
    const guilds = social as SocialSource & GuildSource;
    await follows.block(ME, leader);
    await guilds.visitGuildTab(ME);
    clock.now += MOCK_INVITATION_S;
    expect((await guilds.playerGuild(ME)).invitations).toEqual([]);
    // A write while blocked keeps it held back.
    clock.now += 3_600;
    await guilds.readAnnouncements(ME).catch(() => undefined);
    await guilds.visitGuildTab(ME);
    expect((await guilds.playerGuild(ME)).invitations).toEqual([]);
    expect(await follows.status(ME, leader)).toMatchObject({ blocking: true });
    // Lifted, the invitation comes, with its first time.
    await follows.unblock(ME, leader);
    expect((await guilds.playerGuild(ME)).invitations.map((i) => [i.inviter, i.sentAt])).toEqual([[playerKey(leader), NOW + MOCK_INVITATION_S]]);

    // The leader's block of the player (stored: the mock's members write nothing) holds it back too.
    const other = mock();
    const otherGuilds = other.social as SocialSource & GuildSource;
    await otherGuilds.visitGuildTab(ME);
    const state = JSON.parse(other.store.getItem(MOCK_KEY)!);
    state.follows = { follows: [], blocks: [{ blocker: playerKey(leader), blocked: playerKey(ME), at: NOW }], seen: {}, backed: [] };
    other.store.setItem(MOCK_KEY, JSON.stringify(state));
    other.clock.now += MOCK_INVITATION_S;
    expect((await otherGuilds.playerGuild(ME)).invitations).toEqual([]);
  });

  it("let no community player join across a block set after the invitation or the request (#953)", async () => {
    const { clock, follows, social } = mock();
    const guilds = social as SocialSource & GuildSource;
    await guilds.createGuild(ME, { name: "Stone Road", emblem: { icon: 1, primary: 2, secondary: 3 }, description: "We pave.", joinType: "open", requirements: { level: 0, crowns: 0 } });
    const invitee = community().find((m) => !seededGuildWorld().guilds.some((g) => g.members.some((x) => playerKey(x.address) === playerKey(m.address))))!.address;
    await guilds.invite(ME, invitee);
    await follows.block(ME, invitee);
    clock.now += MOCK_INVITE_ANSWER_S;
    const mine = (await guilds.playerGuild(ME)).guild!;
    expect(mine.members).toBe(1);
    expect(mine.invitations).toEqual([]);

    // A request to a community leader's By-request guild, then a block of that leader: not accepted.
    const other = mock();
    const otherGuilds = other.social as SocialSource & GuildSource;
    // Hollow Oak without its requirements, as stored (as the guilds' own test does).
    const w = seededGuildWorld();
    const target = w.guilds.find((g) => g.name === "Hollow Oak")!;
    target.settings.requirements = { level: 0, crowns: 0 };
    other.store.setItem(MOCK_KEY, JSON.stringify({ version: 1, players: {}, vault: { assets: "1", supply: "1" }, transactions: 0, guilds: w }));
    const leader = target.members.find((m) => m.rank === GUILD_RANK.leader)!.address;
    await otherGuilds.requestToJoin(ME, target.id, "Hello");
    await other.follows.block(ME, leader);
    other.clock.now += MOCK_ACCEPT_S;
    const state = await otherGuilds.playerGuild(ME);
    expect(state.guild).toBeNull();
    expect(state.request).toBeNull();
  });

  it("never undo what the guilds did before a block, nor redo it on unblocking (#953)", async () => {
    const { clock, follows, social } = mock();
    const guilds = social as SocialSource & GuildSource;
    await guilds.createGuild(ME, { name: "Stone Road", emblem: { icon: 1, primary: 2, secondary: 3 }, description: "We pave.", joinType: "open", requirements: { level: 0, crowns: 0 } });
    const invitee = community().find((m) => !seededGuildWorld().guilds.some((g) => g.members.some((x) => playerKey(x.address) === playerKey(m.address))))!.address;
    await guilds.invite(ME, invitee);
    // Past the automatic answer, with no guild write since: the join is read, not stored yet.
    clock.now += MOCK_INVITE_ANSWER_S + 5;
    const roster = async () => (await guilds.playerGuild(ME)).guild!.roster.map((m) => playerKey(m.profile.address)).sort();
    const both = [ME, invitee].map(playerKey).sort();
    expect(await roster()).toEqual(both);
    // Blocking the member they became leaves them a member (the block judges what comes after it).
    await follows.block(ME, invitee);
    expect(await roster()).toEqual(both);
    clock.now += 60;
    expect(await roster()).toEqual(both);
    await follows.unblock(ME, invitee);
    expect(await roster()).toEqual(both);
    // The mock's invitation, received before a block of its leader.
    const other = mock();
    const otherGuilds = other.social as SocialSource & GuildSource;
    const leader = seededGuildWorld().guilds.find((g) => g.name === "Iron Quay Wardens")!.members.find((m) => m.rank === GUILD_RANK.leader)!.address;
    await otherGuilds.visitGuildTab(ME);
    other.clock.now += MOCK_INVITATION_S + 1;
    expect((await otherGuilds.playerGuild(ME)).invitations).toHaveLength(1);
    await other.follows.block(ME, leader);
    // Still pending when the block came: withdrawn, as the block ends the follows; unblocking brings it back no more.
    expect((await otherGuilds.playerGuild(ME)).invitations).toEqual([]);
    await other.follows.unblock(ME, leader);
    other.clock.now += 3_600;
    expect((await otherGuilds.playerGuild(ME)).invitations).toEqual([]);
  });

  it("send the player's guild no seeded join request from a player a block stands between (#953)", async () => {
    const draft = { name: "Stone Road", emblem: { icon: 1, primary: 2, secondary: 3 }, description: "We pave.", joinType: "request" as const, requirements: { level: 0, crowns: 0 } };
    const askerOf = async (blockFirst: string | null) => {
      const { clock, follows, social } = mock();
      const guilds = social as SocialSource & GuildSource;
      if (blockFirst) await follows.block(ME, blockFirst);
      await guilds.createGuild(ME, draft);
      clock.now += MOCK_SEED_REQUEST_S;
      return (await guilds.playerGuild(ME)).guild!.requests!.map((r) => playerKey(r.profile.address));
    };
    const [first] = await askerOf(null);
    expect(first).toBeDefined();
    const after = await askerOf(first!);
    expect(after).toHaveLength(1);
    expect(after[0]).not.toBe(first);
  });

  it("list the latest block first", async () => {
    const { clock, follows } = mock();
    await follows.block(ME, SEEDED_PLAYERS[0]!.address);
    clock.now = NOW + 5;
    await follows.block(ME, SEEDED_PLAYERS[1]!.address);
    expect(addressesOf((await follows.lists(ME)).blocked)).toEqual([SEEDED_PLAYERS[1]!.address, SEEDED_PLAYERS[0]!.address].map(playerKey));
  });

  it("mark new followers until seen", async () => {
    const { clock, follows } = mock();
    await follows.follow(ME, backers[0]!.address);
    await follows.follow(ME, backers[1]!.address);
    clock.now = NOW + 60;
    expect((await follows.lists(ME)).newFollowers).toBe(2);
    await follows.seeFollowers(ME);
    const seen = await follows.lists(ME);
    expect(seen.newFollowers).toBe(0);
    expect(seen.followers.every((r) => !r.isNew)).toBe(true);
    expect(seen.followers).toHaveLength(2);
  });

  it("order the lists by presence: online first, then the most recently seen", async () => {
    const { follows } = mock();
    for (const p of SEEDED_PLAYERS) await follows.follow(ME, p.address);
    const following = (await follows.lists(ME)).following;
    expect(following).toHaveLength(SEEDED_PLAYERS.length);
    const online = following.map((r) => isOnline(r.profile.lastSeen, NOW));
    expect(online).toEqual([...online].sort((a, b) => Number(b) - Number(a)));
    const away = following.filter((r) => !isOnline(r.profile.lastSeen, NOW)).map((r) => r.profile.lastSeen);
    expect(away).toEqual([...away].sort((a, b) => b - a));
    expect(ONLINE_WINDOW_S).toBe(300);
  });

  it("keep the follows on the device: a ledger on the same store reads them, another player's are their own", async () => {
    const a = mock();
    await a.follows.follow(ME, SEEDED_PLAYERS[4]!.address);
    await a.follows.follow(OTHER_ME, SEEDED_PLAYERS[5]!.address);
    const b = mock(a.store);
    expect(addressesOf((await b.follows.lists(ME)).following)).toEqual([playerKey(SEEDED_PLAYERS[4]!.address)]);
    expect(addressesOf((await b.follows.lists(OTHER_ME)).following)).toEqual([playerKey(SEEDED_PLAYERS[5]!.address)]);
  });

  it("go with the account it forgets, and all with Reset", async () => {
    const { ledger, follows } = mock();
    await follows.follow(ME, SEEDED_PLAYERS[4]!.address);
    await follows.follow(OTHER_ME, SEEDED_PLAYERS[5]!.address);
    // `forget` drops an account the ledger holds: the faucet's write makes the record.
    await ledger.mint(ME);
    expect(await ledger.forget(ME)).toBe(true);
    expect((await follows.lists(ME)).following).toEqual([]);
    expect((await follows.lists(OTHER_ME)).following).toHaveLength(1);
    await ledger.reset();
    expect((await follows.lists(OTHER_ME)).following).toEqual([]);
  });
});

describe("the follow suggestions on the mock (#954)", () => {
  it("put the followers not followed back first, then the recent PvP opponents, then the community, without those followed", async () => {
    const { clock, follows, store, ledger } = mock();
    const backer = backers[0]!;
    await follows.follow(ME, backer.address);
    clock.now = NOW + 60;
    await follows.unfollow(ME, backer.address);
    // The player's record with an attack that ended on a rival, and a defence against another.
    await ledger.mint(ME);
    const state = JSON.parse(store.getItem(MOCK_KEY)!);
    const [attacked, attacker] = [mockRivalsV2()[5]!, mockRivalsV2()[6]!];
    state.players[playerKey(ME)] = { ...state.players[playerKey(ME)], v2: { ...freshV2(), attacks: [{ status: "finished", defender: attacked.address, finishedAt: NOW - 100 }], defences: [{ attacker: attacker.address, finishedAt: NOW - 50 }] } };
    store.setItem(MOCK_KEY, JSON.stringify(state));
    await follows.follow(ME, SEEDED_PLAYERS[0]!.address);

    const suggested = (await follows.suggestions(ME)).map((p) => playerKey(p.address));
    expect(suggested.slice(0, 3)).toEqual([backer.address, attacker.address, attacked.address].map(playerKey));
    expect(suggested).not.toContain(playerKey(SEEDED_PLAYERS[0]!.address));
    expect(suggested).not.toContain(playerKey(ME));
    expect(suggested.length).toBe(10);
  });

  it("put the guild's members after the followers not followed back (#953)", async () => {
    const { follows, social } = mock();
    const guilds = social as SocialSource & GuildSource;
    await guilds.createGuild(ME, { name: "Stone Road", emblem: { icon: 1, primary: 2, secondary: 3 }, description: "We pave.", joinType: "open", requirements: { level: 0, crowns: 0 } });
    // A community player in no seeded guild.
    const mate = community().find((m) => !seededGuildWorld().guilds.some((g) => g.members.some((x) => playerKey(x.address) === playerKey(m.address))))!.address;
    // A community player joins: the guild's view lists them.
    const view = await guilds.playerGuild(ME);
    const id = view.guild!.id;
    await expect(guilds.joinGuild(mate, id)).resolves.toBeUndefined();
    expect((await follows.suggestions(ME)).map((p) => playerKey(p.address))[0]).toBe(playerKey(mate));
  });

  it("leave out a blocked player", async () => {
    const { follows } = mock();
    await follows.block(ME, SEEDED_PLAYERS[0]!.address);
    expect((await follows.suggestions(ME)).map((p) => playerKey(p.address))).not.toContain(playerKey(SEEDED_PLAYERS[0]!.address));
  });
});

describe("the follow hooks (#954)", () => {
  afterEach(() => vi.useRealTimers());

  it("read the lists, a player's status and the suggestions from the social source", async () => {
    const { social } = mock();
    const member = SEEDED_PLAYERS[3]!.address;
    const { result } = renderData(() => [useFollowLists(ME), useFollowStatus(ME, member), useFollowSuggestions(ME)] as const, fakeSources({ social }).sources);
    await waitFor(() => expect(result.current.every((r) => r.data !== undefined)).toBe(true));
    expect(result.current[0].data!.following).toEqual([]);
    expect(result.current[1].data).toMatchObject({ following: false });
    expect(result.current[2].data!.length).toBeGreaterThan(0);
  });

  it("answer unavailable without a follow source (the chain today, or a social source without follows)", () => {
    const bare: SocialSource = { profile: async () => null, searchPlayers: async () => [] };
    for (const sources of [fakeSources().sources, fakeSources({ social: bare }).sources]) {
      const { result } = renderData(() => ({ reads: [useFollowLists(ME), useFollowStatus(ME, ME), useFollowSuggestions(ME)], actions: useFollowActions(ME) }), sources);
      expect(result.current.reads.map((r) => [r.unavailable, r.isPending, r.data])).toEqual([
        [true, false, undefined],
        [true, false, undefined],
        [true, false, undefined],
      ]);
      expect(result.current.actions).toBeNull();
    }
  });

  it("read nothing without a connected player, and give no actions", () => {
    const lists = vi.fn(async () => ({ friends: [], following: [], followers: [], newFollowers: 0, blocked: [], nextChangeAt: null }));
    const follows = { lists } as unknown as FollowSource;
    const { result } = renderData(() => ({ lists: useFollowLists(null), actions: useFollowActions(null) }), fakeSources({ social: { profile: async () => null, searchPlayers: async () => [], follows } }).sources);
    expect(result.current.lists).toMatchObject({ isPending: false, unavailable: false, data: undefined });
    expect(result.current.actions).toBeNull();
    expect(lists).not.toHaveBeenCalled();
  });

  it("read the player's lists and the status again after a write", async () => {
    const { social } = mock();
    const member = nonBackers[0]!.address;
    const { result } = renderData(() => ({ lists: useFollowLists(ME), status: useFollowStatus(ME, member), actions: useFollowActions(ME) }), fakeSources({ social }).sources);
    await waitFor(() => expect(result.current.status.data).toBeDefined());
    await act(() => result.current.actions!.run("follow", member));
    await waitFor(() => expect(result.current.status.data?.following).toBe(true));
    expect(addressesOf(result.current.lists.data!.following)).toEqual([playerKey(member)]);
    await act(() => result.current.actions!.run("unfollow", member));
    await waitFor(() => expect(result.current.status.data?.following).toBe(false));
  });

  it("read the guilds again after a block or an unblock: a withdrawn invitation and its badge go from the mounted reads (#953)", async () => {
    const { clock, social } = mock();
    const guilds = social as SocialSource & GuildSource;
    const leader = seededGuildWorld().guilds.find((g) => g.name === "Iron Quay Wardens")!.members.find((m) => m.rank === GUILD_RANK.leader)!.address;
    await guilds.visitGuildTab(ME);
    clock.now += MOCK_INVITATION_S + 1;
    const { result } = renderData(() => ({ guild: usePlayerGuild(ME), actions: useFollowActions(ME) }), fakeSources({ social }).sources);
    await waitFor(() => expect(result.current.guild.data?.invitations).toHaveLength(1));
    expect(result.current.guild.data!.badge).toBe(1);
    await act(() => result.current.actions!.run("block", leader));
    await expect(guilds.playerGuild(ME)).resolves.toMatchObject({ invitations: [] });
    await waitFor(() => expect(result.current.guild.data!.invitations).toEqual([]), { timeout: 3000 });
    expect(result.current.guild.data!.badge).toBe(0);
    // A follow alone reads no guild again.
    const reads = vi.spyOn(guilds, "playerGuild");
    await act(() => result.current.actions!.run("follow", SEEDED_PLAYERS[0]!.address));
    expect(reads).not.toHaveBeenCalled();
    await act(() => result.current.actions!.run("unblock", leader));
    expect(reads).toHaveBeenCalled();
  });

  it("reject a refused write with its typed reason, and keep it as the error until the next", async () => {
    const { social } = mock();
    const { result } = renderData(() => useFollowActions(ME), fakeSources({ social }).sources);
    await act(() => expect(result.current!.run("follow", "0x1234")).rejects.toMatchObject({ reason: "unknown-player" }));
    await waitFor(() => expect(result.current!.error).toBeInstanceOf(FollowRefusedError));
  });

  it("clear the new followers once seen", async () => {
    const { clock, social, follows } = mock();
    await follows.follow(ME, backers[0]!.address);
    clock.now = NOW + 60;
    const { result } = renderData(() => ({ lists: useFollowLists(ME), actions: useFollowActions(ME) }), fakeSources({ social }).sources);
    await waitFor(() => expect(result.current.lists.data?.newFollowers).toBe(1));
    await act(() => result.current.actions!.seeFollowers());
    await waitFor(() => expect(result.current.lists.data?.newFollowers).toBe(0));
  });

  it("read the lists again once, when a follow back is due: no polling", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW * 1000 });
    const { clock, social } = mock();
    const lists = vi.spyOn(social.follows!, "lists");
    const backer = backers[0]!;
    const delay = followBackDelay(ME, backer.address)!;
    await social.follows!.follow(ME, backer.address);
    const { result } = renderData(() => useFollowLists(ME), fakeSources({ social }).sources);
    expect((await dataOf(result))!.nextChangeAt).toBe(NOW + delay);
    expect(lists).toHaveBeenCalledTimes(1);
    clock.now = NOW + delay + 1;
    await act(async () => void vi.advanceTimersByTime((delay + 1) * 1000 + 10));
    await waitFor(() => expect(result.current.data?.friends).toHaveLength(1));
    expect(lists).toHaveBeenCalledTimes(2);
    // Nothing more is due: no read follows.
    await act(async () => void vi.advanceTimersByTime(60_000));
    expect(lists).toHaveBeenCalledTimes(2);
  });
});
