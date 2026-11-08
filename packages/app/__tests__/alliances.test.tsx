import { act, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ALLIANCE_INVITE_TTL_S, ALLIANCE_MAX_GUILDS, GUILD_RANK, type AllianceDraft, type GuildDraft } from "@paved/game-core";
import { allianceKeys, allianceRefusal, useAlliance, useAlliancePlace, useAllianceRanking, useAllianceSearch, useAllianceWrites, useGuildAlliance, usePlayerAlliance } from "../src/data/alliances";
import { guildKeys } from "../src/data/guilds";
import { MOCK_ACCEPT_S, MOCK_INVITATION_S, MOCK_INVITE_ANSWER_S, MOCK_SEED_REQUEST_S, parseAllianceWorld, seededAllianceWorld } from "../src/data/mock/alliances";
import { seededGuildWorld } from "../src/data/mock/guilds";
import { MockLedger } from "../src/data/mock/ledger";
import { MOCKED_ALLIANCE_CALLS, mockSocial } from "../src/data/mock/overlay";
import { allianceSource, type AllianceSource, type GuildSource, type SocialSource } from "../src/data/social-source";
import { fakeSources, memoryStore, renderData } from "./data-fakes";

// The alliances on the mock (ALLIANCES): the seeded world, the flows on the ledger (create, request, invite, answer, remove, hand the
// head over, leave), what the mock's community does when due, how the guilds' changes reach the alliances, and the alliance hooks.

/** 2026-10-31 12:00 UTC. */
const T0 = 1_793_448_000;
/** Devices' players, outside the community. */
const ME = "0xabc001";
const OTHER = "0xabc002";

/** A ledger on its own store, its clock in `clock.now` (seconds). */
function world(start = T0) {
  const store = memoryStore();
  const clock = { now: start };
  const ledger = new MockLedger({ store: () => store, seller: "0x3", latencyMs: 0, now: () => clock.now });
  return { ledger, store, clock, social: mockSocial(ledger) as SocialSource & GuildSource & AllianceSource };
}

const guildDraft = (name: string): GuildDraft => ({ name, emblem: { icon: 1, primary: 2, secondary: 3 }, description: "", joinType: "open", requirements: { level: 0, crowns: 0 } });
const draft = (over: Partial<AllianceDraft> = {}): AllianceDraft => ({ name: "Road Pact", emblem: { icon: 2, primary: 1, secondary: 0 }, description: "We pave together.", ...over });
const refused = (reason: string) => expect.objectContaining({ name: "AllianceRefusedError", reason });
const guildId = (name: string) => seededGuildWorld().guilds.find((g) => g.name === name)!.id;
const STONE_PACT = 700;
const NORTHERN_ACCORD = 701;

describe("the mock's seeded alliances (ALLIANCES)", () => {
  it("are two alliances of the community's guilds, Hollow Oak in none, each with one head", () => {
    const w = seededAllianceWorld();
    expect(w.alliances.map((a) => a.name)).toEqual(["Stone Pact", "Northern Accord"]);
    const ids = w.alliances.flatMap((a) => a.guilds.map((g) => g.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain(guildId("Hollow Oak"));
    for (const a of w.alliances) expect(a.guilds.filter((g) => g.role === "head")).toHaveLength(1);
    expect(seededAllianceWorld()).toEqual(w);
    expect(parseAllianceWorld(w)).toBe(w);
    expect(parseAllianceWorld({ version: 0, alliances: [], players: {} })).toBeNull();
  });

  it("score an alliance as the sum of its guilds' scores, ranked by it, found by name", async () => {
    const { social } = world();
    const [first, second] = await social.allianceRanking();
    expect(first!.name).toBe("Northern Accord");
    const guilds = await social.guildRanking();
    const sum = (names: string[]) => names.reduce((s, n) => s + guilds.find((g) => g.name === n)!.score, 0);
    expect(first!.score).toBe(sum(["Iron Quay Wardens", "Thistle Watch"]));
    expect(second!.score).toBe(sum(["The Quarrymen", "Order of the Millstone", "Ashford Lanterns"]));
    expect(second!.members).toBe(["The Quarrymen", "Order of the Millstone", "Ashford Lanterns"].reduce((s, n) => s + guilds.find((g) => g.name === n)!.members, 0));
    expect(second!.head.name).toBe("The Quarrymen");
    expect((await social.searchAlliances("pact")).map((a) => a.name)).toEqual(["Stone Pact"]);
    expect(await social.alliancePlace(STONE_PACT)).toMatchObject({ place: 2 });
  });

  it("show a guild's alliance and its role, outsiders the page without the requests", async () => {
    const { social } = world();
    expect(await social.allianceOfGuild(guildId("The Quarrymen"))).toMatchObject({ id: STONE_PACT, role: "head" });
    expect(await social.allianceOfGuild(guildId("Ashford Lanterns"))).toMatchObject({ id: STONE_PACT, role: "member" });
    expect(await social.allianceOfGuild(guildId("Hollow Oak"))).toBeNull();
    const page = (await social.alliance(STONE_PACT, ME))!;
    expect(page.roster.map((g) => g.role)).toEqual(["head", "member", "member"]);
    expect(page).toMatchObject({ role: null, leads: false, leadsGuild: false, requests: null, invitations: null });
    expect(await social.alliance(1, ME)).toBeNull();
    expect(await social.playerAlliance(ME)).toEqual({ guild: null, alliance: null, request: null, invitations: [], badge: 0 });
  });

  it("serves every read and write of the alliance source from the ledger", () => {
    const { social } = world();
    expect(allianceSource(social)).not.toBeNull();
    for (const call of MOCKED_ALLIANCE_CALLS) expect(typeof social[call]).toBe("function");
  });
});

describe("creating and running an alliance on the mock (ALLIANCES)", () => {
  it("lets a guild's leader create one, their guild its head; refuses a member, a taken name, a second", async () => {
    const { social } = world();
    await expect(social.createAlliance(ME, draft())).rejects.toEqual(refused("not-in-guild"));
    const id = await social.createGuild(ME, guildDraft("Stone Road"));
    await social.joinGuild(OTHER, id);
    await expect(social.createAlliance(OTHER, draft())).rejects.toEqual(refused("not-leader"));
    await expect(social.createAlliance(ME, draft({ name: "stone  PACT" }))).rejects.toEqual(refused("name-taken"));
    const alliance = await social.createAlliance(ME, draft());
    await expect(social.createAlliance(ME, draft({ name: "Another" }))).rejects.toEqual(refused("in-alliance"));
    const mine = await social.playerAlliance(ME);
    expect(mine.alliance).toMatchObject({ id: alliance, name: "Road Pact", guilds: 1, role: "head", leads: true, leadsGuild: true, requests: [], invitations: [] });
    expect((await social.playerAlliance(OTHER)).alliance).toMatchObject({ id: alliance, role: "head", leads: false, leadsGuild: false, requests: null });
    await social.editAlliance(ME, { emblem: { icon: 3, primary: 0, secondary: 1 }, description: "New words." });
    expect((await social.alliance(alliance, null))!.description).toBe("New words.");
    await expect(social.editAlliance(OTHER, { emblem: { icon: 3, primary: 0, secondary: 1 }, description: "" })).rejects.toEqual(refused("not-leader"));
  });

  it("invites a guild led from the community, which accepts it a little later; the leader alone leaves and disbands", async () => {
    const { social, clock } = world();
    await social.createGuild(ME, guildDraft("Stone Road"));
    const alliance = await social.createAlliance(ME, draft());
    const oak = guildId("Hollow Oak");
    await social.inviteGuild(ME, oak);
    await expect(social.inviteGuild(ME, oak)).rejects.toEqual(refused("invited-already"));
    await expect(social.inviteGuild(ME, guildId("Thistle Watch"))).rejects.toEqual(refused("in-alliance"));
    expect((await social.alliance(alliance, ME))!.invitations!.map((i) => [i.guild.name, i.expiresAt - i.sentAt])).toEqual([["Hollow Oak", ALLIANCE_INVITE_TTL_S]]);
    clock.now += MOCK_INVITE_ANSWER_S;
    const page = (await social.alliance(alliance, ME))!;
    expect(page.roster.map((g) => [g.guild.name, g.role])).toEqual([
      ["Stone Road", "head"],
      ["Hollow Oak", "member"],
    ]);
    expect(page.invitations).toEqual([]);
    await expect(social.leaveAlliance(ME)).rejects.toEqual(refused("head-must-transfer"));
    await social.removeGuild(ME, oak);
    expect((await social.alliance(alliance, ME))!.guilds).toBe(1);
    await social.leaveAlliance(ME);
    expect(await social.alliance(alliance, ME)).toBeNull();
    expect((await social.playerAlliance(ME)).alliance).toBeNull();
  });

  it("gets a community guild's request after its creation, and answers it", async () => {
    const { social, clock } = world();
    await social.createGuild(ME, guildDraft("Stone Road"));
    const alliance = await social.createAlliance(ME, draft());
    clock.now += MOCK_SEED_REQUEST_S;
    const mine = await social.playerAlliance(ME);
    expect(mine.alliance!.requests!.map((r) => r.guild.name)).toEqual(["Hollow Oak"]);
    expect(mine.badge).toBe(1);
    await social.answerAllianceRequest(ME, guildId("Hollow Oak"), true);
    expect((await social.alliance(alliance, ME))!.roster.map((g) => g.guild.name)).toContain("Hollow Oak");
    await expect(social.answerAllianceRequest(ME, guildId("Hollow Oak"), true)).rejects.toEqual(refused("no-request"));
  });

  it("hands the head to another guild: its leader then leads, the old head's leader may leave", async () => {
    const { social } = world();
    await social.createGuild(ME, guildDraft("Stone Road"));
    const second = await social.createGuild(OTHER, guildDraft("Iron Road"));
    const alliance = await social.createAlliance(ME, draft());
    await social.inviteGuild(ME, second);
    await social.answerAllianceInvitation(OTHER, alliance, true);
    await expect(social.makeHeadGuild(OTHER, second)).rejects.toEqual(refused("not-head"));
    await social.makeHeadGuild(ME, second);
    expect((await social.alliance(alliance, OTHER))!).toMatchObject({ role: "head", leads: true });
    expect((await social.alliance(alliance, ME))!).toMatchObject({ role: "member", leads: false, leadsGuild: true });
    await social.leaveAlliance(ME);
    expect((await social.alliance(alliance, OTHER))!.guilds).toBe(1);
  });
});

describe("a guild's leader asking on the mock (ALLIANCES)", () => {
  it("asks an alliance led from the community, which takes the guild a little later; one request at a time", async () => {
    const { social, clock } = world();
    await social.createGuild(ME, guildDraft("Stone Road"));
    await social.requestAlliance(ME, STONE_PACT);
    await expect(social.requestAlliance(ME, NORTHERN_ACCORD)).rejects.toEqual(refused("request-pending"));
    expect((await social.playerAlliance(ME)).request).toMatchObject({ alliance: { id: STONE_PACT } });
    await social.cancelAllianceRequest(ME);
    await expect(social.cancelAllianceRequest(ME)).rejects.toEqual(refused("no-request"));
    await social.requestAlliance(ME, STONE_PACT);
    clock.now += MOCK_ACCEPT_S;
    const mine = await social.playerAlliance(ME);
    expect(mine.alliance).toMatchObject({ id: STONE_PACT, role: "member", leadsGuild: true, guilds: 4 });
    expect(mine.request).toBeNull();
  });

  it("gets Northern Accord's invitation a minute after the first visit, and accepts or declines it", async () => {
    const { social, clock } = world();
    await social.createGuild(ME, guildDraft("Stone Road"));
    await social.visitAlliance(ME);
    clock.now += MOCK_INVITATION_S - 1;
    expect((await social.playerAlliance(ME)).invitations).toEqual([]);
    clock.now += 1;
    const mine = await social.playerAlliance(ME);
    expect(mine.invitations.map((i) => i.alliance.name)).toEqual(["Northern Accord"]);
    expect(mine.badge).toBe(1);
    await social.answerAllianceInvitation(ME, NORTHERN_ACCORD, false);
    expect((await social.playerAlliance(ME)).invitations).toEqual([]);
    await expect(social.answerAllianceInvitation(ME, NORTHERN_ACCORD, true)).rejects.toEqual(refused("invite-expired"));
  });

  it("refuses a full alliance", async () => {
    const { social } = world();
    const ids = [];
    for (const [i, name] of ["Road A", "Road B", "Road C", "Road D", "Road E"].entries()) ids.push(await social.createGuild(`0xabc1${i}`, guildDraft(name)));
    const alliance = await social.createAlliance("0xabc10", draft());
    for (const [i, id] of ids.slice(1, ALLIANCE_MAX_GUILDS).entries()) {
      await social.inviteGuild("0xabc10", id);
      await social.answerAllianceInvitation(`0xabc1${i + 1}`, alliance, true);
    }
    expect((await social.alliance(alliance, null))!.guilds).toBe(ALLIANCE_MAX_GUILDS);
    await social.createGuild(ME, guildDraft("Stone Road"));
    await expect(social.requestAlliance(ME, alliance)).rejects.toEqual(refused("full"));
  });
});

describe("the guilds' changes reach the alliances (ALLIANCES)", () => {
  it("a disbanded guild leaves its alliance; the head disbanded, the longest-serving guild takes it", async () => {
    const { social } = world();
    await social.createGuild(ME, guildDraft("Stone Road"));
    const second = await social.createGuild(OTHER, guildDraft("Iron Road"));
    const alliance = await social.createAlliance(ME, draft());
    await social.inviteGuild(ME, second);
    await social.answerAllianceInvitation(OTHER, alliance, true);
    await social.leaveGuild(ME);
    const page = (await social.alliance(alliance, OTHER))!;
    expect(page.roster.map((g) => [g.guild.name, g.role])).toEqual([["Iron Road", "head"]]);
    expect(page.leads).toBe(true);
    await social.leaveGuild(OTHER);
    expect(await social.alliance(alliance, null)).toBeNull();
  });

  it("follows the head guild's leader: a guild's new leader leads the alliance", async () => {
    const { social } = world();
    const id = await social.createGuild(ME, guildDraft("Stone Road"));
    await social.joinGuild(OTHER, id);
    const alliance = await social.createAlliance(ME, draft());
    await social.makeLeader(ME, OTHER);
    expect((await social.alliance(alliance, OTHER))!.leads).toBe(true);
    expect((await social.alliance(alliance, ME))!).toMatchObject({ leads: false, leadsGuild: false });
    expect((await social.playerAlliance(OTHER)).guild).toMatchObject({ id, rank: GUILD_RANK.leader });
  });
});

describe("the alliance hooks (ALLIANCES)", () => {
  it("read the player's alliance, a page, a guild's alliance, the search, the ranking and a place", async () => {
    const { social } = world();
    const { result } = renderData(
      () => ({
        mine: usePlayerAlliance(ME),
        page: useAlliance(STONE_PACT, ME),
        ofGuild: useGuildAlliance(guildId("The Quarrymen")),
        search: useAllianceSearch("north", { delayMs: 0 }),
        ranking: useAllianceRanking(),
        place: useAlliancePlace(STONE_PACT),
      }),
      fakeSources({ social }).sources,
    );
    await waitFor(() => expect(Object.values(result.current).every((r) => r.data !== undefined)).toBe(true));
    expect(result.current.mine.data).toMatchObject({ guild: null, alliance: null });
    expect(result.current.page.data!.name).toBe("Stone Pact");
    expect(result.current.ofGuild.data).toMatchObject({ id: STONE_PACT, role: "head" });
    expect(result.current.search.data!.map((a) => a.name)).toEqual(["Northern Accord"]);
    expect(result.current.ranking.data).toHaveLength(2);
    expect(result.current.place.data!.place).toBe(2);
  });

  it("answer unavailable without an alliance part, and are disabled without an ID or a player", () => {
    const plain: SocialSource = { profile: async () => null, searchPlayers: async () => [] };
    expect(allianceSource(plain)).toBeNull();
    const { result } = renderData(() => [usePlayerAlliance(ME), useAllianceRanking(), useAllianceWrites(ME)] as const, fakeSources({ social: plain }).sources);
    expect(result.current.map((r) => r.unavailable)).toEqual([true, true, true]);
    const { social } = world();
    const spy = vi.spyOn(social, "playerAlliance");
    const off = renderData(() => [usePlayerAlliance(null), useAlliance(null, ME), useGuildAlliance(null)] as const, fakeSources({ social }).sources);
    expect(off.result.current.map((r) => [r.isPending, r.data])).toEqual([
      [false, undefined],
      [false, undefined],
      [false, undefined],
    ]);
    expect(spy).not.toHaveBeenCalled();
  });

  it("write for the player and read again what the write changed, guild reads too; a refusal keeps its reason", async () => {
    const { social } = world();
    await social.createGuild(ME, guildDraft("Stone Road"));
    const { result } = renderData(() => ({ mine: usePlayerAlliance(ME), writes: useAllianceWrites(ME) }), fakeSources({ social }).sources);
    await waitFor(() => expect(result.current.mine.data).toBeDefined());
    await act(() => result.current.writes.run((a, me) => a.createAlliance(me, draft())));
    await waitFor(() => expect(result.current.mine.data!.alliance?.name).toBe("Road Pact"));
    await act(() => result.current.writes.run((a, me) => a.createAlliance(me, draft({ name: "Again" }))).catch(() => undefined));
    await waitFor(() => expect(result.current.writes.refusal).toBe("in-alliance"));
    expect(allianceRefusal(new Error("down"))).toBeNull();
  });

  it("key an alliance read under the guilds', so a guild write makes it stale", () => {
    expect(allianceKeys.player("0x0ABC001")).toEqual(allianceKeys.player(ME));
    expect(allianceKeys.page(1, null)).not.toEqual(allianceKeys.page(1, ME));
    expect(allianceKeys.ranking().slice(0, 2)).toEqual([...guildKeys.all]);
    expect(allianceKeys.all).toEqual(allianceKeys.ranking().slice(0, 3));
  });
});
