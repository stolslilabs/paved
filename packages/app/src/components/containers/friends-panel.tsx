import { useState, type ReactNode } from "react";
import { formatInteger } from "@paved/game-core";
import type { FollowLists, FollowRow, GuildBadge, PublicProfile } from "../../data/social-source";
import { followErrorText } from "../../lib/follow-text";
import { LEAGUES, leagueOf } from "../../lib/pvp-rules";
import { useSidePanel } from "../../lib/side-panel";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../ui/sheet";
import { ScrollRegion } from "../ui/scroll-region";
import { Skeleton } from "../ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import { FollowMark } from "../elements/follow-mark";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { LeagueCrest } from "../elements/league-crest";
import { PlayerAvatar } from "../elements/player-avatar";
import { PlayerName } from "../elements/player-name";
import { Presence } from "../elements/presence";
import { formatPoints } from "../elements/score";
import { useGuildActions } from "./guild-sheets";

/** The Friends tab's three lists (#954). */
export type FriendsList = "friends" | "following" | "followers";

/** The writes of the Friends tab's rows, on one player. */
export type FollowRowAction = "follow" | "unfollow" | "removeFollower" | "unblock";

/** The side panel from `desktop`; the bottom sheet under it. */
const DESKTOP_QUERY = "(min-width: 64rem)";

/** How many rows a list shows before "Show more", and how many more each tap. */
export const FRIENDS_PAGE = 20;

const LISTS: { id: FriendsList; label: string; empty: string }[] = [
  { id: "friends", label: "Friends", empty: "No friends yet. When a player you follow follows you back, you are friends." },
  { id: "following", label: "Following", empty: "You follow no one yet: find a player above, or follow a suggestion below." },
  { id: "followers", label: "Followers", empty: "No one follows you yet." },
];

/** The key a list compares players by: the address in small letters, without leading zeros. */
const keyOf = (address: string): string => {
  try {
    return `0x${BigInt(address).toString(16)}`;
  } catch {
    return address.toLowerCase();
  }
};

export interface FollowPlayerRowProps {
  profile: PublicProfile;
  now: number;
  /** Their guild (#953), or none. */
  guild?: GuildBadge | null;
  /** A follower not seen yet: the New mark. */
  isNew?: boolean;
  /** The Friend or Follows you mark. */
  mark?: { followsYou: boolean; friend: boolean };
  onOpen?: (address: string) => void;
  /** The row's actions, on its right (under the player on a narrow screen). */
  children?: ReactNode;
}

/**
 * One player of a follow list (#954): the avatar, the name, the level, the league, the guild, and online or last seen; a tap
 * opens their profile. The actions sit beside it, and go under it when the row is too narrow.
 */
export function FollowPlayerRow({ profile, now, guild, isNew, mark, onOpen, children }: FollowPlayerRowProps) {
  const league = LEAGUES[profile.league] ?? leagueOf(profile.crowns);
  return (
    <div data-slot="follow-row" data-new={isNew || undefined} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border bg-card p-2 pr-3">
      <button
        type="button"
        aria-label={`${profile.name ?? profile.address}, level ${formatPoints(profile.level)}, ${league.name} league${isNew ? ", new follower" : ""}`}
        onClick={() => onOpen?.(profile.address)}
        className="state-layer flex min-h-12 min-w-0 flex-[1_1_12rem] items-center gap-3 rounded-lg px-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <PlayerAvatar player={{ name: profile.name, address: profile.address }} look={profile.look} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-2">
            <PlayerName name={profile.name} address={profile.address} className="min-w-0 truncate font-semibold" />
            {isNew && <span className="shrink-0 rounded-full bg-primary px-1.5 text-xs leading-5 font-semibold text-primary-foreground">New</span>}
          </span>
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <span>
              Level <span className="numeric">{formatPoints(profile.level)}</span>
            </span>
            <LeagueCrest league={league} size="sm" />
            {guild && (
              <span data-slot="follow-row-guild" className="inline-flex min-w-0 items-center gap-1">
                <Icon name="shield-halved" size="xs" />
                <span className="min-w-0 wrap-anywhere">{guild.name}</span>
              </span>
            )}
          </span>
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            <Presence lastSeen={profile.lastSeen} now={now} />
            {mark && <FollowMark status={mark} />}
          </span>
        </span>
      </button>
      {children && <div className="ml-auto flex shrink-0 flex-wrap justify-end gap-2">{children}</div>}
    </div>
  );
}

/** A list read as the panel shows it: read, still read (null), or failed. */
export interface FriendsPanelProps {
  /** The player's own lists; null while they are read. */
  lists: FollowLists | null;
  error?: string | null;
  errorDetail?: ErrorDetail;
  onRetry?: () => void;
  /** Whom the player may follow; null while read. */
  suggestions: readonly PublicProfile[] | null;
  /** The list shown. */
  list: FriendsList;
  onListChange?: (list: FriendsList) => void;
  /** The clock, in seconds: online or last seen. */
  now: number;
  /** A player's guild (#953), as read; undefined or null: none shown. */
  guildOf?: (address: string) => GuildBadge | null | undefined;
  onOpenPlayer?: (address: string) => void;
  /** A row's write on `address`; returns the write's promise. */
  onAction?: (action: FollowRowAction, address: string) => Promise<unknown> | void;
  /** Where the blocked players' sheet starts: open for its story. */
  initialBlockedOpen?: boolean;
}

/**
 * The Social page's Friends tab (#954): three lists, Friends (the mutual follows), Following and Followers, each with its count,
 * online players first, then the most recently seen; the new followers marked until seen. Each row opens the player's profile
 * and has its actions: Unfollow (confirmed), and in Followers, Follow back and Remove (confirmed; they are not told). Then the
 * players suggested to follow, and the tab's menu: the blocked players, with Unblock.
 */
export function FriendsPanel({ lists, error, errorDetail, onRetry, suggestions, list, onListChange, now, guildOf, onOpenPlayer, onAction, initialBlockedOpen = false }: FriendsPanelProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const actions = useGuildActions<{ action: FollowRowAction; address: string }>((a) => onAction?.(a.action, a.address), followErrorText);
  const [shown, setShown] = useState(FRIENDS_PAGE);
  const [suggested, setSuggested] = useState(5);
  const [blockedOpen, setBlockedOpen] = useState(initialBlockedOpen);
  const run = (action: FollowRowAction, address: string) => {
    setBusy(keyOf(address));
    void actions.run({ action, address }).finally(() => setBusy(null));
  };
  const nameOf = (p: PublicProfile) => p.name ?? "this player";
  const following = new Set(lists?.following.map((r) => keyOf(r.profile.address)));
  const followers = new Set(lists?.followers.map((r) => keyOf(r.profile.address)));
  const rows = lists ? lists[list] : null;
  const meta = LISTS.find((l) => l.id === list)!;

  const unfollow = (p: PublicProfile, friend: boolean) => (
    <Button
      size="sm"
      variant="secondary"
      aria-label={`Unfollow ${nameOf(p)}`}
      disabled={busy !== null}
      onClick={() => actions.ask({ title: `Unfollow ${nameOf(p)}?`, text: friend ? "You stop being friends; they still follow you." : "They are not told.", confirm: "Unfollow" }, () => ({ action: "unfollow", address: p.address }))}
    >
      Unfollow
    </Button>
  );
  const follow = (p: PublicProfile, back: boolean) => (
    <Button size="sm" aria-label={`${back ? "Follow back" : "Follow"} ${nameOf(p)}`} loading={busy === keyOf(p.address)} disabled={busy !== null} onClick={() => run("follow", p.address)}>
      <Icon name="plus" size="xs" />
      {back ? "Follow back" : "Follow"}
    </Button>
  );

  const rowOf = (r: FollowRow) => {
    const p = r.profile;
    const key = keyOf(p.address);
    const friend = following.has(key) && followers.has(key);
    return (
      <li key={key}>
        <FollowPlayerRow profile={p} now={now} guild={guildOf?.(p.address)} isNew={list === "followers" && r.isNew} mark={list === "friends" ? undefined : { followsYou: followers.has(key), friend }} onOpen={onOpenPlayer}>
          {list === "followers" ? (
            <>
              {!following.has(key) && follow(p, true)}
              <Button
                size="sm"
                variant="outline"
                aria-label={`Remove ${nameOf(p)}`}
                disabled={busy !== null}
                onClick={() => actions.ask({ title: `Remove ${nameOf(p)}?`, text: "They stop following you. They are not told, and may follow you again.", confirm: "Remove", destructive: true }, () => ({ action: "removeFollower", address: p.address }))}
              >
                <Icon name="xmark" size="xs" />
                Remove
              </Button>
            </>
          ) : (
            unfollow(p, friend)
          )}
        </FollowPlayerRow>
      </li>
    );
  };

  const blocked = lists?.blocked ?? [];
  return (
    <div data-slot="friends-panel" className="flex flex-col gap-5">
      <InlineError
        title="Friends"
        message={error}
        detail={errorDetail}
        action={
          onRetry && (
            <Button size="sm" variant="secondary" onClick={onRetry}>
              Try again
            </Button>
          )
        }
      />

      <ToggleGroup
        type="single"
        aria-label="Lists"
        className="grid w-full grid-cols-3"
        value={list}
        onValueChange={(v) => {
          if (!v) return;
          setShown(FRIENDS_PAGE);
          onListChange?.(v as FriendsList);
        }}
      >
        {LISTS.map(({ id, label }) => {
          const count = lists ? lists[id].length : null;
          const fresh = id === "followers" ? (lists?.newFollowers ?? 0) : 0;
          return (
            <ToggleGroupItem key={id} value={id} aria-label={`${label}${count === null ? "" : `, ${formatInteger(count)}`}${fresh > 0 ? `, ${formatInteger(fresh)} new` : ""}`} className="relative h-auto min-w-0 flex-col gap-0 px-1 py-1.5">
              <span className="numeric text-base leading-6 font-semibold">{count === null ? "–" : formatInteger(count)}</span>
              <span className="text-xs">{label}</span>
              {fresh > 0 && (
                <span aria-hidden className="numeric absolute -top-2 -right-1 z-10 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-xs leading-none font-semibold text-primary-foreground">
                  {fresh > 99 ? "99+" : fresh}
                </span>
              )}
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>

      <section aria-label={meta.label} className="flex flex-col gap-2">
        {rows === null && !error && (
          <div aria-busy className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-18 rounded-xl" />
            ))}
          </div>
        )}
        {rows?.length === 0 && <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">{meta.empty}</p>}
        {rows && rows.length > 0 && <ul className="flex flex-col gap-2">{rows.slice(0, shown).map(rowOf)}</ul>}
        {rows && rows.length > shown && (
          <Button variant="ghost" onClick={() => setShown(shown + FRIENDS_PAGE)}>
            Show more ({formatInteger(rows.length - shown)})
          </Button>
        )}
        <InlineError title="Friends" message={actions.error} />
      </section>

      <section aria-label="Suggested players" className="flex flex-col gap-2">
        <h3 className="font-semibold">Players to follow</h3>
        {suggestions === null && (
          <div aria-busy className="flex flex-col gap-2">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-18 rounded-xl" />
            ))}
          </div>
        )}
        {suggestions?.length === 0 && <p className="text-sm text-muted-foreground">No one to suggest right now: search a name above.</p>}
        {suggestions && suggestions.length > 0 && (
          <ul className="flex flex-col gap-2">
            {suggestions.slice(0, suggested).map((p) => {
              const back = followers.has(keyOf(p.address));
              return (
                <li key={keyOf(p.address)}>
                  <FollowPlayerRow profile={p} now={now} guild={guildOf?.(p.address)} mark={{ followsYou: back, friend: false }} onOpen={onOpenPlayer}>
                    {follow(p, back)}
                  </FollowPlayerRow>
                </li>
              );
            })}
          </ul>
        )}
        {suggestions && suggestions.length > suggested && (
          <Button variant="ghost" onClick={() => setSuggested(suggested + 5)}>
            More suggestions
          </Button>
        )}
      </section>

      <Button variant="outline" className="self-center" onClick={() => setBlockedOpen(true)}>
        <Icon name="lock" size="xs" />
        Blocked players{blocked.length > 0 && <span className="numeric">({formatInteger(blocked.length)})</span>}
      </Button>
      <BlockedSheet open={blockedOpen} onOpenChange={setBlockedOpen} blocked={lists ? blocked : null} now={now} busy={busy} onOpenPlayer={onOpenPlayer} onUnblock={(address) => run("unblock", address)} error={blockedOpen ? actions.error : null} />
      {actions.dialog}
    </div>
  );
}

interface BlockedSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The players the player blocks, the latest first; null while read. */
  blocked: readonly FollowRow[] | null;
  now: number;
  busy: string | null;
  onOpenPlayer?: (address: string) => void;
  onUnblock: (address: string) => void;
  error?: string | null;
}

/** The Friends tab's menu (#954, open point 5's default): the blocked players, each with Unblock. Theirs only to see. */
function BlockedSheet({ open, onOpenChange, blocked, now, busy, onOpenPlayer, onUnblock, error }: BlockedSheetProps) {
  const desktop = useSidePanel(DESKTOP_QUERY);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={desktop ? "right" : "bottom"} data-slot="blocked-players" className="max-h-[92dvh]">
        <SheetHeader>
          <SheetTitle>Blocked players</SheetTitle>
          <SheetDescription>They cannot follow you, message you or invite you to a guild, and they are not told.</SheetDescription>
        </SheetHeader>
        <ScrollRegion className="-mx-6 min-h-0 px-6">
          {blocked === null && <Skeleton aria-busy className="h-18 rounded-xl" />}
          {blocked?.length === 0 && <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">You block no one. Block a player from their profile.</p>}
          {blocked && blocked.length > 0 && (
            <ul className="flex flex-col gap-2">
              {blocked.map((r) => (
                <li key={keyOf(r.profile.address)}>
                  <FollowPlayerRow profile={r.profile} now={now} onOpen={onOpenPlayer}>
                    <Button size="sm" variant="outline" aria-label={`Unblock ${r.profile.name ?? "this player"}`} loading={busy === keyOf(r.profile.address)} disabled={busy !== null} onClick={() => onUnblock(r.profile.address)}>
                      <Icon name="lock-open" size="xs" />
                      Unblock
                    </Button>
                  </FollowPlayerRow>
                </li>
              ))}
            </ul>
          )}
          <InlineError title="Unblock" message={error} className="mt-2" />
        </ScrollRegion>
      </SheetContent>
    </Sheet>
  );
}
