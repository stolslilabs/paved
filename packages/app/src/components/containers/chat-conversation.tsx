import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import * as m from "motion/react-m";
import { useReducedMotionConfig } from "motion/react";
import { CHAT_MESSAGE_MAX, CHAT_REPORT_REASONS, chatLength, formatDate, formatInteger, type ChatReportReason } from "@paved/game-core";
import { ChatRefusedError, type ChatMessage, type ChatPageHead, type ConversationSummary } from "../../data/social-source";
import { CHAT_REFUSALS, PRIVATE_NOTICE, REPORT_REASONS, REPORT_REVEAL, UNREADABLE_MESSAGE, chatErrorText, conversationName } from "../../lib/chat-text";
import { logLine } from "../../lib/guild-text";
import { LEAGUES } from "../../lib/pvp-rules";
import { cn } from "../../lib/utils";
import { useVisualViewportHeight } from "../../lib/visual-viewport";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { Icon } from "../ui/icon";
import { ScrollRegion } from "../ui/scroll-region";
import { Skeleton } from "../ui/skeleton";
import { GuildEmblem } from "../elements/guild-emblem";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { Notice } from "../elements/notice";
import { PlayerAvatar } from "../elements/player-avatar";
import { PlayerName } from "../elements/player-name";
import { shortAddress } from "../elements/short-address";
import { LevelStar } from "../elements/level-star";
import { UiIcon } from "../elements/ui-icon";
import { EncryptionLine, EncryptionSheet, JoinerLine, KeyChangeLine } from "./chat-encryption";
import { useGuildActions } from "./guild-sheets";
import { LeaguePortrait } from "./league-control";

/** A write on one message or its author, from the message's menu. */
/** A message's action. No Delete (the owner, 2026-11-05: a message is published on the ledger, and deleting it would be one more event
 * that does not make it invisible): Report and Mute. */
export type ChatMessageAction = { type: "report"; id: string; reason: ChatReportReason } | { type: "mute"; address: string };

/** How near the bottom (px) the reader counts as reading the latest messages: a new one then scrolls into view. */
const AT_BOTTOM_PX = 48;
/** How near the top (px) the older page is loaded. */
const NEAR_TOP_PX = 120;

/** The room (px) kept under the chat page's conversation when a phone's keyboard shrinks the visual viewport. */
const KEYBOARD_GAP_PX = 8;

/**
 * The chat's gold buttons raised as the drawer's pressables are (the owner's ask of 2026-11-05: Send and Accept as raised as
 * Decline, `drawer-raised`): the gold lit along its top and deeper at its foot (the book's), the near-black outline and lip, the
 * hover and press layers over it. A style, as the Shop's price (`shop-card.tsx`): in the page's chunk, not the one stylesheet.
 */
export const GOLD_RAISED: CSSProperties = {
  backgroundImage: "linear-gradient(var(--layer, transparent), var(--layer, transparent)), linear-gradient(var(--primary), var(--accent-scale-400))",
  boxShadow: "inset 0 1px 0 color-mix(in oklab, var(--primary) 55%, var(--foreground)), 0 0 0 1px var(--hud-outline), 0 2px 0 1px var(--hud-outline)",
};
/** The share of the limit past which the draft's count shows (CHAT-PAGE: the book's composer has none until then). */
const COUNT_FROM = 0.8;

/** A league by its index on chain (0 Wood to 22 Grand Master), for the rim round a portrait; unknown, none. */
export const chatLeague = (index: number | undefined) => (index === undefined ? undefined : LEAGUES[index]);

/** A message's time: the hour today, else the day and the hour. */
export function messageTime(at: number, now: number, timeZone?: string): string {
  const today = formatDate(now * 1000, { day: "numeric", month: "short", timeZone }) === formatDate(at * 1000, { day: "numeric", month: "short", timeZone });
  return formatDate(at * 1000, today ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone } : { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone });
}

/** A time's day in the viewer's zone (or the stories'), to tell two days apart. */
const dayOf = (at: number, timeZone?: string): string => formatDate(at * 1000, { year: "numeric", month: "numeric", day: "numeric", timeZone });

/** A day's divider's words: "Today", else the day and the month, and the year when it is not this one. */
function dayLabel(at: number, now: number, timeZone?: string): string {
  if (dayOf(at, timeZone) === dayOf(now, timeZone)) return "Today";
  const sameYear = formatDate(at * 1000, { year: "numeric", timeZone }) === formatDate(now * 1000, { year: "numeric", timeZone });
  return formatDate(at * 1000, sameYear ? { day: "numeric", month: "short", timeZone } : { day: "numeric", month: "short", year: "numeric", timeZone });
}

/**
 * The rule between two lines of different days (the owner's ask of 2026-11-05: no rule between the messages of one day), its day in
 * its middle.
 */
function DayDivider({ at, now, timeZone }: { at: number; now: number; timeZone?: string }) {
  const label = dayLabel(at, now, timeZone);
  // A separator, not a line of the conversation: its day is its name.
  return (
    <li role="separator" aria-label={label} data-slot="chat-day" className="flex items-center gap-3 px-3 py-2">
      <span aria-hidden className="h-px flex-1 bg-border" />
      <span aria-hidden className="shrink-0 text-xs font-semibold text-muted-foreground">
        {label}
      </span>
      <span aria-hidden className="h-px flex-1 bg-border" />
    </li>
  );
}

/** Who wrote a message, in words. */
const authorName = (m: ChatMessage): string => (m.mine ? "You" : (m.author?.name ?? shortAddress(m.author?.address ?? "")));

interface MessageRowProps {
  message: ChatMessage;
  now: number;
  timeZone?: string;
  /** The author may be muted here (the World and the guild, not in private). */
  mayMute: boolean;
  /** It came while the conversation was shown: it fades in (no motion with reduced motion). */
  arrived: boolean;
  onOpenPlayer?: (address: string) => void;
  onReport: (m: ChatMessage) => void;
  onMute: (m: ChatMessage) => void;
}

/**
 * A message's bubble (the book's): a soft slate pill, flat, no outline or drop (the owner's ask of 2026-11-05: softer than the
 * drawer's raised plates); the player's own in a faint gold with its tail toward their avatar.
 */
const BUBBLE = "relative w-fit max-w-full min-w-0 rounded-2xl px-3.5 py-2 text-base leading-snug";
const OTHER_BUBBLE = "bg-secondary font-semibold text-foreground";
/** The player's own: a discreet gold, the gold faint over the panel (the owner's ask of 2026-11-05: the book's full gold too strong). */
const MINE_BUBBLE =
  "bg-primary/20 font-semibold text-foreground after:absolute after:top-1/2 after:-right-1.5 after:-translate-y-1/2 after:border-y-[6px] after:border-l-[7px] after:border-y-transparent after:border-l-primary/20";
/** A deleted (the data's state; the page offers no Delete) or unreadable message: the bubble fainter, its words in italics. */
const QUIET_BUBBLE = "bg-secondary/50 text-sm text-muted-foreground italic";

/**
 * One line of a conversation (CHAT-PAGE, the Paved UX Book's chat): a player's message, its author's avatar in the rim of their
 * league with its crest, then their name, their level in the profile's blue star and the time over the text in a bubble (plain: a
 * link or an address is never made clickable; no guild's tag, the owner's ask of 2026-11-05: the name opens the profile); the player's own at the right, in a gold bubble. "Message deleted", one this device cannot
 * open (#997), or an event of the guild's log, centred.
 */
function MessageRow({ message: msg, now, timeZone, mayMute, arrived, onOpenPlayer, onReport, onMute }: MessageRowProps) {
  const reduced = useReducedMotionConfig();
  const motion = arrived && !reduced ? { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.2 } } : {};
  if (msg.kind === "event" && msg.event)
    return (
      <m.li {...motion} data-slot="chat-event" className="flex justify-center px-2 py-2">
        <span className="flex max-w-full items-center gap-1.5 rounded-full bg-secondary/60 px-3 py-1 text-center text-xs font-semibold text-muted-foreground">
          <Icon name="shield-halved" size="xs" />
          <span className="min-w-0 wrap-anywhere">{logLine(msg.event)}</span>
          <span className="shrink-0 tabular-nums">· {messageTime(msg.at, now, timeZone)}</span>
        </span>
      </m.li>
    );
  const author = msg.author;
  const name = authorName(msg);
  const mine = msg.mine;
  const hasMenu = !msg.deleted && (msg.mayReport || (mayMute && !mine && author !== null));
  const menu = hasMenu && (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" className="shrink-0 text-muted-foreground" aria-label={`More for ${name}'s message`}>
          <Icon name="ellipsis" size="sm" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {author && !mine && (
          <DropdownMenuItem onSelect={() => onOpenPlayer?.(author.address)}>
            <Icon name="user" size="xs" fixedWidth />
            Profile
          </DropdownMenuItem>
        )}
        {mayMute && !mine && author && (
          <DropdownMenuItem onSelect={() => onMute(msg)}>
            <Icon name="volume-xmark" size="xs" fixedWidth />
            Mute
          </DropdownMenuItem>
        )}
        {msg.mayReport && (
          <DropdownMenuItem onSelect={() => onReport(msg)}>
            <Icon name="flag" size="xs" fixedWidth />
            Report
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
  let text: ReactNode;
  if (msg.deleted) text = <p className={cn(BUBBLE, QUIET_BUBBLE)}>Message deleted</p>;
  else if (msg.unreadable)
    text = (
      <p data-slot="chat-unreadable" className={cn(BUBBLE, QUIET_BUBBLE, "flex min-w-0 items-start gap-1.5")}>
        <Icon name="lock" size="xs" className="mt-1 shrink-0" />
        <span className="min-w-0 wrap-anywhere">{UNREADABLE_MESSAGE}</span>
      </p>
    );
  else text = <p className={cn(BUBBLE, "whitespace-pre-wrap wrap-break-word", mine ? MINE_BUBBLE : OTHER_BUBBLE)}>{msg.text}</p>;
  return (
    <m.li {...motion} data-slot="chat-message" data-mine={mine || undefined} className={cn("flex min-w-0 items-start gap-2.5 px-2 py-2", mine && "flex-row-reverse")}>
      <button
        type="button"
        aria-label={author ? `${name}'s profile` : name}
        disabled={!author}
        onClick={() => author && onOpenPlayer?.(author.address)}
        className="state-layer shrink-0 rounded-full outline-none"
      >
        {author ? (
          <LeaguePortrait player={{ name: author.name, address: author.address }} look={author.look} league={chatLeague(author.league)} className="text-[3rem]" />
        ) : (
          <PlayerAvatar player={null} />
        )}
      </button>
      <div className={cn("flex min-w-0 flex-1 flex-col gap-1", mine && "items-end")}>
        <div className={cn("flex min-h-6 w-full min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5", mine && "justify-end")}>
          {author ? (
            <button type="button" onClick={() => onOpenPlayer?.(author.address)} className="text-outline max-w-full min-w-0 rounded text-left text-sm font-bold outline-none">
              <PlayerName name={author.name} address={author.address} className="block" />
            </button>
          ) : (
            <span className="text-outline text-sm font-bold">{name}</span>
          )}
          {author && <LevelStar level={author.level} />}
          <span className="shrink-0 text-xs font-semibold text-muted-foreground tabular-nums">{messageTime(msg.at, now, timeZone)}</span>
        </div>
        {/* The message's menu beside its bubble, on the side away from the avatar: the name's line keeps its room (the book's). */}
        <div className={cn("flex max-w-full min-w-0 items-center gap-1", mine && "flex-row-reverse")}>
          {text}
          {menu}
        </div>
      </div>
    </m.li>
  );
}

interface ReportDialogProps {
  message: ChatMessage | null;
  /** The conversation is end-to-end encrypted: the dialog says what the report reveals (#997, point 12). */
  encrypted: boolean;
  onCancel: () => void;
  onReport: (reason: ChatReportReason) => Promise<unknown>;
}

/** Reporting a message: spam, scam, harassment or other. Its author is not told. In private and in a guild, what it reveals. */
function ReportDialog({ message, encrypted, onCancel, onReport }: ReportDialogProps) {
  return (
    <Dialog open={message !== null} onOpenChange={(open) => !open && onCancel()}>
      {/* As tall as the screen at most, its body scrolling within (Close stays put): the encrypted conversations' warning makes it
          taller than a small phone. */}
      <DialogContent data-slot="chat-report" className="flex max-h-[calc(100dvh-2rem)] flex-col p-0">
        <ScrollRegion className="min-h-0 overscroll-contain p-6">{message && <ReportBody key={message.id} message={message} encrypted={encrypted} onCancel={onCancel} onReport={onReport} />}</ScrollRegion>
      </DialogContent>
    </Dialog>
  );
}

function ReportBody({ message, encrypted, onCancel, onReport }: ReportDialogProps & { message: ChatMessage }) {
  const [reason, setReason] = useState<ChatReportReason | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const group = useId();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!reason) return;
    setPending(true);
    setError(null);
    onReport(reason)
      .then(onCancel)
      .catch((err: unknown) => setError(chatErrorText(err)))
      .finally(() => setPending(false));
  };
  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <DialogHeader>
        <DialogTitle className="pr-6 wrap-anywhere">Report {authorName(message)}'s message?</DialogTitle>
        <DialogDescription>They are not told. The message stays until it is reviewed.</DialogDescription>
      </DialogHeader>
      {encrypted && (
        <Notice tone="warning" icon="lock">
          {REPORT_REVEAL}
        </Notice>
      )}
      <div role="radiogroup" aria-label="Reason" className="flex flex-col gap-2">
        {CHAT_REPORT_REASONS.map((r) => (
          <label key={r} className={cn("flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border px-3 py-2", reason === r ? "border-primary bg-primary/10" : "border-border")}>
            <input type="radio" name={group} value={r} checked={reason === r} onChange={() => setReason(r)} className="mt-1 accent-primary" />
            <span className="flex min-w-0 flex-col">
              <span className="text-sm font-semibold">{REPORT_REASONS[r].label}</span>
              <span className="text-xs text-muted-foreground">{REPORT_REASONS[r].line}</span>
            </span>
          </label>
        ))}
      </div>
      <InlineError title="Report" message={error} />
      <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="destructive" disabled={!reason} loading={pending}>
          Report
        </Button>
      </DialogFooter>
    </form>
  );
}

export interface ChatConversationProps {
  /** What the conversation's page says beside its messages; undefined while read, null when the player may not read it. */
  head: ChatPageHead | null | undefined;
  /** Every message read, oldest first. */
  messages: readonly ChatMessage[];
  hasOlder?: boolean;
  loadingOlder?: boolean;
  onLoadOlder?: () => void;
  error?: string | null;
  errorDetail?: ErrorDetail;
  onRetry?: () => void;
  /** The clock, in seconds: the times and the rate limit's wait. */
  now: number;
  /** The times' zone (the stories' fixed one); omitted, the viewer's. */
  timeZone?: string;
  /** The player saw the notice of their first private conversation. */
  noticeSeen?: boolean;
  onSeeNotice?: () => void;
  onBack?: () => void;
  /** The conversation's title: the other player's profile, or the guild's page. */
  onOpenTitle?: () => void;
  onOpenPlayer?: (address: string) => void;
  /** Sends a message; resolves once kept, rejects with why (a `ChatRefusedError`). */
  onSend?: (text: string) => Promise<unknown>;
  onAction?: (action: ChatMessageAction) => Promise<unknown>;
  /** A request: accept (the conversation opens) or decline (it goes away). */
  onAnswer?: (accept: boolean) => Promise<unknown>;
  /** The draft the field starts with (the stories'). */
  initialDraft?: string;
  /** The message whose report dialog starts open (the stories'). */
  initialReport?: string;
  /** The Encryption sheet starts open (the stories'). */
  initialEncryptionOpen?: boolean;
  /**
   * The chat page's own conversation (#973: a tab's, or a private one over the list): as tall as what the page leaves under its
   * header and its tabs, with no cap. Off, a box of at most 44rem among other content.
   */
  fill?: boolean;
}

/**
 * One conversation (#955): its title (the World, the guild with its tag, or the other player), the guild's announcement pinned at
 * the top, the messages, the latest at the bottom, the older ones loaded on scrolling up (the reading place kept), a "New messages"
 * pill when one comes while the player reads older ones; then the field, which stays above a phone's keyboard (its height follows
 * `visualViewport`). In private: the notice of the first conversation, a request's Accept and Decline, and a note while the
 * player's own request waits. Each message's menu: Profile, Mute (the World and the guild), Report (no Delete: on the ledger, a message
 * stays). A write refused by the rules says why; the rate limits count down to when the player may send again. End-to-end
 * encryption (#997): a line under the title says what is encrypted (the World is public; in private, the conversation's opening, until
 * its first message, as the notice), a joiner's line in the guild, the other's key changes among the messages,
 * a message this device cannot open in place of its text, what a report reveals, and in private the Encryption sheet with the
 * safety code, from the conversation's menu or its line.
 */
export function ChatConversation({
  head,
  messages,
  hasOlder = false,
  loadingOlder = false,
  onLoadOlder,
  error,
  errorDetail,
  onRetry,
  now,
  timeZone,
  noticeSeen = true,
  onSeeNotice,
  onBack,
  onOpenTitle,
  onOpenPlayer,
  onSend,
  onAction,
  onAnswer,
  initialDraft = "",
  initialReport,
  initialEncryptionOpen = false,
  fill = false,
}: ChatConversationProps) {
  const viewport = useVisualViewportHeight();
  const scroller = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(initialDraft);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const [answering, setAnswering] = useState<boolean | null>(null);
  const [answerError, setAnswerError] = useState<string | null>(null);
  const [reporting, setReporting] = useState<ChatMessage | null>(() => messages.find((x) => x.id === initialReport) ?? null);
  const actions = useGuildActions<ChatMessageAction>((a) => onAction?.(a), chatErrorText);
  const [encryptionOpen, setEncryptionOpen] = useState(initialEncryptionOpen);

  // The reading place: whether the reader is at the bottom, the messages that came while they were not, and the first and last
  // IDs seen, to tell an older page (keep the place) from a new message (follow it, or show the pill).
  const [atBottom, setAtBottom] = useState(true);
  const [unseen, setUnseen] = useState(0);
  const firstId = messages[0]?.id ?? null;
  const last = messages.at(-1) ?? null;
  const seen = useRef<{ first: string | null; last: string | null; height: number; top: number }>({ first: null, last: null, height: 0, top: 0 });
  // The latest message's time when the conversation was first drawn: only those that come after it fade in.
  const [baseline, setBaseline] = useState<number | null>(null);
  if (baseline === null && last) setBaseline(last.at);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const before = seen.current;
    if (before.first === null && before.last === null) {
      // First drawn: at the latest message.
      el.scrollTop = el.scrollHeight;
    } else if (firstId !== before.first && last?.id === before.last) {
      // An older page came on top: the same messages stay where the reader had them.
      el.scrollTop = before.top + (el.scrollHeight - before.height);
    } else if (last && last.id !== before.last) {
      if (atBottom || last.mine) el.scrollTop = el.scrollHeight;
      else setUnseen((n) => n + 1);
    }
    seen.current = { first: firstId, last: last?.id ?? null, height: el.scrollHeight, top: el.scrollTop };
  }, [firstId, last, atBottom]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < AT_BOTTOM_PX;
    if (bottom !== atBottom) setAtBottom(bottom);
    if (bottom && unseen > 0) setUnseen(0);
    seen.current = { ...seen.current, height: el.scrollHeight, top: el.scrollTop };
    if (el.scrollTop < NEAR_TOP_PX && hasOlder && !loadingOlder) onLoadOlder?.();
  };
  const toBottom = () => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
    setUnseen(0);
    setAtBottom(true);
  };


  const c = head?.conversation;
  const name = c ? conversationName(c, shortAddress) : "";
  const wait = Math.max(head?.nextSendAt ?? 0, retryAt ?? 0) - now;
  const length = chatLength(draft.trim());
  const tooLong = length > CHAT_MESSAGE_MAX;
  const refusal = head?.writeRefusal ?? null;
  const request = head?.standing === "request";
  const encryption = head?.encryption ?? null;
  const encrypted = encryption !== null && encryption.mode !== "public";
  const isPrivate = c?.kind === "private";
  // The other's key changes among the messages, each before the first message after it; one older than the page read waits for
  // the older page.
  const keyChangesBefore = new Map<number, { at: number; version: number }[]>();
  for (const k of isPrivate ? (encryption?.keyChanges ?? []) : []) {
    if (hasOlder && messages.length > 0 && k.at < messages[0]!.at) continue;
    const i = messages.findIndex((x) => x.at > k.at);
    const at = i < 0 ? messages.length : i;
    keyChangesBefore.set(at, [...(keyChangesBefore.get(at) ?? []), k]);
  }
  const keyChangeRows = (i: number) =>
    (keyChangesBefore.get(i) ?? []).map((k) => (
      <li key={`key-${k.version}-${k.at}`} data-slot="chat-key-change" className="flex justify-center px-2 py-1">
        <KeyChangeLine otherName={name} onViewCode={() => setEncryptionOpen(true)} />
      </li>
    ));

  const send = (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (text === "" || tooLong || sending || wait > 0 || !onSend) return;
    setSending(true);
    setSendError(null);
    onSend(text)
      .then(() => {
        setDraft("");
        setRetryAt(null);
      })
      .catch((err: unknown) => {
        setSendError(chatErrorText(err));
        if (err instanceof ChatRefusedError && err.retryAt !== null) setRetryAt(err.retryAt);
      })
      .finally(() => setSending(false));
  };
  const answer = (accept: boolean) => {
    if (!onAnswer) return;
    setAnswering(accept);
    setAnswerError(null);
    onAnswer(accept)
      .catch((err: unknown) => setAnswerError(chatErrorText(err)))
      .finally(() => setAnswering(null));
  };

  // On the chat page (`fill`, CHAT-PAGE: the HUD's drawer), as tall as what the drawer leaves under its tabs, 20rem at least; with a
  // phone's keyboard open, no taller than what is left above it (its top measured, the visual viewport's foot less a small gap), its
  // minimum too (#1025: a 20rem floor kept the field under the keyboard, and the drawer's body, which fits, cannot scroll it back): the
  // composer stays whole at its foot, the messages scroll in what is left. Elsewhere, a tall box on a phone, the field at its foot.
  const tall = viewport !== null ? `${Math.round(viewport)}px` : "100dvh";
  const box = useRef<HTMLElement>(null);
  const [room, setRoom] = useState<number | null>(null);
  useLayoutEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!fill || !box.current || !vv || viewport === null) return;
    const top = box.current.getBoundingClientRect().top;
    setRoom(top > 0 ? Math.max(0, Math.round(vv.offsetTop + vv.height - top - KEYBOARD_GAP_PX)) : null);
  }, [fill, viewport]);
  // With the keyboard open, the field stays in view: the box shrinks with the visual viewport, and the field is brought back.
  useEffect(() => {
    if (viewport !== null && document.activeElement === field.current) field.current?.scrollIntoView({ block: "nearest" });
  }, [viewport, room]);
  const style = fill
    ? room !== null
      ? { maxHeight: `${room}px`, minHeight: `min(20rem, ${room}px)` }
      : undefined
    : { height: `min(44rem, max(20rem, ${tall} - 9rem))` };
  const nearLimit = length >= CHAT_MESSAGE_MAX * COUNT_FROM;
  const placeholder = c?.kind === "world" ? "Message the World" : c?.kind === "guild" ? "Message the allegiance" : "Message";

  return (
    <>
      {c?.kind === "guild" && <GuildBanner name={name} guild={c.guild} pinned={head?.pinned ?? null} onOpen={onOpenTitle} />}
      <section
        ref={box}
        aria-label={name ? `${name} conversation` : "Conversation"}
        data-slot="chat-conversation"
        className={cn("drawer-carved flex min-w-0 flex-col overflow-hidden rounded-2xl", fill && "min-h-80 flex-1")}
        style={style}
      >
        {/* A private conversation's head; with Back, also while it loads and once it is not there any more (#1025: its way back to the list). */}
        {(isPrivate || (onBack && head == null)) && (
          <header className="flex min-w-0 items-center gap-1 border-b border-border p-1.5">
            {onBack && (
              <button type="button" aria-label="Back to the conversations" onClick={onBack} className="state-layer grid size-11 shrink-0 cursor-pointer place-items-center rounded-full outline-none">
                <Icon name="chevron-left" className="drawer-icon" />
              </button>
            )}
            {c?.other ? (
              <button type="button" disabled={!onOpenTitle} onClick={onOpenTitle} className="state-layer flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl px-1 py-0.5 text-left outline-none">
                <LeaguePortrait player={{ name: c.other.name, address: c.other.address }} look={c.other.look} league={chatLeague(c.other.league)} className="text-[2.75rem]" />
                <PlayerName name={c.other.name} address={c.other.address} className="text-outline min-w-0 text-base leading-snug font-bold" />
                <LevelStar level={c.other.level} />
              </button>
            ) : head === null ? (
              <span className="flex-1" />
            ) : (
              <Skeleton className="h-6 flex-1 rounded" />
            )}
            {isPrivate && encryption && (
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="ghost" className="shrink-0" aria-label={`Menu of the conversation with ${name}`}>
                    <Icon name="ellipsis" size="sm" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setEncryptionOpen(true)}>
                    <Icon name="lock" size="xs" fixedWidth />
                    Encryption
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </header>
        )}
        {encryption && !isPrivate && (
          <div className="border-b border-border">
            <EncryptionLine mode={encryption.mode} otherName={name} onOpen={isPrivate ? () => setEncryptionOpen(true) : undefined} />
          </div>
        )}

        <div className="relative min-h-0 flex-1">
          <ScrollRegion ref={scroller} onScroll={onScroll} role="log" aria-label="Messages" aria-busy={head === undefined || loadingOlder} className="size-full overscroll-contain px-1 py-1 [overflow-anchor:none]">
            {hasOlder && (
              <div className="flex justify-center py-1">
                <Button size="sm" variant="ghost" loading={loadingOlder} onClick={onLoadOlder}>
                  Older messages
                </Button>
              </div>
            )}
            {head === undefined && !error && (
              <div className="flex flex-col gap-3 p-2">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-14 rounded-xl" />
                ))}
              </div>
            )}
            {head === null && <p className="px-4 py-8 text-center text-sm text-muted-foreground">This conversation is not there any more.</p>}
            {encryption?.joinedAt != null && !hasOlder && <JoinerLine />}
            {head && messages.length === 0 && (
              // The conversation's opening (the owner's ask of 2026-11-05): in private, what is encrypted, until the first message.
              <div data-slot="chat-opening" className="flex flex-col items-center gap-3 px-3 py-6">
                {isPrivate && encryption && (
                  <EncryptionLine mode={encryption.mode} otherName={name} onOpen={() => setEncryptionOpen(true)} className="w-auto max-w-full rounded-2xl bg-secondary/60 px-3.5 py-2" />
                )}
                <p className="text-center text-sm text-muted-foreground">No messages yet: say hello.</p>
              </div>
            )}
            {messages.length > 0 && (
              <ul className="flex flex-col">
                {messages.map((msg, i) => [
                  // A rule only where the day changes from the line before (none above the first line read).
                  i > 0 && dayOf(messages[i - 1]!.at, timeZone) !== dayOf(msg.at, timeZone) ? <DayDivider key={`day-${msg.id}`} at={msg.at} now={now} timeZone={timeZone} /> : null,
                  ...keyChangeRows(i),
                  <MessageRow
                    key={msg.id}
                    message={msg}
                    now={now}
                    timeZone={timeZone}
                    mayMute={c?.kind !== "private"}
                    arrived={baseline !== null && msg.at > baseline}
                    onOpenPlayer={onOpenPlayer}
                    onReport={setReporting}
                    onMute={(x) => void actions.run({ type: "mute", address: x.author!.address })}
                  />,
                ])}
                {keyChangeRows(messages.length)}
              </ul>
            )}
          </ScrollRegion>
          {unseen > 0 && (
            <Button size="sm" className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full shadow-md" onClick={toBottom}>
              New messages
            </Button>
          )}
        </div>

        <div className="flex flex-col gap-2 p-2.5">
          <InlineError title="Chat" message={error ?? actions.error} detail={error ? errorDetail : undefined} action={error && onRetry ? <Button size="sm" variant="secondary" onClick={onRetry}>Try again</Button> : undefined} />
          {/* The first private conversation's notice, before its first message only (the owner's ask of 2026-11-05). */}
          {c?.kind === "private" && !noticeSeen && messages.length === 0 && (
            <Notice tone="warning" icon="lock" action={onSeeNotice && <Button size="sm" variant="secondary" onClick={onSeeNotice}>Got it</Button>}>
              {PRIVATE_NOTICE}
            </Notice>
          )}
          {request && c?.other && (
            <div data-slot="chat-request" className="drawer-raised flex flex-col gap-2 rounded-xl p-3">
              <p className="text-sm">
                <PlayerName name={c.other.name} address={c.other.address} className="font-bold whitespace-normal wrap-anywhere" /> wants to message you. Reply or accept to let them write to you; decline and they cannot write again.
              </p>
              {/* The book's check and cross alone (the owner's ask of 2026-11-05: no words on them), as the list's request row. */}
              <div className="flex justify-end gap-2">
                <Button aria-label="Accept" className="size-11 shrink-0 rounded-xl px-0" style={GOLD_RAISED} loading={answering === true} disabled={answering !== null} onClick={() => answer(true)}>
                  <UiIcon name="check" px={28} className="drawer-icon size-7" />
                </Button>
                <Button aria-label="Decline" variant="secondary" className="drawer-raised size-11 shrink-0 rounded-xl px-0" loading={answering === false} disabled={answering !== null} onClick={() => answer(false)}>
                  <UiIcon name="cross" px={24} className="drawer-icon size-6" />
                </Button>
              </div>
              <InlineError title="Request" message={answerError} />
            </div>
          )}
          {head?.awaitsReply && !refusal && <p className="text-xs text-muted-foreground">Your messages wait in their Requests until they reply or accept.</p>}
          {refusal ? (
            <Notice icon={refusal === "level-low" ? "lock" : undefined}>{CHAT_REFUSALS[refusal]}</Notice>
          ) : (
            head && (
              <form className="flex min-w-0 items-center gap-2" onSubmit={send}>
                <div className="relative flex min-w-0 flex-1">
                  <input
                    ref={field}
                    type="text"
                    aria-label={`Message ${name}`}
                    placeholder={placeholder}
                    enterKeyHint="send"
                    autoComplete="off"
                    value={draft}
                    onChange={(e) => {
                      setDraft(e.target.value);
                      if (sendError) setSendError(null);
                    }}
                    className={cn("min-h-12 w-full min-w-0 rounded-xl border border-input bg-secondary px-4 py-2 text-base font-semibold outline-none placeholder:text-muted-foreground", nearLimit && "pr-20")}
                  />
                  {/* The count past 80 % of the limit only (the book's field has none), inside the field's end; read out as it changes. */}
                  <span aria-live="polite" className={cn("numeric pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs font-bold", tooLong ? "text-warning" : "text-muted-foreground")}>
                    {nearLimit && `${formatInteger(length)}/${formatInteger(CHAT_MESSAGE_MAX)}`}
                  </span>
                </div>
                <Button
                  type="submit"
                  className="h-12 w-16 shrink-0 rounded-xl"
                  style={GOLD_RAISED}
                  loading={sending}
                  disabled={draft.trim() === "" || tooLong || wait > 0}
                  aria-label={wait > 0 ? `Send, in ${formatInteger(wait)} s` : "Send"}
                >
                  {wait > 0 ? <span className="numeric text-outline font-bold text-foreground">{formatInteger(wait)} s</span> : <UiIcon name="send" px={32} className="drawer-icon size-8" />}
                </Button>
              </form>
            )
          )}
          <InlineError title="Send" message={sendError} />
        </div>
      <ReportDialog message={reporting} encrypted={encrypted} onCancel={() => setReporting(null)} onReport={(reason) => onAction?.({ type: "report", id: reporting!.id, reason }) ?? Promise.resolve()} />
        {isPrivate && encryption && <EncryptionSheet open={encryptionOpen} onOpenChange={setEncryptionOpen} otherName={name} safetyCode={encryption.safetyCode} />}
      </section>
    </>
  );
}

interface GuildBannerProps {
  /** The guild's name in words. */
  name: string;
  guild: ConversationSummary["guild"];
  pinned: ChatPageHead["pinned"];
  /** The guild's page. */
  onOpen?: () => void;
}

/**
 * Above the guild's conversation (CHAT-PAGE, the book's "chat": its pinned post on a gold plate): the latest announcement with the
 * book's pin, on two lines at most; with none, the guild's emblem, name and tag. Either way a tap opens the guild's page, where the
 * announcements are whole, with their author and time.
 */
function GuildBanner({ name, guild, pinned, onOpen }: GuildBannerProps) {
  return (
    <button
      type="button"
      data-slot="chat-pinned"
      disabled={!onOpen}
      onClick={onOpen}
      className="state-layer flex min-h-14 w-full min-w-0 shrink-0 cursor-pointer items-center gap-3 rounded-2xl border-2 border-primary/70 bg-linear-to-b from-primary/40 to-primary/15 px-3 py-2 text-left outline-none disabled:cursor-default"
    >
      {pinned ? (
        <>
          <UiIcon name="pin" px={36} label="Pinned announcement" className="drawer-icon size-9" />
          <span title={pinned.text} className="text-outline line-clamp-2 min-w-0 flex-1 text-base leading-snug font-bold wrap-anywhere">
            {pinned.text}
          </span>
        </>
      ) : (
        <>
          {guild && <GuildEmblem emblem={guild.emblem} size="sm" className="drawer-icon" />}
          <span title={name} className="text-outline min-w-0 flex-1 truncate text-base leading-snug font-bold">
            {name}
          </span>
          {guild && <span className="shrink-0 text-xs font-bold text-info">{guild.tag}</span>}
        </>
      )}
      {onOpen && <Icon name="chevron-right" size="sm" className="drawer-icon shrink-0" label={`Open ${name}`} />}
    </button>
  );
}
