import { describe, expect, it } from "vitest";
import {
  ALLIANCE_ACTOR_RANK,
  ALLIANCE_DESCRIPTION_MAX,
  ALLIANCE_INVITE_TTL_S,
  ALLIANCE_LIST_LIMIT,
  ALLIANCE_MAX_GUILDS,
  GUILD_EMBLEM_COLOURS,
  GUILD_RANK,
  acceptAllianceInvitationRefusal,
  actorRefusal,
  allianceFull,
  allianceInvitationOpen,
  allianceNameKey,
  allianceNameRefusal,
  alliancePlace,
  allianceScore,
  allianceSettingsInvalid,
  answerAllianceRequestRefusal,
  cancelAllianceRequestRefusal,
  createAllianceRefusal,
  declineAllianceInvitationRefusal,
  editAllianceRefusal,
  headRefusal,
  inviteGuildRefusal,
  leadsAlliance,
  leaveAllianceRefusal,
  leaveDisbandsAlliance,
  makeHeadRefusal,
  nextHeadGuild,
  normalAllianceName,
  rankAlliances,
  removeGuildRefusal,
  requestAllianceRefusal,
  searchAlliances,
  sortAllianceGuilds,
  type AllianceActor,
  type AllianceDraft,
  type AllianceListing,
} from "../src";

// ALLIANCES: the alliance rules, pure, as the mock applies them and the contract will mirror them.

const EMBLEM = { icon: 0, primary: 4, secondary: 0 };
const DRAFT: AllianceDraft = { name: "Stone Pact", emblem: EMBLEM, description: "" };

/** A guild's leader, their guild 1 in no alliance. */
const FREE: AllianceActor = { guild: 1, rank: GUILD_RANK.leader, alliance: null, role: null };
/** The alliance's leader: guild 1 heads alliance 7. */
const HEAD: AllianceActor = { guild: 1, rank: GUILD_RANK.leader, alliance: 7, role: "head" };
/** A member guild's leader: guild 2 in alliance 7. */
const MEMBER: AllianceActor = { guild: 2, rank: GUILD_RANK.leader, alliance: 7, role: "member" };
/** An Officer of the head guild: no alliance right. */
const OFFICER: AllianceActor = { ...HEAD, rank: GUILD_RANK.officer };
const GUILDLESS: AllianceActor = { guild: null, rank: null, alliance: null, role: null };
const ALLIANCE = { id: 7, guilds: 3 };
const FULL = { id: 7, guilds: ALLIANCE_MAX_GUILDS };

describe("alliance limits", () => {
  it("sets the proposed limits: five guilds, the guilds' name and description, 7 days, a leader acting for a guild", () => {
    expect(ALLIANCE_MAX_GUILDS).toBe(5);
    expect(ALLIANCE_DESCRIPTION_MAX).toBe(150);
    expect(ALLIANCE_INVITE_TTL_S).toBe(7 * 86_400);
    expect(ALLIANCE_LIST_LIMIT).toBe(30);
    expect(ALLIANCE_ACTOR_RANK).toBe(GUILD_RANK.leader);
    expect(allianceFull({ guilds: 4 })).toBe(false);
    expect(allianceFull({ guilds: 5 })).toBe(true);
  });
});

describe("alliance names and settings", () => {
  it("keeps a name trimmed, one space between words, and keys it whatever the case", () => {
    expect(normalAllianceName("  Stone   Pact ")).toBe("Stone Pact");
    expect(allianceNameKey("stone  PACT")).toBe(allianceNameKey("Stone Pact"));
  });
  it("refuses a name too short or long, with other characters, or taken", () => {
    expect(allianceNameRefusal("ab")).toBe("name-length");
    expect(allianceNameRefusal("W".repeat(21))).toBe("name-length");
    expect(allianceNameRefusal("Stone-Pact")).toBe("name-chars");
    expect(allianceNameRefusal("Stone Pact", (k) => k === "stone pact")).toBe("name-taken");
    expect(allianceNameRefusal("Stone Pact")).toBeNull();
  });
  it("refuses an emblem out of the guild emblems' sets and a description over 150 characters", () => {
    expect(allianceSettingsInvalid({ emblem: { ...EMBLEM, primary: GUILD_EMBLEM_COLOURS }, description: "" })).toBe("emblem");
    expect(allianceSettingsInvalid({ emblem: EMBLEM, description: "x".repeat(151) })).toBe("description-length");
    expect(allianceSettingsInvalid({ emblem: EMBLEM, description: "x".repeat(150) })).toBeNull();
  });
});

describe("who acts for a guild and for the alliance", () => {
  it("lets a guild's Leader act for it, no one else", () => {
    expect(actorRefusal(GUILDLESS)).toBe("not-in-guild");
    expect(actorRefusal({ guild: 1, rank: GUILD_RANK.officer })).toBe("not-leader");
    expect(actorRefusal(FREE)).toBeNull();
  });
  it("lets only the head guild's leader lead the alliance", () => {
    expect(headRefusal(FREE)).toBe("not-in-alliance");
    expect(headRefusal(MEMBER)).toBe("not-head");
    expect(headRefusal(OFFICER)).toBe("not-leader");
    expect(headRefusal(HEAD)).toBeNull();
    expect(leadsAlliance(HEAD)).toBe(true);
    expect(leadsAlliance(MEMBER)).toBe(false);
  });
});

describe("creating and editing", () => {
  it("lets a guild's leader in no alliance create one, with a free name and valid settings", () => {
    expect(createAllianceRefusal(GUILDLESS, DRAFT)).toBe("not-in-guild");
    expect(createAllianceRefusal({ ...FREE, rank: GUILD_RANK.member }, DRAFT)).toBe("not-leader");
    expect(createAllianceRefusal(MEMBER, DRAFT)).toBe("in-alliance");
    expect(createAllianceRefusal(FREE, { ...DRAFT, name: "ab" })).toBe("name-length");
    expect(createAllianceRefusal(FREE, DRAFT, () => true)).toBe("name-taken");
    expect(createAllianceRefusal(FREE, DRAFT)).toBeNull();
  });
  it("lets only the alliance's leader edit the emblem and the description", () => {
    const settings = { emblem: EMBLEM, description: "Ours." };
    expect(editAllianceRefusal(MEMBER, settings)).toBe("not-head");
    expect(editAllianceRefusal(HEAD, { ...settings, description: "x".repeat(151) })).toBe("description-length");
    expect(editAllianceRefusal(HEAD, settings)).toBeNull();
  });
});

describe("joining", () => {
  it("lets a guild in no alliance ask once at a time, while there is room", () => {
    expect(requestAllianceRefusal({ ...FREE, rank: GUILD_RANK.officer }, ALLIANCE, null)).toBe("not-leader");
    expect(requestAllianceRefusal(MEMBER, ALLIANCE, null)).toBe("member-already");
    expect(requestAllianceRefusal({ ...MEMBER, alliance: 8 }, ALLIANCE, null)).toBe("in-alliance");
    expect(requestAllianceRefusal(FREE, ALLIANCE, 8)).toBe("request-pending");
    expect(requestAllianceRefusal(FREE, FULL, null)).toBe("full");
    expect(requestAllianceRefusal(FREE, ALLIANCE, null)).toBeNull();
  });
  it("lets the guild's leader cancel a request waiting", () => {
    expect(cancelAllianceRequestRefusal(FREE, null)).toBe("no-request");
    expect(cancelAllianceRequestRefusal({ ...FREE, rank: GUILD_RANK.veteran }, 7)).toBe("not-leader");
    expect(cancelAllianceRequestRefusal(FREE, 7)).toBeNull();
  });
  it("lets the alliance's leader answer: declining always, accepting a guild still in none while there is room", () => {
    expect(answerAllianceRequestRefusal(MEMBER, ALLIANCE, { alliance: null }, true)).toBe("not-head");
    expect(answerAllianceRequestRefusal(HEAD, FULL, { alliance: null }, false)).toBeNull();
    expect(answerAllianceRequestRefusal(HEAD, FULL, { alliance: null }, true)).toBe("full");
    expect(answerAllianceRequestRefusal(HEAD, ALLIANCE, { alliance: 8 }, true)).toBe("in-alliance");
    expect(answerAllianceRequestRefusal(HEAD, ALLIANCE, { alliance: null }, true)).toBeNull();
  });
  it("lets the alliance's leader invite another guild in none, once, while there is room", () => {
    const target = { id: 3, alliance: null, invited: false };
    expect(inviteGuildRefusal(MEMBER, ALLIANCE, target)).toBe("not-head");
    expect(inviteGuildRefusal(HEAD, ALLIANCE, { ...target, id: 1 })).toBe("self");
    expect(inviteGuildRefusal(HEAD, ALLIANCE, { ...target, alliance: 7 })).toBe("member-already");
    expect(inviteGuildRefusal(HEAD, ALLIANCE, { ...target, alliance: 8 })).toBe("in-alliance");
    expect(inviteGuildRefusal(HEAD, ALLIANCE, { ...target, invited: true })).toBe("invited-already");
    expect(inviteGuildRefusal(HEAD, FULL, target)).toBe("full");
    expect(inviteGuildRefusal(HEAD, ALLIANCE, target)).toBeNull();
  });
  it("lets an invitation lapse after 7 days", () => {
    expect(allianceInvitationOpen(0, ALLIANCE_INVITE_TTL_S - 1)).toBe(true);
    expect(allianceInvitationOpen(0, ALLIANCE_INVITE_TTL_S)).toBe(false);
  });
  it("lets the invited guild's leader accept while it is open, the guild in none and the alliance not full", () => {
    const sent = { sentAt: 0 };
    expect(acceptAllianceInvitationRefusal({ ...FREE, rank: GUILD_RANK.officer }, sent, 1, ALLIANCE)).toBe("not-leader");
    expect(acceptAllianceInvitationRefusal(FREE, sent, ALLIANCE_INVITE_TTL_S, ALLIANCE)).toBe("invite-expired");
    expect(acceptAllianceInvitationRefusal({ ...MEMBER, alliance: 8 }, sent, 1, ALLIANCE)).toBe("in-alliance");
    expect(acceptAllianceInvitationRefusal(FREE, sent, 1, FULL)).toBe("full");
    expect(acceptAllianceInvitationRefusal(FREE, sent, 1, ALLIANCE)).toBeNull();
    expect(declineAllianceInvitationRefusal({ ...FREE, rank: GUILD_RANK.member })).toBe("not-leader");
    expect(declineAllianceInvitationRefusal(FREE)).toBeNull();
  });
});

describe("acting on guilds and leaving", () => {
  it("lets the alliance's leader remove another guild of theirs, or make it head", () => {
    const other = { id: 2, alliance: 7 };
    for (const check of [removeGuildRefusal, makeHeadRefusal]) {
      expect(check(MEMBER, other)).toBe("not-head");
      expect(check(HEAD, { id: 1, alliance: 7 })).toBe("self");
      expect(check(HEAD, { id: 3, alliance: null })).toBe("not-in-alliance");
      expect(check(HEAD, other)).toBeNull();
    }
  });
  it("lets a member guild's leader leave; the head only alone, which disbands", () => {
    expect(leaveAllianceRefusal(FREE, 0)).toBe("not-in-alliance");
    expect(leaveAllianceRefusal({ ...MEMBER, rank: GUILD_RANK.officer }, 3)).toBe("not-leader");
    expect(leaveAllianceRefusal(MEMBER, 3)).toBeNull();
    expect(leaveAllianceRefusal(HEAD, 3)).toBe("head-must-transfer");
    expect(leaveAllianceRefusal(HEAD, 1)).toBeNull();
    expect(leaveDisbandsAlliance(1)).toBe(true);
    expect(leaveDisbandsAlliance(2)).toBe(false);
  });
});

describe("an alliance's guilds", () => {
  const guilds = [
    { id: 4, role: "member" as const, score: 900, joinedAt: 30 },
    { id: 2, role: "member" as const, score: 900, joinedAt: 20 },
    { id: 1, role: "head" as const, score: 100, joinedAt: 10 },
    { id: 3, role: "member" as const, score: 2_000, joinedAt: 40 },
  ];
  it("lists the head first, then by score, then the longest-serving", () => {
    expect(sortAllianceGuilds(guilds).map((g) => g.id)).toEqual([1, 3, 2, 4]);
  });
  it("hands the head to the longest-serving guild left, none when none is left", () => {
    expect(nextHeadGuild(guilds.filter((g) => g.id !== 1))).toBe(2);
    expect(nextHeadGuild([{ id: 9, joinedAt: 5 }, { id: 8, joinedAt: 5 }])).toBe(8);
    expect(nextHeadGuild([])).toBeNull();
  });
  it("scores an alliance as the sum of its guilds' scores", () => {
    expect(allianceScore(guilds)).toBe(3_900);
    expect(allianceScore([])).toBe(0);
  });
});

describe("finding and ranking alliances", () => {
  const list: AllianceListing[] = [
    { id: 701, name: "Northern Accord", guilds: 2, score: 12_054 },
    { id: 700, name: "Stone Pact", guilds: 3, score: 6_535 },
    { id: 703, name: "Accord of Ash", guilds: 2, score: 6_535 },
    { id: 702, name: "Lantern Road", guilds: 1, score: 415 },
  ];
  it("ranks by score, then by guilds, then the oldest", () => {
    expect(rankAlliances(list).map((a) => a.id)).toEqual([701, 700, 703, 702]);
    expect(rankAlliances(list, 2)).toHaveLength(2);
  });
  it("finds by name from a word's start, those starting with it first; empty, the ranking", () => {
    expect(searchAlliances(list, "accord").map((a) => a.id)).toEqual([703, 701]);
    expect(searchAlliances(list, "cord")).toEqual([]);
    expect(searchAlliances(list, "  ").map((a) => a.id)).toEqual([701, 700, 703, 702]);
  });
  it("gives an alliance's place past the list's end, null for none", () => {
    expect(alliancePlace(list, 702)).toEqual({ place: 4, alliance: list[3] });
    expect(alliancePlace(list, 1)).toBeNull();
  });
});
