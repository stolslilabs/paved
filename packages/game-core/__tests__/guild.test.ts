import { describe, expect, it } from "vitest";
import {
  GUILD_ANNOUNCEMENTS_KEPT,
  GUILD_ANNOUNCEMENT_MAX,
  GUILD_DESCRIPTION_MAX,
  GUILD_EMBLEM_COLOURS,
  GUILD_EMBLEM_ICONS,
  GUILD_INVITE_TTL_S,
  GUILD_KICK_COOLDOWN_S,
  GUILD_KICK_REASON_MAX,
  GUILD_LEADER_IDLE_S,
  GUILD_LOG_KEPT,
  GUILD_MAX_MEMBERS,
  GUILD_RANK,
  GUILD_REQUEST_MESSAGE_MAX,
  LEVEL_CAP,
  acceptInvitationRefusal,
  acceptRequestRefusal,
  cancelRequestRefusal,
  createGuildRefusal,
  declineRequestRefusal,
  demoteRefusal,
  editAnnouncementRefusal,
  editSettingsRefusal,
  filterGuilds,
  guildFull,
  guildNameKey,
  guildNameRefusal,
  guildScore,
  guildTag,
  invitationOpen,
  inviteRefusal,
  isGuildRank,
  joinRefusal,
  keepAnnouncements,
  keepLog,
  kickRefusal,
  leaveDisbands,
  leaveRefusal,
  makeLeaderRefusal,
  mayApply,
  nextKickAt,
  normalGuildName,
  parseGuildTag,
  postAnnouncementRefusal,
  promoteRefusal,
  rankGuilds,
  ranksAbove,
  requestRefusal,
  rotatedLeader,
  searchGuilds,
  sortGuildMembers,
  suggestGuilds,
  unreadAnnouncements,
  type GuildDraft,
  type GuildListing,
  type GuildRank,
  type GuildRosterEntry,
} from "../src";

// The guild rules (#953): every row of the proposal's table and every limit, allowed and refused.

const { member: M, officer: O, leader: L } = GUILD_RANK;
const NOW = 1_793_448_000;

const actor = (address: string, rank: GuildRank) => ({ address, rank });
const draft = (over: Partial<GuildDraft> = {}): GuildDraft => ({
  name: "Iron Quay",
  emblem: { icon: 0, primary: 1, secondary: 2 },
  description: "Builders of the north road.",
  joinType: "open",
  requirements: { level: 0, crowns: 0 },
  ...over,
});
const opening = (over: Partial<GuildListing> = {}): GuildListing => ({ id: 7, name: "Iron Quay", joinType: "open", requirements: { level: 0, crowns: 0 }, members: 10, score: 1_000, active: 3, ...over });
const guildless = { level: 5, crowns: 300, guild: null };

describe("the ranks (#953)", () => {
  it("are numbers in order, with room for a fourth between Officer and Leader", () => {
    expect(M < O && O < L).toBe(true);
    expect(L - O).toBeGreaterThan(1);
    expect([M, O, L].every(isGuildRank)).toBe(true);
    expect(isGuildRank(3)).toBe(false);
    expect(isGuildRank("1")).toBe(false);
  });

  it("let an actor act only on a strictly lower rank", () => {
    expect(ranksAbove(L, O)).toBe(true);
    expect(ranksAbove(O, M)).toBe(true);
    expect(ranksAbove(O, O)).toBe(false);
    expect(ranksAbove(M, O)).toBe(false);
  });
});

describe("creating a guild (#953)", () => {
  it("takes a name of 3 to 20 letters, digits and spaces, unique whatever the case", () => {
    expect(guildNameRefusal("Ash")).toBeNull();
    expect(guildNameRefusal("A".repeat(20))).toBeNull();
    expect(guildNameRefusal("Ab")).toBe("name-length");
    expect(guildNameRefusal("A".repeat(21))).toBe("name-length");
    expect(guildNameRefusal("   Ab   ")).toBe("name-length");
    expect(guildNameRefusal("Iron-Quay")).toBe("name-chars");
    expect(guildNameRefusal("Château")).toBe("name-chars");
    const taken = new Set([guildNameKey("Iron Quay")]);
    expect(guildNameRefusal("iron   QUAY ", (k) => taken.has(k))).toBe("name-taken");
    expect(guildNameRefusal("Iron Quays", (k) => taken.has(k))).toBeNull();
    expect(normalGuildName("  Iron   Quay ")).toBe("Iron Quay");
  });

  it("is only for a player in no guild, with valid settings, of any join type", () => {
    for (const joinType of ["open", "request", "invite"] as const) expect(createGuildRefusal({ guild: null }, draft({ joinType }))).toBeNull();
    expect(createGuildRefusal({ guild: 3 }, draft())).toBe("in-guild");
    expect(createGuildRefusal({ guild: null }, draft({ description: "x".repeat(GUILD_DESCRIPTION_MAX) }))).toBeNull();
    expect(createGuildRefusal({ guild: null }, draft({ description: "x".repeat(GUILD_DESCRIPTION_MAX + 1) }))).toBe("description-length");
    expect(createGuildRefusal({ guild: null }, draft({ emblem: { icon: GUILD_EMBLEM_ICONS - 1, primary: GUILD_EMBLEM_COLOURS - 1, secondary: 0 } }))).toBeNull();
    expect(createGuildRefusal({ guild: null }, draft({ emblem: { icon: GUILD_EMBLEM_ICONS, primary: 0, secondary: 0 } }))).toBe("emblem");
    expect(createGuildRefusal({ guild: null }, draft({ emblem: { icon: 0, primary: -1, secondary: 0 } }))).toBe("emblem");
    expect(createGuildRefusal({ guild: null }, draft({ joinType: "closed" as never }))).toBe("join-type");
    expect(createGuildRefusal({ guild: null }, draft({ requirements: { level: LEVEL_CAP, crowns: 500 } }))).toBeNull();
    expect(createGuildRefusal({ guild: null }, draft({ requirements: { level: LEVEL_CAP + 1, crowns: 0 } }))).toBe("requirements");
    expect(createGuildRefusal({ guild: null }, draft({ requirements: { level: 1.5, crowns: 0 } }))).toBe("requirements");
    expect(createGuildRefusal({ guild: null }, draft({ requirements: { level: 0, crowns: -1 } }))).toBe("requirements");
  });

  it("gives a tag made from the ID, read back with or without its #, whatever the case", () => {
    const tags = [0, 1, 13, 14, 20_000, 9_999_999].map(guildTag);
    expect(new Set(tags).size).toBe(tags.length);
    expect(guildTag(0)).toBe("#0");
    for (const id of [0, 1, 13, 14, 20_000, 9_999_999]) {
      expect(parseGuildTag(guildTag(id))).toBe(id);
      expect(parseGuildTag(` ${guildTag(id).slice(1).toLowerCase()} `)).toBe(id);
    }
    expect(parseGuildTag("#")).toBeNull();
    expect(parseGuildTag("#ABC")).toBeNull();
    expect(parseGuildTag("")).toBeNull();
  });
});

describe("the settings (#953)", () => {
  it("are the leader's only", () => {
    expect(editSettingsRefusal(L, draft())).toBeNull();
    expect(editSettingsRefusal(O, draft())).toBe("rank");
    expect(editSettingsRefusal(M, draft())).toBe("rank");
    expect(editSettingsRefusal(L, draft({ description: "x".repeat(GUILD_DESCRIPTION_MAX + 1) }))).toBe("description-length");
  });
});

describe("joining (#953)", () => {
  it("joins an Open guild at once, its requirements met and not full", () => {
    expect(joinRefusal(guildless, opening())).toBeNull();
    expect(joinRefusal(guildless, opening({ requirements: { level: 5, crowns: 300 } }))).toBeNull();
    expect(joinRefusal(guildless, opening({ requirements: { level: 6, crowns: 0 } }))).toBe("level-low");
    expect(joinRefusal(guildless, opening({ requirements: { level: 0, crowns: 301 } }))).toBe("crowns-low");
    expect(joinRefusal(guildless, opening({ members: GUILD_MAX_MEMBERS - 1 }))).toBeNull();
    expect(joinRefusal(guildless, opening({ members: GUILD_MAX_MEMBERS }))).toBe("full");
  });

  it("refuses a player in a guild, and the other join types", () => {
    expect(joinRefusal({ ...guildless, guild: 3 }, opening())).toBe("in-guild");
    expect(joinRefusal({ ...guildless, guild: 7 }, opening())).toBe("member-already");
    expect(joinRefusal(guildless, opening({ joinType: "request" }))).toBe("by-request");
    expect(joinRefusal(guildless, opening({ joinType: "invite" }))).toBe("invite-only");
  });

  it("requests a By-request guild with a message of up to 100 characters, one pending at a time, and cancels it", () => {
    const g = opening({ joinType: "request" });
    const p = { ...guildless, pending: null };
    expect(requestRefusal(p, g)).toBeNull();
    expect(requestRefusal(p, g, "x".repeat(GUILD_REQUEST_MESSAGE_MAX))).toBeNull();
    expect(requestRefusal(p, g, "x".repeat(GUILD_REQUEST_MESSAGE_MAX + 1))).toBe("message-length");
    expect(requestRefusal({ ...p, pending: 9 }, g)).toBe("request-pending");
    expect(requestRefusal(p, opening({ joinType: "open" }))).toBe("open");
    expect(requestRefusal(p, opening({ joinType: "invite" }))).toBe("invite-only");
    expect(requestRefusal(p, { ...g, members: GUILD_MAX_MEMBERS })).toBe("full");
    expect(requestRefusal(p, { ...g, requirements: { level: 9, crowns: 0 } })).toBe("level-low");
    expect(requestRefusal({ ...p, guild: 3 }, g)).toBe("in-guild");
    expect(cancelRequestRefusal(7)).toBeNull();
    expect(cancelRequestRefusal(null)).toBe("no-request");
  });

  it("lets officers and the leader accept or decline a request, members not", () => {
    for (const rank of [O, L]) {
      expect(acceptRequestRefusal(rank, { members: 10 }, { guild: null })).toBeNull();
      expect(declineRequestRefusal(rank)).toBeNull();
    }
    expect(acceptRequestRefusal(M, { members: 10 }, { guild: null })).toBe("rank");
    expect(declineRequestRefusal(M)).toBe("rank");
    expect(acceptRequestRefusal(O, { members: GUILD_MAX_MEMBERS }, { guild: null })).toBe("full");
    expect(acceptRequestRefusal(O, { members: 10 }, { guild: 3 })).toBe("in-guild");
  });
});

describe("invitations (#953)", () => {
  const target = { guild: null, blockedInviter: false, invited: false };
  it("are sent by officers and the leader, to a player in no guild or in another one", () => {
    for (const rank of [O, L]) expect(inviteRefusal(rank, { id: 7, members: 10 }, target)).toBeNull();
    expect(inviteRefusal(O, { id: 7, members: 10 }, { ...target, guild: 3 })).toBeNull();
    expect(inviteRefusal(M, { id: 7, members: 10 }, target)).toBe("rank");
    expect(inviteRefusal(O, { id: 7, members: 10 }, { ...target, guild: 7 })).toBe("member-already");
    expect(inviteRefusal(O, { id: 7, members: 10 }, { ...target, blockedInviter: true })).toBe("blocked");
    expect(inviteRefusal(O, { id: 7, members: 10 }, { ...target, invited: true })).toBe("invited-already");
    expect(inviteRefusal(O, { id: 7, members: GUILD_MAX_MEMBERS }, target)).toBe("full");
  });

  it("lapse after 7 days", () => {
    expect(invitationOpen(NOW, NOW + GUILD_INVITE_TTL_S - 1)).toBe(true);
    expect(invitationOpen(NOW, NOW + GUILD_INVITE_TTL_S)).toBe(false);
    expect(acceptInvitationRefusal({ sentAt: NOW - GUILD_INVITE_TTL_S }, NOW, { members: 10 }, { guild: null, rank: null, members: 0 }, false)).toBe("invite-expired");
  });

  it("are accepted while the guild has room; from another guild, once its leaving is confirmed", () => {
    const sent = { sentAt: NOW - 60 };
    expect(acceptInvitationRefusal(sent, NOW, { members: 10 }, { guild: null, rank: null, members: 0 }, false)).toBeNull();
    expect(acceptInvitationRefusal(sent, NOW, { members: GUILD_MAX_MEMBERS }, { guild: null, rank: null, members: 0 }, false)).toBe("full");
    expect(acceptInvitationRefusal(sent, NOW, { members: 10 }, { guild: 3, rank: M, members: 8 }, false)).toBe("in-guild");
    expect(acceptInvitationRefusal(sent, NOW, { members: 10 }, { guild: 3, rank: M, members: 8 }, true)).toBeNull();
    expect(acceptInvitationRefusal(sent, NOW, { members: 10 }, { guild: 3, rank: L, members: 8 }, true)).toBe("leader-must-transfer");
    expect(acceptInvitationRefusal(sent, NOW, { members: 10 }, { guild: 3, rank: L, members: 1 }, true)).toBeNull();
  });
});

describe("kicks (#953)", () => {
  const leader = { ...actor("0xa", L), lastKick: null };
  const officer = { ...actor("0xb", O), lastKick: null };
  const memberActor = { ...actor("0xc", M), lastKick: null };

  it("let the leader kick Officers and Members, officers Members only, members no one", () => {
    expect(kickRefusal(leader, actor("0xd", O), NOW)).toBeNull();
    expect(kickRefusal(leader, actor("0xd", M), NOW)).toBeNull();
    expect(kickRefusal(officer, actor("0xd", M), NOW)).toBeNull();
    expect(kickRefusal(officer, actor("0xd", O), NOW)).toBe("rank-not-above");
    expect(kickRefusal(officer, actor("0xd", L), NOW)).toBe("rank-not-above");
    expect(kickRefusal(memberActor, actor("0xd", M), NOW)).toBe("rank");
    expect(kickRefusal(leader, actor("0xa", L), NOW)).toBe("self");
  });

  it("take an optional reason of up to 100 characters", () => {
    expect(kickRefusal(leader, actor("0xd", M), NOW, "x".repeat(GUILD_KICK_REASON_MAX))).toBeNull();
    expect(kickRefusal(leader, actor("0xd", M), NOW, "x".repeat(GUILD_KICK_REASON_MAX + 1))).toBe("reason-length");
  });

  it("hold an officer to one kick per 20 minutes, the leader to none", () => {
    const kicked = { ...officer, lastKick: NOW - GUILD_KICK_COOLDOWN_S + 1 };
    expect(kickRefusal(kicked, actor("0xd", M), NOW)).toBe("kick-cooldown");
    expect(kickRefusal({ ...officer, lastKick: NOW - GUILD_KICK_COOLDOWN_S }, actor("0xd", M), NOW)).toBeNull();
    expect(kickRefusal({ ...leader, lastKick: NOW - 1 }, actor("0xd", M), NOW)).toBeNull();
    expect(nextKickAt(kicked, NOW)).toBe(NOW + 1);
    expect(nextKickAt(officer, NOW)).toBe(NOW);
    expect(nextKickAt({ rank: L, lastKick: NOW }, NOW)).toBe(NOW);
  });
});

describe("promotions, demotions and the leadership (#953)", () => {
  it("let the leader alone promote a Member to Officer", () => {
    expect(promoteRefusal(actor("0xa", L), actor("0xd", M))).toBeNull();
    expect(promoteRefusal(actor("0xa", L), actor("0xd", O))).toBe("not-a-member");
    expect(promoteRefusal(actor("0xb", O), actor("0xd", M))).toBe("rank");
    expect(promoteRefusal(actor("0xc", M), actor("0xd", M))).toBe("rank");
    expect(promoteRefusal(actor("0xa", L), actor("0xa", L))).toBe("self");
  });

  it("let the leader alone demote an Officer", () => {
    expect(demoteRefusal(actor("0xa", L), actor("0xd", O))).toBeNull();
    expect(demoteRefusal(actor("0xa", L), actor("0xd", M))).toBe("not-an-officer");
    expect(demoteRefusal(actor("0xb", O), actor("0xd", O))).toBe("rank");
    expect(demoteRefusal(actor("0xc", M), actor("0xd", O))).toBe("rank");
  });

  it("let the leader alone make another member leader", () => {
    expect(makeLeaderRefusal(actor("0xa", L), actor("0xd", O))).toBeNull();
    expect(makeLeaderRefusal(actor("0xa", L), actor("0xd", M))).toBeNull();
    expect(makeLeaderRefusal(actor("0xb", O), actor("0xd", M))).toBe("rank");
    expect(makeLeaderRefusal(actor("0xc", M), actor("0xd", M))).toBe("rank");
    expect(makeLeaderRefusal(actor("0xa", L), actor("0xa", L))).toBe("self");
  });
});

describe("leaving (#953)", () => {
  it("lets members and officers leave; the leader only when alone, which disbands the guild", () => {
    expect(leaveRefusal(M, 10)).toBeNull();
    expect(leaveRefusal(O, 10)).toBeNull();
    expect(leaveRefusal(L, 10)).toBe("leader-must-transfer");
    expect(leaveRefusal(L, 1)).toBeNull();
    expect(leaveDisbands(1)).toBe(true);
    expect(leaveDisbands(2)).toBe(false);
  });

  it("names the longest-serving active officer leader after 35 idle days, or else the longest-serving active member", () => {
    const m = (address: string, rank: GuildRank, joinedAt: number, lastSeen = NOW): GuildRosterEntry => ({ address, rank, crowns: 0, joinedAt, lastSeen });
    const idle = NOW - GUILD_LEADER_IDLE_S;
    const roster = [m("0xa", L, 1, idle), m("0xb", O, 30), m("0xc", O, 20), m("0xd", M, 5), m("0xe", O, 10, idle)];
    expect(rotatedLeader(roster, NOW)).toBe("0xc");
    expect(rotatedLeader([m("0xa", L, 1, idle), m("0xd", M, 50), m("0xf", M, 40)], NOW)).toBe("0xf");
    expect(rotatedLeader([m("0xa", L, 1, idle + 1), m("0xb", O, 30)], NOW)).toBeNull();
    expect(rotatedLeader([m("0xa", L, 1, idle), m("0xb", O, 30, idle)], NOW)).toBeNull();
    expect(rotatedLeader([m("0xa", L, 1, idle)], NOW)).toBeNull();
  });
});

describe("announcements (#953)", () => {
  it("are posted by officers and the leader, up to 500 characters, not blank", () => {
    expect(postAnnouncementRefusal(O, "Raid at dusk.")).toBeNull();
    expect(postAnnouncementRefusal(L, "x".repeat(GUILD_ANNOUNCEMENT_MAX))).toBeNull();
    expect(postAnnouncementRefusal(M, "Raid at dusk.")).toBe("rank");
    expect(postAnnouncementRefusal(O, "x".repeat(GUILD_ANNOUNCEMENT_MAX + 1))).toBe("announcement-length");
    expect(postAnnouncementRefusal(O, "   ")).toBe("announcement-empty");
  });

  it("are edited and deleted by an officer when theirs, by the leader all", () => {
    expect(editAnnouncementRefusal(actor("0xb", O), "0xb", "New text")).toBeNull();
    expect(editAnnouncementRefusal(actor("0xb", O), "0xb", null)).toBeNull();
    expect(editAnnouncementRefusal(actor("0xb", O), "0xa", "New text")).toBe("not-author");
    expect(editAnnouncementRefusal(actor("0xb", O), "0xa", null)).toBe("not-author");
    expect(editAnnouncementRefusal(actor("0xa", L), "0xb", "New text")).toBeNull();
    expect(editAnnouncementRefusal(actor("0xa", L), "0xb", null)).toBeNull();
    expect(editAnnouncementRefusal(actor("0xc", M), "0xc", null)).toBe("rank");
    expect(editAnnouncementRefusal(actor("0xa", L), "0xb", "")).toBe("announcement-empty");
  });

  it("keep the 20 latest, newest first, and count those unread by others", () => {
    const list = Array.from({ length: 25 }, (_, i) => ({ at: NOW + i, author: i % 2 ? "0xa" : "0xb" }));
    const kept = keepAnnouncements(list);
    expect(kept).toHaveLength(GUILD_ANNOUNCEMENTS_KEPT);
    expect(kept[0]!.at).toBe(NOW + 24);
    expect(kept.at(-1)!.at).toBe(NOW + 5);
    expect(unreadAnnouncements(list, "0xa", NOW + 20)).toBe(2);
    expect(unreadAnnouncements(list, "0xc", NOW + 20)).toBe(4);
  });
});

describe("the log and the members (#953)", () => {
  it("keeps the log's 100 latest entries", () => {
    const log = Array.from({ length: 130 }, (_, i) => i);
    expect(keepLog(log)).toEqual(log.slice(30));
    expect(keepLog(log)).toHaveLength(GUILD_LOG_KEPT);
    expect(keepLog([1, 2])).toEqual([1, 2]);
  });

  it("lists the members by rank, then by crowns, and scores the guild by their crowns", () => {
    const members = [
      { address: "0x1", rank: M, crowns: 900, joinedAt: 1 },
      { address: "0x2", rank: O, crowns: 100, joinedAt: 2 },
      { address: "0x3", rank: L, crowns: 50, joinedAt: 3 },
      { address: "0x4", rank: M, crowns: 1_000, joinedAt: 4 },
      { address: "0x5", rank: O, crowns: 200, joinedAt: 5 },
    ];
    expect(sortGuildMembers(members).map((x) => x.address)).toEqual(["0x3", "0x5", "0x2", "0x4", "0x1"]);
    expect(guildScore(members)).toBe(2_250);
  });

  it("is full at 50 members", () => {
    expect(guildFull({ members: GUILD_MAX_MEMBERS - 1 })).toBe(false);
    expect(guildFull({ members: GUILD_MAX_MEMBERS })).toBe(true);
    expect(GUILD_MAX_MEMBERS).toBe(50);
  });
});

describe("finding guilds (#953)", () => {
  const guilds = [
    opening({ id: 1, name: "Iron Quay", score: 5_000, active: 2 }),
    opening({ id: 2, name: "The Quarrymen", joinType: "request", score: 9_000, active: 5 }),
    opening({ id: 3, name: "Hollow Oak", joinType: "invite", score: 7_000, active: 9 }),
    opening({ id: 4, name: "Quay Wardens", requirements: { level: 12, crowns: 0 }, score: 1_000, active: 8 }),
    opening({ id: 5, name: "Full House", members: GUILD_MAX_MEMBERS, score: 20_000, active: 9 }),
  ];

  it("searches by name from the start of a word, or by tag", () => {
    expect(searchGuilds(guilds, "quay").map((g) => g.id)).toEqual([4, 1]);
    expect(searchGuilds(guilds, "QUARRY").map((g) => g.id)).toEqual([2]);
    expect(searchGuilds(guilds, "uay")).toEqual([]);
    expect(searchGuilds(guilds, "")).toEqual([]);
    expect(searchGuilds(guilds, guildTag(3)).map((g) => g.id)).toEqual([3]);
    expect(searchGuilds(guilds, ` ${guildTag(3).toLowerCase()} `).map((g) => g.id)).toEqual([3]);
    expect(searchGuilds(guilds, guildTag(99))).toEqual([]);
  });

  it("suggests the guilds a player may join, the most active first", () => {
    expect(mayApply(guildless, guilds[0]!)).toBe(true);
    expect(mayApply(guildless, guilds[2]!)).toBe(false);
    expect(mayApply(guildless, guilds[3]!)).toBe(false);
    expect(mayApply(guildless, guilds[4]!)).toBe(false);
    expect(mayApply({ ...guildless, guild: 1 }, guilds[0]!)).toBe(false);
    expect(suggestGuilds(guilds, guildless).map((g) => g.id)).toEqual([2, 1]);
    expect(suggestGuilds(guilds, { ...guildless, level: 12 }).map((g) => g.id)).toEqual([4, 2, 1]);
  });

  it("filters by join type, by the requirements a player meets, and by members", () => {
    expect(filterGuilds(guilds, { joinType: "request" }).map((g) => g.id)).toEqual([2]);
    expect(filterGuilds(guilds, { meets: guildless }).map((g) => g.id)).toEqual([1, 2, 3, 5]);
    expect(filterGuilds(guilds, { minMembers: GUILD_MAX_MEMBERS }).map((g) => g.id)).toEqual([5]);
    expect(filterGuilds(guilds, { maxMembers: 10 }).map((g) => g.id)).toEqual([1, 2, 3, 4]);
    expect(filterGuilds(guilds, {})).toHaveLength(guilds.length);
  });

  it("ranks the guilds by score", () => {
    expect(rankGuilds(guilds).map((g) => g.id)).toEqual([5, 2, 3, 1, 4]);
    expect(rankGuilds(guilds, 2)).toHaveLength(2);
  });
});
