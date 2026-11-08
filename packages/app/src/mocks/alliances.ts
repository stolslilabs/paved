import { ALLIANCE_DESCRIPTION_MAX, ALLIANCE_NAME_MAX, GUILD_NAME_MAX } from "@paved/game-core";
import type { AlliancePageProps } from "../components/containers/alliance-page";
import { addressKey } from "../data/keys";
import { allianceRankingOf, allianceViewOf, inviteGuildIn, playerAllianceOf, requestAllianceIn, searchAlliancesOf, seededAllianceWorld, type AllianceRead } from "../data/mock/alliances";
import { community, communityProfile } from "../data/mock/community";
import { createGuildIn, seededGuildWorld, type GuildPeople } from "../data/mock/guilds";
import type { AllianceBadge, AllianceSummary, AllianceView, GuildSummary, PlayerAlliance } from "../data/social-source";
import { allianceApply } from "../routes/social/alliance-apply";
import { GUILD_NOW } from "./guilds";

// The alliances' mocks (ALLIANCES): the mock's seeded worlds (`data/mock/guilds.ts`, `data/mock/alliances.ts`), the community's six
// guilds in two alliances, with two more guilds, a request and an invitation, read as their leaders and members see them at
// `GUILD_NOW`; and the states of the alliance's page and the guild page's Alliance view.

/** A community player's profile at `GUILD_NOW`. */
const person: GuildPeople = (address) => communityProfile(address, GUILD_NOW) ?? { address, name: null, look: null, level: 1, crowns: 0, league: 0, score: 0, lastSeen: GUILD_NOW - 3_600 };
const at = (index: number) => addressKey(community()[index]!.address);

/** Community indexes: the seeded guilds' leaders (`guilds.ts`), an officer of The Quarrymen, and two guildless players who found a guild. */
const LEAD = { quarrymen: 48, hollowOak: 49, millstone: 47, lanterns: 20, furrow: 5, bells: 6 } as const;
const QUARRY_OFFICER = 24;
const STONE_PACT = 700;
const NORTHERN_ACCORD = 701;

/** The worlds as the stories read them: the seeded ones, two more guilds, Hollow Oak's request at Stone Pact and its invitation to Wild Furrow. */
function storyWorlds(): AllianceRead {
  const guilds = seededGuildWorld();
  const found = (index: number, name: string, icon: number, primary: number) =>
    createGuildIn({ world: guilds, people: person, now: GUILD_NOW - 5 * 86_400, player: at(index) }, { name, emblem: { icon, primary, secondary: 6 }, description: "", joinType: "open", requirements: { level: 0, crowns: 0 } });
  const furrow = found(LEAD.furrow, "Wild Furrow", 19, 2);
  found(LEAD.bells, "Copper Bells", 12, 7);
  const r: AllianceRead = { alliances: seededAllianceWorld(), guilds, people: person, now: GUILD_NOW };
  requestAllianceIn({ ...r, now: GUILD_NOW - 2 * 3_600, player: at(LEAD.hollowOak) }, STONE_PACT);
  inviteGuildIn({ ...r, now: GUILD_NOW - 86_400, player: at(LEAD.quarrymen) }, furrow);
  return r;
}

/** Stone Pact full: the five guilds the cap allows (Hollow Oak and Wild Furrow in it). */
function fullWorlds(): AllianceRead {
  const r = storyWorlds();
  const pact = r.alliances.alliances.find((a) => a.id === STONE_PACT)!;
  const ids = r.guilds.guilds.map((g) => g.id).filter((id) => !r.alliances.alliances.some((a) => a.guilds.some((g) => g.id === id)));
  for (const id of ids.slice(0, 5 - pact.guilds.length)) pact.guilds.push({ id, role: "member", joinedAt: GUILD_NOW - 86_400 });
  pact.requests = [];
  pact.invitations = [];
  return r;
}

/** Ashford Lanterns' leader founding an alliance alone: their guild out of Stone Pact, at the head of its own. */
function aloneWorlds(): AllianceRead {
  const r = storyWorlds();
  const pact = r.alliances.alliances.find((a) => a.id === STONE_PACT)!;
  pact.guilds = pact.guilds.filter((g) => g.id !== 20_005);
  r.alliances.alliances.push({ id: 702, name: "Lantern Road", settings: { emblem: { icon: 12, primary: 7, secondary: 0, charge: 0 }, description: "" }, createdAt: GUILD_NOW - 3_600, guilds: [{ id: 20_005, role: "head", joinedAt: GUILD_NOW - 3_600 }], requests: [], invitations: [], seedRequestAt: null });
  return r;
}

const WORLDS = storyWorlds();
const FULL = fullWorlds();
const ALONE = aloneWorlds();
const view = (id: number, viewer: number | null, r: AllianceRead = WORLDS): AllianceView => allianceViewOf(r, id, viewer === null ? null : at(viewer))!;
const playerOf = (index: number, r: AllianceRead = WORLDS): PlayerAlliance => playerAllianceOf(r, at(index));
const guildIdOf = (index: number, r: AllianceRead = WORLDS) => playerOf(index, r).guild?.id ?? null;

/** The stress alliance (WRAP360): the longest names and description, the largest figures. */
function stressView(base: AllianceView): AllianceView {
  const long = (g: GuildSummary): GuildSummary => ({ ...g, name: "W".repeat(GUILD_NAME_MAX), members: 50, score: 499_950 });
  return {
    ...base,
    name: "W".repeat(ALLIANCE_NAME_MAX),
    description: "Mmmmmmmmmm ".repeat(14).slice(0, ALLIANCE_DESCRIPTION_MAX),
    guilds: 5,
    members: 250,
    score: 2_499_750,
    roster: [...base.roster.map((g) => ({ ...g, guild: long(g.guild) })), ...base.roster.slice(0, 5 - base.roster.length).map((g) => ({ ...g, role: "member" as const, guild: long(g.guild) }))],
    requests: base.requests?.map((q) => ({ ...q, guild: long(q.guild) })) ?? null,
    invitations: base.invitations?.map((v) => ({ ...v, guild: long(v.guild) })) ?? null,
  };
}

type PageData = Pick<AlliancePageProps, "alliance" | "myGuild" | "now" | "apply">;
/** An alliance's page as a player sees it, with what they may do (a guild leader outside it). */
const pageOf = (id: number, index: number, r: AllianceRead = WORLDS): PageData => {
  const alliance = view(id, index, r);
  return { alliance, myGuild: guildIdOf(index, r), now: GUILD_NOW, apply: allianceApply(alliance, playerOf(index, r)) };
};

/** The alliance page's states (ALLIANCES). */
export const ALLIANCE_PAGE = {
  /** The alliance's leader (The Quarrymen's, the head guild): the menu, the guilds, Hollow Oak's request, the invitation sent. */
  leader: pageOf(STONE_PACT, LEAD.quarrymen),
  /** A member guild's leader (Order of the Millstone's): the menu holds Leave. */
  memberLeader: pageOf(STONE_PACT, LEAD.millstone),
  /** A player of a member guild who does not lead it: the page alone, no menu. */
  member: pageOf(STONE_PACT, QUARRY_OFFICER),
  /** Another alliance seen by a guild leader in none (Copper Bells'): Request to join. */
  visitor: pageOf(NORTHERN_ACCORD, LEAD.bells),
  /** Hollow Oak's leader on Stone Pact, their request waiting: Cancel. */
  requested: pageOf(STONE_PACT, LEAD.hollowOak),
  /** Hollow Oak's leader on Northern Accord: their request waits at Stone Pact. */
  requestedElsewhere: pageOf(NORTHERN_ACCORD, LEAD.hollowOak),
  /** Wild Furrow's leader on Stone Pact, which invited their guild: Accept or Decline. */
  invited: pageOf(STONE_PACT, LEAD.furrow),
  /** Stone Pact full (Hollow Oak and Wild Furrow in it), seen by Copper Bells' leader: why they may not ask. */
  full: pageOf(STONE_PACT, LEAD.bells, FULL),
  /** Lantern Road, its one guild's leader: the menu's Disband. */
  alone: pageOf(702, LEAD.lanterns, ALONE),
  /** A player outside any guild (anyone): the page alone. */
  anyone: { alliance: view(NORTHERN_ACCORD, null), myGuild: null, now: GUILD_NOW },
  /** WRAP360, the alliance's leader: the longest names and the largest figures. */
  stress: { ...pageOf(STONE_PACT, LEAD.quarrymen), alliance: stressView(view(STONE_PACT, LEAD.quarrymen)) },
} satisfies Record<string, PageData>;

/** The players' alliance states (the guild page's Alliance view). */
export const PLAYER_ALLIANCE = {
  /** The alliance's leader: their alliance, its requests badged. */
  leader: playerOf(LEAD.quarrymen),
  /** A member guild's leader. */
  memberLeader: playerOf(LEAD.millstone),
  /** A player of a guild in an alliance who does not lead it. */
  member: playerOf(QUARRY_OFFICER),
  /** A guild's leader in none, with Stone Pact's invitation: Accept or Decline, Create, Find. */
  invited: playerOf(LEAD.furrow),
  /** A guild's leader in none, their request waiting at Stone Pact: Cancel, Create, Find. */
  requested: playerOf(LEAD.hollowOak),
  /** A guild's leader in none, nothing waiting: Create, Find. */
  free: playerOf(LEAD.bells),
  /** A player of a guild in none who does not lead it: "No alliance". */
  none: playerAllianceOf(WORLDS, at(28)),
} satisfies Record<string, PlayerAlliance>;

/** The alliances by score, and a search. */
export const ALLIANCE_LISTS = {
  ranking: allianceRankingOf(WORLDS),
  search: searchAlliancesOf(WORLDS, "nor"),
} satisfies Record<string, AllianceSummary[]>;

/** The stories' alliance IDs, guilds and clock. */
export const ALLIANCE_IDS = { stonePact: STONE_PACT, northernAccord: NORTHERN_ACCORD, quarrymen: 20_000, hollowOak: 20_001 } as const;

/** A guild's alliance as its page shows it, under its tag. */
const badgeOf = (v: AllianceView, role: AllianceBadge["role"]): AllianceBadge => ({ id: v.id, name: v.name, emblem: v.emblem, role });
export const ALLIANCE_BADGE = {
  /** The Quarrymen, Stone Pact's head guild. */
  head: badgeOf(ALLIANCE_PAGE.leader.alliance, "head"),
  /** Thistle Watch, in Northern Accord. */
  member: badgeOf(ALLIANCE_PAGE.visitor.alliance, "member"),
  /** WRAP360: the longest name. */
  stress: { ...badgeOf(ALLIANCE_PAGE.leader.alliance, "head"), name: "W".repeat(ALLIANCE_NAME_MAX) },
} satisfies Record<string, AllianceBadge>;
