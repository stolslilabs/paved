import { useContext, useState, type ReactNode } from "react";
import { isOnline } from "@paved/game-core";
import { playerRecords } from "../../data/player-records";
import type { FollowStatus, PublicProfile } from "../../data/social-source";
import { DataContext } from "../../data/sources";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import { FollowMark } from "../elements/follow-mark";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { LevelBar } from "../elements/level-bar";
import { PlayerAvatar } from "../elements/player-avatar";
import { PlayerName } from "../elements/player-name";
import { Presence } from "../elements/presence";
import { formatPoints } from "../elements/score";
import { SectionTitle } from "../elements/section-title";
import { shortAddress } from "../elements/short-address";
import type { PlayerProgress } from "../elements/xp-motion";
import { HudDrawer } from "./hud-drawer";
import { Figure, FigureBand, HallAndStats, ProfileRim, TrophiesBand, XpLeft, type PlayerRecords, type SeasonStanding } from "./profile-sheet";

/** What the sheet shows: the profile read, still read, no player of that ID, a failed read, or no social source on this network. */
export type PublicProfileState =
  | { status: "loading" }
  | { status: "ready"; profile: PublicProfile }
  | { status: "missing" }
  | { status: "error"; message: string }
  | { status: "unavailable" };

export interface PublicProfileSheetProps {
  state: PublicProfileState;
  /** The clock, in seconds: online or last seen. */
  now: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Copies the player ID; a rejection is a failed copy (nothing said). The page does the copying. */
  onCopy?: (address: string) => Promise<void>;
  /** Reads the profile again after a failed read. */
  onRetry?: () => void;
  errorDetail?: ErrorDetail;
  /** The guild line (#953): the player's guild and rank. Left out: none shown. */
  guild?: ReactNode;
  /**
   * The actions of the social features (#953 to #955): Message, Follow or Following, Block (the Profile's tiles, side by side), and
   * the guild's (a block of its own, under them).
   */
  actions?: ReactNode;
  /**
   * The follows (#954): the Friends or Follows you mark beside the presence, and the counts of followers and following beside the
   * village score. Left out (no follow source, or still read): none shown.
   */
  follow?: Pick<FollowStatus, "followers" | "followed" | "followsYou" | "friend">;
  /** Their level and XP (`Setup.player_level`, as the player's own profile reads theirs); undefined while read: the bar's star empty. */
  progress?: PlayerProgress | null;
  /**
   * Their Hall of Fame and records (the owner's ask of 2026-11-05: as on the player's own profile). Left out with `records`, read where
   * the app's sources are (`playerRecords`: the mock's for now, the same for every player, as the own profile's); else none.
   */
  hallOfFame?: readonly SeasonStanding[];
  records?: PlayerRecords;
}

/** The sheet's title and line for each state but `ready`. */
const HEADS: Record<Exclude<PublicProfileState["status"], "ready">, { title: string; line: string }> = {
  loading: { title: "Player", line: "Looking for this player…" },
  missing: { title: "Player not found", line: "No player has this ID." },
  error: { title: "Player", line: "Their profile could not be read." },
  unavailable: { title: "Player", line: "Player profiles are not on this network yet." },
};

/** The portrait in the rim of their league, the Profile's 112 px (`ProfileRim`, its crest at its lower left). */
function Portrait({ profile }: { profile: PublicProfile }) {
  return (
    <span className="text-[7rem]">
      <ProfileRim league={{ crowns: profile.crowns, league: profile.league, unranked: false }}>
        <PlayerAvatar size="lg" className="size-full p-0 [&>span]:text-3xl" player={{ name: profile.name, address: profile.address }} look={profile.look} />
      </ProfileRim>
    </span>
  );
}

/**
 * Another player's public profile (#952), opened from anywhere the app lists other players (the friends' rows, the battle logs'
 * cards, the search's results, the chat, the guild, `/player/:id`). FRIENDS-PAGE, the owner's asks of 2026-11-05: the player's own
 * Profile page (`ProfileSheet`), as the HUD's drawer, a full page on a phone, a side panel docked at the **right** from `tablet` (the
 * others' profiles at the right, in the friends page's place; one's own at the left), its Back at every width back to where it was
 * opened from; titled "Profile" (its accessible name the player's, which screen readers hear). The avatar in the rim of
 * their league and its crest, their name, online or last seen and the Friends or Follows you mark, their player ID under them (a tap
 * copies it, as the Profile's address); their guild's line (#953); the Level (its star and bar, their XP), the League (the crowns and
 * the league), the village score and the follow counts (#954) carved; then their actions as the Profile's raised tiles, Message,
 * Following and Block (#953 to #955), in place of Battle logs, Avatar, Tiles and Invite, the guild's beside them; then their Hall of
 * Fame and Stats, as the Profile's (`HallAndStats`).
 */
export function PublicProfileSheet({ state, now, open, onOpenChange, onCopy, onRetry, errorDetail, guild, actions, follow, progress, hallOfFame: givenFame, records: givenRecords }: PublicProfileSheetProps) {
  const sources = useContext(DataContext);
  // Neither given (the app): read where the app's sources are, as the player's own profile does.
  const { hallOfFame, records } = sources && givenFame === undefined && givenRecords === undefined ? playerRecords() : { hallOfFame: givenFame, records: givenRecords };
  const [copied, setCopied] = useState(false);
  const profile = state.status === "ready" ? state.profile : null;
  const head = state.status === "ready" ? null : HEADS[state.status];
  const title = profile ? (
    <>
      <span aria-hidden>Profile</span>
      <span className="sr-only">{profile.name ?? shortAddress(profile.address)}</span>
    </>
  ) : (
    head!.title
  );
  return (
    <HudDrawer
      open={open}
      onOpenChange={(next) => {
        if (!next) setCopied(false);
        onOpenChange(next);
      }}
      title={title}
      side="right"
      // Back at every width (the owner's ask of 2026-11-05): to the page it was opened from, the friends' list in its place.
      onBack={() => onOpenChange(false)}
      slot="public-profile"
    >
      <div data-slot="public-profile" data-status={state.status} className="flex flex-col gap-3">
        {profile ? (
          <>
            {/* Room under the avatar: the crest runs past the rim's foot (the owner's ask of 2026-11-05). */}
            <div data-slot="profile-identity" className="flex items-center gap-3 pb-3">
              <Portrait profile={profile} />
              <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
                {/* With no name, the short address in Space Mono, whose glyphs stand taller than a tight line (the profile's rule). */}
                <PlayerName name={profile.name} address={profile.address} className={cn("text-outline max-w-full text-2xl font-bold", profile.name ? "leading-tight" : "leading-normal")} />
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Presence lastSeen={profile.lastSeen} now={now} className={cn("text-sm font-bold", isOnline(profile.lastSeen, now) && "text-success")} />
                  {follow && <FollowMark status={follow} />}
                </div>
                {/* The player ID as a subtitle: a tap copies it, with no button's look (the Profile's address); "Copied" says it worked. */}
                <button
                  type="button"
                  data-slot="profile-address"
                  aria-label={copied ? "Player ID copied" : "Copy player ID"}
                  aria-live="polite"
                  onClick={() => void onCopy?.(profile.address).then(() => setCopied(true), () => undefined)}
                  className="max-w-full cursor-pointer truncate rounded-sm text-sm font-semibold text-muted-foreground outline-none"
                >
                  {copied ? "Copied" : `#${shortAddress(profile.address)}`}
                </button>
              </div>
            </div>
            {/* Their guild before the actions (the owner's ask of 2026-11-05). */}
            {guild && (
              <div data-slot="profile-guild" className="empty:hidden">
                {guild}
              </div>
            )}
            {/*
              Under the avatar (the owner's ask of 2026-11-05), as on the player's own profile: the row of tiles (Message, Following,
              Block); a block of its own (the guild's, `basis-full`) on a line under them.
            */}
            {/* The Profile's row of tiles (Message, Following, Block); a block of its own (the guild's, `basis-full`) on a line under them. */}
            <div data-slot="profile-actions" className="flex flex-wrap gap-1.5 empty:hidden">
              {actions}
            </div>
            <div data-slot="player-level" className="flex flex-col gap-1">
              <SectionTitle>Level</SectionTitle>
              <LevelBar progress={progress ?? undefined} variant="profile" className="mx-auto max-w-66" />
              <span className="sr-only">Level {formatPoints(progress?.level ?? profile.level)}</span>
              {/* The bar is a picture (`aria-hidden`): its XP made and required, or the cap, said as on the own profile (#1026). */}
              <XpLeft progress={progress ?? undefined} />
            </div>
            <section aria-label="League" className="flex flex-col gap-2">
              <SectionTitle>League</SectionTitle>
              <TrophiesBand league={{ crowns: profile.crowns, league: profile.league, unranked: false }} />
            </section>
            <FigureBand slot="profile-figures">
              <Figure term="Village score" value={profile.score} />
              {follow && (
                <>
                  <Figure term="Followers" value={follow.followers} />
                  <Figure term="Following" value={follow.followed} />
                </>
              )}
            </FigureBand>
            <HallAndStats hallOfFame={hallOfFame} records={records} />
          </>
        ) : (
          <>
            {state.status === "loading" && (
              <div aria-busy className="flex items-center gap-3">
                <Skeleton aria-hidden className="size-28 shrink-0 rounded-full" />
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-6 w-32" />
                  <Skeleton className="h-4 w-24" />
                </div>
              </div>
            )}
            <p className="text-sm font-semibold text-muted-foreground">{head!.line}</p>
            {state.status === "loading" && <Skeleton aria-hidden className="h-32 rounded-xl" />}
          </>
        )}
        <InlineError
          title="Player"
          message={state.status === "error" ? state.message : null}
          detail={errorDetail}
          action={
            onRetry && (
              <Button size="sm" variant="secondary" onClick={onRetry}>
                Try again
              </Button>
            )
          }
        />
      </div>
    </HudDrawer>
  );
}
