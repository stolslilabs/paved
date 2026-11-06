import { GUILD_MAX_MEMBERS, formatInteger, guildFull, requirementsUnmet, type GuildCandidate, type GuildJoinType } from "@paved/game-core";
import type { GuildSummary } from "../../data/social-source";
import { JOIN_TYPES, REFUSALS, requirementsText } from "../../lib/guild-text";
import { cn } from "../../lib/utils";
import { Icon } from "../ui/icon";
import { GuildEmblem } from "../elements/guild-emblem";
import { UiIcon } from "../elements/ui-icon";

/** A guild's join type: its painted icon (GUILD-PAGE: the open padlock, the sealed letter, the padlock) and its name. */
export function JoinType({ type, className }: { type: GuildJoinType; className?: string }) {
  const { label, art } = JOIN_TYPES[type];
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap", className)}>
      <UiIcon name={art} px={16} className="size-4" />
      {label}
    </span>
  );
}

/** The member count out of the cap: "12/50", under the painted busts. */
export function MemberCount({ members, className }: { members: number; className?: string }) {
  return (
    <span role="img" aria-label={`${formatInteger(members)} of ${GUILD_MAX_MEMBERS} members`} className={cn("inline-flex items-center gap-1 whitespace-nowrap", className)}>
      <UiIcon name="members" px={16} className="size-4" />
      <span aria-hidden className="tabular-nums">
        {formatInteger(members)}/{GUILD_MAX_MEMBERS}
      </span>
    </span>
  );
}

/** The guild's score, the sum of its members' crowns, under the painted crown (the guild page's band). */
export function GuildScore({ score, className }: { score: number; className?: string }) {
  return (
    <span role="img" aria-label={`Score ${formatInteger(score)}`} className={cn("inline-flex items-center gap-1 whitespace-nowrap", className)}>
      <UiIcon name="crown" px={16} className="size-4" />
      <span aria-hidden className="tabular-nums">
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
 * the score, the join type and the requirements; full or out of reach, it says why. A tap opens the guild's page. GUILD-PAGE: a row of
 * the drawer's carved lists (the battle logs'), its name outlined, its figures under the painted icons; its place in the ranking in the
 * medal's gold for the first three.
 */
export function GuildCard({ guild, place, player = null, onOpen }: GuildCardProps) {
  const block = cardBlock(guild, player);
  return (
    <button
      type="button"
      data-slot="guild-card"
      aria-label={`${guild.name}, ${guild.tag}`}
      onClick={() => onOpen?.(guild.id)}
      className="state-layer flex w-full min-w-0 cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left outline-none"
    >
      {place !== undefined && <span className={cn("text-outline w-6 shrink-0 text-center text-base font-bold tabular-nums", place <= 3 ? "text-medal-1" : "text-muted-foreground")}>{formatInteger(place)}</span>}
      <GuildEmblem emblem={guild.emblem} />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <span className="text-outline min-w-0 text-sm leading-tight font-bold wrap-anywhere">{guild.name}</span>
          <span className="numeric text-xs font-semibold text-muted-foreground">{guild.tag}</span>
        </span>
        <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-xs leading-tight font-bold">
          <MemberCount members={guild.members} />
          <GuildScore score={guild.score} />
          <JoinType type={guild.joinType} />
        </span>
        <span className="text-xs leading-tight font-semibold text-muted-foreground">Requirements: {requirementsText(guild.requirements)}</span>
        {block && (
          <span data-slot="guild-block" className="flex items-center gap-1 text-xs font-semibold text-warning">
            <Icon name="triangle-exclamation" size="xs" fixedWidth />
            {block}
          </span>
        )}
      </span>
      <Icon name="chevron-right" size="sm" className="drawer-icon shrink-0 text-muted-foreground" />
    </button>
  );
}
