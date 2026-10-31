import { GUILD_MAX_MEMBERS, formatInteger, guildFull, requirementsUnmet, type GuildCandidate, type GuildJoinType } from "@paved/game-core";
import type { GuildSummary } from "../../data/social-source";
import { JOIN_TYPES, REFUSALS, requirementsText } from "../../lib/guild-text";
import { cn } from "../../lib/utils";
import { Icon } from "../ui/icon";
import { GuildEmblem } from "../elements/guild-emblem";

/** A guild's join type: its icon and name. */
export function JoinType({ type, className }: { type: GuildJoinType; className?: string }) {
  const { label, icon } = JOIN_TYPES[type];
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap", className)}>
      <Icon name={icon} size="xs" fixedWidth />
      {label}
    </span>
  );
}

/** The member count out of the cap: "12/50". */
export function MemberCount({ members, className }: { members: number; className?: string }) {
  return (
    <span role="img" aria-label={`${formatInteger(members)} of ${GUILD_MAX_MEMBERS} members`} className={cn("inline-flex items-center gap-1 whitespace-nowrap", className)}>
      <Icon name="users" size="xs" fixedWidth />
      <span aria-hidden className="numeric">
        {formatInteger(members)}/{GUILD_MAX_MEMBERS}
      </span>
    </span>
  );
}

/** The guild's score, the sum of its members' crowns. */
export function GuildScore({ score, className }: { score: number; className?: string }) {
  return (
    <span role="img" aria-label={`Score ${formatInteger(score)}`} className={cn("inline-flex items-center gap-1 whitespace-nowrap", className)}>
      <Icon name="trophy" size="xs" fixedWidth />
      <span aria-hidden className="numeric">
        {formatInteger(score)}
      </span>
    </span>
  );
}

/** Why `player` may not apply to a guild they are not in, from its card: full, or a requirement not met; null otherwise. */
export function cardBlock(guild: GuildSummary, player: Pick<GuildCandidate, "level" | "crowns"> | null): string | null {
  if (guildFull(guild)) return REFUSALS.full;
  const unmet = player ? requirementsUnmet(player, guild.requirements) : null;
  return unmet ? REFUSALS[unmet] : null;
}

export interface GuildCardProps {
  guild: GuildSummary;
  /** Its place in the ranking (1 first); left out, none shown. */
  place?: number;
  /** The player's level and crowns: the card says when they do not meet the requirements. Null: not known. */
  player?: Pick<GuildCandidate, "level" | "crowns"> | null;
  onOpen?: (id: number) => void;
}

/**
 * A guild as the search, the suggestions and the ranking show it (#953): the emblem, the name, the tag, the members out of 50,
 * the score, the join type and the requirements; full or out of reach, it says why. A tap opens the guild's page.
 */
export function GuildCard({ guild, place, player = null, onOpen }: GuildCardProps) {
  const block = cardBlock(guild, player);
  return (
    <button
      type="button"
      data-slot="guild-card"
      aria-label={`${guild.name}, ${guild.tag}`}
      onClick={() => onOpen?.(guild.id)}
      className="state-layer flex w-full min-w-0 items-center gap-3 rounded-xl border border-border bg-card px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {place !== undefined && <span className="numeric w-6 shrink-0 text-center text-sm font-semibold text-muted-foreground">{formatInteger(place)}</span>}
      <GuildEmblem emblem={guild.emblem} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <span className="min-w-0 font-semibold wrap-anywhere">{guild.name}</span>
          <span className="numeric text-xs text-muted-foreground">{guild.tag}</span>
        </span>
        <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <MemberCount members={guild.members} />
          <GuildScore score={guild.score} />
          <JoinType type={guild.joinType} />
        </span>
        <span className="text-xs text-muted-foreground">Requirements: {requirementsText(guild.requirements)}</span>
        {block && (
          <span data-slot="guild-block" className="flex items-center gap-1 text-xs text-warning">
            <Icon name="triangle-exclamation" size="xs" fixedWidth />
            {block}
          </span>
        )}
      </span>
      <Icon name="chevron-right" size="xs" className="shrink-0 text-muted-foreground" />
    </button>
  );
}
