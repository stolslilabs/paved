import {
  GUILD_INVITE_TTL_S,
  GUILD_LEADER_IDLE_S,
  GUILD_RANK,
  acceptInvitationRefusal,
  acceptRequestRefusal,
  cancelRequestRefusal,
  createGuildRefusal,
  declineRequestRefusal,
  demoteRefusal,
  editAnnouncementRefusal,
  editSettingsRefusal,
  filterGuilds,
  guildNameKey,
  guildScore,
  guildTag,
  invitationOpen,
  inviteRefusal,
  joinRefusal,
  keepAnnouncements,
  keepLog,
  kickRefusal,
  leaveDisbands,
  leaveRefusal,
  makeLeaderRefusal,
  nextKickAt,
  normalGuildName,
  postAnnouncementRefusal,
  promoteRefusal,
  rankGuilds,
  requestRefusal,
  rotatedLeader,
  searchGuilds,
  sortGuildMembers,
  suggestGuilds,
  unreadAnnouncements,
  type GuildDraft,
  type GuildRank,
  type GuildRefusal,
  type GuildSettings,
} from "@paved/game-core";
import { addressKey } from "../keys";
import {
  GuildRefusedError,
  type GuildBadge,
  type GuildInvitation,
  type GuildLogKind,
  type GuildQuery,
  type GuildSummary,
  type GuildView,
  type PlayerGuild,
  type PublicProfile,
} from "../social-source";
import { community, communityMember, lastSeenOf } from "./community";
import { SEEDED_FROM_DAY } from "./players";

// The mock's guilds (#953): the guild world of the device, kept in the ledger's state (`StoredState.guilds`), on game-core's
// rules (`packages/game-core/src/social/guild.ts`). Until a write keeps it, the world is the seeded one: six guilds of the mock
// community (#952), hand-written as the rivals are, the same on every device; twelve of its fifty players are in none.
//
// The community's players are on other devices, so the mock plays their part, from the times the world keeps (never a timer:
// `settle` applies what is due at each read and before each write, so a read and the next write agree):
// - a By-request guild led by one of them accepts a request `MOCK_ACCEPT_S` after it was sent;
// - one of them invited by a device's player, and in no guild, accepts `MOCK_INVITE_ANSWER_S` later;
// - a By-request guild a device's player creates gets a request from one of them `MOCK_SEED_REQUEST_S` later;
// - Iron Quay Wardens invites a guildless device's player `MOCK_INVITATION_S` after their first visit to the Guild tab
//   (open point 10's default).

/** A By-request guild of the community answers a request this long after it was sent, in seconds. */
export const MOCK_ACCEPT_S = 5;
/** A community player in no guild accepts an invitation this long after it was sent. */
export const MOCK_INVITE_ANSWER_S = 10;
/** A By-request guild a device's player created gets a community player's request this long after its creation. */
export const MOCK_SEED_REQUEST_S = 30;
/** The mock's invitation comes this long after the player's first visit to the Guild tab. */
export const MOCK_INVITATION_S = 60;
/** "Active": seen within the last day. */
const ACTIVE_S = 86_400;
/** The first guild ID: four-digit tags. */
const FIRST_GUILD_ID = 20_000;

/** A member as stored: their address key, rank, when they joined, and when they last kicked (officers' 20 minutes). */
export interface StoredGuildMember {
  address: string;
  rank: GuildRank;
  joinedAt: number;
  lastKick: number | null;
}

export interface StoredAnnouncement {
  id: number;
  author: string;
  text: string;
  at: number;
  editedAt: number | null;
}

export interface StoredLogEntry {
  kind: GuildLogKind;
  at: number;
  actor: string;
  target: string | null;
  reason: string | null;
}

export interface StoredGuild {
  id: number;
  name: string;
  settings: GuildSettings;
  createdAt: number;
  members: StoredGuildMember[];
  /** Newest first. */
  announcements: StoredAnnouncement[];
  /** Oldest first. */
  log: StoredLogEntry[];
  requests: { address: string; message: string; sentAt: number }[];
  invitations: { address: string; inviter: string; sentAt: number }[];
  nextAnnouncement: number;
  /** When a community player requests to join (a By-request guild a device's player created); null: done or none. */
  seedRequestAt: number | null;
}

/** A device's player, as the guilds keep them: when they last read each guild's announcements, visited the Guild tab, and played. */
export interface StoredGuildPlayer {
  /**
   * When they last read the announcements, by guild ID: a guild's own, so reading one guild's says nothing of another's after
   * a move (IDs are never reused, `nextId`).
   */
  reads?: Record<string, number>;
  firstVisit?: number;
  /** The mock's invitation came (or was skipped: they were in a guild then). */
  invited?: boolean;
  seenAt?: number;
}

export interface GuildWorld {
  version: 1;
  nextId: number;
  guilds: StoredGuild[];
  /** By address key. */
  players: Record<string, StoredGuildPlayer>;
}

/** What the guilds read of the players: anyone's public profile, the device's players' included. */
export type GuildPeople = (address: string) => PublicProfile;

const key = (address: string): string => addressKey(address);
const refuse = (reason: GuildRefusal): never => {
  throw new GuildRefusedError(reason);
};
const check = (reason: GuildRefusal | null): void => {
  if (reason) refuse(reason);
};
/** A player of the community (on another device): the mock plays their part. */
const isCommunity = (address: string): boolean => communityMember(address) !== null;

// --- The seeded world ------------------------------------------------------------------------------------------------

/** The seeded guilds' start: the seeded players' first day (2026-09-22). */
const SEED_T0 = SEEDED_FROM_DAY * 86_400;

interface GuildSeed {
  name: string;
  settings: GuildSettings;
  /** Community indexes (`community()`): the leader, the officers, the members. */
  leader: number;
  officers: number[];
  members: number[];
  announcements: { by: number; text: string; day: number }[];
}

/** The seeded guilds, hand-written. Community indexes: 0 to 19 the seeded players, 20 to 49 the rivals. */
const SEEDS: readonly GuildSeed[] = [
  {
    name: "The Quarrymen",
    settings: { emblem: { icon: 0, primary: 0, secondary: 4 }, description: "We cut the stone the whole valley builds on. New hands welcome, no questions asked.", joinType: "open", requirements: { level: 0, crowns: 0 } },
    leader: 48,
    officers: [24, 3],
    members: [21, 22, 0, 1, 4, 23],
    announcements: [
      { by: 48, day: 30, text: "Season's turning. Bring your best layouts to the quarry and share them with the new hands." },
      { by: 24, day: 21, text: "Welcome to all the new faces! Ask an officer if you need help with your first village." },
    ],
  },
  {
    name: "Hollow Oak",
    settings: { emblem: { icon: 3, primary: 2, secondary: 6 }, description: "An old grove of patient builders. Tell us about your village in your request.", joinType: "request", requirements: { level: 5, crowns: 300 } },
    leader: 49,
    officers: [38, 11],
    members: [29, 33, 10, 28, 35],
    announcements: [{ by: 49, day: 28, text: "We meet under the oak every evening. Attacks on our members get answered." }],
  },
  {
    name: "Iron Quay Wardens",
    settings: { emblem: { icon: 5, primary: 5, secondary: 1 }, description: "Keepers of the harbour road. By invitation only.", joinType: "invite", requirements: { level: 10, crowns: 600 } },
    leader: 19,
    officers: [46],
    members: [37, 41, 15, 17, 45],
    announcements: [{ by: 19, day: 33, text: "The quay holds. Keep your shields up through the weekend." }],
  },
  {
    name: "Order of the Millstone",
    settings: { emblem: { icon: 7, primary: 3, secondary: 0 }, description: "Grinding crowns one turn at a time. Steady players, steady wheel.", joinType: "request", requirements: { level: 0, crowns: 100 } },
    leader: 47,
    officers: [9],
    members: [25, 30, 7, 36],
    announcements: [],
  },
  {
    name: "Thistle Watch",
    settings: { emblem: { icon: 9, primary: 6, secondary: 2 }, description: "Sharp as the thistle. We watch the moors and the league table.", joinType: "open", requirements: { level: 8, crowns: 400 } },
    leader: 43,
    officers: [31],
    members: [18, 34, 12],
    announcements: [{ by: 31, day: 25, text: "Level 8 and 400 crowns to join. Read the rules pinned in the chat." }],
  },
  {
    name: "Ashford Lanterns",
    settings: { emblem: { icon: 11, primary: 7, secondary: 3 }, description: "A small light on the ford road.", joinType: "open", requirements: { level: 0, crowns: 0 } },
    leader: 20,
    officers: [],
    members: [26, 2],
    announcements: [],
  },
];

/** The guild that sends the mock's invitation: Iron Quay Wardens, Invite only. */
const INVITING_GUILD = FIRST_GUILD_ID + 2;

function seededGuild(seed: GuildSeed, i: number): StoredGuild {
  const people = community();
  const at = (index: number) => key(people[index]!.address);
  const createdAt = SEED_T0 + i * 2 * 86_400;
  const members: StoredGuildMember[] = [{ address: at(seed.leader), rank: GUILD_RANK.leader, joinedAt: createdAt, lastKick: null }];
  const log: StoredLogEntry[] = [{ kind: "created", at: createdAt, actor: at(seed.leader), target: null, reason: null }];
  [...seed.officers, ...seed.members].forEach((index, n) => {
    const joinedAt = createdAt + 3_600 * (5 + n * 7);
    members.push({ address: at(index), rank: GUILD_RANK.member, joinedAt, lastKick: null });
    log.push({ kind: "joined", at: joinedAt, actor: at(index), target: null, reason: null });
  });
  seed.officers.forEach((index, n) => {
    const promotedAt = createdAt + 86_400 * (3 + n);
    members.find((m) => m.address === at(index))!.rank = GUILD_RANK.officer;
    log.push({ kind: "promoted", at: promotedAt, actor: at(seed.leader), target: at(index), reason: null });
  });
  const announcements = seed.announcements.map((a, n) => ({ id: n + 1, author: at(a.by), text: a.text, at: SEED_T0 + a.day * 3_600 * 24 - 3_600 * (i + 1), editedAt: null }));
  for (const a of announcements) log.push({ kind: "announcement", at: a.at, actor: a.author, target: null, reason: null });
  log.sort((a, b) => a.at - b.at);
  return { id: FIRST_GUILD_ID + i, name: seed.name, settings: structuredClone(seed.settings), createdAt, members, announcements: keepAnnouncements(announcements), log, requests: [], invitations: [], nextAnnouncement: announcements.length + 1, seedRequestAt: null };
}

/** The seeded world: the same on every device, before any write. */
export const seededGuildWorld = (): GuildWorld => ({ version: 1, nextId: FIRST_GUILD_ID + SEEDS.length, guilds: SEEDS.map(seededGuild), players: {} });

/** A stored world, or null when it is not one this version wrote (then the seeded one serves). */
export function parseGuildWorld(stored: unknown): GuildWorld | null {
  const w = stored as GuildWorld | null | undefined;
  return w && w.version === 1 && Array.isArray(w.guilds) && typeof w.players === "object" && w.players !== null ? w : null;
}

// --- Lookups ---------------------------------------------------------------------------------------------------------

const guildOfKey = (world: GuildWorld, address: string): StoredGuild | null => world.guilds.find((g) => g.members.some((m) => m.address === address)) ?? null;
const memberOf = (g: StoredGuild, address: string): StoredGuildMember | null => g.members.find((m) => m.address === address) ?? null;
const guildById = (world: GuildWorld, id: number): StoredGuild | null => world.guilds.find((g) => g.id === id) ?? null;
const pendingOf = (world: GuildWorld, address: string): StoredGuild | null => world.guilds.find((g) => g.requests.some((r) => r.address === address)) ?? null;
const leaderOf = (g: StoredGuild): StoredGuildMember => g.members.find((m) => m.rank === GUILD_RANK.leader) ?? g.members[0]!;
const playerOf = (world: GuildWorld, address: string): StoredGuildPlayer => (world.players[address] ??= {});

/** The rules' view of a guild. */
const opening = (g: StoredGuild) => ({ id: g.id, joinType: g.settings.joinType, requirements: g.settings.requirements, members: g.members.length });

/** The rules' view of a player: their level, crowns, guild. */
function candidate(world: GuildWorld, people: GuildPeople, address: string) {
  const p = people(address);
  return { level: p.level, crowns: p.crowns, guild: guildOfKey(world, address)?.id ?? null };
}

function addLog(g: StoredGuild, kind: GuildLogKind, at: number, actor: string, target: string | null = null, reason: string | null = null): void {
  g.log = keepLog([...g.log, { kind, at, actor, target, reason }]);
}

/** `address` joins `g` at `at`: as a Member, their request and this guild's invitation to them gone. */
function enter(world: GuildWorld, g: StoredGuild, address: string, at: number): void {
  for (const other of world.guilds) other.requests = other.requests.filter((r) => r.address !== address);
  g.invitations = g.invitations.filter((i) => i.address !== address);
  g.members.push({ address, rank: GUILD_RANK.member, joinedAt: at, lastKick: null });
  addLog(g, "joined", at, address);
}

/** `address` leaves `g` (`kind` left or kicked, by `by`); its last member gone, the guild is disbanded. */
function exit(world: GuildWorld, g: StoredGuild, address: string, at: number, kind: "left" | "kicked" = "left", by: string = address, reason: string | null = null): void {
  if (leaveDisbands(g.members.length)) {
    world.guilds = world.guilds.filter((other) => other !== g);
    return;
  }
  g.members = g.members.filter((m) => m.address !== address);
  if (kind === "left") addLog(g, "left", at, address);
  else addLog(g, "kicked", at, by, address, reason);
}

// --- What the community does, when due -------------------------------------------------------------------------------

/** One thing due: when, and what it does. */
interface Due {
  at: number;
  apply: () => void;
}

/** The next thing due at or before `now`, or null. */
function nextDue(world: GuildWorld, people: GuildPeople, now: number): Due | null {
  const due: Due[] = [];
  for (const g of world.guilds) {
    const leader = leaderOf(g);
    if (isCommunity(leader.address)) {
      for (const r of g.requests) {
        due.push({
          at: r.sentAt + MOCK_ACCEPT_S,
          apply: () => {
            g.requests = g.requests.filter((x) => x !== r);
            const c = candidate(world, people, r.address);
            if (acceptRequestRefusal(GUILD_RANK.leader, opening(g), c) === null) enter(world, g, r.address, r.sentAt + MOCK_ACCEPT_S);
          },
        });
      }
    }
    for (const inv of g.invitations) {
      if (!isCommunity(inv.address) || guildOfKey(world, inv.address) !== null) continue;
      due.push({
        at: inv.sentAt + MOCK_INVITE_ANSWER_S,
        apply: () => {
          if (acceptInvitationRefusal(inv, inv.sentAt + MOCK_INVITE_ANSWER_S, opening(g), { guild: null, rank: null, members: 0 }, false) === null) enter(world, g, inv.address, inv.sentAt + MOCK_INVITE_ANSWER_S);
          else g.invitations = g.invitations.filter((x) => x !== inv);
        },
      });
    }
    if (g.seedRequestAt !== null) {
      const at = g.seedRequestAt;
      due.push({
        at,
        apply: () => {
          g.seedRequestAt = null;
          if (g.settings.joinType !== "request") return;
          const asked = community().find((m) => {
            const c = candidate(world, people, key(m.address));
            return requestRefusal({ ...c, pending: pendingOf(world, key(m.address))?.id ?? null }, opening(g)) === null;
          });
          if (asked) g.requests.push({ address: key(asked.address), message: "Room for one more builder? I play every day.", sentAt: at });
        },
      });
    }
  }
  const inviting = guildById(world, INVITING_GUILD);
  for (const [address, p] of Object.entries(world.players)) {
    if (p.firstVisit === undefined || p.invited) continue;
    const at = p.firstVisit + MOCK_INVITATION_S;
    due.push({
      at,
      apply: () => {
        p.invited = true;
        if (!inviting || guildOfKey(world, address) !== null || inviting.invitations.some((i) => i.address === address)) return;
        inviting.invitations.push({ address, inviter: leaderOf(inviting).address, sentAt: at });
      },
    });
  }
  const ready = due.filter((d) => d.at <= now).sort((a, b) => a.at - b.at);
  return ready[0] ?? null;
}

/**
 * When a member last played, as of `at`: a community player by the community's clock, a device's player by their last guild write
 * (`seen`), as stored. Never by who reads: every read at one time, and the next write, then see the same leader.
 */
function lastSeen(world: GuildWorld, address: string, at: number): number {
  if (isCommunity(address)) return lastSeenOf(address, at);
  return world.players[address]?.seenAt ?? 0;
}

/**
 * Applies to `world`, in place, what the community does by `now` (in time order), lapses the old invitations, and the
 * leader's rotation. A function of the stored world and `now` alone: a read settles a copy, a write settles before its check.
 */
export function settle(world: GuildWorld, people: GuildPeople, now: number): GuildWorld {
  for (let n = 0; n < 1_000; n++) {
    const due = nextDue(world, people, now);
    if (!due) break;
    due.apply();
  }
  for (const g of world.guilds) {
    g.invitations = g.invitations.filter((i) => invitationOpen(i.sentAt, now));
    // The rotation, judged when it came due (the leader's 35th idle day) and not when it is read: every read from then on, and
    // the next write (which settles before its own check), see the same leader. A new leader idle too passes it on in turn.
    for (let turn = 0; turn < g.members.length; turn++) {
      const old = leaderOf(g);
      const at = lastSeen(world, old.address, now) + GUILD_LEADER_IDLE_S;
      if (at > now) break;
      const roster = g.members.map((m) => ({ ...m, crowns: 0, lastSeen: Math.min(lastSeen(world, m.address, at), at) }));
      const next = rotatedLeader(roster, at);
      if (!next) break;
      old.rank = GUILD_RANK.officer;
      memberOf(g, next)!.rank = GUILD_RANK.leader;
      addLog(g, "leader", at, next, next);
    }
  }
  return world;
}

// --- Reads -----------------------------------------------------------------------------------------------------------

function summaryOf(g: StoredGuild, people: GuildPeople, now: number): GuildSummary {
  const profiles = g.members.map((m) => people(m.address));
  return {
    id: g.id,
    tag: guildTag(g.id),
    name: g.name,
    emblem: { ...g.settings.emblem },
    description: g.settings.description,
    joinType: g.settings.joinType,
    requirements: { ...g.settings.requirements },
    members: g.members.length,
    score: guildScore(profiles),
    active: profiles.filter((p) => now - p.lastSeen < ACTIVE_S).length,
  };
}

const nameOf = (people: GuildPeople, address: string | null): string | null => (address === null ? null : people(address).name);

function viewOf(g: StoredGuild, people: GuildPeople, now: number, viewer: string | null): GuildView {
  const me = viewer === null ? null : memberOf(g, viewer);
  const rank = me?.rank ?? null;
  const officer = rank !== null && rank >= GUILD_RANK.officer;
  const roster = sortGuildMembers(g.members.map((m) => ({ ...m, crowns: people(m.address).crowns }))).map((m) => ({ profile: people(m.address), rank: m.rank, joinedAt: m.joinedAt }));
  return {
    ...summaryOf(g, people, now),
    roster,
    rank,
    announcements: me ? g.announcements.map((a) => ({ id: a.id, author: a.author, authorName: nameOf(people, a.author), text: a.text, at: a.at, editedAt: a.editedAt })) : null,
    log: me ? g.log.map((e) => ({ kind: e.kind, at: e.at, actor: e.actor, actorName: nameOf(people, e.actor), target: e.target, targetName: nameOf(people, e.target), reason: e.reason })) : null,
    requests: officer ? g.requests.map((r) => ({ profile: people(r.address), message: r.message, sentAt: r.sentAt })) : null,
    invitations: officer ? [...g.invitations].sort((a, b) => b.sentAt - a.sentAt).map((i) => ({ profile: people(i.address), inviter: i.inviter, sentAt: i.sentAt, expiresAt: i.sentAt + GUILD_INVITE_TTL_S })) : null,
    nextKickAt: officer ? nextKickAt(me!, now) : null,
  };
}

/** The connected player's guild state. */
export function playerGuildOf(world: GuildWorld, people: GuildPeople, now: number, player: string): PlayerGuild {
  const address = key(player);
  const g = guildOfKey(world, address);
  const guild = g ? viewOf(g, people, now, address) : null;
  const pending = pendingOf(world, address);
  const request = pending ? { guild: summaryOf(pending, people, now), message: pending.requests.find((r) => r.address === address)!.message, sentAt: pending.requests.find((r) => r.address === address)!.sentAt } : null;
  const invitations: GuildInvitation[] = world.guilds
    .flatMap((other) => other.invitations.filter((i) => i.address === address).map((i) => ({ guild: summaryOf(other, people, now), inviter: i.inviter, inviterName: nameOf(people, i.inviter), sentAt: i.sentAt, expiresAt: i.sentAt + GUILD_INVITE_TTL_S })))
    .sort((a, b) => b.sentAt - a.sentAt);
  const unread = g ? unreadAnnouncements(g.announcements, address, world.players[address]?.reads?.[g.id] ?? 0) : 0;
  const requests = guild?.requests?.length ?? 0;
  return { guild, request, invitations, unread, badge: invitations.length + unread + requests };
}

/** A guild's page as `viewer` sees it, or null. */
export function guildViewOf(world: GuildWorld, people: GuildPeople, now: number, id: number, viewer: string | null): GuildView | null {
  const g = guildById(world, id);
  return g ? viewOf(g, people, now, viewer === null ? null : key(viewer)) : null;
}

/** The guild `address` is in, as their profiles show it. */
export function guildBadgeOf(world: GuildWorld, address: string): GuildBadge | null {
  const k = key(address);
  const g = guildOfKey(world, k);
  return g ? { id: g.id, tag: guildTag(g.id), name: g.name, emblem: { ...g.settings.emblem }, rank: memberOf(g, k)!.rank } : null;
}

const listings = (world: GuildWorld, people: GuildPeople, now: number) => world.guilds.map((g) => summaryOf(g, people, now));

/** The guild search: by name or tag, filtered; an empty query lists every guild by score. */
export function searchGuildsOf(world: GuildWorld, people: GuildPeople, now: number, q: GuildQuery): GuildSummary[] {
  const all = listings(world, people, now);
  const found = q.query.trim() === "" ? rankGuilds(all, all.length) : searchGuilds(all, q.query, all.length);
  const meets = q.meetsFor === undefined ? undefined : people(key(q.meetsFor));
  return filterGuilds(found, { joinType: q.joinType, meets, minMembers: q.minMembers, maxMembers: q.maxMembers });
}

export const suggestedGuildsOf = (world: GuildWorld, people: GuildPeople, now: number, player: string): GuildSummary[] => suggestGuilds(listings(world, people, now), candidate(world, people, key(player)));

export const guildRankingOf = (world: GuildWorld, people: GuildPeople, now: number): GuildSummary[] => rankGuilds(listings(world, people, now));

// --- Writes ----------------------------------------------------------------------------------------------------------

/** The guild writes, each applied in place on a settled world for `player` at `now`; a refusal throws a `GuildRefusedError`. */
export interface GuildWrite {
  world: GuildWorld;
  people: GuildPeople;
  now: number;
  player: string;
  /** Whether a block stands between two players, either way (#954, game-core's `blockBetween`); left out, none does. */
  blocked?: (a: string, b: string) => boolean;
}

/** The actor's guild and membership, or a refusal. */
function mine(w: GuildWrite): { g: StoredGuild; me: StoredGuildMember } {
  const g = guildOfKey(w.world, w.player) ?? refuse("not-in-guild");
  return { g, me: memberOf(g, w.player)! };
}

/** A member of the actor's guild, or a refusal. */
function targetIn(g: StoredGuild, target: string): StoredGuildMember {
  return memberOf(g, key(target)) ?? refuse("not-in-guild");
}

export function createGuildIn(w: GuildWrite, draft: GuildDraft): number {
  const taken = new Set(w.world.guilds.map((g) => guildNameKey(g.name)));
  check(createGuildRefusal(candidate(w.world, w.people, w.player), draft, (k) => taken.has(k)));
  const id = w.world.nextId++;
  const g: StoredGuild = {
    id,
    name: normalGuildName(draft.name),
    settings: { emblem: { ...draft.emblem }, description: draft.description, joinType: draft.joinType, requirements: { ...draft.requirements } },
    createdAt: w.now,
    members: [{ address: w.player, rank: GUILD_RANK.leader, joinedAt: w.now, lastKick: null }],
    announcements: [],
    log: [{ kind: "created", at: w.now, actor: w.player, target: null, reason: null }],
    requests: [],
    invitations: [],
    nextAnnouncement: 1,
    seedRequestAt: draft.joinType === "request" ? w.now + MOCK_SEED_REQUEST_S : null,
  };
  for (const other of w.world.guilds) other.requests = other.requests.filter((r) => r.address !== w.player);
  w.world.guilds.push(g);
  return id;
}

export function editGuildIn(w: GuildWrite, settings: GuildSettings): void {
  const { g, me } = mine(w);
  check(editSettingsRefusal(me.rank, settings));
  g.settings = { emblem: { ...settings.emblem }, description: settings.description, joinType: settings.joinType, requirements: { ...settings.requirements } };
  addLog(g, "settings", w.now, w.player);
}

export function joinGuildIn(w: GuildWrite, id: number): void {
  const g = guildById(w.world, id) ?? refuse("not-found");
  check(joinRefusal(candidate(w.world, w.people, w.player), opening(g)));
  enter(w.world, g, w.player, w.now);
}

export function requestToJoinIn(w: GuildWrite, id: number, message: string): void {
  const g = guildById(w.world, id) ?? refuse("not-found");
  check(requestRefusal({ ...candidate(w.world, w.people, w.player), pending: pendingOf(w.world, w.player)?.id ?? null }, opening(g), message));
  g.requests.push({ address: w.player, message, sentAt: w.now });
}

export function cancelRequestIn(w: GuildWrite): void {
  const g = pendingOf(w.world, w.player);
  check(cancelRequestRefusal(g?.id ?? null));
  g!.requests = g!.requests.filter((r) => r.address !== w.player);
}

export function answerRequestIn(w: GuildWrite, applicant: string, accept: boolean): void {
  const { g, me } = mine(w);
  // Officers and the leader answer: the rank first, then the request, then (accepting) the room and the applicant.
  check(declineRequestRefusal(me.rank));
  const r = g.requests.find((x) => x.address === key(applicant)) ?? refuse("no-request");
  if (accept) check(acceptRequestRefusal(me.rank, opening(g), candidate(w.world, w.people, key(applicant))));
  g.requests = g.requests.filter((x) => x !== r);
  if (accept) enter(w.world, g, key(applicant), w.now);
}

export function inviteIn(w: GuildWrite, target: string): void {
  const { g, me } = mine(w);
  const t = key(target);
  if (t === w.player) refuse("self");
  // A block either way stops the invitation (#954): the target's of the inviter, or the inviter's of the target.
  check(inviteRefusal(me.rank, opening(g), { guild: guildOfKey(w.world, t)?.id ?? null, blockedInviter: w.blocked?.(w.player, t) ?? false, invited: g.invitations.some((i) => i.address === t) }));
  g.invitations.push({ address: t, inviter: w.player, sentAt: w.now });
}

export function answerInvitationIn(w: GuildWrite, id: number, accept: boolean, leaving = false): void {
  const g = guildById(w.world, id) ?? refuse("not-found");
  const inv = g.invitations.find((i) => i.address === w.player) ?? refuse("invite-expired");
  if (!accept) {
    g.invitations = g.invitations.filter((i) => i !== inv);
    return;
  }
  const current = guildOfKey(w.world, w.player);
  check(acceptInvitationRefusal(inv, w.now, opening(g), { guild: current?.id ?? null, rank: current ? memberOf(current, w.player)!.rank : null, members: current?.members.length ?? 0 }, leaving));
  if (current) exit(w.world, current, w.player, w.now);
  enter(w.world, g, w.player, w.now);
}

export function kickIn(w: GuildWrite, target: string, reason: string): void {
  const { g, me } = mine(w);
  const t = memberOf(g, key(target));
  if (!t) refuse(key(target) === w.player ? "self" : "not-in-guild");
  check(kickRefusal(me, t!, w.now, reason));
  me.lastKick = w.now;
  exit(w.world, g, t!.address, w.now, "kicked", w.player, reason.trim() === "" ? null : reason);
}

export function promoteIn(w: GuildWrite, target: string): void {
  const { g, me } = mine(w);
  const t = targetIn(g, target);
  check(promoteRefusal(me, t));
  t.rank = GUILD_RANK.officer;
  addLog(g, "promoted", w.now, w.player, t.address);
}

export function demoteIn(w: GuildWrite, target: string): void {
  const { g, me } = mine(w);
  const t = targetIn(g, target);
  check(demoteRefusal(me, t));
  t.rank = GUILD_RANK.member;
  addLog(g, "demoted", w.now, w.player, t.address);
}

export function makeLeaderIn(w: GuildWrite, target: string): void {
  const { g, me } = mine(w);
  const t = targetIn(g, target);
  check(makeLeaderRefusal(me, t));
  t.rank = GUILD_RANK.leader;
  me.rank = GUILD_RANK.officer;
  addLog(g, "leader", w.now, w.player, t.address);
}

export function leaveGuildIn(w: GuildWrite): void {
  const { g, me } = mine(w);
  check(leaveRefusal(me.rank, g.members.length));
  exit(w.world, g, w.player, w.now);
}

export function postAnnouncementIn(w: GuildWrite, text: string): void {
  const { g, me } = mine(w);
  check(postAnnouncementRefusal(me.rank, text));
  g.announcements = keepAnnouncements([{ id: g.nextAnnouncement++, author: w.player, text: text.trim(), at: w.now, editedAt: null }, ...g.announcements]);
  // The author's own never counts as unread (`unreadAnnouncements`): their reads stay as they were.
  addLog(g, "announcement", w.now, w.player);
}

export function editAnnouncementIn(w: GuildWrite, id: number, text: string | null): void {
  const { g, me } = mine(w);
  const a = g.announcements.find((x) => x.id === id) ?? refuse("not-found");
  check(editAnnouncementRefusal(me, a.author, text));
  if (text === null) g.announcements = g.announcements.filter((x) => x !== a);
  else Object.assign(a, { text: text.trim(), editedAt: w.now });
}

export function readAnnouncementsIn(w: GuildWrite): void {
  const { g } = mine(w);
  const p = playerOf(w.world, w.player);
  p.reads = { ...p.reads, [g.id]: w.now };
}

export function visitGuildTabIn(w: GuildWrite): void {
  playerOf(w.world, w.player).firstVisit ??= w.now;
}

/** Marks the writer seen (the leader's rotation reads it). */
export function seen(w: GuildWrite): void {
  playerOf(w.world, w.player).seenAt = w.now;
}
