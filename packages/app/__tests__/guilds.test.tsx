import { act, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GUILD_INVITE_TTL_S, GUILD_KICK_COOLDOWN_S, GUILD_LEADER_IDLE_S, GUILD_LOG_KEPT, GUILD_RANK, guildTag, type GuildDraft } from "@paved/game-core";
import { guildKeys, guildRefusal, useGuild, useGuildBadge, useGuildRanking, useGuildSearch, useGuildWrites, usePlayerGuild, useSuggestedGuilds } from "../src/data/guilds";
import { community } from "../src/data/mock/community";
import { MOCK_ACCEPT_S, MOCK_INVITATION_S, MOCK_INVITE_ANSWER_S, MOCK_SEED_REQUEST_S, seededGuildWorld } from "../src/data/mock/guilds";
import { MockLedger, MOCK_KEY } from "../src/data/mock/ledger";
import { mockSocial } from "../src/data/mock/overlay";
import { GuildRefusedError, guildSource, type GuildSource, type SocialSource } from "../src/data/social-source";
import { fakeSources, memoryStore, renderData } from "./data-fakes";

// The guilds on the mock (#953): the seeded world, the flows of the acceptance on the ledger (create, join, request, invite,
// ranks, kicks, leaving, announcements), what the mock's community does when due, and the guild hooks.

/** 2026-10-31 12:00 UTC. */
const T0 = 1_793_448_000;

/** A device's player, outside the community. */
const ME = "0xabc001";
const OTHER = "0xabc002";

/** A ledger on its own store, its clock in `clock.now` (seconds). */
function world(start = T0) {
  const store = memoryStore();
  const clock = { now: start };
  const ledger = new MockLedger({ store: () => store, seller: "0x3", latencyMs: 0, now: () => clock.now });
  return { ledger, store, clock, guilds: mockSocial(ledger) as SocialSource & GuildSource };
}

const draft = (over: Partial<GuildDraft> = {}): GuildDraft => ({ name: "Stone Road", emblem: { icon: 1, primary: 2, secondary: 3 }, description: "We pave.", joinType: "open", requirements: { level: 0, crowns: 0 }, ...over });
const refused = (reason: string) => expect.objectContaining({ name: "GuildRefusedError", reason });
const byName = (name: string) => seededGuildWorld().guilds.find((g) => g.name === name)!;
/** A community player in no seeded guild. */
const guildless = () => community().filter((m) => !seededGuildWorld().guilds.some((g) => g.members.some((x) => BigInt(x.address) === BigInt(m.address))));

describe("the mock's seeded guilds (#953)", () => {
  it("are six guilds of the community with every join type, and leave some players in none", () => {
    const w = seededGuildWorld();
    expect(w.guilds).toHaveLength(6);
    expect(new Set(w.guilds.map((g) => g.settings.joinType))).toEqual(new Set(["open", "request", "invite"]));
    const members = w.guilds.flatMap((g) => g.members.map((m) => m.address));
    expect(new Set(members).size).toBe(members.length);
    expect(guildless().length).toBeGreaterThanOrEqual(6);
    for (const g of w.guilds) {
      expect(g.members.filter((m) => m.rank === GUILD_RANK.leader)).toHaveLength(1);
      expect(g.log[0]!.kind).toBe("created");
      expect(g.settings.description.length).toBeLessThanOrEqual(150);
    }
    expect(seededGuildWorld()).toEqual(w);
  });

  it("are served by score, found by name or tag, and suggested by what the player may join", async () => {
    const { guilds } = world();
    const ranking = await guilds.guildRanking();
    expect(ranking.map((g) => g.score)).toEqual([...ranking.map((g) => g.score)].sort((a, b) => b - a));
    expect((await guilds.searchGuilds({ query: "oak" })).map((g) => g.name)).toEqual(["Hollow Oak"]);
    const quay = byName("Iron Quay Wardens");
    expect((await guilds.searchGuilds({ query: guildTag(quay.id) })).map((g) => g.name)).toEqual([quay.name]);
    expect((await guilds.searchGuilds({ query: "", joinType: "request" })).map((g) => g.joinType)).toEqual(["request", "request"]);
    // A new player (level 1, no crowns): the open guilds without requirements only.
    expect((await guilds.searchGuilds({ query: "", meetsFor: ME })).every((g) => g.requirements.level <= 1 && g.requirements.crowns === 0)).toBe(true);
    const suggested = await guilds.suggestedGuilds(ME);
    expect(suggested.map((g) => g.name).sort()).toEqual(["Ashford Lanterns", "The Quarrymen"]);
    expect(suggested.map((g) => g.active)).toEqual([...suggested.map((g) => g.active)].sort((a, b) => b - a));
  });

  it("show a member's guild on their profile, and none for a guildless player", async () => {
    const { guilds } = world();
    const quarry = byName("The Quarrymen");
    const leader = quarry.members[0]!.address;
    expect(await guilds.guildOf(leader)).toMatchObject({ id: quarry.id, name: "The Quarrymen", rank: GUILD_RANK.leader });
    expect(await guilds.guildOf(guildless()[0]!.address)).toBeNull();
    expect(await guilds.guildOf(ME)).toBeNull();
  });

  it("show outsiders the card and the members, not the announcements, the log or the requests", async () => {
    const { guilds } = world();
    const oak = byName("Hollow Oak");
    const page = (await guilds.guild(oak.id, ME))!;
    expect(page.roster).toHaveLength(oak.members.length);
    expect(page.roster[0]!.rank).toBe(GUILD_RANK.leader);
    expect(page).toMatchObject({ rank: null, announcements: null, log: null, requests: null, invitations: null, nextKickAt: null });
    expect(await guilds.guild(1, ME)).toBeNull();
  });
});

describe("creating a guild on the mock (#953)", () => {
  it("creates one of each join type, its creator its Leader", async () => {
    for (const joinType of ["open", "request", "invite"] as const) {
      const { guilds } = world();
      const id = await guilds.createGuild(ME, draft({ joinType }));
      const mine = await guilds.playerGuild(ME);
      expect(mine.guild).toMatchObject({ id, tag: guildTag(id), name: "Stone Road", joinType, members: 1, rank: GUILD_RANK.leader, requests: [], invitations: [] });
      expect(mine.guild!.log!.map((e) => e.kind)).toEqual(["created"]);
    }
  });

  it("refuses a taken name whatever the case, a player in a guild, and invalid settings", async () => {
    const { guilds } = world();
    await expect(guilds.createGuild(ME, draft({ name: "hollow  OAK" }))).rejects.toEqual(refused("name-taken"));
    await expect(guilds.createGuild(ME, draft({ name: "No!" }))).rejects.toEqual(refused("name-chars"));
    await expect(guilds.createGuild(ME, draft({ description: "x".repeat(151) }))).rejects.toEqual(refused("description-length"));
    await guilds.createGuild(ME, draft());
    await expect(guilds.createGuild(ME, draft({ name: "Second Road" }))).rejects.toBeInstanceOf(GuildRefusedError);
    await expect(guilds.createGuild(OTHER, draft({ name: " stone road " }))).rejects.toEqual(refused("name-taken"));
  });

  it("keeps the world on the device: another ledger on the same store reads it", async () => {
    const { guilds, store, clock } = world();
    const id = await guilds.createGuild(ME, draft());
    expect(store.getItem(MOCK_KEY)).toContain("Stone Road");
    const again = mockSocial(new MockLedger({ store: () => store, seller: "0x3", latencyMs: 0, now: () => clock.now })) as SocialSource & GuildSource;
    expect((await again.playerGuild(ME)).guild?.id).toBe(id);
  });

  it("lets the leader alone edit the settings, logged", async () => {
    const { guilds } = world();
    await guilds.createGuild(ME, draft());
    await guilds.editGuild(ME, { ...draft(), joinType: "invite", description: "By invitation." });
    const g = (await guilds.playerGuild(ME)).guild!;
    expect(g).toMatchObject({ joinType: "invite", description: "By invitation." });
    expect(g.log!.at(-1)!.kind).toBe("settings");
  });
});

describe("joining on the mock (#953)", () => {
  it("joins an Open guild at once", async () => {
    const { guilds } = world();
    const quarry = byName("The Quarrymen");
    await guilds.joinGuild(ME, quarry.id);
    const g = (await guilds.playerGuild(ME)).guild!;
    expect(g).toMatchObject({ id: quarry.id, rank: GUILD_RANK.member, members: quarry.members.length + 1 });
    expect(g.log!.at(-1)).toMatchObject({ kind: "joined", actor: ME });
    // A member: the announcements and the log, not the requests.
    expect(g.announcements!.length).toBeGreaterThan(0);
    expect(g.requests).toBeNull();
  });

  it("shows why a player cannot join: requirements, join type, a guild already", async () => {
    const { guilds } = world();
    await expect(guilds.joinGuild(ME, byName("Thistle Watch").id)).rejects.toEqual(refused("level-low"));
    await expect(guilds.joinGuild(ME, byName("Hollow Oak").id)).rejects.toEqual(refused("by-request"));
    await expect(guilds.joinGuild(ME, byName("Iron Quay Wardens").id)).rejects.toEqual(refused("invite-only"));
    await expect(guilds.requestToJoin(ME, byName("Hollow Oak").id, "")).rejects.toEqual(refused("level-low"));
    await expect(guilds.joinGuild(ME, 1)).rejects.toEqual(refused("not-found"));
    await guilds.joinGuild(ME, byName("The Quarrymen").id);
    await expect(guilds.joinGuild(ME, byName("Ashford Lanterns").id)).rejects.toEqual(refused("in-guild"));
  });

  it("refuses a full guild", async () => {
    const { guilds } = world();
    const id = await guilds.createGuild(ME, draft());
    // 49 device players join: 50 members.
    for (let i = 1; i < 50; i++) await guilds.joinGuild(`0xbee${i.toString(16).padStart(3, "0")}`, id);
    expect((await guilds.playerGuild(ME)).guild!.members).toBe(50);
    await expect(guilds.joinGuild(OTHER, id)).rejects.toEqual(refused("full"));
    expect((await guilds.suggestedGuilds(OTHER)).some((g) => g.id === id)).toBe(false);
  });

  it("sends a request with a message, one at a time, cancels it; the community's guild accepts it a few seconds later", async () => {
    const { guilds, clock } = world();
    const millstone = byName("Order of the Millstone");
    // A new player has no crowns: the Millstone asks 100. A seeded By-request guild with no requirement: none; one is made.
    await expect(guilds.requestToJoin(ME, millstone.id, "")).rejects.toEqual(refused("crowns-low"));
    const id = await guilds.createGuild(OTHER, draft({ joinType: "request" }));
    await guilds.requestToJoin(ME, id, "Let me in");
    await expect(guilds.requestToJoin(ME, id, "Again")).rejects.toEqual(refused("request-pending"));
    expect((await guilds.playerGuild(ME)).request).toMatchObject({ guild: { id }, message: "Let me in", sentAt: T0 });
    await guilds.cancelRequest(ME);
    expect((await guilds.playerGuild(ME)).request).toBeNull();
    await expect(guilds.cancelRequest(ME)).rejects.toEqual(refused("no-request"));
    // A device player's guild answers no request by itself: the request waits for its officers.
    await guilds.requestToJoin(ME, id, "");
    clock.now += 3_600;
    expect((await guilds.playerGuild(ME)).guild).toBeNull();
    await expect(guilds.requestToJoin(ME, byName("The Quarrymen").id, "")).rejects.toEqual(refused("open"));
  });

  it("is accepted by a community guild MOCK_ACCEPT_S after the request", async () => {
    const { guilds, clock, store } = world();
    // Hollow Oak without its requirements, as stored: the world kept on the device is the one the ledger reads.
    const w = seededGuildWorld();
    const oak = w.guilds.find((g) => g.name === "Hollow Oak")!;
    oak.settings.requirements = { level: 0, crowns: 0 };
    store.setItem(MOCK_KEY, JSON.stringify({ version: 1, players: {}, vault: { assets: "1", supply: "1" }, transactions: 0, guilds: w }));
    await guilds.requestToJoin(ME, oak.id, "I build every day");
    clock.now += MOCK_ACCEPT_S - 1;
    expect((await guilds.playerGuild(ME)).guild).toBeNull();
    clock.now += 1;
    const g = (await guilds.playerGuild(ME)).guild!;
    expect(g).toMatchObject({ id: oak.id, rank: GUILD_RANK.member });
    expect(g.log!.at(-1)).toMatchObject({ kind: "joined", actor: ME, at: T0 + MOCK_ACCEPT_S });
    expect((await guilds.playerGuild(ME)).request).toBeNull();
  });

  it("lets the officers and the leader answer requests; a guild created By request gets one from the community", async () => {
    const { guilds, clock } = world();
    const id = await guilds.createGuild(ME, draft({ joinType: "request" }));
    await guilds.requestToJoin(OTHER, id, "Hello");
    let mine = await guilds.playerGuild(ME);
    expect(mine.guild!.requests!.map((r) => r.profile.address)).toEqual([OTHER]);
    expect(mine.badge).toBe(1);
    await guilds.answerRequest(ME, OTHER, true);
    expect((await guilds.playerGuild(OTHER)).guild).toMatchObject({ id, rank: GUILD_RANK.member });
    // A member may not answer.
    await expect(guilds.answerRequest(OTHER, "0xabc003", true)).rejects.toEqual(refused("rank"));
    await expect(guilds.answerRequest(ME, "0xabc003", false)).rejects.toEqual(refused("no-request"));

    clock.now += MOCK_SEED_REQUEST_S;
    mine = await guilds.playerGuild(ME);
    expect(mine.guild!.requests).toHaveLength(1);
    const asker = mine.guild!.requests![0]!.profile.address;
    expect(guildless().some((m) => BigInt(m.address) === BigInt(asker))).toBe(true);
    await guilds.answerRequest(ME, asker, false);
    expect((await guilds.playerGuild(ME)).guild!.requests).toEqual([]);
    expect((await guilds.playerGuild(ME)).guild!.members).toBe(2);
  });
});

describe("invitations on the mock (#953)", () => {
  it("come from a seeded guild a minute after the first visit to the Guild tab, and are accepted, the requirements waived", async () => {
    const { guilds, clock } = world();
    await guilds.visitGuildTab(ME);
    clock.now += MOCK_INVITATION_S - 1;
    expect((await guilds.playerGuild(ME)).invitations).toEqual([]);
    clock.now += 1;
    const mine = await guilds.playerGuild(ME);
    expect(mine.invitations).toHaveLength(1);
    expect(mine.invitations[0]).toMatchObject({ guild: { name: "Iron Quay Wardens", joinType: "invite" }, sentAt: T0 + MOCK_INVITATION_S, expiresAt: T0 + MOCK_INVITATION_S + GUILD_INVITE_TTL_S });
    expect(mine.badge).toBe(1);
    // A second visit brings no second invitation.
    await guilds.visitGuildTab(ME);
    clock.now += 3_600;
    expect((await guilds.playerGuild(ME)).invitations).toHaveLength(1);
    await guilds.answerInvitation(ME, mine.invitations[0]!.guild.id, true);
    const g = (await guilds.playerGuild(ME)).guild!;
    expect(g).toMatchObject({ name: "Iron Quay Wardens", rank: GUILD_RANK.member });
    expect((await guilds.playerGuild(ME)).invitations).toEqual([]);
  });

  it("are sent by officers and the leader, lapse after 7 days, and from a guild need the leaving confirmed", async () => {
    const { guilds, clock } = world();
    const id = await guilds.createGuild(ME, draft({ joinType: "invite" }));
    await guilds.invite(ME, OTHER);
    await expect(guilds.invite(ME, OTHER)).rejects.toEqual(refused("invited-already"));
    expect((await guilds.playerGuild(ME)).guild!.invitations!.map((i) => i.profile.address)).toEqual([OTHER]);
    // OTHER is in a guild of their own: accepting needs the leaving confirmed, and as its leader alone it disbands.
    const theirs = await guilds.createGuild(OTHER, draft({ name: "Other Road" }));
    await expect(guilds.answerInvitation(OTHER, id, true)).rejects.toEqual(refused("in-guild"));
    await guilds.answerInvitation(OTHER, id, true, true);
    expect((await guilds.playerGuild(OTHER)).guild).toMatchObject({ id, rank: GUILD_RANK.member });
    expect(await guilds.guild(theirs, null)).toBeNull();
    // A member may not invite.
    await expect(guilds.invite(OTHER, "0xabc003")).rejects.toEqual(refused("rank"));
    await expect(guilds.invite(ME, OTHER)).rejects.toEqual(refused("member-already"));
    // Lapsed: gone from both sides.
    await guilds.invite(ME, "0xabc003");
    clock.now += GUILD_INVITE_TTL_S;
    expect((await guilds.playerGuild("0xabc003")).invitations).toEqual([]);
    await expect(guilds.answerInvitation("0xabc003", id, true)).rejects.toEqual(refused("invite-expired"));
  });

  it("are declined", async () => {
    const { guilds } = world();
    const id = await guilds.createGuild(ME, draft({ joinType: "invite" }));
    await guilds.invite(ME, OTHER);
    await guilds.answerInvitation(OTHER, id, false);
    expect((await guilds.playerGuild(OTHER)).invitations).toEqual([]);
    expect((await guilds.playerGuild(ME)).guild!.invitations).toEqual([]);
  });

  it("are accepted by a guildless player of the community a few seconds later", async () => {
    const { guilds, clock } = world();
    await guilds.createGuild(ME, draft({ joinType: "invite" }));
    const target = guildless()[0]!.address;
    await guilds.invite(ME, target);
    clock.now += MOCK_INVITE_ANSWER_S;
    const g = (await guilds.playerGuild(ME)).guild!;
    expect(g.roster.map((m) => m.profile.address)).toContain(target);
    expect(g.invitations).toEqual([]);
  });
});

/** ME leads a guild with OTHER and two more device players, all Members. */
async function guildOfFour() {
  const w = world();
  const id = await w.guilds.createGuild(ME, draft());
  for (const p of [OTHER, "0xabc003", "0xabc004"]) await w.guilds.joinGuild(p, id);
  return { ...w, id };
}

describe("ranks and kicks on the mock (#953)", () => {
  it("promotes and demotes, the leader only, logged", async () => {
    const { guilds } = await guildOfFour();
    await guilds.promote(ME, OTHER);
    expect((await guilds.guildOf(OTHER))!.rank).toBe(GUILD_RANK.officer);
    await expect(guilds.promote(OTHER, "0xabc003")).rejects.toEqual(refused("rank"));
    await expect(guilds.promote(ME, OTHER)).rejects.toEqual(refused("not-a-member"));
    await guilds.demote(ME, OTHER);
    expect((await guilds.guildOf(OTHER))!.rank).toBe(GUILD_RANK.member);
    await expect(guilds.demote(ME, OTHER)).rejects.toEqual(refused("not-an-officer"));
    await expect(guilds.promote(ME, "0xdead")).rejects.toEqual(refused("not-in-guild"));
    expect((await guilds.playerGuild(ME)).guild!.log!.slice(-2).map((e) => [e.kind, e.target])).toEqual([
      ["promoted", OTHER],
      ["demoted", OTHER],
    ]);
  });

  it("kicks with a reason; an officer Members only, once per 20 minutes", async () => {
    const { guilds, clock } = await guildOfFour();
    await guilds.promote(ME, OTHER);
    await expect(guilds.kick(OTHER, ME, "")).rejects.toEqual(refused("rank-not-above"));
    await guilds.kick(OTHER, "0xabc003", "Inactive");
    expect(await guilds.guildOf("0xabc003")).toBeNull();
    expect((await guilds.playerGuild(OTHER)).guild!.nextKickAt).toBe(T0 + GUILD_KICK_COOLDOWN_S);
    await expect(guilds.kick(OTHER, "0xabc004", "")).rejects.toEqual(refused("kick-cooldown"));
    clock.now += GUILD_KICK_COOLDOWN_S;
    await guilds.kick(OTHER, "0xabc004", "");
    // The leader kicks officers, with no wait.
    await guilds.joinGuild("0xabc003", (await guilds.guildOf(ME))!.id);
    await guilds.kick(ME, OTHER, "");
    await guilds.kick(ME, "0xabc003", "");
    const g = (await guilds.playerGuild(ME)).guild!;
    expect(g.members).toBe(1);
    expect(g.log!.filter((e) => e.kind === "kicked").map((e) => [e.actor, e.target, e.reason])).toEqual([
      [OTHER, "0xabc003", "Inactive"],
      [OTHER, "0xabc004", null],
      [ME, OTHER, null],
      [ME, "0xabc003", null],
    ]);
    await expect(guilds.kick(ME, ME, "")).rejects.toEqual(refused("self"));
  });

  it("refuses a member kicking", async () => {
    const { guilds } = await guildOfFour();
    await expect(guilds.kick(OTHER, "0xabc003", "")).rejects.toEqual(refused("rank"));
  });

  it("makes another member leader, the old leader an Officer", async () => {
    const { guilds } = await guildOfFour();
    await expect(guilds.makeLeader(OTHER, "0xabc003")).rejects.toEqual(refused("rank"));
    await guilds.makeLeader(ME, OTHER);
    expect((await guilds.guildOf(OTHER))!.rank).toBe(GUILD_RANK.leader);
    expect((await guilds.guildOf(ME))!.rank).toBe(GUILD_RANK.officer);
    expect((await guilds.playerGuild(ME)).guild!.roster.map((m) => m.rank).slice(0, 2)).toEqual([GUILD_RANK.leader, GUILD_RANK.officer]);
  });

  it("rotates the leadership after 35 days without the leader playing", async () => {
    const { guilds, clock } = await guildOfFour();
    await guilds.promote(ME, "0xabc004");
    clock.now += GUILD_LEADER_IDLE_S - 600;
    // OTHER and 0xabc004 play; the leader does not.
    await guilds.readAnnouncements("0xabc004");
    await guilds.readAnnouncements(OTHER);
    clock.now += 600;
    expect((await guilds.guildOf(ME))!.rank).toBe(GUILD_RANK.officer);
    expect((await guilds.guildOf("0xabc004"))!.rank).toBe(GUILD_RANK.leader);
    expect((await guilds.playerGuild(OTHER)).guild!.log!.at(-1)).toMatchObject({ kind: "leader", actor: "0xabc004" });
  });
});

describe("the leader's rotation, whoever reads (#953)", () => {
  it("shows every reader the same leader at one time, and the old leader acts as an Officer", async () => {
    const { guilds, clock } = world();
    const id = await guilds.createGuild(ME, draft());
    await guilds.joinGuild(OTHER, id);
    await guilds.promote(ME, OTHER);
    // OTHER plays on day 34; ME stays away until day 35.
    clock.now = T0 + 34 * 86_400;
    await guilds.readAnnouncements(OTHER);
    clock.now = T0 + GUILD_LEADER_IDLE_S;
    const reads = async () => [(await guilds.guildOf(ME))!.rank, (await guilds.playerGuild(ME)).guild!.rank, (await guilds.guild(id, OTHER))!.rank, (await guilds.guild(id, null))!.roster.find((m) => m.profile.address === OTHER)!.rank];
    expect(await reads()).toEqual([GUILD_RANK.officer, GUILD_RANK.officer, GUILD_RANK.leader, GUILD_RANK.leader]);
    // The old leader's write is checked on the rotated guild: an Officer does not kick the Leader.
    await expect(guilds.kick(ME, OTHER, "")).rejects.toEqual(refused("rank-not-above"));
    await expect(guilds.promote(ME, OTHER)).rejects.toEqual(refused("rank"));
    expect(await reads()).toEqual([GUILD_RANK.officer, GUILD_RANK.officer, GUILD_RANK.leader, GUILD_RANK.leader]);
    // Later reads agree, the rotation logged once, when it came due.
    clock.now += 5 * 86_400;
    expect(await reads()).toEqual([GUILD_RANK.officer, GUILD_RANK.officer, GUILD_RANK.leader, GUILD_RANK.leader]);
    const log = (await guilds.playerGuild(OTHER)).guild!.log!.filter((e) => e.kind === "leader");
    expect(log.map((e) => [e.actor, e.at])).toEqual([[OTHER, T0 + GUILD_LEADER_IDLE_S]]);
  });

  it("names no successor when the others are idle too, and a read by the leader counts for nothing", async () => {
    const { guilds, clock } = world();
    const id = await guilds.createGuild(ME, draft());
    await guilds.joinGuild(OTHER, id);
    clock.now = T0 + GUILD_LEADER_IDLE_S - 1;
    expect((await guilds.playerGuild(ME)).guild!.rank).toBe(GUILD_RANK.leader);
    clock.now += 1;
    // OTHER last played when they joined, at T0: idle as long as ME, so no one takes over.
    expect((await guilds.playerGuild(ME)).guild!.rank).toBe(GUILD_RANK.leader);
    // OTHER plays now: the leader's reads above did not count as playing, so the rotation is due at once.
    await guilds.readAnnouncements(OTHER);
    expect([(await guilds.guildOf(ME))!.rank, (await guilds.guildOf(OTHER))!.rank]).toEqual([GUILD_RANK.officer, GUILD_RANK.leader]);
  });
});

describe("unread announcements, guild by guild (#953)", () => {
  it("counts another guild's announcements unread after a move, whatever was read in the first", async () => {
    const { guilds, clock } = world();
    const first = await guilds.createGuild(ME, draft({ name: "First Road" }));
    const second = await guilds.createGuild(OTHER, draft({ name: "Second Road" }));
    await guilds.joinGuild("0xabc003", first);
    clock.now = T0 + 10;
    await guilds.postAnnouncement(OTHER, "Welcome to the second road.");
    clock.now = T0 + 20;
    await guilds.readAnnouncements("0xabc003");
    await guilds.leaveGuild("0xabc003");
    await guilds.joinGuild("0xabc003", second);
    const mine = await guilds.playerGuild("0xabc003");
    expect(mine.guild!.announcements!.map((a) => a.text)).toEqual(["Welcome to the second road."]);
    expect(mine.unread).toBe(1);
    expect(mine.badge).toBe(1);
    // Back to the first guild: its reads were its own.
    await guilds.readAnnouncements("0xabc003");
    expect((await guilds.playerGuild("0xabc003")).unread).toBe(0);
  });

  it("keeps a poster's earlier unread announcements unread", async () => {
    const { guilds, clock } = await guildOfFour();
    await guilds.promote(ME, OTHER);
    await guilds.postAnnouncement(OTHER, "From the officer.");
    clock.now += 60;
    await guilds.postAnnouncement(ME, "From the leader.");
    expect((await guilds.playerGuild(ME)).unread).toBe(1);
  });
});

describe("leaving on the mock (#953)", () => {
  it("lets a member leave, and the leader only after a transfer", async () => {
    const { guilds } = await guildOfFour();
    await guilds.leaveGuild(OTHER);
    expect((await guilds.playerGuild(OTHER)).guild).toBeNull();
    await expect(guilds.leaveGuild(ME)).rejects.toEqual(refused("leader-must-transfer"));
    await guilds.makeLeader(ME, "0xabc003");
    await guilds.leaveGuild(ME);
    expect(await guilds.guildOf(ME)).toBeNull();
    expect((await guilds.playerGuild("0xabc003")).guild!.log!.at(-1)).toMatchObject({ kind: "left", actor: ME });
    await expect(guilds.leaveGuild(ME)).rejects.toEqual(refused("not-in-guild"));
  });

  it("disbands the guild when its only member leaves; its name is free again", async () => {
    const { guilds } = world();
    const id = await guilds.createGuild(ME, draft());
    await guilds.leaveGuild(ME);
    expect(await guilds.guild(id, null)).toBeNull();
    expect((await guilds.searchGuilds({ query: "stone road" }))).toEqual([]);
    await expect(guilds.createGuild(ME, draft())).resolves.toBeGreaterThan(id);
  });
});

describe("announcements on the mock (#953)", () => {
  it("are posted by officers and the leader, pinned newest first, unread for the others", async () => {
    const { guilds, clock } = await guildOfFour();
    await expect(guilds.postAnnouncement(OTHER, "Hi")).rejects.toEqual(refused("rank"));
    await guilds.postAnnouncement(ME, "Raid at dusk.");
    clock.now += 60;
    await guilds.promote(ME, OTHER);
    await guilds.postAnnouncement(OTHER, "  Bring stone.  ");
    const mine = await guilds.playerGuild(ME);
    expect(mine.guild!.announcements!.map((a) => [a.text, a.author])).toEqual([
      ["Bring stone.", OTHER],
      ["Raid at dusk.", ME],
    ]);
    expect(mine.unread).toBe(1);
    expect((await guilds.playerGuild("0xabc003")).unread).toBe(2);
    expect((await guilds.playerGuild("0xabc003")).badge).toBe(2);
    await guilds.readAnnouncements("0xabc003");
    expect((await guilds.playerGuild("0xabc003")).unread).toBe(0);
    expect(mine.guild!.log!.filter((e) => e.kind === "announcement")).toHaveLength(2);
  });

  it("are edited and deleted by an officer when theirs, by the leader all", async () => {
    const { guilds } = await guildOfFour();
    await guilds.promote(ME, OTHER);
    await guilds.postAnnouncement(ME, "Leader's");
    await guilds.postAnnouncement(OTHER, "Officer's");
    const [officers, leaders] = (await guilds.playerGuild(ME)).guild!.announcements!;
    await expect(guilds.editAnnouncement(OTHER, leaders!.id, "Mine now")).rejects.toEqual(refused("not-author"));
    await expect(guilds.deleteAnnouncement(OTHER, leaders!.id)).rejects.toEqual(refused("not-author"));
    await guilds.editAnnouncement(OTHER, officers!.id, "Officer's, edited");
    await guilds.deleteAnnouncement(ME, officers!.id);
    await guilds.editAnnouncement(ME, leaders!.id, "Leader's, edited");
    expect((await guilds.playerGuild(ME)).guild!.announcements!.map((a) => [a.text, a.editedAt])).toEqual([["Leader's, edited", T0]]);
    await expect(guilds.deleteAnnouncement(ME, 999)).rejects.toEqual(refused("not-found"));
  });

  it("keep the log to its last 100 entries", async () => {
    const { guilds } = await guildOfFour();
    for (let i = 0; i < 60; i++) {
      await guilds.promote(ME, OTHER);
      await guilds.demote(ME, OTHER);
    }
    const log = (await guilds.playerGuild(ME)).guild!.log!;
    expect(log).toHaveLength(GUILD_LOG_KEPT);
    expect(log.at(-1)!.kind).toBe("demoted");
  });
});

describe("the guild hooks (#953)", () => {
  it("read the player's guild, a page, a badge, the search, the suggestions and the ranking", async () => {
    const { guilds } = world();
    const quarry = byName("The Quarrymen");
    const { result } = renderData(
      () => ({
        mine: usePlayerGuild(ME),
        page: useGuild(quarry.id, ME),
        badge: useGuildBadge(quarry.members[0]!.address),
        search: useGuildSearch({ query: "quarry" }, { delayMs: 0 }),
        suggested: useSuggestedGuilds(ME),
        ranking: useGuildRanking(),
      }),
      fakeSources({ social: guilds }).sources,
    );
    await waitFor(() => expect(Object.values(result.current).every((r) => r.data !== undefined)).toBe(true));
    expect(result.current.mine.data).toMatchObject({ guild: null, request: null, invitations: [], badge: 0 });
    expect(result.current.page.data!.name).toBe("The Quarrymen");
    expect(result.current.badge.data!.rank).toBe(GUILD_RANK.leader);
    expect(result.current.search.data!.map((g) => g.name)).toEqual(["The Quarrymen"]);
    expect(result.current.suggested.data!.length).toBeGreaterThan(0);
    expect(result.current.ranking.data).toHaveLength(6);
  });

  it("answer unavailable without a guild part, and are disabled without an ID or a player", () => {
    const plain: SocialSource = { profile: async () => null, searchPlayers: async () => [] };
    expect(guildSource(plain)).toBeNull();
    const { result } = renderData(() => [usePlayerGuild(ME), useGuildRanking(), useGuildWrites(ME)] as const, fakeSources({ social: plain }).sources);
    expect(result.current.map((r) => r.unavailable)).toEqual([true, true, true]);
    const { guilds } = world();
    const spy = vi.spyOn(guilds, "playerGuild");
    const off = renderData(() => [usePlayerGuild(null), useGuild(null, ME)] as const, fakeSources({ social: guilds }).sources);
    expect(off.result.current.map((r) => [r.isPending, r.data])).toEqual([
      [false, undefined],
      [false, undefined],
    ]);
    expect(spy).not.toHaveBeenCalled();
  });

  it("write for the player and read again what the write changed; a refusal keeps its reason", async () => {
    const { guilds } = world();
    const quarry = byName("The Quarrymen");
    const { result } = renderData(() => ({ mine: usePlayerGuild(ME), writes: useGuildWrites(ME) }), fakeSources({ social: guilds }).sources);
    await waitFor(() => expect(result.current.mine.data).toBeDefined());
    await act(() => result.current.writes.run((g, me) => g.joinGuild(me, quarry.id)));
    await waitFor(() => expect(result.current.mine.data!.guild?.id).toBe(quarry.id));
    await act(() => result.current.writes.run((g, me) => g.joinGuild(me, quarry.id)).catch(() => undefined));
    await waitFor(() => expect(result.current.writes.refusal).toBe("member-already"));
    expect(guildRefusal(new Error("down"))).toBeNull();
  });

  it("key a guild read by its arguments, addresses in one form", () => {
    expect(guildKeys.player("0x0ABC001")).toEqual(guildKeys.player(ME));
    expect(guildKeys.search({ query: "oak" })).not.toEqual(guildKeys.search({ query: "oak", joinType: "open" }));
    expect(guildKeys.page(1, null)).not.toEqual(guildKeys.page(1, ME));
    expect(guildKeys.all).toEqual(guildKeys.ranking().slice(0, 2));
  });
});
