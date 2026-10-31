import type { IndexedPlayer, PlayerStats } from "@paved/chain";
import { useContext, useState } from "react";
import { useGuildBadge } from "../../data/guilds";
import { isUnranked, usePvpLastAttack, usePvpLeagueOf } from "../../data/pvp-standing";
import { DataContext, type DataSources } from "../../data/sources";
import { LEAGUES, leagueOf } from "../../lib/pvp-rules";
import { useSidePanel } from "../../lib/side-panel";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../ui/sheet";
import { LeagueCrest } from "../elements/league-crest";
import { PlayerAvatar } from "../elements/player-avatar";
import { PlayerName } from "../elements/player-name";
import { formatPoints } from "../elements/score";
import { ShortAddress } from "../elements/short-address";
import { isMaxLevel, xpLeft } from "../elements/xp-level";
import { GuildLine } from "./guild-profile";
import { XpRing, type PlayerProgress } from "../elements/xp-ring";

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
  /** Opens the avatar creator (#626); omitted, Edit avatar is not offered. */
  onEditAvatar?: () => void;
  /**
   * The connected player's PvP standing (`Matchmaker.league`): their league's crest and name under their name (#917). Left out, the
   * sheet reads it itself where the app's sources are (the home's read and cache, in the sheet's own chunk, not the first load);
   * null: none shown (not read, no PvP on the network).
   */
  league?: PlayerLeague | null;
  /** Opens the PvP league (#647): the crowns, the attacks, the defence log; omitted, League is not offered. */
  onOpenLeague?: () => void;
  /** Opens the guild's page (#953) from the guild line; the sheet closes first. */
  onOpenGuild?: (id: number) => void;
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

/** The player's league under their name: its crest and name, or Unranked (#917). */
function ProfileLeague({ league }: { league: PlayerLeague }) {
  return <LeagueCrest league={LEAGUES[league.league] ?? leagueOf(league.crowns)} unranked={league.unranked} className="self-center" />;
}

/** The league as the app's sources give it (`Matchmaker.league` and `Arena.attack`, the home's and the PvP screens' reads and cache). */
function ReadLeague({ sources, playerId }: { sources: DataSources; playerId: string }) {
  const league = usePvpLeagueOf(sources, playerId);
  const attack = usePvpLastAttack(sources, playerId);
  if (!league || attack === undefined) return null;
  return <ProfileLeague league={{ crowns: league.crowns, league: league.league, unranked: attack !== null && isUnranked(league, attack) }} />;
}

/** The player's guild (#953): its emblem, name and their rank, read from the guild source; none, nothing. */
function ReadGuild({ playerId, onOpen }: { playerId: string; onOpen: (id: number) => void }) {
  const badge = useGuildBadge(playerId).data;
  return badge ? <GuildLine badge={badge} onOpen={onOpen} /> : null;
}

/** One of the level's XP figures on the sheet (#830). */
function XpLine({ term, value }: { term: string; value: string }) {
  return (
    <div data-slot="xp-line" className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{term}</dt>
      <dd className="numeric text-sm font-semibold wrap-anywhere">{value}</dd>
    </div>
  );
}

/** The side panel from `desktop`, where the avatar sits at the left of the navigation's header; the bottom sheet under it. */
const DESKTOP_QUERY = "(min-width: 64rem)";

/**
 * What a tap on the avatar opens (#624): a bottom sheet on a phone, a panel from the left from `desktop`. The avatar larger,
 * the name, the short address with Copy, the Challenge figures the home card showed, Edit avatar (the
 * creator, #626) and Disconnect; a guest gets the Training line and Connect. Connected, the XP ring and the level (#625), the XP made in it, the XP left and the whole XP (#830).
 */
export function ProfileSheet({ state, open, onOpenChange, onConnect, onDisconnect, onCopy, progress, look, onEditAvatar, league, onOpenLeague, onOpenGuild, returnFocus }: ProfileSheetProps) {
  const sources = useContext(DataContext);
  const desktop = useSidePanel(DESKTOP_QUERY);
  const [copied, setCopied] = useState(false);
  const connected = state.status === "connected" ? state.data : null;
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) setCopied(false);
        onOpenChange(next);
      }}
    >
      <SheetContent
        side={desktop ? "left" : "bottom"}
        onCloseAutoFocus={(e) => {
          const target = returnFocus?.();
          if (!target) return;
          e.preventDefault();
          target.focus();
        }}
      >
        <SheetHeader className="items-center text-center">
          <PlayerAvatar size="lg" player={connected ? { name: connected.player.name, address: connected.player.playerId } : null} loading={state.status === "loading"} look={look}>
            {connected && <XpRing size="lg" progress={progress} />}
          </PlayerAvatar>
          <SheetTitle className="flex w-full min-w-0 justify-center">
            {connected ? <PlayerName name={connected.player.name} address={connected.player.playerId} className="text-lg" /> : state.status === "guest" ? "Playing as a guest" : "Profile"}
          </SheetTitle>
          <SheetDescription>{connected ? "Your profile" : state.status === "guest" ? "Training is free. Connect to enter the Challenge." : "Looking for your account…"}</SheetDescription>
          {connected && (league !== undefined ? league && <ProfileLeague league={league} /> : sources && <ReadLeague sources={sources} playerId={connected.player.playerId} />)}
        </SheetHeader>

        {connected && (
          <>
            <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/60 p-1.5 pl-3">
              <ShortAddress address={connected.player.playerId} className="flex-1 text-xs" />
              <Button
                size="sm"
                variant={copied ? "secondary" : "default"}
                aria-live="polite"
                onClick={() => void onCopy?.(connected.player.playerId).then(() => setCopied(true), () => undefined)}
              >
                <Icon name={copied ? "check" : "copy"} size="xs" />
                {copied ? "Copied" : "Copy"}
              </Button>
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
            <div data-slot="player-level" className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
              <span className="text-sm font-semibold">
                Level <span className="numeric">{progress ? formatPoints(progress.level) : "–"}</span>
              </span>
              {/* The XP made in the level, the XP left to the next, and the whole XP when the source knows it (#830): not on the home. */}
              <dl className="grid grid-cols-3 gap-2">
                <XpLine term="XP made" value={progress ? formatPoints(progress.xp) : "–"} />
                <XpLine term={progress && !isMaxLevel(progress) ? `To level ${formatPoints(progress.level + 1)}` : "XP left"} value={progress ? (isMaxLevel(progress) ? "Max level" : formatPoints(xpLeft(progress))) : "–"} />
                {progress?.total !== undefined && <XpLine term="Total XP" value={formatPoints(progress.total)} />}
              </dl>
            </div>
            <dl className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-0.5 rounded-lg border border-border bg-card p-3">
                <dt className="text-xs text-muted-foreground">Games</dt>
                <dd className="numeric text-lg font-semibold wrap-anywhere">{formatPoints(connected.stats.challengeFinished)}</dd>
              </div>
              <div className="flex flex-col gap-0.5 rounded-lg border border-border bg-card p-3">
                <dt className="text-xs text-muted-foreground">Best</dt>
                <dd className="numeric text-lg font-semibold wrap-anywhere">{formatPoints(connected.stats.bestScore)}</dd>
              </div>
            </dl>
            {onOpenLeague && (
              <Button variant="outline" onClick={onOpenLeague}>
                <Icon name="swords" size="xs" />
                Battle logs
              </Button>
            )}
            {onEditAvatar && (
              <Button variant="outline" onClick={onEditAvatar}>
                <Icon name="pen" size="xs" />
                Edit avatar
              </Button>
            )}
            <Button variant="ghost" onClick={onDisconnect}>
              <Icon name="right-from-bracket" size="xs" />
              Disconnect
            </Button>
          </>
        )}
        {state.status === "guest" && (
          <Button onClick={onConnect} loading={state.connecting}>
            Connect
          </Button>
        )}
      </SheetContent>
    </Sheet>
  );
}
