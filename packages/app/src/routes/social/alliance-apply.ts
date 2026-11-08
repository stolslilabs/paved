import { ALLIANCE_ACTOR_RANK, requestAllianceRefusal } from "@paved/game-core";
import type { AllianceApply } from "../../components/containers/alliance-page";
import type { AllianceSummary, PlayerAlliance } from "../../data/social-source";
import { ALLIANCE_REFUSALS } from "../../lib/alliance-text";

/**
 * What the connected player may do on the page of an alliance their guild is not in (ALLIANCES), by game-core's checks: nothing unless
 * they lead their guild and it is in no alliance; else answer its invitation, cancel their guild's request there, Request to join, or
 * why not (the alliance full, a request waiting elsewhere).
 */
export function allianceApply(alliance: Pick<AllianceSummary, "id" | "guilds">, player: PlayerAlliance): AllianceApply | undefined {
  if (!player.guild || player.guild.rank < ALLIANCE_ACTOR_RANK || player.alliance !== null) return undefined;
  if (player.invitations.some((i) => i.alliance.id === alliance.id)) return { kind: "invited" };
  if (player.request?.alliance.id === alliance.id) return { kind: "requested" };
  const actor = { guild: player.guild.id, rank: player.guild.rank, alliance: null, role: null };
  const refused = requestAllianceRefusal(actor, { id: alliance.id, guilds: alliance.guilds }, player.request?.alliance.id ?? null);
  if (refused === null) return { kind: "request" };
  return { kind: "blocked", reason: refused === "request-pending" && player.request ? `Your guild's request waits at ${player.request.alliance.name}.` : ALLIANCE_REFUSALS[refused] };
}
