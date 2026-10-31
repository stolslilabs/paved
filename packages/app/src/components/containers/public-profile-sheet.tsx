import { useState, type ReactNode } from "react";
import type { PublicProfile } from "../../data/social-source";
import { LEAGUES, leagueOf } from "../../lib/pvp-rules";
import { useSidePanel } from "../../lib/side-panel";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../ui/sheet";
import { Skeleton } from "../ui/skeleton";
import { Crowns } from "../elements/crowns";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { LeagueCrest } from "../elements/league-crest";
import { PlayerAvatar } from "../elements/player-avatar";
import { PlayerName } from "../elements/player-name";
import { Presence } from "../elements/presence";
import { formatPoints } from "../elements/score";
import { ShortAddress } from "../elements/short-address";

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
  /** The actions of the social features (#953 to #955: Follow, Message, Invite, the rank actions), above Copy player ID. */
  actions?: ReactNode;
}

/** The side panel from `desktop`; the bottom sheet under it. */
const DESKTOP_QUERY = "(min-width: 64rem)";

/** One figure of the profile. */
function Figure({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-lg border border-border bg-card p-3">
      <dt className="text-xs text-muted-foreground">{term}</dt>
      <dd className="numeric text-lg font-semibold wrap-anywhere">{children}</dd>
    </div>
  );
}

/** The player ID with Copy: what this step gives the actions area (#952). */
function CopyId({ address, onCopy }: { address: string; onCopy?: (address: string) => Promise<void> }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/60 p-1.5 pl-3">
      <ShortAddress address={address} className="flex-1 text-xs" />
      <Button size="sm" variant={copied ? "secondary" : "default"} aria-live="polite" aria-label={copied ? "Player ID copied" : "Copy player ID"} onClick={() => void onCopy?.(address).then(() => setCopied(true), () => undefined)}>
        <Icon name={copied ? "check" : "copy"} size="xs" />
        {copied ? "Copied" : "Copy ID"}
      </Button>
    </div>
  );
}

/** The sheet's title and line for each state but `ready`. */
const HEADS: Record<Exclude<PublicProfileState["status"], "ready">, { title: string; line: string }> = {
  loading: { title: "Player", line: "Looking for this player…" },
  missing: { title: "Player not found", line: "No player has this ID." },
  error: { title: "Player", line: "Their profile could not be read." },
  unavailable: { title: "Player", line: "Player profiles are not on this network yet." },
};

/**
 * Another player's public profile (#952), opened from anywhere the app lists other players (the battle logs' cards, the
 * search's results, `/player/:id`): a bottom sheet on a phone, a panel from the right from `desktop`. The avatar, the name,
 * online or last seen, the league's crest and crowns, the level and the village score; the guild line (#953) and the actions
 * (#953 to #955) where their issues give them, and Copy player ID.
 */
export function PublicProfileSheet({ state, now, open, onOpenChange, onCopy, onRetry, errorDetail, guild, actions }: PublicProfileSheetProps) {
  const desktop = useSidePanel(DESKTOP_QUERY);
  const profile = state.status === "ready" ? state.profile : null;
  const head = state.status === "ready" ? null : HEADS[state.status];
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={desktop ? "right" : "bottom"} data-slot="public-profile" data-status={state.status}>
        <SheetHeader className="items-center text-center">
          {profile ? (
            <PlayerAvatar size="lg" player={{ name: profile.name, address: profile.address }} look={profile.look} />
          ) : state.status === "loading" ? (
            <Skeleton aria-hidden className="size-24 rounded-full" />
          ) : null}
          <SheetTitle className="flex w-full min-w-0 justify-center">{profile ? <PlayerName name={profile.name} address={profile.address} className="text-lg" /> : head!.title}</SheetTitle>
          <SheetDescription asChild={!!profile}>{profile ? <div className="flex justify-center"><Presence lastSeen={profile.lastSeen} now={now} /></div> : head!.line}</SheetDescription>
          {profile && (
            <div data-slot="profile-league" className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
              <LeagueCrest league={LEAGUES[profile.league] ?? leagueOf(profile.crowns)} />
              <Crowns value={profile.crowns} />
            </div>
          )}
        </SheetHeader>

        {state.status === "loading" && (
          <div aria-busy className="grid grid-cols-2 gap-3">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-16 rounded-lg" />
            ))}
          </div>
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

        {profile && (
          <>
            {guild && <div data-slot="profile-guild">{guild}</div>}
            <dl className="grid grid-cols-2 gap-3">
              <Figure term="Level">{formatPoints(profile.level)}</Figure>
              <Figure term="Village score">{formatPoints(profile.score)}</Figure>
            </dl>
            <div data-slot="profile-actions" className="flex flex-col gap-2">
              {actions}
              <CopyId address={profile.address} onCopy={onCopy} />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
