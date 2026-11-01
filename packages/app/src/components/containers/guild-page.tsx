import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  GUILD_ANNOUNCEMENT_MAX,
  GUILD_RANK,
  GUILD_REQUEST_MESSAGE_MAX,
  editAnnouncementRefusal,
  formatAgo,
  formatInteger,
  leaveDisbands,
  leaveRefusal,
  type GuildDraft,
  type GuildRank,
} from "@paved/game-core";
import type { GuildAnnouncement, GuildMember, GuildView } from "../../data/social-source";
import { JOIN_TYPES, REFUSALS, logLine, rankName, requirementsText } from "../../lib/guild-text";
import { cn } from "../../lib/utils";
import type { GuildTab } from "../../routes/guild-tab";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Crowns } from "../elements/crowns";
import { GuildEmblem } from "../elements/guild-emblem";
import { InlineError } from "../elements/inline-error";
import { PlayerAvatar } from "../elements/player-avatar";
import { PlayerName } from "../elements/player-name";
import { Presence } from "../elements/presence";
import { GuildScore, JoinType, MemberCount } from "./guild-card";
import { GuildMemberSheet, GuildMenuSheet, type GuildMenuItem } from "./guild-page-sheets";
import type { GuildMemberAction } from "./guild-profile";
import { GuildFormSheet, useGuildActions } from "./guild-sheets";
import { GuildTabs } from "./guild-tabs";

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
  /** The header's Chat: the chat page on Guild. */
  onOpenChat?: () => void;
  /** The menu's Invite a player (officers and the leader): the player search. */
  onInvite?: () => void;
  /** The menu's Find guilds: the search and the ranking. */
  onFindGuilds?: () => void;
  /** The member whose row's sheet starts open (its story). */
  initialMember?: string;
  /** Where the description starts: unfolded for its story. */
  initialUnfolded?: boolean;
  /** Where the header's menu starts: open for its story. */
  initialMenuOpen?: boolean;
}

/** A rank's badge: the Leader's crown, the Officer's star. */
export function RankBadge({ rank, className }: { rank: GuildRank; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs whitespace-nowrap", rank >= GUILD_RANK.officer ? "font-semibold text-primary" : "text-muted-foreground", className)}>
      {rank >= GUILD_RANK.officer && <Icon name={rank >= GUILD_RANK.leader ? "crown" : "star"} size="xs" fixedWidth />}
      {rankName(rank)}
    </span>
  );
}

function Section({ title, count, children, action }: { title: string; count?: number; children: ReactNode; action?: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <div className="flex min-h-9 items-center justify-between gap-2">
        <h3 className="font-semibold">
          {title}
          {count !== undefined && <span className="numeric ml-1.5 text-sm text-muted-foreground">{formatInteger(count)}</span>}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

const EMPTY = "rounded-xl border border-dashed border-border px-4 py-4 text-center text-sm text-muted-foreground";

/** A member's row: the avatar, the name, the level, the rank, the crowns, online or last seen; a tap shows what may be done. */
function MemberRow({ member, now, me, onOpen }: { member: GuildMember; now: number; me: string | null; onOpen?: (address: string) => void }) {
  const p = member.profile;
  return (
    <button
      type="button"
      data-slot="guild-member"
      onClick={() => onOpen?.(p.address)}
      className="state-layer flex w-full min-w-0 items-center gap-3 rounded-xl border border-border bg-card px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <PlayerAvatar player={{ name: p.name, address: p.address }} look={p.look} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 flex-wrap items-center gap-x-2">
          <PlayerName name={p.name} address={p.address} className="max-w-full min-w-0 truncate font-semibold" />
          {me !== null && p.address === me && <span className="text-xs text-muted-foreground">(you)</span>}
        </span>
        <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <RankBadge rank={member.rank} />
          <span>
            Level <span className="numeric">{formatInteger(p.level)}</span>
          </span>
          <Crowns value={p.crowns} size="sm" tone="muted" />
        </span>
        <Presence lastSeen={p.lastSeen} now={now} />
      </span>
      <Icon name="chevron-right" size="xs" className="shrink-0 text-muted-foreground" />
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
    <div className="flex flex-col items-start gap-0.5">
      <p ref={ref} data-slot="guild-description" title={unfolded ? undefined : text} className={cn("text-sm wrap-anywhere", !unfolded && "line-clamp-2")}>
        {text}
      </p>
      {long && (
        <button type="button" aria-expanded={unfolded} onClick={() => setUnfolded(!unfolded)} className="rounded text-sm font-semibold text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {unfolded ? "Less" : "More"}
        </button>
      )}
    </div>
  );
}

/**
 * A guild's page (#953, its header, menu and tabs since #973). For its members: the header (the emblem, the name, the tag, the
 * player's rank, the members against the cap, the score, the join type, the requirements, the description folded to two lines,
 * Chat and the menu: Invite a player, Settings, Find guilds, Leave or Disband), then the tabs: Announcements (pinned, newest
 * first), Members (by rank, then crowns; a row's tap shows the actions the viewer's rank allows), Requests (officers and the
 * leader: the requests, then the invitations sent) and Log (newest first). A player outside sees the header and the members,
 * with Join, Request, Cancel or the invitation's answer, or why they may not join; a row opens the member's profile.
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
  onOpenChat,
  onInvite,
  onFindGuilds,
  initialMember,
  initialUnfolded,
  initialMenuOpen,
}: GuildPageProps) {
  const { run, ask, dialog, pending, error } = useGuildActions(onAction);
  const [settings, setSettings] = useState(false);
  const [opening, setOpening] = useState(0);
  const [allLog, setAllLog] = useState(false);
  const [ownTab, setOwnTab] = useState<GuildTab>(defaultTab ?? (unread > 0 ? "announcements" : "members"));
  const [memberShown, setMemberShown] = useState<string | null>(initialMember ?? null);
  const [menuOpen, setMenuOpen] = useState(initialMenuOpen ?? false);
  const rank = guild.rank;
  const officer = rank !== null && rank >= GUILD_RANK.officer;
  const leader = rank !== null && rank >= GUILD_RANK.leader;
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
  const member = memberShown === null ? null : (guild.roster.find((m) => m.profile.address === memberShown) ?? null);
  const leave = () =>
    ask(
      disbands
        ? { title: `Disband ${guild.name}?`, text: "You are its only member: leaving disbands the guild, for good.", confirm: "Disband", destructive: true }
        : { title: `Leave ${guild.name}?`, text: "You can join another guild, or come back if they let you in.", confirm: "Leave", destructive: true },
      () => ({ type: "leave" }),
    );

  const menu: GuildMenuItem[] = [
    ...(officer ? [{ label: "Invite a player", icon: "plus", onSelect: () => onInvite?.() }] : []),
    ...(leader
      ? [
          {
            label: "Guild settings",
            icon: "gear",
            onSelect: () => {
              setOpening(opening + 1);
              setSettings(true);
            },
          },
        ]
      : []),
    { label: "Find guilds", icon: "magnifying-glass", onSelect: () => onFindGuilds?.() },
    { label: disbands ? "Disband the guild" : "Leave the guild", icon: "right-from-bracket", destructive: true, onSelect: leave, refused: leaveBlock ? REFUSALS[leaveBlock] : undefined },
  ];

  const members = (
    <Section title="Members" count={guild.roster.length}>
      <ul className="flex flex-col gap-2">
        {guild.roster.map((m) => (
          <li key={m.profile.address}>
            <MemberRow member={m} now={now} me={me} onOpen={rank === null ? onOpenPlayer : setMemberShown} />
          </li>
        ))}
      </ul>
    </Section>
  );

  let body: ReactNode = null;
  if (tab === "announcements" && guild.announcements)
    body = (
      <Section
        title="Announcements"
        count={guild.announcements.length}
        action={
          officer && (
            <Button size="sm" onClick={() => ask({ title: "Post an announcement", text: "Pinned at the top of the guild's page, for every member.", confirm: "Post", field: { label: "Announcement", max: GUILD_ANNOUNCEMENT_MAX, rows: 4 } }, (text) => ({ type: "post", text }))}>
              <Icon name="plus" size="xs" />
              Post
            </Button>
          )
        }
      >
        {guild.announcements.length === 0 ? (
          <p className={EMPTY}>{officer ? "No announcement yet: post the first." : "No announcement yet."}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {guild.announcements.map((a) => (
              <li key={a.id} data-slot="guild-announcement" className="flex flex-col gap-1.5 rounded-xl border border-border bg-secondary/60 p-3">
                <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                  <Icon name="scroll" size="xs" fixedWidth className="text-primary" />
                  <PlayerName name={a.authorName} address={a.author} className="min-w-0 truncate font-semibold text-foreground" />
                  <span className="shrink-0">
                    {formatAgo(a.at - now)}
                    {a.editedAt !== null && ", edited"}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap wrap-anywhere">{a.text}</p>
                {mayEdit(a) && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => ask({ title: "Edit the announcement", text: "Members see it as edited.", confirm: "Save", field: { label: "Announcement", max: GUILD_ANNOUNCEMENT_MAX, initial: a.text, rows: 4 } }, (text) => ({ type: "edit-announcement", id: a.id, text }))}>
                      <Icon name="pen" size="xs" />
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => ask({ title: "Delete the announcement?", text: "It goes for every member.", confirm: "Delete", destructive: true }, () => ({ type: "delete-announcement", id: a.id }))}>
                      <Icon name="trash" size="xs" />
                      Delete
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>
    );
  else if (tab === "requests" && guild.requests)
    body = (
      <div className="flex flex-col gap-5">
        <Section title="Requests" count={guild.requests.length}>
          {guild.requests.length === 0 ? (
            <p className={EMPTY}>No request waiting.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {guild.requests.map((r) => (
                <li key={r.profile.address} data-slot="guild-request" className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3">
                  <button type="button" onClick={() => onOpenPlayer?.(r.profile.address)} className="flex min-w-0 items-center gap-3 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <PlayerAvatar player={{ name: r.profile.name, address: r.profile.address }} look={r.profile.look} />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <PlayerName name={r.profile.name} address={r.profile.address} className="max-w-full min-w-0 truncate font-semibold" />
                      <span className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                        <span>
                          Level <span className="numeric">{formatInteger(r.profile.level)}</span>
                        </span>
                        <Crowns value={r.profile.crowns} size="sm" tone="muted" />
                        <span>{formatAgo(r.sentAt - now)}</span>
                      </span>
                    </span>
                  </button>
                  {r.message && <p className="text-sm whitespace-pre-wrap wrap-anywhere">“{r.message}”</p>}
                  <div className="grid grid-cols-2 gap-2">
                    <Button size="sm" disabled={pending} onClick={() => void run({ type: "answer-request", applicant: r.profile.address, accept: true })}>
                      <Icon name="check" size="xs" />
                      Accept
                    </Button>
                    <Button size="sm" variant="outline" disabled={pending} onClick={() => void run({ type: "answer-request", applicant: r.profile.address, accept: false })}>
                      <Icon name="xmark" size="xs" />
                      Decline
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>
        {guild.invitations && (
          <Section title="Invitations sent" count={guild.invitations.length}>
            {guild.invitations.length === 0 ? (
              <p className={EMPTY}>None waiting. Invite a player from the guild's menu.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {guild.invitations.map((i) => (
                  <li key={i.profile.address}>
                    <button type="button" onClick={() => onOpenPlayer?.(i.profile.address)} className="state-layer flex w-full min-w-0 items-center gap-3 rounded-xl border border-border bg-card px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <PlayerAvatar player={{ name: i.profile.name, address: i.profile.address }} look={i.profile.look} />
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <PlayerName name={i.profile.name} address={i.profile.address} className="max-w-full min-w-0 truncate font-semibold" />
                        <span className="text-xs text-muted-foreground">
                          Sent {formatAgo(i.sentAt - now)}, lapses in {Math.max(1, Math.ceil((i.expiresAt - now) / 86_400))}d
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}
      </div>
    );
  else if (tab === "log" && log)
    body = (
      <Section
        title="Log"
        action={
          log.length > logShown && (
            <Button size="sm" variant="ghost" onClick={() => setAllLog(!allLog)}>
              {allLog ? "Show less" : `Show all ${formatInteger(log.length)}`}
            </Button>
          )
        }
      >
        {log.length === 0 ? (
          <p className={EMPTY}>Nothing yet.</p>
        ) : (
          <ol data-slot="guild-log" className="flex flex-col gap-1 rounded-xl border border-border bg-card p-3 text-sm">
            {(allLog ? log : log.slice(0, logShown)).map((e, i) => (
              <li key={`${e.at}-${i}`} className="flex min-w-0 items-baseline justify-between gap-3">
                <span className="min-w-0 wrap-anywhere">{logLine(e)}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{formatAgo(e.at - now)}</span>
              </li>
            ))}
          </ol>
        )}
      </Section>
    );
  else body = members;

  return (
    <div data-slot="guild-page" className="flex flex-col gap-5">
      <header className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
        <div className="flex min-w-0 items-center gap-3">
          <GuildEmblem emblem={guild.emblem} size="lg" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h2 className="font-display text-2xl leading-tight wrap-anywhere">{guild.name}</h2>
            <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
              <span className="numeric">{guild.tag}</span>
              {rank !== null && <RankBadge rank={rank} />}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <MemberCount members={guild.members} />
          <GuildScore score={guild.score} />
          <JoinType type={guild.joinType} />
        </div>
        <p className="text-sm text-muted-foreground">
          Requirements: <span className="text-foreground">{requirementsText(guild.requirements)}</span>
        </p>
        {guild.description && <GuildDescription text={guild.description} initialUnfolded={initialUnfolded} />}
        {rank !== null && (
          <div data-slot="guild-own" className="flex items-center gap-2">
            <Button variant="secondary" className="flex-1" onClick={onOpenChat}>
              <Icon name="comments" size="xs" />
              Chat
            </Button>
            <Button size="icon" variant="outline" aria-label="Guild menu" aria-haspopup="dialog" onClick={() => setMenuOpen(true)}>
              <Icon name="ellipsis" size="sm" />
            </Button>
          </div>
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
                    { title: `Request to join ${guild.name}`, text: "An officer or the leader answers it. You can cancel it until then.", confirm: "Send request", field: { label: "Message", max: GUILD_REQUEST_MESSAGE_MAX, optional: true } },
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
        <InlineError title={guild.name} message={settings ? null : error} />
      </header>

      {rank === null ? (
        members
      ) : (
        <GuildTabs tab={tab} onTabChange={setTab} tabs={tabs} badges={{ announcements: unread, requests: guild.requests?.length ?? 0 }}>
          {body}
        </GuildTabs>
      )}

      {rank !== null && <GuildMenuSheet open={menuOpen} onOpenChange={setMenuOpen} guildName={guild.name} items={menu} />}
      {rank !== null && (
        <GuildMemberSheet
          member={member}
          onOpenChange={(open) => !open && setMemberShown(null)}
          guild={guild}
          me={me}
          now={now}
          onOpenPlayer={onOpenPlayer}
          onAction={(target, action) => onAction?.({ type: "member", target, action })}
        />
      )}
      {leader && (
        <GuildFormSheet
          key={opening}
          open={settings}
          onOpenChange={setSettings}
          mode="edit"
          initial={{ name: guild.name, emblem: guild.emblem, description: guild.description, joinType: guild.joinType, requirements: guild.requirements }}
          pending={pending}
          error={settings ? error : null}
          onSubmit={(draft) => void run({ type: "settings", draft }).then((done) => done && setSettings(false))}
        />
      )}
      {dialog}
    </div>
  );
}
