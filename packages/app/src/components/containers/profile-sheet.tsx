import type { IndexedPlayer, PlayerStats } from "@paved/chain";
import { useContext, useState, type ReactNode } from "react";
import { useGuildBadge } from "../../data/guilds";
import type { GuildBadge } from "../../data/social-source";
import { useFollowStatus } from "../../data/social";
import { isUnranked, usePvpLastAttack, usePvpLeagueOf } from "../../data/pvp-standing";
import { DataContext, type DataSources } from "../../data/sources";
import { rankName } from "../../lib/guild-text";
import { LEAGUES, leagueOf } from "../../lib/pvp-rules";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { GuildEmblem } from "../elements/guild-emblem";
import { LeagueCrestIcon } from "../elements/league-crest-art";
import { LeagueRim } from "../elements/league-rim";
import { divisionOf, RIM_PORTRAIT, tierOf } from "../elements/league-standards";
import { LevelBar } from "../elements/level-bar";
import { PlayerAvatar } from "../elements/player-avatar";
import { PlayerName } from "../elements/player-name";
import { formatPoints } from "../elements/score";
import { ShortAddress } from "../elements/short-address";
import { TokenIcon } from "../elements/token-icon";
import type { UiIconName } from "../elements/ui-art";
import { UiIcon } from "../elements/ui-icon";
import { isMaxLevel, xpLeft } from "../elements/xp-level";
import type { PlayerProgress } from "../elements/xp-ring";
import { HudDrawer } from "./hud-drawer";

/** The connected player as the indexer gives them: the profile and their Challenge figures. */
export interface PlayerStatusData {
  player: IndexedPlayer;
  stats: PlayerStats;
}

/** Who is at the controls: the wallet still looking for an earlier session, a guest, or a connected player. */
export type ProfileState = { status: "loading" } | { status: "guest"; connecting?: boolean } | { status: "connected"; data: PlayerStatusData };

export interface ProfileSheetProps {
  state: ProfileState;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  /** Copies the address; a rejection is a failed copy (nothing said). The page does the copying. */
  onCopy?: (address: string) => Promise<void>;
  /** The connected player's level and XP (#625, `usePlayerProgress`); undefined while it is read. */
  progress?: PlayerProgress;
  /** The look the connected player saved (#626, read from the chain); null or omitted: the default avatar (the initial). */
  look?: bigint | null;
  /** Opens the avatar creator (#626); omitted, Avatar is not offered. */
  onEditAvatar?: () => void;
  /**
   * The connected player's PvP standing (`Matchmaker.league`): their league's rim and crest round the avatar and its name under their
   * name (#917). Left out, the sheet reads it itself where the app's sources are (the home's read and cache, in the sheet's own chunk,
   * not the first load); null: none shown (not read, no PvP on the network).
   */
  league?: PlayerLeague | null;
  /** Opens the PvP league (#647): the crowns, the attacks, the defence log; omitted, Battle logs is not offered. */
  onOpenLeague?: () => void;
  /** Opens the player's tiles (My tiles); omitted, Collection is not offered. */
  onOpenCollection?: () => void;
  /** Opens the referral (the USDC a friend's games earn); omitted, Invite is not offered. */
  onOpenInvite?: () => void;
  /** The player's counts of followers and following (#954), as given (a story); left out, read from the follow source. */
  follows?: { followers: number; followed: number };
  /** Opens the guild's page (#953) from the guild line; the sheet closes first. */
  onOpenGuild?: (id: number) => void;
  /** Where the drawer's top stops, in CSS px from the viewport's top (`HudDrawer`): the home's HUD end. */
  top?: number;
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

/** The portrait in the rim's hole: the same box with a rim or without one. */
const PORTRAIT_INSET = { inset: `${((1 - RIM_PORTRAIT) / 2) * 100}%` };

/**
 * The avatar in the rim of the player's league with its crest at its lower left (the player card's, larger: 112 px, the crest placed alike); no league known,
 * a plain grey ring round the same hole.
 */
function ProfileRim({ league, children }: { league: PlayerLeague | null; children: ReactNode }) {
  if (!league) {
    return (
      <span data-slot="profile-rim" className="relative block size-[1em] shrink-0 rounded-full border-4 border-border">
        <span className="absolute overflow-hidden rounded-full" style={PORTRAIT_INSET}>
          {children}
        </span>
      </span>
    );
  }
  const shown = LEAGUES[league.league] ?? leagueOf(league.crowns);
  const tier = league.unranked ? "unranked" : tierOf(shown);
  return (
    <span data-slot="profile-rim" data-tier={tier} className="relative block size-[1em] shrink-0">
      <LeagueRim tier={tier} size="inherit" className="block">
        {children}
      </LeagueRim>
      <LeagueCrestIcon
        tier={tier}
        division={league.unranked ? null : divisionOf(shown)}
        size="inherit"
        className="absolute -bottom-[10%] -left-[10%]"
        style={{ width: "44%", height: "44%" }}
      />
    </span>
  );
}

/** The league's name under the player's: "Bronze II", or "Unranked" (#917). */
const leagueName = (league: PlayerLeague) => (league.unranked ? "Unranked" : (LEAGUES[league.league] ?? leagueOf(league.crowns)).name);

/** The player's guild (#953): its emblem, its name and a chevron, the player's rank in its name; a tap opens its page. */
function GuildPill({ badge, onOpen }: { badge: GuildBadge; onOpen?: (id: number) => void }) {
  return (
    <button
      type="button"
      data-slot="guild-line"
      aria-label={`${badge.name}, ${rankName(badge.rank)}`}
      onClick={() => onOpen?.(badge.id)}
      className="state-layer drawer-raised flex h-10 w-full min-w-0 cursor-pointer items-center gap-2 rounded-xl pr-2 pl-1.5 text-left outline-none"
    >
      <GuildEmblem emblem={badge.emblem} size="sm" />
      <span className="text-outline min-w-0 flex-1 truncate font-bold">{badge.name}</span>
      <Icon name="chevron-right" size="xs" className="shrink-0" />
    </button>
  );
}

/** The player's guild, read from the guild source; none, nothing. */
function ReadGuild({ playerId, onOpen }: { playerId: string; onOpen: (id: number) => void }) {
  const badge = useGuildBadge(playerId).data;
  return badge ? <GuildPill badge={badge} onOpen={onOpen} /> : null;
}

/** One figure of the profile: its label over it. */
function Figure({ term, value }: { term: string; value: string }) {
  return (
    <div data-slot="profile-figure" className="flex min-w-0 flex-1 basis-0 flex-col items-center gap-0.5 px-0.5 py-2">
      <dt className="text-xs font-bold text-muted-foreground">{term}</dt>
      <dd className="numeric text-outline max-w-full text-lg leading-tight font-bold wrap-anywhere">{value}</dd>
    </div>
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
      <Figure term="Followers" value={formatPoints(counts.followers)} />
      <Figure term="Following" value={formatPoints(counts.followed)} />
    </>
  );
}

/** One of the profile's actions: its icon over its name, on a raised tile; `children` over the icon (Invite's USDC). */
function ActionTile({ art, label, name, onClick, children }: { art: UiIconName; label: string; name?: string; onClick: () => void; children?: ReactNode }) {
  return (
    <button
      type="button"
      data-slot="profile-action"
      aria-label={name}
      onClick={onClick}
      className="state-layer drawer-tile flex min-w-0 flex-1 basis-0 cursor-pointer flex-col items-center gap-1 rounded-2xl px-0.5 pt-2.5 pb-2 outline-none"
    >
      <span className="relative">
        <UiIcon name={art} px={44} className="drawer-icon size-11" />
        {children}
      </span>
      {/* 12 px, tight: each name holds on one line in a 360 px phone's quarter; narrower, it wraps between its words. */}
      <span className="text-outline max-w-full text-center text-xs leading-tight font-black tracking-tight">{label}</span>
    </button>
  );
}

/**
 * The level's figures for screen readers, the bar being a picture: the XP made in the level, left to the next, and the whole XP when the
 * source knows it (#830); "Max level" at the cap. Not shown (the owner's ask of 2026-11-03: the bar says it).
 */
function XpLeft({ progress }: { progress: PlayerProgress | undefined }) {
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
 * What a tap on the player card opens (#624), redrawn after the profile's mockup (PROFILE-DRAWER, `docs/design/profile.webp`): the HUD's
 * drawer, rising from the bottom of a phone up to the HUD's end, a side panel docked at the left from `tablet` (`HudDrawer`), one layout.
 * "Your profile" over the avatar in the rim of the player's league and its crest (#917); beside it the name, the league's, the short
 * address with Copy and the guild (#953); the level and its bar ("90 / 150 XP"; the XP left and in all, #830, said to screen readers only); Games and the
 * follow counts (#954) in one band (Best left on 2026-11-03, the owner's ask); the actions as tiles (Battle logs #834, Avatar #626, Collection, Invite); Disconnect. A guest gets
 * the Training line and Connect.
 */
export function ProfileSheet({
  state,
  open,
  onOpenChange,
  onConnect,
  onDisconnect,
  onCopy,
  progress,
  look,
  onEditAvatar,
  league,
  onOpenLeague,
  onOpenCollection,
  onOpenInvite,
  onOpenGuild,
  follows,
  top,
  returnFocus,
}: ProfileSheetProps) {
  const sources = useContext(DataContext);
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
        if (!next) setCopied(false);
        onOpenChange(next);
      }}
      title={connected ? "Your profile" : "Profile"}
      top={top}
      returnFocus={returnFocus}
      slot="profile"
    >
      {connected ? (
        <WithLeague league={league} playerId={connected.player.playerId}>
          {(shown) => (
            <>
              <div data-slot="profile-identity" className="flex items-center gap-3">
                <span className="text-[7rem]">
                  <ProfileRim league={shown}>{portrait}</ProfileRim>
                </span>
                <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
                  <span className="flex max-w-full min-w-0 flex-col">
                    {/* With no name, the short address in Space Mono, whose glyphs stand taller than a tight line: `truncate` would cut their top and foot. */}
                    <PlayerName
                      name={connected.player.name}
                      address={connected.player.playerId}
                      className={cn("text-outline text-2xl font-black", connected.player.name ? "leading-tight" : "leading-normal")}
                    />
                    {shown && (
                      <span data-slot="profile-league" className="truncate text-sm font-bold text-muted-foreground">
                        {leagueName(shown)}
                      </span>
                    )}
                  </span>
                  <span data-slot="profile-address" className="drawer-raised flex h-8 max-w-full items-center gap-0.5 rounded-lg pl-3">
                    <ShortAddress address={connected.player.playerId} className="text-sm font-bold text-muted-foreground" />
                    <button
                      type="button"
                      aria-label={copied ? "Copied" : "Copy address"}
                      aria-live="polite"
                      onClick={() => void onCopy?.(connected.player.playerId).then(() => setCopied(true), () => undefined)}
                      className="state-layer grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg text-muted-foreground outline-none hover:text-foreground"
                    >
                      <Icon name={copied ? "check" : "copy"} size="xs" />
                    </button>
                  </span>
                </div>
              </div>
              {sources && (
                <ReadGuild
                  playerId={connected.player.playerId}
                  onOpen={(id) => {
                    onOpenChange(false);
                    onOpenGuild?.(id);
                  }}
                />
              )}
              <div data-slot="player-level" className="flex flex-col gap-1">
                <span className="text-outline text-lg leading-tight font-black">
                  Level <span className="numeric">{progress ? formatPoints(progress.level) : "–"}</span>
                </span>
                <LevelBar progress={progress} variant="profile" />
                <XpLeft progress={progress} />
              </div>
              <dl data-slot="profile-figures" className="drawer-raised drawer-rule flex rounded-xl">
                <Figure term="Games" value={formatPoints(connected.stats.challengeFinished)} />
                {follows ? <FollowCounts counts={follows} /> : sources && <ReadFollowCounts playerId={connected.player.playerId} />}
              </dl>
              {(onOpenLeague || onEditAvatar || onOpenCollection || onOpenInvite) && (
                <div data-slot="profile-actions" className="flex gap-1.5">
                  {onOpenLeague && <ActionTile art="swords" label="Battle logs" onClick={onOpenLeague} />}
                  {onEditAvatar && <ActionTile art="avatar" label="Avatar" name="Edit avatar" onClick={onEditAvatar} />}
                  {onOpenCollection && <ActionTile art="collection" label="Collection" onClick={onOpenCollection} />}
                  {onOpenInvite && (
                    <ActionTile art="invite" label="Invite" onClick={onOpenInvite}>
                      {/* What an invitation earns: USDC (the referral's share of a friend's games). */}
                      <TokenIcon kind="usdc" px={20} className="absolute -right-1.5 -bottom-1 size-5" />
                    </ActionTile>
                  )}
                </div>
              )}
              <button
                type="button"
                onClick={onDisconnect}
                className="state-layer drawer-raised flex h-11 cursor-pointer items-center gap-2 self-center rounded-full pr-4 pl-3 outline-none"
              >
                <UiIcon name="disconnect" px={32} className="size-8" />
                <span className="text-outline font-black">Disconnect</span>
              </button>
            </>
          )}
        </WithLeague>
      ) : (
        <div data-slot="profile-identity" className="flex flex-col items-center gap-3 text-center">
          <span className="text-[7rem]">
            <ProfileRim league={null}>{portrait}</ProfileRim>
          </span>
          <span className="text-outline text-xl font-black">{state.status === "guest" ? "Playing as a guest" : "Looking for your account…"}</span>
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
