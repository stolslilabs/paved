import type { IndexedPlayer, PlayerStats } from "@paved/chain";
import { formatCompact, type ScoringCategory } from "@paved/game-core";
import { useContext, useState, type ReactNode } from "react";
import { useInRouterContext } from "react-router";
import { playerRecords } from "../../data/player-records";
import { useGuildBadge } from "../../data/guilds";
import { useFollowStatus } from "../../data/social";
import { useOpenGuild } from "../../routes/open-guild";
import { isUnranked, usePvpLastAttack, usePvpLeagueOf } from "../../data/pvp-standing";
import { DataContext, type DataSources } from "../../data/sources";
import { LEAGUES, leagueOf } from "../../lib/pvp-rules";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { CATEGORY_NAMES } from "../elements/category-names";
import { LeagueBanner } from "../elements/league-banner";
import { LeagueCrestIcon } from "../elements/league-crest-art";
import { LeagueRim } from "../elements/league-rim";
import { divisionOf, RIM_PORTRAIT, tierOf } from "../elements/league-standards";
import { LevelBar } from "../elements/level-bar";
import { PlayerAvatar } from "../elements/player-avatar";
import { PlayerName } from "../elements/player-name";
import { SectionTitle } from "../elements/section-title";
import { formatPoints } from "../elements/score";
import { shortAddress } from "../elements/short-address";
import { TokenIcon } from "../elements/token-icon";
import type { UiIconName } from "../elements/ui-art";
import { UiIcon } from "../elements/ui-icon";
import { isMaxLevel, xpLeft } from "../elements/xp-level";
import type { PlayerProgress } from "../elements/xp-ring";
import { GuildLine } from "./guild-profile";
import { HudDrawer } from "./hud-drawer";
import { ActionTile } from "./profile-action";

/** The connected player as the indexer gives them: the profile and their Challenge figures. */
export interface PlayerStatusData {
  player: IndexedPlayer;
  stats: PlayerStats;
}

/** Who is at the controls: the wallet still looking for an earlier session, a guest, or a connected player. */
export type ProfileState = { status: "loading" } | { status: "guest"; connecting?: boolean } | { status: "connected"; data: PlayerStatusData };

/** A season in the Hall of Fame: the league and the crowns it ended at, or the current one's so far. */
export interface SeasonStanding {
  season: number;
  /** The league on chain (0 Wood to 22 Grand Master). */
  league: number;
  crowns: number;
  /** Not in the leagues that season (`isUnranked`). */
  unranked?: boolean;
}

/** A structure type's figures over a span: the points its closings scored, the best closing's, the structures closed. */
export interface StructureRecord {
  category: `${ScoringCategory}`;
  points: number;
  best: number;
  closed: number;
}

/** The player's records over a span (a season, or all time): the same three figures in all, then per structure type. */
export interface PlayerRecordSpan {
  points: number;
  best: number;
  closed: number;
  structures: readonly StructureRecord[];
}

/** The player's records: the current season (picked first), each season's by number, and all time's. */
export interface PlayerRecords {
  season: number;
  seasons: Readonly<Record<number, PlayerRecordSpan>>;
  allTime: PlayerRecordSpan;
}

export interface ProfileSheetProps {
  state: ProfileState;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnect?: () => void;
  /** Copies the address; a rejection is a failed copy (nothing said). The page does the copying. */
  onCopy?: (address: string) => Promise<void>;
  /** The connected player's level and XP (#625, `usePlayerProgress`); undefined while it is read. */
  progress?: PlayerProgress;
  /** The look the connected player saved (#626, read from the chain); null or omitted: the default avatar (the initial). */
  look?: bigint | null;
  /** Opens the avatar creator (#626); omitted, Avatar is not offered. */
  onEditAvatar?: () => void;
  /** Changes the player's name; omitted, the name has no pencil. */
  onEditName?: () => void;
  /**
   * The connected player's PvP standing (`Matchmaker.league`): their league's rim and crest round the avatar, their crowns and
   * league under League (#917). Left out, the sheet reads it itself where the app's sources are (the home's read and cache,
   * in the sheet's own chunk, not the first load); null: none shown (not read, no PvP on the network).
   */
  league?: PlayerLeague | null;
  /** Opens the PvP league (#647): the crowns, the attacks, the defence log; omitted, Battle logs is not offered. */
  onOpenLeague?: () => void;
  /** Opens the player's tiles (Tiles, `/tiles`); omitted, Tiles is not offered. */
  onOpenTiles?: () => void;
  /** Opens the referral (the USDC a friend's games earn); omitted, Invite is not offered. */
  onOpenInvite?: () => void;
  /**
   * The player's guild line (FRIENDS-PAGE, the owner's ask of 2026-11-05: as on another player's profile, before the actions), as given
   * (a story); left out, read where the app's sources are (`useGuildBadge`), a tap opening the guild's page; none without a guild.
   */
  guild?: ReactNode;
  /** The player's counts of followers and following (#954), as given (a story); left out, read from the follow source. */
  follows?: { followers: number; followed: number };
  /**
   * Each season's league and crowns, oldest first, the current one last. Left out with `records`, the sheet reads both where the app's
   * sources are (`playerRecords`, the mock's for now); else none, no Hall of Fame.
   */
  hallOfFame?: readonly SeasonStanding[];
  /** The player's records by season and all time; left out, read with the Hall of Fame (above), else none: no Stats. */
  records?: PlayerRecords;
  /** Where the focus goes back on close: the avatar that opened it, which is not a Radix trigger (the sheet loads after the tap). */
  returnFocus?: () => HTMLElement | null;
}

/** What the profile shows of the player's standing: the crowns, the league on chain (0 Wood to 22 Grand Master), Unranked or not. */
export interface PlayerLeague {
  crowns: number;
  league: number;
  /** Not in the leagues yet (`isUnranked`: no crowns, no attack settled, none ever made). */
  unranked: boolean;
}

/** The league as the app's sources give it (`Matchmaker.league` and `Arena.attack`, the home's and the PvP screens' reads and cache); none while read. */
function ReadLeague({ sources, playerId, children }: { sources: DataSources; playerId: string; children: (league: PlayerLeague | null) => ReactNode }) {
  const league = usePvpLeagueOf(sources, playerId);
  const attack = usePvpLastAttack(sources, playerId);
  if (!league || attack === undefined) return children(null);
  return children({ crowns: league.crowns, league: league.league, unranked: attack !== null && isUnranked(league, attack) });
}

/** The league as given, else as read where the app's sources are, else none. */
function WithLeague({ league, playerId, children }: { league: PlayerLeague | null | undefined; playerId: string; children: (league: PlayerLeague | null) => ReactNode }) {
  const sources = useContext(DataContext);
  if (league !== undefined || !sources) return children(league ?? null);
  return (
    <ReadLeague sources={sources} playerId={playerId}>
      {children}
    </ReadLeague>
  );
}

/** A standing's tier, division and name: Unranked's, or its league's ("Bronze II"). */
export function standingOf({ league, crowns, unranked }: { league: number; crowns: number; unranked?: boolean }) {
  const shown = LEAGUES[league] ?? leagueOf(crowns);
  return unranked ? { tier: "unranked" as const, division: null, name: "Unranked" } : { tier: tierOf(shown), division: divisionOf(shown), name: shown.name };
}

/** The portrait in the rim's hole: the same box with a rim or without one. */
const PORTRAIT_INSET = { inset: `${((1 - RIM_PORTRAIT) / 2) * 100}%` };

/**
 * The avatar in the rim of the player's league with its crest at its lower left (the player card's, larger: 112 px, the crest placed alike); no league known,
 * a plain grey ring round the same hole.
 */
export function ProfileRim({ league, children }: { league: PlayerLeague | null; children: ReactNode }) {
  if (!league) {
    return (
      <span data-slot="profile-rim" className="relative block size-[1em] shrink-0 rounded-full border-4 border-border">
        <span className="absolute overflow-hidden rounded-full" style={PORTRAIT_INSET}>
          {children}
        </span>
      </span>
    );
  }
  const { tier, division } = standingOf(league);
  return (
    <span data-slot="profile-rim" data-tier={tier} className="relative block size-[1em] shrink-0">
      <LeagueRim tier={tier} size="inherit" className="block">
        {children}
      </LeagueRim>
      <LeagueCrestIcon tier={tier} division={division} size="inherit" className="absolute -bottom-[10%] -left-[10%]" style={{ width: "44%", height: "44%" }} />
    </span>
  );
}

/** From a million, a figure is short ("1.2M"): a 320 px phone's third holds seven characters at the figures' size ("999,999"). */
const COMPACT_FROM = 1_000_000;

/**
 * One figure: its label over it, in the mockups' type (the owner's ask of 2026-11-04): the rounded bold face, tabular, not Space Mono
 * (these figures do not tick). `small`, a structure type's, a step under the total's. A short figure keeps its whole number in its
 * tooltip and for screen readers.
 */
export function Figure({ term, value, small = false }: { term: string; value: number; small?: boolean }) {
  const whole = formatPoints(value);
  const short = value >= COMPACT_FROM;
  return (
    <div data-slot="profile-figure" className={cn("flex min-w-0 flex-1 basis-0 flex-col items-center gap-0.5 px-0.5", small ? "py-1.5" : "py-2")}>
      <dt className="text-center text-xs leading-tight font-bold text-muted-foreground">{term}</dt>
      <dd title={short ? whole : undefined} className={cn("text-outline max-w-full leading-tight font-bold tabular-nums wrap-anywhere", small ? "text-lg" : "text-xl")}>
        {short ? (
          <>
            <span aria-hidden>{formatCompact(value)}</span>
            <span className="sr-only">{whole}</span>
          </>
        ) : (
          whole
        )}
      </dd>
    </div>
  );
}

/** Figures side by side on a carved band: information, never pressed (the owner's rule of 2026-11-04: raised presses, carved informs). */
export function FigureBand({ slot, children }: { slot: string; children: ReactNode }) {
  return (
    <dl data-slot={slot} className="drawer-carved drawer-rule flex rounded-xl">
      {children}
    </dl>
  );
}

/** The player's own guild (#953), read from the guild source: its line, a tap opening its page (the profile closed first); none, nothing. */
function ReadGuildLine({ playerId, onOpened }: { playerId: string; onOpened: () => void }) {
  const badge = useGuildBadge(playerId).data;
  const openGuild = useOpenGuild();
  if (!badge) return null;
  return (
    <GuildLine
      badge={badge}
      onOpen={(id) => {
        onOpened();
        openGuild(id);
      }}
    />
  );
}

/** The player's own counts of followers and following (#954, on every profile), read from the follow source; none, nothing. */
function ReadFollowCounts({ playerId }: { playerId: string }) {
  const counts = useFollowStatus(playerId, playerId).data;
  return counts ? <FollowCounts counts={counts} /> : null;
}

function FollowCounts({ counts }: { counts: { followers: number; followed: number } }) {
  return (
    <>
      <Figure term="Followers" value={counts.followers} />
      <Figure term="Following" value={counts.followed} />
    </>
  );
}

/**
 * The level's figures for screen readers, the bar being a picture: the XP made in the level, left to the next, and the whole XP when the
 * source knows it (#830); "Max level" at the cap. Not shown (the owner's ask of 2026-11-03: the bar says it).
 */
export function XpLeft({ progress }: { progress: PlayerProgress | undefined }) {
  if (!progress) return null;
  const max = isMaxLevel(progress);
  return (
    <span data-slot="xp-left" className="sr-only">
      {formatPoints(progress.xp)} XP made{max ? "" : ` of ${formatPoints(progress.xpForNext)}`},{" "}
      {max ? "Max level" : `${formatPoints(xpLeft(progress))} XP to level ${formatPoints(progress.level + 1)}`}
      {progress.total !== undefined && ` · ${formatPoints(progress.total)} XP in all`}
    </span>
  );
}

/**
 * The player's crowns and league: two carved chips side by side, each as wide as its content and at least 8.5 rem (both on one line
 * at 320 px for most leagues), wrapping one under the other where both do not fit ("Grand Master" beside its crowns at 320 px).
 */
const LEAGUE_CHIP = "drawer-carved flex min-w-34 flex-auto items-center justify-center gap-2 rounded-xl px-3 py-2.5";

export function TrophiesBand({ league }: { league: PlayerLeague }) {
  const { tier, division, name } = standingOf(league);
  return (
    <dl data-slot="profile-trophies" className="flex flex-wrap gap-1.5">
      <div className={LEAGUE_CHIP}>
        <dt>
          <UiIcon name="crown" px={32} className="drawer-icon size-8" />
          <span className="sr-only">Crowns</span>
        </dt>
        <dd className="text-outline text-xl leading-tight font-bold tabular-nums">{formatPoints(league.crowns)}</dd>
      </div>
      <div className={LEAGUE_CHIP}>
        <dt className="flex shrink-0 text-[2rem]">
          <LeagueCrestIcon tier={tier} division={division} size="inherit" />
          <span className="sr-only">League</span>
        </dt>
        <dd data-slot="profile-league" className="text-outline min-w-0 truncate text-lg leading-tight font-bold">
          {name}
        </dd>
      </div>
    </dl>
  );
}

/** What the Stats show: a season by number, or all time. */
type Span = number | "all";

/**
 * One season's card in the Hall of Fame: its number, its league's banner, its crowns; the current one tagged "Now". With the Stats, a
 * card picks its season for them (the owner's ask of 2026-11-04: the Hall of Fame is the filter): the picked one outlined in gold, a
 * tap on it again lets go (all time).
 */
function SeasonCard({ standing, current, picked, onPick }: { standing: SeasonStanding; current: boolean; picked: boolean; onPick?: (span: Span) => void }) {
  const { tier, division, name } = standingOf(standing);
  const body = (
    <>
      {current && <span className="absolute -top-2 -right-1 rounded-md bg-medal-1 px-1.5 text-xs leading-tight font-bold text-primary-foreground">Now</span>}
      <span className="text-xs font-bold text-muted-foreground tabular-nums">S{standing.season}</span>
      <span className="text-[2.75rem] leading-none">
        <LeagueBanner tier={tier} division={division} size="inherit" />
      </span>
      <span className="flex items-center gap-1">
        <UiIcon name="crown" px={16} className="size-4" />
        <span className="text-outline text-xs leading-tight font-bold tabular-nums">{formatPoints(standing.crowns)}</span>
      </span>
    </>
  );
  const card = cn("drawer-carved relative flex w-full min-w-0 flex-col items-center gap-1 rounded-xl px-1 pt-1.5 pb-2", picked && "ring-2 ring-medal-1");
  const label = `Season ${standing.season}: ${name}, ${formatPoints(standing.crowns)} crowns`;
  return (
    <li data-slot="hall-of-fame-season" data-picked={picked || undefined} className="flex">
      {onPick ? (
        <button type="button" aria-label={label} aria-pressed={picked} onClick={() => onPick(picked ? "all" : standing.season)} className={cn(card, "state-layer cursor-pointer outline-none")}>
          {body}
        </button>
      ) : (
        <div role="img" aria-label={label} className={card}>
          {body}
        </div>
      )}
    </li>
  );
}

/** Each structure type's image (one a line: the Font Awesome subset's guard reads the words of a line that names an icon). */
const STRUCTURE_ART = {
  City: "city",
  Road: "road",
  Forest: "forest",
  Wonder: "wonder",
} as const satisfies Record<`${ScoringCategory}`, UiIconName>;

/** The three figures of a span or a structure type, in the owner's order (2026-11-04): Total points, Best points, Total closed. */
function SpanFigures({ figures, small }: { figures: { points: number; best: number; closed: number }; small?: boolean }) {
  return (
    <>
      <Figure term="Total points" value={figures.points} small={small} />
      <Figure term="Best points" value={figures.best} small={small} />
      <Figure term="Total closed" value={figures.closed} small={small} />
    </>
  );
}

/**
 * A block of the Stats: its title with its icon, then its figures carved (the owner's asks of 2026-11-04: the titles out of the carved
 * style, the data in it). The total is a second-level title (the stats' icon); each structure type a third-level one, a step smaller,
 * a section of its own so a type can grow its own figures later.
 */
function RecordBlock({ slot, art, name, figures, part = false }: { slot: string; art: UiIconName; name: string; figures: { points: number; best: number; closed: number }; part?: boolean }) {
  const title = (
    <>
      <UiIcon name={art} px={part ? 24 : 32} className={cn("drawer-icon", part ? "size-6" : "size-8")} />
      {name}
    </>
  );
  const heading = "text-outline flex items-center gap-2 font-display leading-tight tracking-wide";
  return (
    <section data-slot={slot} aria-label={name} className="flex flex-col gap-1.5">
      {part ? <h5 className={cn(heading, "text-lg")}>{title}</h5> : <h4 className={cn(heading, "text-xl")}>{title}</h4>}
      <dl className="drawer-carved drawer-rule flex rounded-xl">
        <SpanFigures figures={figures} small={part} />
      </dl>
    </section>
  );
}

/** The Stats: the span the Hall of Fame picked, named in a badge by the title (its cross back to all time), the total, then each type. */
function RecordsSection({ records, span, onSpan }: { records: PlayerRecords; span: Span; onSpan: (span: Span) => void }) {
  const shown = span === "all" ? records.allTime : (records.seasons[span] ?? records.allTime);
  return (
    <section data-slot="profile-records" aria-label="Stats" className="flex flex-col gap-3">
      <SectionTitle
        end={
          <span data-slot="profile-records-span" className="flex h-7 items-center gap-1 rounded-full bg-card/40 pr-1 pl-2.5 text-xs font-bold">
            <span className="text-outline pr-1.5">{span === "all" ? "All time" : `Season ${span}`}</span>
            {span !== "all" && (
              <button type="button" aria-label="Show all time" onClick={() => onSpan("all")} className="state-layer grid size-5 cursor-pointer place-items-center rounded-full text-muted-foreground outline-none hover:text-foreground">
                <Icon name="xmark" size="xs" />
              </button>
            )}
          </span>
        }
      >
        Stats
      </SectionTitle>
      <RecordBlock slot="profile-records-total" art="stats" name="Total" figures={shown} />
      <div className="flex flex-col gap-3 pt-1">
        {shown.structures.map((record) => (
          <RecordBlock key={record.category} slot="profile-structure" art={STRUCTURE_ART[record.category]} name={CATEGORY_NAMES[record.category]?.plural ?? record.category} figures={record} part />
        ))}
      </div>
    </section>
  );
}

/**
 * The Hall of Fame (each season's banner and crowns, the filter of the Stats: the current season picked first, a tap on it again for
 * all time) and the Stats (the totals, a section per structure type): the player's own profile's, and another player's (FRIENDS-PAGE,
 * the owner's ask of 2026-11-05). The span picked is its own state, back on the current season each time the profile opens.
 */
export function HallAndStats({ hallOfFame, records }: { hallOfFame?: readonly SeasonStanding[]; records?: PlayerRecords }) {
  const [span, setSpan] = useState<Span>(records?.season ?? "all");
  return (
    <>
      {hallOfFame && hallOfFame.length > 0 && (
        <section aria-label="Hall of Fame" className="flex flex-col gap-2">
          <SectionTitle>Hall of Fame</SectionTitle>
          <ol data-slot="hall-of-fame" className="grid grid-cols-4 gap-1.5 pt-2">
            {hallOfFame.map((standing) => (
              <SeasonCard
                key={standing.season}
                standing={standing}
                current={standing.season === (records?.season ?? hallOfFame.at(-1)!.season)}
                picked={records !== undefined && span === standing.season}
                onPick={records && setSpan}
              />
            ))}
          </ol>
        </section>
      )}
      {records && <RecordsSection records={records} span={span} onSpan={setSpan} />}
    </>
  );
}

/**
 * What a tap on the player card opens (#624), redrawn after the profile's mockups (PROFILE-DRAWER, `docs/design/profile.webp`; PROFILE-PAGE,
 * the owner's rounds of 2026-11-04): the HUD's drawer, a full page with Back on a phone, a side panel docked at the left from `tablet`
 * (`HudDrawer`), one layout, titled "Profile". The presentation: the avatar in the rim of the player's league and its crest (#917),
 * the name with its pencil, the address under it (a tap copies it, no button's look); under them the actions as raised tiles (Battle
 * logs #834, Avatar #626, Tiles, Invite; under the avatar since the owner's ask of 2026-11-05); then the level and its bar ("90 /
 * 150 XP"; the XP left and in all, #830, said to screen readers only), League (the crowns and the league, carved chips that wrap), Games and the follow
 * counts (#954), the Hall of Fame (each season's
 * banner and crowns, the filter of the Stats: the current season picked first, a tap on it again for all time) and the Stats (the
 * totals, a section per structure type). What informs is carved, what presses is raised. Disconnect is Settings' (the owner's ask of
 * 2026-11-04). A guest gets the Training line and Connect.
 */
export function ProfileSheet({
  state,
  open,
  onOpenChange,
  onConnect,
  onCopy,
  progress,
  look,
  onEditAvatar,
  onEditName,
  league,
  onOpenLeague,
  onOpenTiles,
  onOpenInvite,
  guild,
  follows,
  hallOfFame: givenFame,
  records: givenRecords,
  returnFocus,
}: ProfileSheetProps) {
  const sources = useContext(DataContext);
  // The guild line opens the guild's page: read only in a router (the app), not in a bare render.
  const routed = useInRouterContext();
  // Neither given (the app): read where the app's sources are.
  const { hallOfFame, records } = sources && givenFame === undefined && givenRecords === undefined ? playerRecords() : { hallOfFame: givenFame, records: givenRecords };
  const [copied, setCopied] = useState(false);
  const connected = state.status === "connected" ? state.data : null;
  const portrait = (
    <PlayerAvatar
      size="lg"
      className="size-full p-0 [&>span]:text-3xl"
      player={connected ? { name: connected.player.name, address: connected.player.playerId } : null}
      loading={state.status === "loading"}
      look={look}
    />
  );
  return (
    <HudDrawer
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setCopied(false);
        }
        onOpenChange(next);
      }}
      title="Profile"
      returnFocus={returnFocus}
      slot="profile"
    >
      {connected ? (
        <WithLeague league={league} playerId={connected.player.playerId}>
          {(shown) => (
            <>
              {/* Room under the avatar: the crest runs past the rim's foot (the owner's ask of 2026-11-05). */}
              <div data-slot="profile-identity" className="flex items-center gap-3 pb-3">
                <span className="text-[7rem]">
                  <ProfileRim league={shown}>{portrait}</ProfileRim>
                </span>
                <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
                  <span className="flex max-w-full min-w-0 items-center gap-1.5">
                    {/* With no name, the short address in Space Mono, whose glyphs stand taller than a tight line: `truncate` would cut their top and foot. */}
                    <PlayerName
                      name={connected.player.name}
                      address={connected.player.playerId}
                      className={cn("text-outline text-2xl font-bold", connected.player.name ? "leading-tight" : "leading-normal")}
                    />
                    {onEditName && (
                      <button
                        type="button"
                        aria-label="Edit name"
                        onClick={onEditName}
                        className="state-layer drawer-raised grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg outline-none"
                      >
                        <Icon name="pen" size="xs" />
                      </button>
                    )}
                  </span>
                  {/* The address as a subtitle: a tap copies it, with no button's look (the owner's ask of 2026-11-04); "Copied" says it worked. */}
                  <button
                    type="button"
                    data-slot="profile-address"
                    aria-label={copied ? "Copied" : "Copy address"}
                    aria-live="polite"
                    onClick={() => void onCopy?.(connected.player.playerId).then(() => setCopied(true), () => undefined)}
                    className="max-w-full cursor-pointer truncate rounded-sm text-sm font-semibold text-muted-foreground outline-none"
                  >
                    {copied ? "Copied" : `#${shortAddress(connected.player.playerId)}`}
                  </button>
                </div>
              </div>
              {/* The player's guild, then the actions, under the avatar (the owner's asks of 2026-11-05), not after the League. */}
              {(guild ?? (sources && routed)) && (
                <div data-slot="profile-guild" className="empty:hidden">
                  {guild ?? <ReadGuildLine playerId={connected.player.playerId} onOpened={() => onOpenChange(false)} />}
                </div>
              )}
              {(onOpenLeague || onEditAvatar || onOpenTiles || onOpenInvite) && (
                <div data-slot="profile-actions" className="flex gap-1.5">
                  {onOpenLeague && <ActionTile art="swords" label="Battle logs" onClick={onOpenLeague} />}
                  {onEditAvatar && <ActionTile art="avatar" label="Avatar" name="Edit avatar" onClick={onEditAvatar} />}
                  {onOpenTiles && <ActionTile art="collection" label="Tiles" onClick={onOpenTiles} />}
                  {onOpenInvite && (
                    <ActionTile art="invite" label="Invite" onClick={onOpenInvite}>
                      {/* What an invitation earns: USDC (the referral's share of a friend's games). */}
                      <TokenIcon kind="usdc" px={20} className="absolute -right-1.5 -bottom-1 size-5" />
                    </ActionTile>
                  )}
                </div>
              )}
              <div data-slot="player-level" className="flex flex-col gap-1">
                {/* The level's number is the bar's star's (the owner's ask of 2026-11-04): the title alone. */}
                <SectionTitle>Level</SectionTitle>
                {/* 16.5 rem at most, centred (the owner's asks of 2026-11-04): wider than the player card's (9 to 10 rem), never the page's. */}
                <LevelBar progress={progress} variant="profile" className="mx-auto max-w-66" />
                <XpLeft progress={progress} />
              </div>
              {shown && (
                <section aria-label="League" className="flex flex-col gap-2">
                  <SectionTitle>League</SectionTitle>
                  <TrophiesBand league={shown} />
                </section>
              )}
              <FigureBand slot="profile-figures">
                <Figure term="Games" value={connected.stats.challengeFinished} />
                {follows ? <FollowCounts counts={follows} /> : sources && <ReadFollowCounts playerId={connected.player.playerId} />}
              </FigureBand>
              <HallAndStats hallOfFame={hallOfFame} records={records} />
            </>
          )}
        </WithLeague>
      ) : (
        <div data-slot="profile-identity" className="flex flex-col items-center gap-3 text-center">
          <span className="text-[7rem]">
            <ProfileRim league={null}>{portrait}</ProfileRim>
          </span>
          <span className="text-outline text-lg font-bold">{state.status === "guest" ? "Playing as a guest" : "Looking for your account…"}</span>
          {state.status === "guest" && (
            <>
              <p className="text-sm font-bold text-muted-foreground">Training is free. Connect to enter the Challenge.</p>
              <Button onClick={onConnect} loading={state.connecting} className="w-full">
                Connect
              </Button>
            </>
          )}
        </div>
      )}
    </HudDrawer>
  );
}
