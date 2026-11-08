import {
  ALLIANCE_INVITE_TTL_S,
  GUILD_RANK,
  acceptAllianceInvitationRefusal,
  allianceInvitationOpen,
  allianceNameKey,
  alliancePlace,
  allianceScore,
  answerAllianceRequestRefusal,
  cancelAllianceRequestRefusal,
  createAllianceRefusal,
  declineAllianceInvitationRefusal,
  editAllianceRefusal,
  inviteGuildRefusal,
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
  type AllianceRefusal,
  type AllianceRole,
  type AllianceSettings,
} from "@paved/game-core";
import { addressKey } from "../keys";
import {
  AllianceRefusedError,
  type AllianceBadge,
  type AllianceInvitation,
  type AlliancePlace,
  type AllianceSummary,
  type AllianceView,
  type GuildSummary,
  type PlayerAlliance,
} from "../social-source";
import { communityMember } from "./community";
import { summaryOf, type GuildPeople, type GuildWorld, type StoredGuild } from "./guilds";
import { SEEDED_FROM_DAY } from "./players";

// The mock's alliances (ALLIANCES): the alliance world of the device, kept in the ledger's state (`StoredState.alliances`), on
// game-core's rules (`packages/game-core/src/social/alliance.ts`), over the guilds' world (`guilds.ts`): an alliance holds guild IDs,
// and a guild's leader acts for it. Until a write keeps it, the world is the seeded one: two alliances of the community's six guilds,
// the same on every device; Hollow Oak is in none.
//
// The community's guilds are led from other devices, so the mock plays their leaders' part, from the times the world keeps (never a
// timer: `settleAlliances` applies what is due at each read and before each write, so a read and the next write agree):
// - an alliance whose head guild a community player leads answers a guild's request `MOCK_ACCEPT_S` after it was sent;
// - a guild a community player leads, invited while in no alliance, accepts `MOCK_INVITE_ANSWER_S` later;
// - an alliance a device's player created gets a community guild's request `MOCK_SEED_REQUEST_S` later;
// - Northern Accord invites the guild of a device's player who leads one in no alliance `MOCK_INVITATION_S` after their first visit
//   to the alliance view (as Iron Quay Wardens invites a guildless player, #953).
// The guilds' own changes reach the alliances at the same time: a guild disbanded leaves its alliance, the longest-serving guild left
// takes the head when it was the head (game-core's `nextHeadGuild`), and an alliance left with no guild is gone.

/** An alliance led from the community answers a request this long after it was sent, in seconds. */
export const MOCK_ACCEPT_S = 5;
/** A guild led from the community accepts an invitation this long after it was sent. */
export const MOCK_INVITE_ANSWER_S = 10;
/** An alliance a device's player created gets a community guild's request this long after its creation. */
export const MOCK_SEED_REQUEST_S = 30;
/** The mock's invitation comes this long after a guild leader's first visit to the alliance view. */
export const MOCK_INVITATION_S = 60;
/** The first alliance ID. */
const FIRST_ALLIANCE_ID = 700;

/** A guild of an alliance as stored: its ID, its role, when it joined. */
export interface StoredAllianceGuild {
  id: number;
  role: AllianceRole;
  joinedAt: number;
}

export interface StoredAlliance {
  id: number;
  name: string;
  settings: AllianceSettings;
  createdAt: number;
  guilds: StoredAllianceGuild[];
  /** Guilds' requests, oldest first. */
  requests: { guild: number; sentAt: number }[];
  /** Invitations sent to guilds, oldest first. */
  invitations: { guild: number; inviter: string; sentAt: number }[];
  /** When a community guild requests to join (an alliance a device's player created); null: done or none. */
  seedRequestAt: number | null;
}

/** A device's player, as the alliances keep them: their first visit to the alliance view, and whether the mock's invitation came. */
export interface StoredAlliancePlayer {
  firstVisit?: number;
  invited?: boolean;
}

/** The stored world's version. */
export const ALLIANCE_WORLD_VERSION = 1;

export interface AllianceWorld {
  version: typeof ALLIANCE_WORLD_VERSION;
  nextId: number;
  alliances: StoredAlliance[];
  /** By address key. */
  players: Record<string, StoredAlliancePlayer>;
}

const key = (address: string): string => addressKey(address);
const refuse = (reason: AllianceRefusal): never => {
  throw new AllianceRefusedError(reason);
};
const check = (reason: AllianceRefusal | null): void => {
  if (reason) refuse(reason);
};

// --- The seeded world ------------------------------------------------------------------------------------------------

/** The seeded alliances' start: two weeks after the seeded guilds' (`guilds.ts`, from 2026-09-22), every guild founded by then. */
const SEED_T0 = SEEDED_FROM_DAY * 86_400 + 14 * 86_400;
/** The seeded guilds' IDs (`guilds.ts`, in their order from 20,000). */
const QUARRYMEN = 20_000;
const IRON_QUAY = 20_002;
const MILLSTONE = 20_003;
const THISTLE = 20_004;
const LANTERNS = 20_005;

/** The alliance that sends the mock's invitation: Northern Accord. */
const INVITING_ALLIANCE = FIRST_ALLIANCE_ID + 1;

interface AllianceSeed {
  name: string;
  settings: AllianceSettings;
  /** The head guild, then the members in the order they joined. */
  head: number;
  members: number[];
}

/** The seeded alliances, hand-written: two of the six guilds' world (Hollow Oak in none). */
const SEEDS: readonly AllianceSeed[] = [
  {
    name: "Stone Pact",
    settings: { emblem: { icon: 18, primary: 4, secondary: 0, charge: 8 }, description: "Three guilds of the valley under one banner. We share the quarry, the roads and the ranking." },
    head: QUARRYMEN,
    members: [MILLSTONE, LANTERNS],
  },
  {
    name: "Northern Accord",
    settings: { emblem: { icon: 14, primary: 5, secondary: 8, charge: 0 }, description: "The harbour and the moors hold together. Guild leaders: ask, and we answer within the day." },
    head: IRON_QUAY,
    members: [THISTLE],
  },
];

function seededAlliance(seed: AllianceSeed, i: number): StoredAlliance {
  const createdAt = SEED_T0 + i * 86_400;
  const guilds: StoredAllianceGuild[] = [{ id: seed.head, role: "head", joinedAt: createdAt }, ...seed.members.map((id, n) => ({ id, role: "member" as const, joinedAt: createdAt + 3_600 * (6 + n * 20) }))];
  return { id: FIRST_ALLIANCE_ID + i, name: seed.name, settings: structuredClone(seed.settings), createdAt, guilds, requests: [], invitations: [], seedRequestAt: null };
}

/** The seeded world: the same on every device, before any write. */
export const seededAllianceWorld = (): AllianceWorld => ({ version: ALLIANCE_WORLD_VERSION, nextId: FIRST_ALLIANCE_ID + SEEDS.length, alliances: SEEDS.map(seededAlliance), players: {} });

/** A stored world of this version, or null (then the seeded one serves). */
export function parseAllianceWorld(stored: unknown): AllianceWorld | null {
  const w = stored as { version?: unknown; alliances?: unknown; players?: unknown } | null | undefined;
  if (!w || typeof w !== "object" || w.version !== ALLIANCE_WORLD_VERSION || !Array.isArray(w.alliances) || typeof w.players !== "object" || w.players === null) return null;
  return w as AllianceWorld;
}

// --- Lookups ---------------------------------------------------------------------------------------------------------

const allianceById = (world: AllianceWorld, id: number): StoredAlliance | null => world.alliances.find((a) => a.id === id) ?? null;
const allianceOfGuildId = (world: AllianceWorld, guild: number): StoredAlliance | null => world.alliances.find((a) => a.guilds.some((g) => g.id === guild)) ?? null;
const pendingOf = (world: AllianceWorld, guild: number): StoredAlliance | null => world.alliances.find((a) => a.requests.some((r) => r.guild === guild)) ?? null;
const headOf = (a: StoredAlliance): StoredAllianceGuild => a.guilds.find((g) => g.role === "head") ?? a.guilds[0]!;
const guildById = (guilds: GuildWorld, id: number): StoredGuild | null => guilds.guilds.find((g) => g.id === id) ?? null;
const guildOfPlayer = (guilds: GuildWorld, address: string): StoredGuild | null => guilds.guilds.find((g) => g.members.some((m) => m.address === address)) ?? null;
/** A guild's leader's address key (the guilds' rotation already applied by their settlement). */
const leaderOf = (g: StoredGuild): string => (g.members.find((m) => m.rank === GUILD_RANK.leader) ?? g.members[0]!).address;
/** Whether a guild is led from the community (the mock plays its leader). */
const ledFromCommunity = (g: StoredGuild | null): boolean => g !== null && communityMember(leaderOf(g)) !== null;
const playerOf = (world: AllianceWorld, address: string): StoredAlliancePlayer => (world.players[address] ??= {});

/** The rules' view of a player acting for their guild. */
export function actorOf(alliances: AllianceWorld, guilds: GuildWorld, address: string): AllianceActor {
  const g = guildOfPlayer(guilds, address);
  if (!g) return { guild: null, rank: null, alliance: null, role: null };
  const a = allianceOfGuildId(alliances, g.id);
  return { guild: g.id, rank: g.members.find((m) => m.address === address)!.rank, alliance: a?.id ?? null, role: a?.guilds.find((x) => x.id === g.id)!.role ?? null };
}

const opening = (a: StoredAlliance) => ({ id: a.id, guilds: a.guilds.length });

/** `guild` joins `a` at `at`: its request and every invitation to it gone. */
function enter(world: AllianceWorld, a: StoredAlliance, guild: number, at: number): void {
  for (const other of world.alliances) {
    other.requests = other.requests.filter((r) => r.guild !== guild);
    other.invitations = other.invitations.filter((i) => i.guild !== guild);
  }
  a.guilds.push({ id: guild, role: "member", joinedAt: at });
}

/** `guild` leaves `a`: the last one gone, the alliance is gone; the head gone, the longest-serving guild left takes it. */
function exit(world: AllianceWorld, a: StoredAlliance, guild: number): void {
  if (leaveDisbandsAlliance(a.guilds.length)) {
    world.alliances = world.alliances.filter((other) => other !== a);
    return;
  }
  const wasHead = a.guilds.find((g) => g.id === guild)?.role === "head";
  a.guilds = a.guilds.filter((g) => g.id !== guild);
  if (wasHead) {
    const next = nextHeadGuild(a.guilds);
    for (const g of a.guilds) g.role = g.id === next ? "head" : "member";
  }
}

// --- What the community does, when due -------------------------------------------------------------------------------

interface Due {
  at: number;
  apply: () => void;
}

function nextDue(world: AllianceWorld, guilds: GuildWorld, now: number): Due | null {
  const due: Due[] = [];
  for (const a of world.alliances) {
    const head = guildById(guilds, headOf(a).id);
    if (ledFromCommunity(head)) {
      for (const r of a.requests) {
        due.push({
          at: r.sentAt + MOCK_ACCEPT_S,
          apply: () => {
            a.requests = a.requests.filter((x) => x !== r);
            const leader = actorOf(world, guilds, leaderOf(head!));
            if (guildById(guilds, r.guild) && answerAllianceRequestRefusal(leader, opening(a), { alliance: allianceOfGuildId(world, r.guild)?.id ?? null }, true) === null) enter(world, a, r.guild, r.sentAt + MOCK_ACCEPT_S);
          },
        });
      }
    }
    for (const inv of a.invitations) {
      const invited = guildById(guilds, inv.guild);
      if (!ledFromCommunity(invited) || allianceOfGuildId(world, inv.guild) !== null) continue;
      due.push({
        at: inv.sentAt + MOCK_INVITE_ANSWER_S,
        apply: () => {
          const at = inv.sentAt + MOCK_INVITE_ANSWER_S;
          if (acceptAllianceInvitationRefusal(actorOf(world, guilds, leaderOf(invited!)), inv, at, opening(a)) === null) enter(world, a, inv.guild, at);
          else a.invitations = a.invitations.filter((x) => x !== inv);
        },
      });
    }
    if (a.seedRequestAt !== null) {
      const at = a.seedRequestAt;
      due.push({
        at,
        apply: () => {
          a.seedRequestAt = null;
          const asking = guilds.guilds.find((g) => ledFromCommunity(g) && requestAllianceRefusal(actorOf(world, guilds, leaderOf(g)), opening(a), pendingOf(world, g.id)?.id ?? null) === null);
          if (asking) a.requests.push({ guild: asking.id, sentAt: at });
        },
      });
    }
  }
  const inviting = allianceById(world, INVITING_ALLIANCE);
  for (const [address, p] of Object.entries(world.players)) {
    if (p.firstVisit === undefined || p.invited) continue;
    const at = p.firstVisit + MOCK_INVITATION_S;
    due.push({
      at,
      apply: () => {
        p.invited = true;
        if (!inviting) return;
        const head = guildById(guilds, headOf(inviting).id);
        const target = guildOfPlayer(guilds, address);
        if (!head || !target || leaderOf(target) !== address) return;
        const invited = inviting.invitations.some((i) => i.guild === target.id);
        if (inviteGuildRefusal(actorOf(world, guilds, leaderOf(head)), opening(inviting), { id: target.id, alliance: allianceOfGuildId(world, target.id)?.id ?? null, invited }) !== null) return;
        inviting.invitations.push({ guild: target.id, inviter: leaderOf(head), sentAt: at });
      },
    });
  }
  return due.filter((d) => d.at <= now).sort((a, b) => a.at - b.at)[0] ?? null;
}

/**
 * Applies to `world`, in place, the guilds' changes (a disbanded guild leaves its alliance), what the community does by `now` (in
 * time order), and lapses the old invitations. A function of the stored worlds and `now` alone: a read settles a copy, a write settles
 * before its check.
 */
export function settleAlliances(world: AllianceWorld, guilds: GuildWorld, now: number): AllianceWorld {
  for (const a of [...world.alliances]) for (const g of [...a.guilds]) if (!guildById(guilds, g.id)) exit(world, a, g.id);
  for (const a of world.alliances) {
    a.requests = a.requests.filter((r) => guildById(guilds, r.guild) !== null);
    a.invitations = a.invitations.filter((i) => guildById(guilds, i.guild) !== null);
  }
  for (let n = 0; n < 1_000; n++) {
    const due = nextDue(world, guilds, now);
    if (!due) break;
    due.apply();
  }
  for (const a of world.alliances) a.invitations = a.invitations.filter((i) => allianceInvitationOpen(i.sentAt, now));
  return world;
}

// --- Reads -----------------------------------------------------------------------------------------------------------

/** What the alliances read of the guilds and the players at `now`. */
export interface AllianceRead {
  alliances: AllianceWorld;
  guilds: GuildWorld;
  people: GuildPeople;
  now: number;
}

/** A guild's card (`guilds.ts`'s), or a stand-in for a guild no longer there (never shown: settled worlds hold none). */
function cardOf(r: AllianceRead, id: number): GuildSummary {
  const g = guildById(r.guilds, id);
  return g ? summaryOf(g, r.people, r.now) : { id, tag: "", name: "", emblem: { icon: 0, primary: 0, secondary: 0 }, description: "", joinType: "open", requirements: { level: 0, crowns: 0 }, members: 0, score: 0, active: 0 };
}

function summaryOfAlliance(r: AllianceRead, a: StoredAlliance): AllianceSummary {
  const cards = a.guilds.map((g) => cardOf(r, g.id));
  const head = headOf(a);
  return {
    id: a.id,
    name: a.name,
    emblem: { ...a.settings.emblem },
    description: a.settings.description,
    guilds: a.guilds.length,
    members: cards.reduce((sum, c) => sum + c.members, 0),
    score: allianceScore(cards),
    head: { id: head.id, name: cardOf(r, head.id).name },
  };
}

function viewOf(r: AllianceRead, a: StoredAlliance, viewer: string | null): AllianceView {
  const actor = viewer === null ? null : actorOf(r.alliances, r.guilds, viewer);
  const mine = actor !== null && actor.alliance === a.id;
  const leadsGuild = mine && actor.rank !== null && actor.rank >= GUILD_RANK.leader;
  const leads = leadsGuild && actor.role === "head";
  const roster = sortAllianceGuilds(a.guilds.map((g) => ({ ...g, score: cardOf(r, g.id).score }))).map((g) => ({ guild: cardOf(r, g.id), role: g.role, joinedAt: g.joinedAt }));
  return {
    ...summaryOfAlliance(r, a),
    roster,
    role: mine ? actor.role : null,
    leads,
    leadsGuild,
    requests: leads ? a.requests.map((q) => ({ guild: cardOf(r, q.guild), sentAt: q.sentAt })) : null,
    invitations: leads ? [...a.invitations].sort((x, y) => y.sentAt - x.sentAt).map((i) => ({ guild: cardOf(r, i.guild), sentAt: i.sentAt, expiresAt: i.sentAt + ALLIANCE_INVITE_TTL_S })) : null,
  };
}

/** The connected player's alliance, through their guild. */
export function playerAllianceOf(r: AllianceRead, player: string): PlayerAlliance {
  const address = key(player);
  const g = guildOfPlayer(r.guilds, address);
  if (!g) return { guild: null, alliance: null, request: null, invitations: [], badge: 0 };
  const rank = g.members.find((m) => m.address === address)!.rank;
  const a = allianceOfGuildId(r.alliances, g.id);
  const alliance = a ? viewOf(r, a, address) : null;
  const leader = rank >= GUILD_RANK.leader;
  const pending = leader ? pendingOf(r.alliances, g.id) : null;
  const request = pending ? { alliance: summaryOfAlliance(r, pending), sentAt: pending.requests.find((q) => q.guild === g.id)!.sentAt } : null;
  const invitations: AllianceInvitation[] = leader
    ? r.alliances.alliances
        .flatMap((other) => other.invitations.filter((i) => i.guild === g.id).map((i) => ({ alliance: summaryOfAlliance(r, other), inviter: i.inviter, inviterName: r.people(i.inviter).name, sentAt: i.sentAt, expiresAt: i.sentAt + ALLIANCE_INVITE_TTL_S })))
        .sort((x, y) => y.sentAt - x.sentAt)
    : [];
  const requests = alliance?.requests?.length ?? 0;
  return { guild: { id: g.id, name: g.name, rank }, alliance, request, invitations, badge: invitations.length + requests };
}

/** An alliance's page as `viewer` sees it, or null. */
export function allianceViewOf(r: AllianceRead, id: number, viewer: string | null): AllianceView | null {
  const a = allianceById(r.alliances, id);
  return a ? viewOf(r, a, viewer === null ? null : key(viewer)) : null;
}

/** The alliance a guild is in, as the guild's page shows it. */
export function allianceBadgeOf(world: AllianceWorld, guild: number): AllianceBadge | null {
  const a = allianceOfGuildId(world, guild);
  return a ? { id: a.id, name: a.name, emblem: { ...a.settings.emblem }, role: a.guilds.find((g) => g.id === guild)!.role } : null;
}

const listings = (r: AllianceRead) => r.alliances.alliances.map((a) => summaryOfAlliance(r, a));

export const searchAlliancesOf = (r: AllianceRead, query: string): AllianceSummary[] => searchAlliances(listings(r), query);
export const allianceRankingOf = (r: AllianceRead): AllianceSummary[] => rankAlliances(listings(r));
export const alliancePlaceOf = (r: AllianceRead, id: number): AlliancePlace | null => alliancePlace(listings(r), id);

// --- Writes ----------------------------------------------------------------------------------------------------------

/** An alliance write, applied in place on settled worlds for `player` at `now`; a refusal throws an `AllianceRefusedError`. */
export interface AllianceWrite extends AllianceRead {
  player: string;
}

const actorIn = (w: AllianceWrite): AllianceActor => actorOf(w.alliances, w.guilds, w.player);

/** The actor's alliance (refused: in none). */
const mineOf = (w: AllianceWrite, actor: AllianceActor): StoredAlliance => (actor.alliance === null ? null : allianceById(w.alliances, actor.alliance)) ?? refuse("not-in-alliance");

export function createAllianceIn(w: AllianceWrite, draft: AllianceDraft): number {
  const actor = actorIn(w);
  const taken = new Set(w.alliances.alliances.map((a) => allianceNameKey(a.name)));
  check(createAllianceRefusal(actor, draft, (k) => taken.has(k)));
  const id = w.alliances.nextId++;
  for (const other of w.alliances.alliances) other.requests = other.requests.filter((r) => r.guild !== actor.guild);
  w.alliances.alliances.push({
    id,
    name: normalAllianceName(draft.name),
    settings: { emblem: { ...draft.emblem }, description: draft.description },
    createdAt: w.now,
    guilds: [{ id: actor.guild!, role: "head", joinedAt: w.now }],
    requests: [],
    invitations: [],
    seedRequestAt: w.now + MOCK_SEED_REQUEST_S,
  });
  // A guild in an alliance holds no invitation: those it held go.
  for (const other of w.alliances.alliances) other.invitations = other.invitations.filter((i) => i.guild !== actor.guild);
  return id;
}

export function editAllianceIn(w: AllianceWrite, settings: AllianceSettings): void {
  const actor = actorIn(w);
  check(editAllianceRefusal(actor, settings));
  const a = mineOf(w, actor);
  a.settings = { emblem: { ...settings.emblem }, description: settings.description };
}

export function requestAllianceIn(w: AllianceWrite, id: number): void {
  const a = allianceById(w.alliances, id) ?? refuse("not-found");
  const actor = actorIn(w);
  check(requestAllianceRefusal(actor, opening(a), actor.guild === null ? null : (pendingOf(w.alliances, actor.guild)?.id ?? null)));
  a.requests.push({ guild: actor.guild!, sentAt: w.now });
}

export function cancelAllianceRequestIn(w: AllianceWrite): void {
  const actor = actorIn(w);
  const a = actor.guild === null ? null : pendingOf(w.alliances, actor.guild);
  check(cancelAllianceRequestRefusal(actor, a?.id ?? null));
  a!.requests = a!.requests.filter((r) => r.guild !== actor.guild);
}

export function answerAllianceRequestIn(w: AllianceWrite, guild: number, accept: boolean): void {
  const actor = actorIn(w);
  const a = actor.alliance === null ? null : allianceById(w.alliances, actor.alliance);
  check(answerAllianceRequestRefusal(actor, a ? opening(a) : { id: -1, guilds: 0 }, { alliance: null }, false));
  const r = a!.requests.find((x) => x.guild === guild) ?? refuse("no-request");
  if (accept) check(answerAllianceRequestRefusal(actor, opening(a!), { alliance: allianceOfGuildId(w.alliances, guild)?.id ?? null }, true));
  a!.requests = a!.requests.filter((x) => x !== r);
  if (accept) enter(w.alliances, a!, guild, w.now);
}

export function inviteGuildIn(w: AllianceWrite, guild: number): void {
  const actor = actorIn(w);
  const a = mineOf(w, actor);
  if (!guildById(w.guilds, guild)) refuse("not-found");
  check(inviteGuildRefusal(actor, opening(a), { id: guild, alliance: allianceOfGuildId(w.alliances, guild)?.id ?? null, invited: a.invitations.some((i) => i.guild === guild) }));
  a.invitations.push({ guild, inviter: w.player, sentAt: w.now });
}

export function answerAllianceInvitationIn(w: AllianceWrite, id: number, accept: boolean): void {
  const actor = actorIn(w);
  check(declineAllianceInvitationRefusal(actor));
  const a = allianceById(w.alliances, id) ?? refuse("not-found");
  const inv = a.invitations.find((i) => i.guild === actor.guild) ?? refuse("invite-expired");
  if (!accept) {
    a.invitations = a.invitations.filter((i) => i !== inv);
    return;
  }
  check(acceptAllianceInvitationRefusal(actor, inv, w.now, opening(a)));
  enter(w.alliances, a, actor.guild!, w.now);
}

export function removeGuildIn(w: AllianceWrite, guild: number): void {
  const actor = actorIn(w);
  check(removeGuildRefusal(actor, { id: guild, alliance: allianceOfGuildId(w.alliances, guild)?.id ?? null }));
  exit(w.alliances, mineOf(w, actor), guild);
}

export function makeHeadGuildIn(w: AllianceWrite, guild: number): void {
  const actor = actorIn(w);
  check(makeHeadRefusal(actor, { id: guild, alliance: allianceOfGuildId(w.alliances, guild)?.id ?? null }));
  for (const g of mineOf(w, actor).guilds) g.role = g.id === guild ? "head" : "member";
}

export function leaveAllianceIn(w: AllianceWrite): void {
  const actor = actorIn(w);
  const a = actor.alliance === null ? null : allianceById(w.alliances, actor.alliance);
  check(leaveAllianceRefusal(actor, a?.guilds.length ?? 0));
  exit(w.alliances, a!, actor.guild!);
}

export function visitAllianceIn(w: AllianceWrite): void {
  playerOf(w.alliances, w.player).firstVisit ??= w.now;
}
