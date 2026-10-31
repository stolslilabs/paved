import { joinRefusal, requestRefusal, type GuildCandidate } from "@paved/game-core";
import type { GuildApply } from "../../components/containers/guild-page";
import type { GuildSummary, PlayerGuild } from "../../data/social-source";
import { REFUSALS } from "../../lib/guild-text";

/** Level and crowns not read yet: the requirements are left to the source, which refuses with why. */
const UNKNOWN = { level: Number.MAX_SAFE_INTEGER, crowns: Number.MAX_SAFE_INTEGER };

/**
 * What the connected player may do on the page of a guild they are not in (#953), by game-core's checks: answer its invitation
 * (from another guild, after confirming they leave it), cancel their request there, Join an Open guild, Request a By-request
 * one, or why not (full, a requirement, invite only, a request waiting elsewhere, in a guild already).
 */
export function guildApply(guild: GuildSummary, player: PlayerGuild, candidate: Pick<GuildCandidate, "level" | "crowns"> | null): GuildApply {
  if (player.invitations.some((i) => i.guild.id === guild.id)) return { kind: "invited", leaving: player.guild?.name ?? null };
  if (player.request?.guild.id === guild.id) return { kind: "requested" };
  const me = { ...(candidate ?? UNKNOWN), guild: player.guild?.id ?? null };
  const opening = { id: guild.id, joinType: guild.joinType, requirements: guild.requirements, members: guild.members };
  const refused = guild.joinType === "request" ? requestRefusal({ ...me, pending: player.request?.guild.id ?? null }, opening) : joinRefusal(me, opening);
  if (refused === null) return { kind: guild.joinType === "request" ? "request" : "join" };
  return { kind: "blocked", reason: REFUSALS[refused] };
}
