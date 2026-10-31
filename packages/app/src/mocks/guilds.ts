import { GUILD_ANNOUNCEMENT_MAX, GUILD_DESCRIPTION_MAX, GUILD_KICK_COOLDOWN_S, GUILD_NAME_MAX, GUILD_RANK } from "@paved/game-core";
import type { GuildFinderProps } from "../components/containers/guild-finder";
import { NO_GUILD_FILTERS } from "../components/containers/guild-finder";
import type { GuildPageProps } from "../components/containers/guild-page";
import type { GuildMemberActionsProps } from "../components/containers/guild-profile";
import { community, communityProfile } from "../data/mock/community";
import { guildRankingOf, guildViewOf, inviteIn, playerGuildOf, requestToJoinIn, searchGuildsOf, seededGuildWorld, suggestedGuildsOf, type GuildPeople, type GuildWorld } from "../data/mock/guilds";
import { addressKey } from "../data/keys";
import type { GuildBadge, GuildView, PlayerGuild, PublicProfile } from "../data/social-source";
import { guildApply } from "../routes/social/guild-apply";
import { LONG_ADDRESS, LONG_NAME } from "./stress";

// The guilds' mocks (#953): the mock's seeded world (`data/mock/guilds.ts`), six guilds of the community, read as its players
// see it at `GUILD_NOW`, and the states of the Guild tab, the guild's page and the profiles' actions.

/** The guilds' clock: 2026-10-31 12:00 UTC, after every seeded announcement. */
export const GUILD_NOW = 1_793_448_000;

/** Stand-ins past the community's fifty, to fill a guild: "Mason 1" and on, from `0xfeed0001`. */
const MASON = 0xfeed0000;
const masonOf = (address: string): PublicProfile | null => {
  const n = Number(BigInt(address)) - MASON;
  return n > 0 && n < 100 ? { address, name: `Mason ${n}`, look: null, level: 3 + (n % 9), crowns: 40 * n, league: 0, score: 900 * n, lastSeen: GUILD_NOW - n * 3_600 } : null;
};

/** A community player's profile at `GUILD_NOW`. */
const person: GuildPeople = (address) => communityProfile(address, GUILD_NOW) ?? masonOf(address) ?? { address, name: null, look: null, level: 1, crowns: 0, league: 0, score: 0, lastSeen: GUILD_NOW - 3_600 };
const at = (index: number) => addressKey(community()[index]!.address);

/** Community indexes in The Quarrymen (Open): its leader, an officer, a member; and players in no guild. */
const QUARRY = { leader: 48, officer: 24, member: 21 };
const GUILDLESS = [5, 6, 8, 13, 14, 16];

const byName = (w: GuildWorld, name: string) => w.guilds.find((g) => g.name === name)!;

/** The seeded world with what the stories need on top: a request and an invitation at The Quarrymen, and others. */
function storyWorld(): GuildWorld {
  const w = seededGuildWorld();
  const write = (player: number) => ({ world: w, people: person, now: GUILD_NOW - 2 * 3_600, player: at(player) });
  requestToJoinIn(write(GUILDLESS[1]!), byName(w, "Hollow Oak").id, "Builder of three villages, here every evening.");
  // A request at The Quarrymen is not possible (it is Open): it changes to By request for the officers' stories.
  byName(w, "The Quarrymen").settings.joinType = "request";
  requestToJoinIn(write(GUILDLESS[2]!), byName(w, "The Quarrymen").id, "Can I join? I play every day.");
  requestToJoinIn(write(GUILDLESS[3]!), byName(w, "The Quarrymen").id, "");
  inviteIn({ ...write(QUARRY.officer), now: GUILD_NOW - 86_400 }, at(GUILDLESS[4]!));
  inviteIn({ ...write(19), now: GUILD_NOW - 3_600 }, at(GUILDLESS[0]!));
  return w;
}

const WORLD = storyWorld();
const view = (name: string, viewer: string | null, w: GuildWorld = WORLD): GuildView => guildViewOf(w, person, GUILD_NOW, byName(w, name).id, viewer)!;
const playerOf = (index: number, w: GuildWorld = WORLD): PlayerGuild => playerGuildOf(w, person, GUILD_NOW, at(index));

/** A full guild: The Quarrymen with fifty members, the guildless players kept out (the visitors). */
function fullWorld(): GuildWorld {
  const w = seededGuildWorld();
  const quarry = byName(w, "The Quarrymen");
  for (let n = 1; quarry.members.length < 50; n++) quarry.members.push({ address: addressKey(`0x${(MASON + n).toString(16)}`), rank: GUILD_RANK.member, joinedAt: GUILD_NOW - 86_400 * 3 + n * 60, lastKick: null });
  return w;
}
const FULL = fullWorld();

/** The stress guild (WRAP360): the longest name, description and announcement, the largest figures. */
function stressView(base: GuildView): GuildView {
  const stress: PublicProfile = { address: LONG_ADDRESS, name: LONG_NAME, look: null, level: 20, crowns: 9_999, league: 22, score: 123_456_789, lastSeen: GUILD_NOW - 400 * 86_400 };
  return {
    ...base,
    name: "W".repeat(GUILD_NAME_MAX),
    tag: "#VVVVVVVVVVVV",
    description: "Mmmmmmmmmm ".repeat(14).slice(0, GUILD_DESCRIPTION_MAX),
    members: 50,
    score: 499_950,
    requirements: { level: 20, crowns: 10_000 },
    roster: [{ profile: stress, rank: GUILD_RANK.leader, joinedAt: GUILD_NOW - 86_400 }, ...base.roster],
    announcements: base.announcements && [{ id: 99, author: LONG_ADDRESS, authorName: LONG_NAME, text: "Wwwwwwwwwwww ".repeat(40).slice(0, GUILD_ANNOUNCEMENT_MAX), at: GUILD_NOW - 400 * 86_400, editedAt: GUILD_NOW }, ...base.announcements],
    log: base.log && [...base.log, { kind: "kicked", at: GUILD_NOW - 60, actor: LONG_ADDRESS, actorName: LONG_NAME, target: LONG_ADDRESS, targetName: LONG_NAME, reason: "Wwwwwwwww ".repeat(10) }],
    requests: base.requests && [{ profile: stress, message: "Wwwwwwwwww ".repeat(9).slice(0, 100), sentAt: GUILD_NOW - 400 * 86_400 }, ...base.requests],
  };
}

/** Players and their level and crowns, as the requirements read them. */
const candidateOf = (index: number) => ({ level: community()[index]!.level, crowns: community()[index]!.crowns });
const LOW = { level: 1, crowns: 0 };

/** A guild page as a player outside it sees it, with what they may do. */
function visitor(name: string, index: number, w: GuildWorld = WORLD, candidate: { level: number; crowns: number } = candidateOf(index)): Pick<GuildPageProps, "guild" | "me" | "apply"> {
  const guild = view(name, at(index), w);
  return { guild, me: at(index), apply: guildApply(guild, playerOf(index, w), candidate) };
}

/** The guild page's states (#953). */
export const GUILD_PAGE = {
  /** A Member of The Quarrymen: the announcements, the members, the log, Leave; no officer's part. */
  member: { guild: view("The Quarrymen", at(QUARRY.member)), me: at(QUARRY.member), now: GUILD_NOW },
  /** An Officer: the requests and the invitations sent, Post. */
  officer: { guild: view("The Quarrymen", at(QUARRY.officer)), me: at(QUARRY.officer), now: GUILD_NOW },
  /** The Leader: every announcement's Edit and Delete, the settings; Leave waits for a new leader. */
  leader: { guild: view("The Quarrymen", at(QUARRY.leader)), me: at(QUARRY.leader), now: GUILD_NOW },
  /** A leader alone in their guild: leaving disbands it. */
  alone: { guild: { ...view("Ashford Lanterns", at(20)), members: 1, roster: view("Ashford Lanterns", at(20)).roster.filter((m) => m.rank === GUILD_RANK.leader) }, me: at(20), now: GUILD_NOW },
  /** Outside an Open guild, the requirements met: Join. */
  join: { ...visitor("Ashford Lanterns", GUILDLESS[5]!), now: GUILD_NOW },
  /** Outside a By-request guild: Request, with a message. */
  request: { ...visitor("Order of the Millstone", GUILDLESS[5]!, WORLD, { level: 9, crowns: 900 }), now: GUILD_NOW },
  /** Their request waits here: Cancel. */
  requested: { ...visitor("Hollow Oak", GUILDLESS[1]!), now: GUILD_NOW },
  /** They hold this guild's invitation: Accept or Decline, the requirements waived. */
  invited: { ...visitor("Iron Quay Wardens", GUILDLESS[0]!), now: GUILD_NOW },
  /** A full guild: why they cannot join. */
  full: { ...visitor("The Quarrymen", GUILDLESS[0]!, FULL), now: GUILD_NOW },
  /** Requirements not met (Thistle Watch: level 8, 400 crowns) for a new player: why. */
  requirementsNotMet: { ...visitor("Thistle Watch", GUILDLESS[5]!, WORLD, LOW), now: GUILD_NOW },
  /** An Invite only guild: by invitation only. */
  inviteOnly: { ...visitor("Iron Quay Wardens", GUILDLESS[5]!), now: GUILD_NOW },
  /** WRAP360: the longest name, description, announcement, request and log line; the largest figures. */
  stress: { guild: stressView(view("The Quarrymen", at(QUARRY.leader))), me: at(QUARRY.leader), now: GUILD_NOW },
} satisfies Record<string, GuildPageProps>;

const list = (guilds: GuildFinderProps["suggested"]["guilds"]) => ({ guilds });
/** The finder's data, its callbacks the story's. */
type FinderData = Omit<GuildFinderProps, "onQueryChange" | "onFiltersChange" | "onOpenGuild" | "onAction">;
const finder = (index: number, over: Partial<FinderData> = {}): FinderData => ({
  player: playerOf(index),
  now: GUILD_NOW,
  candidate: candidateOf(index),
  query: "",
  filters: NO_GUILD_FILTERS,
  results: list(null),
  suggested: list(suggestedGuildsOf(WORLD, person, GUILD_NOW, at(index))),
  ranking: list(guildRankingOf(WORLD, person, GUILD_NOW)),
  ...over,
});

/** The Guild tab's states for a player in no guild (#953). */
export const GUILD_FINDER = {
  /** No guild, no invitation: Create, the search, the guilds suggested. */
  guildless: finder(GUILDLESS[5]!),
  /** Iron Quay Wardens' invitation, with Accept and Decline. */
  invited: finder(GUILDLESS[0]!),
  /** A request waiting at Hollow Oak: Cancel. */
  requested: finder(GUILDLESS[1]!),
  /** A new player: the cards say which requirements they miss, nothing suggested beyond the open guilds. */
  requirementsNotMet: finder(GUILDLESS[5]!, { candidate: LOW, suggested: list(searchGuildsOf(WORLD, person, GUILD_NOW, { query: "" })) }),
  /** A search by name. */
  searching: finder(GUILDLESS[5]!, { query: "the", results: list(searchGuildsOf(WORLD, person, GUILD_NOW, { query: "the" })) }),
  /** The filters: By request, requirements met. */
  filtered: finder(GUILDLESS[5]!, { filters: { joinType: "request", meets: true, size: "any" }, results: list(searchGuildsOf(WORLD, person, GUILD_NOW, { query: "", joinType: "request", meetsFor: at(GUILDLESS[5]!) })) }),
  none: finder(GUILDLESS[5]!, { query: "zzz", results: list([]) }),
  loading: finder(GUILDLESS[5]!, { suggested: list(null) }),
  error: finder(GUILDLESS[5]!, { suggested: { guilds: null, error: "The guild source did not answer: try again in a moment." } }),
} satisfies Record<string, FinderData>;

/** A player's guild as their profile shows it. */
const badgeOf = (v: GuildView, rank: GuildBadge["rank"]): GuildBadge => ({ id: v.id, tag: v.tag, name: v.name, emblem: v.emblem, rank });
export const GUILD_BADGE = {
  member: badgeOf(GUILD_PAGE.member.guild, GUILD_RANK.member),
  officer: badgeOf(GUILD_PAGE.officer.guild, GUILD_RANK.officer),
  leader: badgeOf(GUILD_PAGE.leader.guild, GUILD_RANK.leader),
  stress: badgeOf(GUILD_PAGE.stress.guild, GUILD_RANK.officer),
} satisfies Record<string, GuildBadge>;

/** The Quarrymen as its viewer reads it, for the profiles' actions. */
const viewerOf = (v: GuildView, me: string, nextKickAt: number | null = v.nextKickAt) => ({ address: me, guild: { id: v.id, name: v.name, members: v.members }, rank: v.rank!, nextKickAt });
const targetOf = (index: number, v: GuildView | null, invited = false) => {
  const member = v?.roster.find((m) => m.profile.address === at(index));
  return { address: at(index), name: community()[index]!.name, guild: member ? v!.id : null, rank: member?.rank ?? null, invited };
};

/** The profile's guild actions (#953), per rank of the viewer and of the player shown. */
export const GUILD_ACTIONS = {
  /** The Leader on a Member: Promote, Make leader, Kick. */
  leaderOnMember: { viewer: viewerOf(GUILD_PAGE.leader.guild, at(QUARRY.leader)), target: targetOf(QUARRY.member, GUILD_PAGE.leader.guild), now: GUILD_NOW },
  /** The Leader on an Officer: Demote, Make leader, Kick. */
  leaderOnOfficer: { viewer: viewerOf(GUILD_PAGE.leader.guild, at(QUARRY.leader)), target: targetOf(QUARRY.officer, GUILD_PAGE.leader.guild), now: GUILD_NOW },
  /** An Officer on a Member: Kick only. */
  officerOnMember: { viewer: viewerOf(GUILD_PAGE.officer.guild, at(QUARRY.officer)), target: targetOf(QUARRY.member, GUILD_PAGE.officer.guild), now: GUILD_NOW },
  /** An Officer who kicked 15 minutes ago: the next kick waits 5 more. */
  officerCooldown: { viewer: viewerOf(GUILD_PAGE.officer.guild, at(QUARRY.officer), GUILD_NOW - 15 * 60 + GUILD_KICK_COOLDOWN_S), target: targetOf(QUARRY.member, GUILD_PAGE.officer.guild), now: GUILD_NOW },
  /** An Officer on the Leader: nothing (they do not rank above). */
  officerOnLeader: { viewer: viewerOf(GUILD_PAGE.officer.guild, at(QUARRY.officer)), target: targetOf(QUARRY.leader, GUILD_PAGE.officer.guild), now: GUILD_NOW },
  /** An Officer on a guildless player: Invite. */
  invite: { viewer: viewerOf(GUILD_PAGE.officer.guild, at(QUARRY.officer)), target: targetOf(GUILDLESS[5]!, null), now: GUILD_NOW },
  /** Invited already: shown done. */
  invited: { viewer: viewerOf(GUILD_PAGE.officer.guild, at(QUARRY.officer)), target: targetOf(GUILDLESS[4]!, null, true), now: GUILD_NOW },
  /** A Member on another member: nothing. */
  memberOnMember: { viewer: viewerOf(GUILD_PAGE.member.guild, at(QUARRY.member)), target: targetOf(QUARRY.officer, GUILD_PAGE.member.guild), now: GUILD_NOW },
  /** WRAP360: the longest names. */
  stress: { viewer: { ...viewerOf(GUILD_PAGE.leader.guild, at(QUARRY.leader)), guild: { id: 1, name: "W".repeat(GUILD_NAME_MAX), members: 12 } }, target: { ...targetOf(QUARRY.member, GUILD_PAGE.leader.guild), name: LONG_NAME }, now: GUILD_NOW },
} satisfies Record<string, GuildMemberActionsProps>;
