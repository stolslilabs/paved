import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import * as m from "motion/react-m";
import {
  GUILD_ANNOUNCEMENT_MAX,
  GUILD_MAX_MEMBERS,
  GUILD_REQUEST_MESSAGE_MAX,
  GUILD_RIGHTS,
  editAnnouncementRefusal,
  formatAgo,
  formatInteger,
  leaveDisbands,
  leaveRefusal,
  type GuildDraft,
  type GuildRank,
} from "@paved/game-core";
import type { GuildAnnouncement, GuildLogEntry, GuildMember, GuildView, PublicProfile } from "../../data/social-source";
import { LEAGUES } from "../../lib/pvp-rules";
import { JOIN_TYPES, RANK_ART, REFUSALS, logLine, rankName, requirementsText } from "../../lib/guild-text";
import { cn } from "../../lib/utils";
import type { GuildTab } from "../../routes/guild-tab";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { DrawerRow } from "../elements/drawer-row";
import { GuildEmblem } from "../elements/guild-emblem";
import { InlineError } from "../elements/inline-error";
import { LeagueCrestIcon } from "../elements/league-crest-art";
import { LeagueRim } from "../elements/league-rim";
import { divisionOf, tierOf } from "../elements/league-standards";
import { PlayerAvatar } from "../elements/player-avatar";
import { PlayerName } from "../elements/player-name";
import { Presence } from "../elements/presence";
import { SectionTitle } from "../elements/section-title";
import type { UiIconName } from "../elements/ui-art";
import { UiIcon } from "../elements/ui-icon";
import { GuildMemberActions, type GuildMemberAction } from "./guild-profile";
import { GuildForm, useGuildActions } from "./guild-sheets";
import { GuildTabs } from "./guild-tabs";
import { ViewHeader, useDrawerView } from "./hud-drawer";

/** What a player outside the guild may do on its page, as the route works it out with game-core's checks. */
export type GuildApply =
  /** Open, room, requirements met: Join. */
  | { kind: "join" }
  /** By request, and they may send one: Request, with a message. */
  | { kind: "request" }
  /** Their request waits here: Cancel. */
  | { kind: "requested" }
  /** They hold an invitation from this guild: Accept or Decline (from another guild, they confirm leaving it). */
  | { kind: "invited"; leaving: string | null }
  /** They may not: why (full, a requirement, invite only, another request waiting, in a guild). */
  | { kind: "blocked"; reason: string };

/** The guild page's actions, each one a write of the source. */
export type GuildPageAction =
  | { type: "join" }
  | { type: "request"; message: string }
  | { type: "cancel-request" }
  | { type: "answer-invitation"; accept: boolean; leaving: boolean }
  | { type: "post"; text: string }
  | { type: "edit-announcement"; id: number; text: string }
  | { type: "delete-announcement"; id: number }
  | { type: "answer-request"; applicant: string; accept: boolean }
  | { type: "settings"; draft: GuildDraft }
  | { type: "leave" }
  /** A rank action on a member, from their row (#973). */
  | { type: "member"; target: string; action: GuildMemberAction };

/**
 * A view the guild page opens in its drawer, in its own place (GUILD-PAGE, the owner's ask of 2026-11-05: what the page opens, it opens
 * in its drawer, never a sheet over it): the menu, and what the menu opens (Invite a player, Guild settings, Find guilds), or a member's
 * row tapped. Back goes back one view; the red cross, or a tap on the village, leaves the drawer.
 */
export type GuildPageView = "menu" | "invite" | "settings" | "find" | { member: string };

export interface GuildPageProps {
  guild: GuildView;
  /** The viewer's ID (their own row and announcements), or null. */
  me: string | null;
  /** The clock, in seconds. */
  now: number;
  /** For a viewer outside the guild: what they may do. Left out: nothing offered. */
  apply?: GuildApply;
  /** Each action, as the source's write (its promise: a refusal keeps the dialog open with why). */
  onAction?: (action: GuildPageAction) => Promise<unknown> | void;
  /** Opens a player's public profile (a visitor's tap on a member's row; a member's Profile, from the row's sheet). */
  onOpenPlayer?: (address: string) => void;
  /** How many log lines show before "Show all". */
  logShown?: number;
  /** A member's tab (#973), when the page's owner holds it; left out, the page holds it from `defaultTab`. */
  tab?: GuildTab;
  onTabChange?: (tab: GuildTab) => void;
  /** Where a page that holds its tab opens; left out, on Announcements while one is unread, else on Members. */
  defaultTab?: GuildTab;
  /** The member's unread announcements: Announcements' badge. */
  unread?: number;
  /** The guild's chat messages the member has not read (the chat's overview): the header's Chat's badge. */
  chatUnread?: number;
  /** The header's Chat: the chat page on Guild. */
  onOpenChat?: () => void;
  /** The menu's Invite a player (officers and the leader): the player search, drawn in its view. */
  invite?: ReactNode;
  /** The menu's Find guilds: the guild search, Suggested and the ranking, drawn in its view. */
  find?: ReactNode;
  /** The view the page starts on (its stories): the menu, one it opens, or a member's. */
  initialView?: GuildPageView;
  /** Where the description starts: unfolded for its story. */
  initialUnfolded?: boolean;
}

/** What is the viewer's (their own row) or first (the pinned announcement): a discreet wash of the primary gold, no ring (the owner's ask of 2026-11-05). */
const CHOSEN = "bg-primary/15";
/** The join types as the figures' band names them, short (the owner's ask of 2026-11-05: "Request", not "By request"). */
const JOIN_SHORT: Record<GuildView["joinType"], string> = { open: "Open", request: "Request", invite: "Invite only" };
/** A row's portrait with its rim: 48 px, the height of the name and the rank's pill beside it. */
const RIM_BOX: CSSProperties = { fontSize: "3rem" };
/** A pill of the page, Tiles' (the rank, an invitation's lapse): carved, it informs. */
const PILL = "flex h-6 w-fit items-center rounded-full px-2.5 text-xs leading-none font-bold whitespace-nowrap";
/** A small raised control in the drawer's grey (the profile's Edit name): what presses is raised. Its 44 px target is its button's. */
const RAISED_FACE = "state-layer drawer-raised grid size-8 place-items-center rounded-lg";
/** A raised button of the page (Post, Show all): the drawer's raised grey, its words outlined. */
const RAISED_BUTTON = "state-layer drawer-raised text-outline h-10 cursor-pointer gap-1.5 rounded-xl px-4 text-sm font-bold";

/** A rank's pill on a row, carved (it informs): Leader, Officer, Member. */
export function RankBadge({ rank, className }: { rank: GuildRank; className?: string }) {
  return <span className={cn(PILL, "drawer-carved text-muted-foreground", className)}>{rankName(rank)}</span>;
}

/**
 * The viewer's rank in the header, a carved pill in the medal's gold: its painted icon (the owner's ask of 2026-11-05: an icon for each
 * rank; `RANK_ART`: the Recruit's sprout, the Member's bust, the Veteran's medal, the Officer's star, the Leader's crown), its name.
 */
function ViewerRank({ rank }: { rank: GuildRank }) {
  return (
    <span data-slot="guild-rank" data-rank={rank} className={cn(PILL, "drawer-carved gap-1 pl-1.5 text-medal-1")}>
      <UiIcon name={RANK_ART[rank]} px={16} className="size-4" />
      {rankName(rank)}
    </span>
  );
}

/** One figure of the header's band, the profile's: its label over it, bold and outlined; `children` beside the value (the crown). */
function Figure({ term, children, label }: { term: string; children: ReactNode; label?: string }) {
  return (
    <div className="flex min-w-0 flex-1 basis-0 flex-col items-center gap-0.5 px-0.5 py-2">
      <dt className="text-center text-xs leading-tight font-bold text-muted-foreground">{term}</dt>
      <dd aria-label={label} className="text-outline flex max-w-full items-center gap-1 text-lg leading-tight font-bold tabular-nums wrap-anywhere">
        {children}
      </dd>
    </div>
  );
}

/** A player's crowns at a row's end: the painted crown and the figure, outlined. */
function RowCrowns({ value }: { value: number }) {
  return (
    <span role="img" aria-label={`${formatInteger(value)} ${value === 1 ? "crown" : "crowns"}`} className="flex shrink-0 items-center gap-1">
      <UiIcon name="crown" px={20} className="drawer-icon size-5" />
      <span aria-hidden className="text-outline min-w-10 text-right text-base leading-tight font-bold tabular-nums">
        {formatInteger(value)}
      </span>
    </span>
  );
}

/** A player's level and crowns under their name, the battle logs' second line: a request's and an invitation's, whose end holds what presses. */
function LevelLine({ profile }: { profile: PublicProfile }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 text-xs leading-tight font-semibold text-muted-foreground">
      <span className="whitespace-nowrap">
        Level <span className="tabular-nums">{formatInteger(profile.level)}</span>
      </span>
      <span role="img" aria-label={`${formatInteger(profile.crowns)} ${profile.crowns === 1 ? "crown" : "crowns"}`} className="flex items-center gap-0.5">
        <UiIcon name="crown" px={16} className="size-4" />
        <span aria-hidden className="text-outline font-bold text-foreground tabular-nums">
          {formatInteger(profile.crowns)}
        </span>
      </span>
    </span>
  );
}

/** A player's portrait in the rim of their league with its crest at its lower left (the player card's, the battle logs'). */
function MemberPortrait({ profile }: { profile: PublicProfile }) {
  const league = LEAGUES[profile.league] ?? LEAGUES[0]!;
  const tier = tierOf(league);
  return (
    <span data-slot="guild-member-rim" data-tier={tier} className="relative block size-[1em] shrink-0" style={RIM_BOX}>
      <LeagueRim tier={tier} size="inherit" className="block">
        <PlayerAvatar player={{ name: profile.name, address: profile.address }} look={profile.look} className="size-full p-0" />
      </LeagueRim>
      <LeagueCrestIcon tier={tier} division={divisionOf(league)} size="inherit" className="absolute -bottom-[10%] -left-[10%]" style={{ width: "44%", height: "44%" }} />
    </span>
  );
}

/** A section of a tab, the drawer's (the Missions'): its engraved title and its count beside it, then its content. */
function TabSection({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <SectionTitle>
        {title}
        <span className="numeric font-sans text-base font-bold text-muted-foreground">{formatInteger(count)}</span>
      </SectionTitle>
      {children}
    </section>
  );
}

/**
 * A log line's mark: the book's painted ones where it draws one (joined, promoted, kicked, posted), the HUD's for the ranks, the
 * settings and the founding, the menu's Leave (Codex's door) for a member who left. Named apart from an icon: the Font Awesome subset's
 * scan reads a block opened on a line about an icon, and would take "left" for its arrow.
 */
function LogMark({ kind }: { kind: GuildLogEntry["kind"] }) {
  const size = "drawer-icon size-7 shrink-0";
  switch (kind) {
    case "joined":
      return <UiIcon name="joined" px={28} className={size} />;
    case "kicked":
      return <UiIcon name="kicked" px={28} className={size} />;
    case "promoted":
      return <UiIcon name="promote" px={28} className={size} />;
    case "demoted":
      return <UiIcon name="demote" px={28} className={size} />;
    case "leader":
      return <UiIcon name="crown" px={28} className={size} />;
    case "announcement":
      return <UiIcon name="chat" px={28} className={size} />;
    case "settings":
      return <UiIcon name="settings" px={28} className={size} />;
    case "created":
      return <UiIcon name="guild" px={28} className={size} />;
    case "left":
      return <UiIcon name="leave" px={28} className={size} />;
  }
}

/** An empty list's line, in the panel's place (the battle logs'). */
const EMPTY = "drawer-carved rounded-xl px-4 py-6 text-center text-xs font-semibold text-muted-foreground";
/** A row of a carved list: the battle logs' rule above every row but the first. */
const rowRule = (index: number) => (index > 0 ? "border-t border-border" : undefined);

/** A member's row: their portrait in their league's rim, their name ("You" on their own, on the gold wash), their rank, their crowns. */
function MemberRow({ member, me, onOpen }: { member: GuildMember; me: string | null; onOpen?: (address: string) => void }) {
  const p = member.profile;
  const own = me !== null && p.address === me;
  return (
    <button
      type="button"
      data-slot="guild-member"
      data-own={own || undefined}
      onClick={() => onOpen?.(p.address)}
      className={cn("state-layer flex w-full min-w-0 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-left outline-none", own && CHOSEN)}
    >
      <MemberPortrait profile={p} />
      <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
        <span className="flex max-w-full min-w-0 items-center gap-1.5">
          <PlayerName name={p.name} address={p.address} className="text-outline min-w-0 text-sm leading-tight font-bold" />
          {own && <span className="shrink-0 rounded-md bg-medal-1 px-1.5 text-xs leading-tight font-bold text-primary-foreground">You</span>}
        </span>
        <RankBadge rank={member.rank} />
      </span>
      <RowCrowns value={p.crowns} />
    </button>
  );
}

/** The description, folded to two lines; More unfolds it when it is longer (measured, so a short one has no More). */
function GuildDescription({ text, initialUnfolded = false }: { text: string; initialUnfolded?: boolean }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [unfolded, setUnfolded] = useState(initialUnfolded);
  const [long, setLong] = useState(initialUnfolded);
  useLayoutEffect(() => {
    const p = ref.current;
    if (!p || unfolded) return;
    const measure = () => setLong(p.scrollHeight > p.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(p);
    return () => observer.disconnect();
  }, [text, unfolded]);
  return (
    <div className="flex min-w-0 flex-col items-start gap-0.5">
      <p ref={ref} data-slot="guild-description" title={unfolded ? undefined : text} className={cn("text-sm font-semibold wrap-anywhere text-muted-foreground", !unfolded && "line-clamp-2")}>
        {text}
      </p>
      {long && (
        <button type="button" aria-expanded={unfolded} onClick={() => setUnfolded(!unfolded)} className="rounded text-sm font-semibold text-primary outline-none">
          {unfolded ? "Less" : "More"}
        </button>
      )}
    </div>
  );
}

/** An item of the guild's menu. */
interface GuildMenuItem {
  label: string;
  /** Its painted icon (Codex's, the owner's ask of 2026-11-05). */
  art: UiIconName;
  onSelect: () => void;
  /** It opens a view in the drawer (Invite a player, Guild settings, Find guilds): the chevron at its end. */
  next?: boolean;
  /** Leave and Disband. */
  destructive?: boolean;
  /** Why it is not offered now (a leader with members cannot leave): shown under it, the item disabled. */
  refused?: string;
}

/**
 * The guild's menu (#973), a view in the drawer (GUILD-PAGE): what the viewer's rank allows, Invite a player (officers and the leader),
 * Guild settings (the leader), Find guilds, then Leave or Disband apart, each a raised row with its painted icon.
 */
function GuildMenu({ items }: { items: readonly GuildMenuItem[] }) {
  return (
    <ul data-slot="guild-menu" aria-label="Guild menu" className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item.label} className={cn("flex flex-col gap-1", item.destructive && "mt-3")}>
          <DrawerRow art={item.art} label={item.label} tone={item.destructive ? "danger" : "default"} next={item.next} disabled={item.refused !== undefined} onClick={item.onSelect} />
          {item.refused && <p className="px-1 text-xs font-semibold text-muted-foreground">{item.refused}</p>}
        </li>
      ))}
    </ul>
  );
}

/** A view's line under its title, what it is for (the sheets' descriptions before GUILD-PAGE). */
const VIEW_LINE = "text-sm font-semibold text-muted-foreground";

/**
 * A member's row tapped (#973, as in Clash of Clans), a view in the drawer (GUILD-PAGE): who they are on a carved band (their portrait
 * in their league's rim, their rank, level and crowns, when they were last seen), their Profile, then the actions the viewer's rank
 * allows on theirs (Promote, Demote, Make leader, Kick), raised rows each confirmed first. Their profile keeps the same actions.
 */
function MemberView({ member, guild, me, now, onOpenPlayer, onAction }: { member: GuildMember; guild: GuildView; me: string | null; now: number; onOpenPlayer?: (address: string) => void; onAction?: (action: GuildMemberAction) => Promise<unknown> | void }) {
  const p = member.profile;
  const own = me !== null && p.address === me;
  return (
    <div data-slot="guild-member-view" className="flex flex-col gap-3">
      <div className={cn("drawer-carved flex min-w-0 items-center gap-3 rounded-xl px-3 py-2.5", own && CHOSEN)}>
        <MemberPortrait profile={p} />
        <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
          <span className="flex max-w-full min-w-0 items-center gap-1.5">
            <PlayerName name={p.name} address={p.address} className="text-outline min-w-0 text-base leading-tight font-bold" />
            {own && <span className="shrink-0 rounded-md bg-medal-1 px-1.5 text-xs leading-tight font-bold text-primary-foreground">You</span>}
          </span>
          <RankBadge rank={member.rank} />
          <LevelLine profile={p} />
          <Presence lastSeen={p.lastSeen} now={now} />
        </span>
      </div>
      <DrawerRow art="user" label="Profile" next onClick={() => onOpenPlayer?.(p.address)} />
      {!own && me !== null && guild.rank !== null && (
        <GuildMemberActions
          layout="rows"
          viewer={{ address: me, guild: { id: guild.id, name: guild.name, members: guild.members }, rank: guild.rank, nextKickAt: guild.nextKickAt }}
          target={{ address: p.address, name: p.name, guild: guild.id, rank: member.rank, invited: false }}
          now={now}
          onAction={onAction}
        />
      )}
    </div>
  );
}

/**
 * A guild's page (#953, its header, menu and tabs since #973; GUILD-PAGE: the Paved UX Book's "Run my guild", in the HUD drawer's
 * style, the profile's, the Missions', the League's and the Shop's). For its members: the identity on the drawer's face, as the
 * profile's (the emblem; the name, the menu as a small raised square; the tag; the player's rank in a carved pill), Chat a raised tile at
 * its right (its red count the guild chat's unread), then the figures on a carved band parted by the drawer's rules (the members against
 * the cap, the score under the painted crown, the join type) and the description folded to two lines. Then the Shop's tabs:
 * Announcements (the newest pinned, on a discreet gold wash under the book's pin; an officer's raised Post), Members (by rank, then
 * crowns, the battle logs' carved rows, each portrait in its league's rim, the viewer's own row on the same gold wash with "You"; a row's
 * tap shows what the viewer's rank allows), Requests (officers and the leader: the requests with a raised Accept and Decline, then the
 * invitations sent, each under the drawer's engraved title) and Log (newest first, the book's painted icons). The menu, what it opens
 * and a member's row are views in the drawer, in the page's place (`GuildPageView`, the owner's ask of 2026-11-05): the drawer's header
 * names the view, its Back goes back one (`useDrawerView`); a view slides in from the right, the page back from the left. A player
 * outside sees the identity, the figures, the requirements and the members, with Join, Request, Cancel or the invitation's answer, or
 * why they may not join; a row opens the member's profile.
 */
export function GuildPage({
  guild,
  me,
  now,
  apply,
  onAction,
  onOpenPlayer,
  logShown = 20,
  tab: heldTab,
  onTabChange,
  defaultTab,
  unread = 0,
  chatUnread = 0,
  onOpenChat,
  invite,
  find,
  initialView,
  initialUnfolded,
}: GuildPageProps) {
  const { run, ask, dialog, pending, error } = useGuildActions(onAction);
  const [allLog, setAllLog] = useState(false);
  const [ownTab, setOwnTab] = useState<GuildTab>(defaultTab ?? (unread > 0 ? "announcements" : "members"));
  const rank = guild.rank;
  // GUILD-PAGE's five ranks: a Member invites, a Veteran posts (and answers the requests: the source sends them), the Leader edits the settings.
  const mayInvite = rank !== null && rank >= GUILD_RIGHTS.invite;
  const mayPost = rank !== null && rank >= GUILD_RIGHTS.post;
  const leader = rank !== null && rank >= GUILD_RIGHTS.settings;
  // The views open over the page, the last one shown; one the viewer may no longer see (a member who left the roster, the settings of a
  // leader no more) is dropped.
  const [views, setViews] = useState<readonly GuildPageView[]>(initialView ? [initialView] : []);
  const stack = views.filter((v) => rank !== null && (typeof v === "object" ? guild.roster.some((m) => m.profile.address === v.member) : v === "invite" ? mayInvite : v === "settings" ? leader : true));
  const view = stack.at(-1) ?? null;
  const openView = (next: GuildPageView) => setViews([...stack, next]);
  const back = () => setViews(stack.slice(0, -1));
  const actor = me !== null && rank !== null ? { address: me, rank } : null;
  const mayEdit = (a: GuildAnnouncement) => actor !== null && editAnnouncementRefusal(actor, a.author, null) === null;
  const leaveBlock = rank !== null ? leaveRefusal(rank, guild.members) : null;
  const disbands = leaveDisbands(guild.members);
  const log = guild.log ? [...guild.log].reverse() : null;
  const tabs: GuildTab[] = guild.requests ? ["announcements", "members", "requests", "log"] : ["announcements", "members", "log"];
  const asked = heldTab ?? ownTab;
  const tab = tabs.includes(asked) ? asked : "members";
  const setTab = (next: GuildTab) => {
    setOwnTab(next);
    onTabChange?.(next);
  };
  const member = view !== null && typeof view === "object" ? (guild.roster.find((m) => m.profile.address === view.member) ?? null) : null;
  const leave = () =>
    ask(
      disbands
        ? { title: `Disband ${guild.name}?`, text: "You are its only member: leaving disbands the guild, for good.", confirm: "Disband", destructive: true }
        : { title: `Leave ${guild.name}?`, text: "You can join another guild, or come back if they let you in.", confirm: "Leave", destructive: true },
      () => ({ type: "leave" }),
    );

  const menu: GuildMenuItem[] = [
    ...(mayInvite ? [{ label: "Invite a player", art: "invite-player" as const, next: true, onSelect: () => openView("invite") }] : []),
    ...(leader ? [{ label: "Guild settings", art: "settings" as const, next: true, onSelect: () => openView("settings") }] : []),
    { label: "Find guilds", art: "find", next: true, onSelect: () => openView("find") },
    { label: disbands ? "Disband the guild" : "Leave the guild", art: disbands ? "disband" : "leave", destructive: true, onSelect: leave, refused: leaveBlock ? REFUSALS[leaveBlock] : undefined },
  ];
  const titles: Record<Exclude<GuildPageView, { member: string }>, string> = { menu: "Guild menu", invite: "Invite a player", settings: "Guild settings", find: "Find guilds" };
  const viewTitle = view === null ? null : typeof view === "object" ? (member?.profile.name ?? "A member") : titles[view];
  // The drawer's header names the view and its Back goes back one; outside a drawer (a story of the page alone), the view draws its own.
  const inDrawer = useDrawerView(viewTitle, back);
  // A move between the page and a view slides (the Shop's theme's view): forward from the right, back from the left, and starts at the
  // top of the drawer's body with the focus on the view.
  const [depth, setDepth] = useState(stack.length);
  const [forward, setForward] = useState<boolean | null>(null);
  if (depth !== stack.length) {
    setDepth(stack.length);
    setForward(stack.length > depth);
  }
  const viewKey = view === null ? "page" : typeof view === "object" ? `member:${view.member}` : view;
  const shown = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);
  useLayoutEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const region = shown.current?.closest("[data-hud-drawer-body]");
    if (region) region.scrollTop = 0;
    shown.current?.focus({ preventScroll: true });
  }, [viewKey]);

  // A row's press layer is rounded as the list (the battle logs': nothing clips a row in the drawer's body).
  const roster = (
    <ul aria-label="Members" className="drawer-carved flex flex-col rounded-xl">
      {guild.roster.map((m, i) => (
        <li key={m.profile.address} className={cn("flex", rowRule(i))}>
          <MemberRow member={m} me={me} onOpen={rank === null ? onOpenPlayer : (address) => openView({ member: address })} />
        </li>
      ))}
    </ul>
  );

  let body: ReactNode = null;
  if (tab === "announcements" && guild.announcements)
    body = (
      <section aria-label="Announcements" className="flex flex-col gap-2.5">
        {mayPost && (
          <Button
            variant="ghost"
            className={cn(RAISED_BUTTON, "self-end")}
            onClick={() => ask({ title: "Post an announcement", text: "Pinned at the top of the guild's page, for every member.", confirm: "Post", field: { label: "Announcement", max: GUILD_ANNOUNCEMENT_MAX, rows: 4 } }, (text) => ({ type: "post", text }))}
          >
            <UiIcon name="pencil" px={20} className="drawer-icon size-5" />
            Post
          </Button>
        )}
        {guild.announcements.length === 0 ? (
          <p className={EMPTY}>{mayPost ? "No announcement yet: post the first." : "No announcement yet."}</p>
        ) : (
          <ul className="drawer-carved flex flex-col rounded-xl">
            {guild.announcements.map((a, i) => {
              const pinned = i === 0;
              return (
                <li key={a.id} data-slot="guild-announcement" data-pinned={pinned || undefined} className={cn("flex min-w-0 items-start gap-2.5 rounded-xl px-3 py-2.5", pinned ? CHOSEN : rowRule(i))}>
                  {pinned && <UiIcon name="pin" px={28} label="Pinned" className="drawer-icon size-7 shrink-0" />}
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <p className="text-outline text-sm leading-snug font-bold whitespace-pre-wrap wrap-anywhere">{a.text}</p>
                    <p className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                      <PlayerName name={a.authorName} address={a.author} className="min-w-0" />
                      <span aria-hidden>·</span>
                      <span className="shrink-0">
                        {formatAgo(a.at - now)}
                        {a.editedAt !== null && ", edited"}
                      </span>
                    </p>
                  </div>
                  {mayEdit(a) && (
                    <div className="-my-1.5 flex shrink-0">
                      <button
                        type="button"
                        aria-label="Edit"
                        onClick={() => ask({ title: "Edit the announcement", text: "Members see it as edited.", confirm: "Save", field: { label: "Announcement", max: GUILD_ANNOUNCEMENT_MAX, initial: a.text, rows: 4 } }, (text) => ({ type: "edit-announcement", id: a.id, text }))}
                        className="grid size-11 cursor-pointer place-items-center rounded-lg outline-none"
                      >
                        <span className={RAISED_FACE}>
                          <Icon name="pen" size="xs" />
                        </span>
                      </button>
                      <button
                        type="button"
                        aria-label="Delete"
                        onClick={() => ask({ title: "Delete the announcement?", text: "It goes for every member.", confirm: "Delete", destructive: true }, () => ({ type: "delete-announcement", id: a.id }))}
                        className="grid size-11 cursor-pointer place-items-center rounded-lg outline-none"
                      >
                        <span className={RAISED_FACE}>
                          <Icon name="trash" size="xs" />
                        </span>
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    );
  else if (tab === "requests" && guild.requests)
    body = (
      <div className="flex flex-col gap-5">
        <TabSection title="Requests" count={guild.requests.length}>
          {guild.requests.length === 0 ? (
            <p className={EMPTY}>No request waiting.</p>
          ) : (
            <ul className="drawer-carved flex flex-col rounded-xl">
              {guild.requests.map((r, i) => (
                <li key={r.profile.address} data-slot="guild-request" className={cn("flex min-w-0 items-center gap-1 py-1 pr-1.5", rowRule(i))}>
                  <button
                    type="button"
                    aria-label={`${r.profile.name ?? "The player"}'s profile`}
                    onClick={() => onOpenPlayer?.(r.profile.address)}
                    className="state-layer flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-xl px-3 py-1.5 text-left outline-none"
                  >
                    <MemberPortrait profile={r.profile} />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <PlayerName name={r.profile.name} address={r.profile.address} className="text-outline max-w-full min-w-0 text-sm leading-tight font-bold" />
                      <LevelLine profile={r.profile} />
                      {r.message && <span className="text-xs leading-tight font-semibold whitespace-pre-wrap wrap-anywhere text-muted-foreground">{r.message}</span>}
                    </span>
                  </button>
                  <button type="button" aria-label="Accept" disabled={pending} onClick={() => void run({ type: "answer-request", applicant: r.profile.address, accept: true })} className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-lg outline-none disabled:opacity-50">
                    <span className={cn(RAISED_FACE, "size-9 text-success")}>
                      <Icon name="check" size="sm" />
                    </span>
                  </button>
                  <button type="button" aria-label="Decline" disabled={pending} onClick={() => void run({ type: "answer-request", applicant: r.profile.address, accept: false })} className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-lg outline-none disabled:opacity-50">
                    <span className={cn(RAISED_FACE, "size-9")}>
                      <Icon name="xmark" size="sm" />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </TabSection>
        {guild.invitations && (
          <TabSection title="Invitations sent" count={guild.invitations.length}>
            {guild.invitations.length === 0 ? (
              <p className={EMPTY}>None waiting. Invite a player from the guild's menu.</p>
            ) : (
              <ul className="drawer-carved flex flex-col rounded-xl">
                {guild.invitations.map((v, i) => (
                  <li key={v.profile.address} className={cn("flex min-w-0 items-center gap-2 py-1 pr-3", rowRule(i))}>
                    <button
                      type="button"
                      aria-label={`${v.profile.name ?? "The player"}'s profile`}
                      onClick={() => onOpenPlayer?.(v.profile.address)}
                      className="state-layer flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-xl px-3 py-1.5 text-left outline-none"
                    >
                      <MemberPortrait profile={v.profile} />
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <PlayerName name={v.profile.name} address={v.profile.address} className="text-outline max-w-full min-w-0 text-sm leading-tight font-bold" />
                        <LevelLine profile={v.profile} />
                      </span>
                    </button>
                    {/* No Cancel: the guild source has no way to take an invitation back; when it lapses, in its place. */}
                    <span className={cn(PILL, "drawer-carved shrink-0 text-muted-foreground")}>Lapses in {formatInteger(Math.max(1, Math.ceil((v.expiresAt - now) / 86_400)))}d</span>
                  </li>
                ))}
              </ul>
            )}
          </TabSection>
        )}
      </div>
    );
  else if (tab === "log" && log)
    body = (
      <section aria-label="Log" className="flex flex-col gap-2.5">
        {log.length === 0 ? (
          <p className={EMPTY}>Nothing yet.</p>
        ) : (
          <ol data-slot="guild-log" className="drawer-carved flex flex-col rounded-xl">
            {(allLog ? log : log.slice(0, logShown)).map((e, i) => (
              <li key={`${e.at}-${i}`} className={cn("flex min-h-12 min-w-0 items-center gap-3 px-3 py-2", rowRule(i))}>
                <LogMark kind={e.kind} />
                <span className="text-outline min-w-0 flex-1 text-sm leading-tight font-bold wrap-anywhere">{logLine(e)}</span>
                <span className="shrink-0 text-xs font-semibold text-muted-foreground">{formatAgo(e.at - now)}</span>
              </li>
            ))}
          </ol>
        )}
        {log.length > logShown && (
          <Button variant="secondary" onClick={() => setAllLog(!allLog)}>
            {allLog ? "Show less" : `Show all ${formatInteger(log.length)}`}
          </Button>
        )}
      </section>
    );
  else body = <section aria-label="Members">{roster}</section>;

  let shownView: ReactNode;
  if (view === "menu") shownView = <GuildMenu items={menu} />;
  else if (view === "invite")
    shownView = (
      <>
        <p className={VIEW_LINE}>Find a player, then invite them to {guild.name} from their profile. An invitation waives the requirements and lapses after 7 days.</p>
        {invite}
      </>
    );
  else if (view === "find")
    shownView = (
      <>
        <p className={VIEW_LINE}>Search the guilds by name or tag, or see the ranking by score.</p>
        {find}
      </>
    );
  else if (view === "settings")
    shownView = (
      <>
        <p className={VIEW_LINE}>Only the leader changes these.</p>
        <GuildForm
          mode="edit"
          initial={{ name: guild.name, emblem: guild.emblem, description: guild.description, joinType: guild.joinType, requirements: guild.requirements }}
          pending={pending}
          error={error}
          onSubmit={(draft) => void run({ type: "settings", draft }).then((done) => done && setViews([]))}
        />
      </>
    );
  else if (member)
    shownView = (
      <MemberView
        member={member}
        guild={guild}
        me={me}
        now={now}
        onOpenPlayer={onOpenPlayer}
        onAction={async (action) => {
          await onAction?.({ type: "member", target: member.profile.address, action });
          back();
        }}
      />
    );
  else
    shownView = (
      <>
    <header data-slot="guild-header" className="flex flex-col gap-3">
      <div data-slot="guild-identity" className="flex min-w-0 items-center gap-3">
        <GuildEmblem emblem={guild.emblem} size="lg" />
        <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
          <span className="flex max-w-full min-w-0 items-center gap-0.5">
            <h2 className="text-outline min-w-0 text-2xl leading-tight font-bold wrap-anywhere">{guild.name}</h2>
            {rank !== null && (
              <button type="button" aria-label="Guild menu" onClick={() => openView("menu")} className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-lg outline-none">
                <span className={RAISED_FACE}>
                  <Icon name="ellipsis" size="sm" />
                </span>
              </button>
            )}
          </span>
          <span className="numeric max-w-full text-sm font-semibold wrap-anywhere text-muted-foreground">{guild.tag}</span>
          {rank !== null && <ViewerRank rank={rank} />}
        </div>
      </div>
      {/* The figures, the profile's band: information, never pressed (raised presses, carved informs). */}
      <dl data-slot="guild-figures" className="drawer-carved drawer-rule flex rounded-xl">
        <Figure term="Members" label={`${formatInteger(guild.members)} of ${GUILD_MAX_MEMBERS} members`}>
          {formatInteger(guild.members)}/{GUILD_MAX_MEMBERS}
        </Figure>
        <Figure term="Score" label={formatInteger(guild.score)}>
          <UiIcon name="crown" px={20} className="drawer-icon size-5" />
          {formatInteger(guild.score)}
        </Figure>
        <Figure term="Join">{JOIN_SHORT[guild.joinType]}</Figure>
      </dl>
      {/* The description, and Chat at its right (the book's): a raised tile, the profile's actions'. */}
      {(guild.description || rank !== null) && (
        <div className="flex min-w-0 items-center gap-3">
          <div className="min-w-0 flex-1">{guild.description && <GuildDescription text={guild.description} initialUnfolded={initialUnfolded} />}</div>
          {rank !== null && (
            <button
              type="button"
              data-slot="guild-chat"
              aria-label={chatUnread > 0 ? `Chat, ${formatInteger(chatUnread)} unread` : "Chat"}
              onClick={onOpenChat}
              className="state-layer drawer-tile flex w-16 shrink-0 cursor-pointer flex-col items-center gap-1 rounded-2xl px-0.5 pt-2.5 pb-2 outline-none"
            >
              <span className="relative">
                <UiIcon name="chat" px={44} className="drawer-icon size-11" />
                {chatUnread > 0 && (
                  <span aria-hidden className="numeric absolute -top-1.5 -right-1.5 grid h-5 min-w-5 place-items-center rounded-[0.3rem] bg-dock-badge px-1 text-xs leading-none font-bold text-foreground ring-2 ring-background">
                    {chatUnread > 99 ? "99+" : formatInteger(chatUnread)}
                  </span>
                )}
              </span>
              <span className="text-outline text-xs leading-tight font-bold">Chat</span>
            </button>
          )}
        </div>
      )}
      {rank === null && (
        <p className="text-sm font-semibold text-muted-foreground">
          Requirements: <span className="text-foreground">{requirementsText(guild.requirements)}</span>
        </p>
      )}
      {apply && rank === null && (
        <div data-slot="guild-apply" className="flex flex-col gap-2">
          {apply.kind === "join" && (
            <Button loading={pending} onClick={() => void run({ type: "join" })}>
              Join
            </Button>
          )}
          {apply.kind === "request" && (
            <Button
              onClick={() =>
                ask(
                  { title: `Request to join ${guild.name}`, text: "A Veteran, an Officer or the leader answers it. You can cancel it until then.", confirm: "Send request", field: { label: "Message", max: GUILD_REQUEST_MESSAGE_MAX, optional: true } },
                  (message) => ({ type: "request", message }),
                )
              }
            >
              Request to join
            </Button>
          )}
          {apply.kind === "requested" && (
            <>
              <p className="text-sm">Your request is waiting for an answer.</p>
              <Button variant="outline" loading={pending} onClick={() => void run({ type: "cancel-request" })}>
                Cancel the request
              </Button>
            </>
          )}
          {apply.kind === "invited" && (
            <div className="grid grid-cols-2 gap-2">
              <Button
                loading={pending}
                onClick={() =>
                  apply.leaving
                    ? ask({ title: `Leave ${apply.leaving}?`, text: `To join ${guild.name}, you leave ${apply.leaving} first.`, confirm: "Leave and join", destructive: true }, () => ({ type: "answer-invitation", accept: true, leaving: true }))
                    : void run({ type: "answer-invitation", accept: true, leaving: false })
                }
              >
                Accept
              </Button>
              <Button variant="outline" disabled={pending} onClick={() => void run({ type: "answer-invitation", accept: false, leaving: false })}>
                Decline
              </Button>
            </div>
          )}
          {apply.kind === "blocked" && (
            <p data-slot="guild-block" className="flex items-center gap-1.5 text-sm text-warning">
              <Icon name="triangle-exclamation" size="xs" fixedWidth />
              {apply.reason}
            </p>
          )}
          {apply.kind !== "blocked" && guild.joinType !== "invite" && <p className="text-xs text-muted-foreground">{JOIN_TYPES[guild.joinType].line}</p>}
        </div>
      )}
      <InlineError title={guild.name} message={error} />
    </header>

    {rank === null ? (
      <section aria-label="Members" className="flex flex-col gap-2">
        <SectionTitle>
          Members
          <span className="numeric font-sans text-base font-bold text-muted-foreground">{formatInteger(guild.roster.length)}</span>
        </SectionTitle>
        {roster}
      </section>
    ) : (
      <GuildTabs tab={tab} onTabChange={setTab} tabs={tabs} badges={{ announcements: unread, requests: guild.requests?.length ?? 0 }}>
        {body}
      </GuildTabs>
    )}
      </>
    );

  return (
    <div data-slot="guild-page" className="flex flex-col gap-4">
      {/* A view outside a drawer (a story of the page alone): its own Back and title. */}
      {!inDrawer && viewTitle !== null && <ViewHeader title={viewTitle} onBack={back} />}
      <m.div
        key={viewKey}
        ref={shown}
        tabIndex={-1}
        data-slot="guild-view"
        data-view={view === null ? "page" : typeof view === "object" ? "member" : view}
        // A view comes in from the right, the page back from the left (no slide under reduced motion: `MotionConfig`).
        initial={forward !== null && { x: forward ? 48 : -48, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        className="flex flex-col gap-4 outline-none"
      >
        {shownView}
      </m.div>
      {dialog}
    </div>
  );
}
