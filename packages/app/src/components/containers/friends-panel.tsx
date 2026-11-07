import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { formatCompact, formatInteger, isOnline } from "@paved/game-core";
import type { FollowLists, FollowRow, GuildBadge, PublicProfile } from "../../data/social-source";
import { followErrorText } from "../../lib/follow-text";
import { LEAGUES, leagueOf } from "../../lib/pvp-rules";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import { Tabs, TabsContent } from "../ui/tabs";
import type { UiIconName } from "../elements/ui-art";
import { goldPillStyle } from "../elements/friends-art";
import { FriendsArt } from "../elements/friends-art-image";
import { GuildEmblem } from "../elements/guild-emblem";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { LeagueCrestIcon } from "../elements/league-crest-art";
import { LevelStar } from "../elements/level-star";
import { LeagueRim } from "../elements/league-rim";
import { divisionOf, tierOf } from "../elements/league-standards";
import { PlayerAvatar } from "../elements/player-avatar";
import { PlayerName } from "../elements/player-name";
import { Presence } from "../elements/presence";
import { formatPoints } from "../elements/score";
import { SectionTitle } from "../elements/section-title";
import { UiIcon } from "../elements/ui-icon";
import { useGuildActions } from "./guild-sheets";
import { FooterTab, FooterTabsList } from "./footer-tabs";
import { DrawerFooter, HudDrawer } from "./hud-drawer";
import { CARVED_ROWS, rowRule } from "./player-search";

/** The friends page's three tabs (#954's lists, tabs since #973). */
export type FriendsList = "friends" | "following" | "followers";

/** The writes of the lists' rows, on one player (`removeFollower` is the data layer's; FRIENDS-PAGE's rows no longer offer it). */
export type FollowRowAction = "follow" | "unfollow" | "removeFollower" | "unblock";

/** How many rows a list shows before "Show more", and how many more each tap. */
export const FRIENDS_PAGE = 20;

/** Each list, its footer tab's painted icon (FOOTER-TABS, #1062) and its empty words. */
const LISTS: { id: FriendsList; label: string; art: UiIconName; empty: string }[] = [
  { id: "friends", label: "Friends", art: "friends", empty: "No friends yet. When a player you follow follows you back, you are friends." },
  { id: "following", label: "Following", art: "user", empty: "You follow no one yet: find a player above, or follow a suggestion below." },
  { id: "followers", label: "Followers", art: "members", empty: "No one follows you yet." },
];

/** The key a list compares players by: the address in small letters, without leading zeros. */
const keyOf = (address: string): string => {
  try {
    return `0x${BigInt(address).toString(16)}`;
  } catch {
    return address.toLowerCase();
  }
};

/** A list's count by its title, the book's "Friends 6": whole up to 999, short from 1,000 ("1.2K"). */
const tabCount = (n: number) => (n < 1_000 ? formatInteger(n) : formatCompact(n));

/**
 * The rows' buttons (FRIENDS-PAGE, the book's pills): 32 px tall and round; their touch target 44 px (a band past their top and
 * foot). Raised grey presses (the drawer's rule: raised presses,
 * carved informs); the book's gold is the one way back, Follow back.
 */
const PILL = "relative h-8 gap-1 rounded-full px-3 text-sm font-bold after:absolute after:inset-x-0 after:-inset-y-1.5";
const RAISED = "drawer-raised text-outline text-foreground";
/** The raised grey pill (Follow, Following, Unblock, Show more). */
export const RAISED_PILL = cn(PILL, RAISED);
/** The gold pill (Follow back): the book's painted pill under the words (`GOLD_PILL_STYLE`), white and outlined as the book writes them. */
export const GOLD_PILL = cn(PILL, "text-outline px-1 text-foreground");

/** The gold pill's height in CSS px (`PILL`'s), its painted ends following it, never stretched. */
const GOLD_PILL_PX = 32;
/** The book's gold pill (`friends-art.ts`, the owner's ask of 2026-11-05) as a 3-slice: its rounded ends whole, its middle stretched. */
export const GOLD_PILL_STYLE: CSSProperties = goldPillStyle(GOLD_PILL_PX);

export interface PlayerPortraitProps {
  profile: Pick<PublicProfile, "name" | "address" | "look" | "league" | "crowns">;
  /** A follower not seen yet: the HUD's red dot at the portrait's upper right (the owner's ask of 2026-11-05, in place of the book's New). */
  isNew?: boolean;
  className?: string;
}

/**
 * A player's portrait in a list (the book's rows): the avatar in the rim of their league, 56 px, the league's crest at its lower right
 * (the owner's ask of 2026-11-05: the guild's emblem is the guild line's alone), a new follower's red dot at its upper right.
 */
export function PlayerPortrait({ profile, isNew, className }: PlayerPortraitProps) {
  const league = LEAGUES[profile.league] ?? leagueOf(profile.crowns);
  return (
    <span data-slot="player-portrait" className={cn("relative shrink-0", className)}>
      <LeagueRim tier={tierOf(league)} size="md" className="block">
        <PlayerAvatar player={{ name: profile.name, address: profile.address }} look={profile.look} className="size-full p-0 [&>span]:text-lg" />
      </LeagueRim>
      <LeagueCrestIcon tier={tierOf(league)} division={divisionOf(league)} size="md" className="drawer-icon absolute -right-1.5 -bottom-1" />
      {isNew && <span aria-hidden data-slot="new-dot" className="absolute -top-0.5 -right-0.5 size-3.5 rounded-full bg-dock-badge ring-2 ring-card" />}
    </span>
  );
}

export interface FollowPlayerRowProps {
  profile: PublicProfile;
  /** Their guild (#953), or none. */
  guild?: GuildBadge | null;
  /** A follower not seen yet: said in the row's name, its red dot on the portrait. */
  isNew?: boolean;
  /** `list`: the name, the level's star and the crowns, the guild (the book's lists); `suggestion`: the name and the guild (its Suggestions). */
  variant?: "list" | "suggestion";
  onOpen?: (address: string) => void;
  /** What the row holds at its right end: online or last seen, or its actions. */
  children?: ReactNode;
}

/**
 * One player of a list (#954; FRIENDS-PAGE, the Paved UX Book's rows): the portrait (`PlayerPortrait`), the name, the level in the
 * HUD's blue star (the owner's ask) and the crowns, the guild's emblem and name; a tap opens their profile. What the row shows at its end sits beside it, and goes under it,
 * at the right, when the player would keep less than 9 rem.
 */
export function FollowPlayerRow({ profile, guild, isNew, variant = "list", onOpen, children }: FollowPlayerRowProps) {
  const league = LEAGUES[profile.league] ?? leagueOf(profile.crowns);
  return (
    <div data-slot="follow-row" data-new={isNew || undefined} className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 py-2">
      <button
        type="button"
        aria-label={`${profile.name ?? profile.address}, level ${formatPoints(profile.level)}, ${league.name} league${isNew ? ", new follower" : ""}`}
        onClick={() => onOpen?.(profile.address)}
        className="state-layer -ml-1.5 flex min-h-14 min-w-0 flex-[1_1_9rem] cursor-pointer items-center gap-2.5 rounded-lg py-1 pr-0 pl-1.5 text-left outline-none"
      >
        <PlayerPortrait profile={profile} isNew={isNew} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          {/* With no name, the short address in Space Mono, whose glyphs stand taller than a tight line (the profile's rule). */}
          <PlayerName name={profile.name} address={profile.address} className={cn("text-outline max-w-full min-w-0 pr-0.5 text-base font-bold", profile.name ? "leading-snug" : "leading-normal")} />
          {variant === "list" && (
            <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-sm leading-tight font-bold whitespace-nowrap">
              <LevelStar level={profile.level} className="size-6" />
              <span className="inline-flex items-center gap-1">
                <UiIcon name="crown" px={20} className="size-5" />
                <span className="text-outline tabular-nums">{formatPoints(profile.crowns)}</span>
              </span>
            </span>
          )}
          {guild && (
            <span data-slot="follow-row-guild" className="flex min-w-0 items-center gap-1.5 text-xs leading-tight font-bold text-muted-foreground">
              <GuildEmblem emblem={guild.emblem} size="sm" className="h-6 w-5" />
              <span title={guild.name} className="min-w-0 truncate">
                {guild.name}
              </span>
            </span>
          )}
        </span>
      </button>
      {children && <div className="ml-auto flex shrink-0 items-center gap-1.5">{children}</div>}
    </div>
  );
}

/** Online, or when last seen, at a friend's row's end (the book's: the green "Online", else "2 h ago"). */
function RowPresence({ profile, now }: { profile: PublicProfile; now: number }) {
  return <Presence short lastSeen={profile.lastSeen} now={now} className={cn("text-sm font-bold", isOnline(profile.lastSeen, now) && "text-success")} />;
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
  /** Message (#955): opens the private conversation with a player. FRIENDS-PAGE: on their profile, the rows have none (the book's). */
  onMessage?: (address: string) => void;
  /** A row's write on `address`; returns the write's promise. */
  onAction?: (action: FollowRowAction, address: string) => Promise<unknown> | void;
  /**
   * The followers on screen, by address, each time they change while Followers is shown (the new ones first, then the rest, a
   * page at a time): the page marks the new ones seen only once every one of them has been on screen.
   */
  onFollowersShown?: (addresses: readonly string[]) => void;
  /** Where the blocked players' sheet starts: open for its story. */
  initialBlockedOpen?: boolean;
}

/** A list's empty state and the panels' words: on the drawer's carved surface. */
export const CARVED_NOTE = "drawer-carved rounded-xl px-4 py-6 text-center text-sm font-semibold text-muted-foreground";

/**
 * The friends page's lists (`/friends`, #973; the Social page's Friends tab of #954 before), redrawn after the Paved UX Book's
 * "Friends and followers" (FRIENDS-PAGE): three tabs, Friends (the mutual follows), Following and Followers, the footer's tabs since
 * #1062 (FOOTER-TABS, the owner's standard), the new followers' count on Followers in the dock's red. Each list under its title and its
 * count, a carved panel of rows, online players first, then the most recently seen; a tap on a row opens the player's profile (Message,
 * Following, Block are there, as the book's). Friends: online or when last seen at each row's end. Following: Following (unfollows,
 * confirmed). Followers: the new ones first and marked New, Follow back in gold, or Following. Then the Suggestions (the book's: the
 * name and the guild, Follow, or Follow back in gold), and the blocked players, a sheet of their own with Unblock.
 */
export function FriendsPanel({ lists, error, errorDetail, onRetry, suggestions, list, onListChange, now, guildOf, onOpenPlayer, onAction, onFollowersShown, initialBlockedOpen = false }: FriendsPanelProps) {
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
  // The new followers first, so that the first page holds them; the source's order (online, then last seen) within each part.
  const rows = useMemo(() => {
    if (!lists) return null;
    const all = lists[list];
    return list === "followers" ? [...all.filter((r) => r.isNew), ...all.filter((r) => !r.isNew)] : all;
  }, [lists, list]);
  const onScreen = list === "followers" && rows ? rows.slice(0, shown).map((r) => r.profile.address).join(",") : null;
  useEffect(() => {
    if (onScreen !== null) onFollowersShown?.(onScreen === "" ? [] : onScreen.split(","));
  }, [onScreen, onFollowersShown]);
  const meta = LISTS.find((l) => l.id === list)!;

  /** Following: the follow, raised; a tap unfollows once confirmed (the profile's Following). */
  const unfollow = (p: PublicProfile, friend: boolean) => (
    <Button
      variant="ghost"
      aria-label={`Following ${nameOf(p)}: unfollow`}
      disabled={busy !== null}
      className={RAISED_PILL}
      onClick={() => actions.ask({ title: `Unfollow ${nameOf(p)}?`, text: friend ? "You stop being friends; they still follow you." : "They are not told.", confirm: "Unfollow" }, () => ({ action: "unfollow", address: p.address }))}
    >
      Following
    </Button>
  );
  /** Follow, raised; Follow back, the book's gold pill. */
  const follow = (p: PublicProfile, back: boolean) => (
    <Button
      variant="ghost"
      aria-label={`${back ? "Follow back" : "Follow"} ${nameOf(p)}`}
      loading={busy === keyOf(p.address)}
      disabled={busy !== null}
      className={back ? GOLD_PILL : RAISED_PILL}
      style={back ? GOLD_PILL_STYLE : undefined}
      onClick={() => run("follow", p.address)}
    >
      {back ? "Follow back" : "Follow"}
    </Button>
  );

  const rowOf = (r: FollowRow, index: number) => {
    const p = r.profile;
    const key = keyOf(p.address);
    const friend = following.has(key) && followers.has(key);
    const isNew = list === "followers" && r.isNew;
    return (
      <li key={key} style={rowRule(index)}>
        <FollowPlayerRow profile={p} guild={guildOf?.(p.address)} isNew={isNew} onOpen={onOpenPlayer}>
          {list === "friends" ? (
            <RowPresence profile={p} now={now} />
          ) : list === "following" ? (
            unfollow(p, friend)
          ) : (
            following.has(key) ? unfollow(p, friend) : follow(p, true)
          )}
        </FollowPlayerRow>
      </li>
    );
  };

  const blocked = lists?.blocked ?? [];
  return (
    <div data-slot="friends-panel" className="flex flex-col gap-4">
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

      <Tabs
        value={list}
        onValueChange={(v) => {
          const next = LISTS.find((l) => l.id === v)?.id;
          if (!next) return;
          setShown(FRIENDS_PAGE);
          onListChange?.(next);
        }}
        rememberAs="friends"
        className="gap-3"
      >
        {LISTS.map(({ id }) => (
          <TabsContent key={id} value={id}>
            {id === list && (
              <section aria-label={meta.label} className="flex flex-col gap-3">
                {/* The list's count by its title, as the Ranking shows its own (#1062). */}
                <SectionTitle>
                  {meta.label}
                  {rows !== null && <span className="numeric font-sans text-base font-bold text-muted-foreground">{tabCount(rows.length)}</span>}
                </SectionTitle>
                {rows === null && !error && (
                  <div aria-busy className="flex flex-col gap-2">
                    {[0, 1, 2].map((i) => (
                      <Skeleton key={i} className="h-18 rounded-xl" />
                    ))}
                  </div>
                )}
                {rows?.length === 0 && <p className={CARVED_NOTE}>{meta.empty}</p>}
                {rows && rows.length > 0 && <ul className={CARVED_ROWS}>{rows.slice(0, shown).map(rowOf)}</ul>}
                {rows && rows.length > shown && (
                  <Button variant="ghost" className={cn(RAISED_PILL, "self-center")} onClick={() => setShown(shown + FRIENDS_PAGE)}>
                    Show more (<span className="tabular-nums">{formatInteger(rows.length - shown)}</span>)
                  </Button>
                )}
                <InlineError title="Friends" message={actions.error} />
              </section>
            )}
          </TabsContent>
        ))}
        {/* The three lists as the footer's tabs (FOOTER-TABS, #1062), the new followers' count on Followers. */}
        <DrawerFooter>
          <FooterTabsList aria-label="Lists">
            {LISTS.map(({ id, label, art }) => (
              <FooterTab key={id} value={id} label={label} badge={id === "followers" ? (lists?.newFollowers ?? 0) : 0} badgeWord="new" art={<UiIcon name={art} px={36} className="drawer-icon size-9" />} />
            ))}
          </FooterTabsList>
        </DrawerFooter>
      </Tabs>

      <section aria-label="Suggested players" className="flex flex-col gap-2.5">
        <SectionTitle>Suggestions</SectionTitle>
        {suggestions === null && (
          <div aria-busy className="flex flex-col gap-2">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-18 rounded-xl" />
            ))}
          </div>
        )}
        {suggestions?.length === 0 && <p className={CARVED_NOTE}>No one to suggest right now: search a name above.</p>}
        {suggestions && suggestions.length > 0 && (
          <ul className={CARVED_ROWS}>
            {suggestions.slice(0, suggested).map((p, i) => (
              <li key={keyOf(p.address)} style={rowRule(i)}>
                <FollowPlayerRow profile={p} guild={guildOf?.(p.address)} variant="suggestion" onOpen={onOpenPlayer}>
                  {follow(p, followers.has(keyOf(p.address)))}
                </FollowPlayerRow>
              </li>
            ))}
          </ul>
        )}
        {suggestions && suggestions.length > suggested && (
          <Button variant="ghost" className={cn(RAISED_PILL, "self-center")} onClick={() => setSuggested(suggested + 5)}>
            More suggestions
          </Button>
        )}
      </section>

      <Button variant="ghost" className={cn(RAISED_PILL, "gap-1.5 self-center")} onClick={() => setBlockedOpen(true)}>
        <FriendsArt part="block" px={20} className="size-5" />
        Blocked players{blocked.length > 0 && <span className="tabular-nums">({formatInteger(blocked.length)})</span>}
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

/**
 * The blocked players (#954, open point 5's default; the book draws none): theirs only to see, each with Unblock. FRIENDS-PAGE: the
 * HUD's drawer as a player's profile is, over the friends page: a sheet from the bottom on a phone, a side panel at the right from
 * `tablet`, in the place of the friends page's.
 */
function BlockedSheet({ open, onOpenChange, blocked, now, busy, onOpenPlayer, onUnblock, error }: BlockedSheetProps) {
  return (
    <HudDrawer open={open} onOpenChange={onOpenChange} title="Blocked players" side="right" phone="sheet" slot="blocked-players">
      <p className="text-sm font-semibold text-muted-foreground">They cannot follow you, message you or invite you to a guild, and they are not told.</p>
      {blocked === null && <Skeleton aria-busy className="h-18 rounded-xl" />}
      {blocked?.length === 0 && <p className={CARVED_NOTE}>You block no one. Block a player from their profile.</p>}
      {blocked && blocked.length > 0 && (
        <ul className={CARVED_ROWS}>
          {blocked.map((r, i) => (
            <li key={keyOf(r.profile.address)} style={rowRule(i)}>
              <FollowPlayerRow profile={r.profile} onOpen={onOpenPlayer}>
                <Button variant="ghost" aria-label={`Unblock ${r.profile.name ?? "this player"}`} loading={busy === keyOf(r.profile.address)} disabled={busy !== null} className={RAISED_PILL} onClick={() => onUnblock(r.profile.address)}>
                  Unblock
                </Button>
              </FollowPlayerRow>
            </li>
          ))}
        </ul>
      )}
      <InlineError title="Unblock" message={error} />
    </HudDrawer>
  );
}
