import type { CSSProperties, ReactNode, Ref } from "react";
import { formatInteger, GUILD_MAX_MEMBERS } from "@paved/game-core";
import type { GuildSummary, PublicProfile } from "../../data/social-source";
import { LEAGUES, leagueOf } from "../../lib/pvp-rules";
import { cn } from "../../lib/utils";
import { GuildEmblem } from "../elements/guild-emblem";
import { LevelStar } from "../elements/level-star";
import { PlayerName } from "../elements/player-name";
import { rankingArtSources } from "../elements/ranking-art";
import { shortAddress } from "../elements/short-address";
import { UiIcon } from "../elements/ui-icon";
import { MemberCount } from "./guild-card";
import { LeaguePortrait } from "./league-control";

// LEADERBOARD-PAGE (the dock's Ranking; the Paved UX Book draws none, so in the integrated pages' style): a ranked player's row and a
// ranked guild's, the Guild page's members' rows (`guild-page.tsx`) with their place in front: the portrait in its league's rim (the
// guild's emblem), the name outlined, the level's blue star (the guild's members), the crowns at the end (the guild's score, the sum
// of its members' crowns), the viewer's own on the Guild page's gold wash with its tag.

/** The viewer's own row: the Guild page's discreet wash of the primary gold, no ring (the owner's ask of 2026-11-05). */
const OWN = "bg-primary/15";
/** A row, the Guild members' rows': its press layer rounded as the carved list it sits in. */
const ROW = "state-layer flex w-full min-w-0 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-left outline-none";
/** The portrait's box, 48 px: the Guild members' rows', as tall as the name over the star beside it. */
const PORTRAIT: CSSProperties = { fontSize: "3rem" };
/** The third place's medal: the HUD's bronze one (the Guild's Veteran). Its name apart, off a line the Font Awesome subset reads. */
type Bronze = "medal";
const BRONZE: Bronze = "medal";
/** A medal's box: 32 px, the place's column. */
const MEDAL = "drawer-icon size-8 shrink-0";

/**
 * A place in the ranking at a row's start: the first three a painted medal (gold, silver: `ranking-art.ts`; bronze: the HUD's), the
 * others their figure, outlined, tabular, muted. Said by the row's name.
 */
export function RankPlace({ place }: { place: number }) {
  const box = { "data-slot": "ranking-place", "data-place": place, "aria-hidden": true } as const;
  if (place === 1) return <img {...box} {...rankingArtSources("medal-gold", 32)} alt="" draggable={false} decoding="async" className={MEDAL} />;
  if (place === 2) return <img {...box} {...rankingArtSources("medal-silver", 32)} alt="" draggable={false} decoding="async" className={MEDAL} />;
  if (place === 3)
    return (
      <span {...box} className={MEDAL}>
        <UiIcon name={BRONZE} px={32} className="size-8" />
      </span>
    );
  return (
    <span {...box} className="numeric text-outline w-8 shrink-0 text-center font-sans text-base leading-tight font-bold text-muted-foreground">
      {formatInteger(place)}
    </span>
  );
}

/** The viewer's tag beside the name: the Guild page's "You", in the medal's gold. */
function OwnTag({ children }: { children: ReactNode }) {
  return <span className="shrink-0 rounded-md bg-medal-1 px-1.5 text-xs leading-tight font-bold text-primary-foreground">{children}</span>;
}

/** The points at a row's end: the painted crown and the figure, outlined (the Guild members' rows'). */
function Points({ value }: { value: number }) {
  return (
    <span role="img" aria-label={`${formatInteger(value)} ${value === 1 ? "crown" : "crowns"}`} className="flex shrink-0 items-center gap-1">
      <UiIcon name="crown" px={20} className="drawer-icon size-5" />
      <span aria-hidden className="numeric text-outline min-w-10 text-right font-sans text-base leading-tight font-bold">
        {formatInteger(value)}
      </span>
    </span>
  );
}

export interface PlayerRankRowProps {
  profile: PublicProfile;
  /** Their place, 1 first. */
  place: number;
  /** The viewer's own row: the gold wash and "You". */
  own?: boolean;
  onOpen?: () => void;
  ref?: Ref<HTMLButtonElement>;
  className?: string;
}

/** A player of the ranking: their place, their portrait in their league's rim, their name and level, their crowns. A tap opens them. */
export function PlayerRankRow({ profile, place, own = false, onOpen, ref, className }: PlayerRankRowProps) {
  const league = LEAGUES[profile.league] ?? leagueOf(profile.crowns);
  const name = profile.name ?? shortAddress(profile.address);
  return (
    <button
      ref={ref}
      type="button"
      data-slot="ranking-player"
      data-own={own || undefined}
      aria-label={`${formatInteger(place)}. ${name}${own ? " (you)" : ""}, level ${formatInteger(profile.level)}, ${formatInteger(profile.crowns)} ${profile.crowns === 1 ? "crown" : "crowns"}`}
      onClick={onOpen}
      className={cn(ROW, own && OWN, className)}
    >
      <RankPlace place={place} />
      <LeaguePortrait player={{ name: profile.name, address: profile.address }} look={profile.look} league={league} slot="ranking-rim" style={PORTRAIT} />
      <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
        <PlayerName name={profile.name} address={profile.address} className={cn("text-outline max-w-full min-w-0 pr-0.5 text-sm font-bold", profile.name ? "leading-snug" : "leading-normal")} />
        <span className="flex max-w-full flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <LevelStar level={profile.level} className="size-6" />
          {own && <OwnTag>You</OwnTag>}
        </span>
      </span>
      <Points value={profile.crowns} />
    </button>
  );
}

export interface GuildRankRowProps {
  guild: GuildSummary;
  place: number;
  /** The viewer's guild: the gold wash and "Yours". */
  own?: boolean;
  onOpen?: () => void;
  ref?: Ref<HTMLButtonElement>;
  className?: string;
}

/** A guild of the ranking: its place, its emblem, its name and members, its score (its members' crowns). A tap opens its page. */
export function GuildRankRow({ guild, place, own = false, onOpen, ref, className }: GuildRankRowProps) {
  return (
    <button
      ref={ref}
      type="button"
      data-slot="ranking-guild"
      data-own={own || undefined}
      aria-label={`${formatInteger(place)}. ${guild.name}${own ? " (your guild)" : ""}, ${formatInteger(guild.members)} of ${GUILD_MAX_MEMBERS} members, ${formatInteger(guild.score)} ${guild.score === 1 ? "crown" : "crowns"}`}
      onClick={onOpen}
      className={cn(ROW, own && OWN, className)}
    >
      <RankPlace place={place} />
      <GuildEmblem emblem={guild.emblem} />
      <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
        <span className="text-outline max-w-full min-w-0 pr-0.5 text-sm leading-snug font-bold wrap-anywhere">{guild.name}</span>
        <span className="flex min-h-6 max-w-full flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <MemberCount members={guild.members} className="text-xs leading-tight font-bold text-muted-foreground" />
          {own && <OwnTag>Yours</OwnTag>}
        </span>
      </span>
      <Points value={guild.score} />
    </button>
  );
}
