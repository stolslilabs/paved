import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import * as m from "motion/react-m";
import { useReducedMotionConfig } from "motion/react";
import { CHAT_MESSAGE_MAX, CHAT_REPORT_REASONS, chatLength, formatDate, formatInteger, type ChatReportReason } from "@paved/game-core";
import { ChatRefusedError, type ChatMessage, type ChatPageHead } from "../../data/social-source";
import { CHAT_REFUSALS, PRIVATE_NOTICE, REPORT_REASONS, REPORT_REVEAL, UNREADABLE_MESSAGE, chatErrorText, conversationName } from "../../lib/chat-text";
import { logLine } from "../../lib/guild-text";
import { cn } from "../../lib/utils";
import { useVisualViewportHeight } from "../../lib/visual-viewport";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { Icon } from "../ui/icon";
import { ScrollRegion } from "../ui/scroll-region";
import { Skeleton } from "../ui/skeleton";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { Notice } from "../elements/notice";
import { PlayerAvatar } from "../elements/player-avatar";
import { PlayerName } from "../elements/player-name";
import { shortAddress } from "../elements/short-address";
import { formatPoints } from "../elements/score";
import { EncryptionLine, EncryptionSheet, JoinerLine, KeyChangeLine } from "./chat-encryption";
import { useGuildActions } from "./guild-sheets";

/** A write on one message or its author, from the message's menu. */
export type ChatMessageAction = { type: "delete"; id: string } | { type: "report"; id: string; reason: ChatReportReason } | { type: "mute"; address: string };

/** How near the bottom (px) the reader counts as reading the latest messages: a new one then scrolls into view. */
const AT_BOTTOM_PX = 48;
/** How near the top (px) the older page is loaded. */
const NEAR_TOP_PX = 120;

/**
 * What the chat page (#973) draws above and under its conversation: the header (`--header-h` and the notch), the content's top
 * padding, the tabs and their gap, the content's bottom padding (`TabPage`, `ChatTabs`). No bottom bar on that page.
 */
const CHAT_PAGE_CHROME = "var(--header-h) - env(safe-area-inset-top) - 5.75rem";

/** A message's time: the hour today, else the day and the hour. */
function messageTime(at: number, now: number, timeZone?: string): string {
  const today = formatDate(now * 1000, { day: "numeric", month: "short", timeZone }) === formatDate(at * 1000, { day: "numeric", month: "short", timeZone });
  return formatDate(at * 1000, today ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone } : { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone });
}

/** Who wrote a message, in words. */
const authorName = (m: ChatMessage): string => (m.mine ? "You" : (m.author?.name ?? shortAddress(m.author?.address ?? "")));

interface MessageRowProps {
  message: ChatMessage;
  now: number;
  timeZone?: string;
  /** The World shows each author's guild tag. */
  showTag: boolean;
  /** The author may be muted here (the World and the guild, not in private). */
  mayMute: boolean;
  /** It came while the conversation was shown: it fades in (no motion with reduced motion). */
  arrived: boolean;
  onOpenPlayer?: (address: string) => void;
  onDelete: (m: ChatMessage) => void;
  onReport: (m: ChatMessage) => void;
  onMute: (m: ChatMessage) => void;
}

/**
 * One line of a conversation: a player's message (avatar, name, level, the guild's tag in the World, the time, then the text,
 * plain: a link or an address is never made clickable), "Message deleted", one this device cannot open (#997), or an event of the
 * guild's log, centred.
 */
function MessageRow({ message: msg, now, timeZone, showTag, mayMute, arrived, onOpenPlayer, onDelete, onReport, onMute }: MessageRowProps) {
  const reduced = useReducedMotionConfig();
  const motion = arrived && !reduced ? { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.2 } } : {};
  if (msg.kind === "event" && msg.event)
    return (
      <m.li {...motion} data-slot="chat-event" className="flex justify-center px-2 py-1">
        <span className="flex max-w-full items-center gap-1.5 rounded-full bg-secondary/60 px-3 py-1 text-center text-xs text-muted-foreground">
          <Icon name="shield-halved" size="xs" />
          <span className="min-w-0 wrap-anywhere">{logLine(msg.event)}</span>
          <span className="numeric shrink-0">· {messageTime(msg.at, now, timeZone)}</span>
        </span>
      </m.li>
    );
  const author = msg.author;
  const name = authorName(msg);
  const hasMenu = !msg.deleted && (msg.mayDelete || msg.mayReport || (mayMute && !msg.mine && author !== null));
  return (
    <m.li {...motion} data-slot="chat-message" data-mine={msg.mine || undefined} className={cn("flex min-w-0 gap-2 rounded-xl px-2 py-1.5", msg.mine && "bg-primary/10")}>
      <button
        type="button"
        aria-label={author ? `${name}'s profile` : name}
        disabled={!author}
        onClick={() => author && onOpenPlayer?.(author.address)}
        className="state-layer h-fit shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <PlayerAvatar player={author ? { name: author.name, address: author.address } : null} look={author?.look ?? null} />
      </button>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          {author ? (
            <button type="button" onClick={() => onOpenPlayer?.(author.address)} className="min-w-0 max-w-full rounded text-left text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {msg.mine ? "You" : <PlayerName name={author.name} address={author.address} className="block" />}
            </button>
          ) : (
            <span className="text-sm font-semibold">{name}</span>
          )}
          {author && (
            <span className="text-xs text-muted-foreground">
              Lv <span className="numeric">{formatPoints(author.level)}</span>
            </span>
          )}
          {showTag && author?.guildTag && <span className="numeric text-xs text-muted-foreground">{author.guildTag}</span>}
          <span className="numeric text-xs text-muted-foreground">{messageTime(msg.at, now, timeZone)}</span>
        </div>
        {msg.deleted ? (
          <p className="text-sm text-muted-foreground italic">Message deleted</p>
        ) : msg.unreadable ? (
          <p data-slot="chat-unreadable" className="flex min-w-0 items-start gap-1.5 text-sm text-muted-foreground italic">
            <Icon name="lock" size="xs" className="mt-1 shrink-0" />
            <span className="min-w-0 wrap-anywhere">{UNREADABLE_MESSAGE}</span>
          </p>
        ) : (
          <p className="text-sm whitespace-pre-wrap wrap-break-word">{msg.text}</p>
        )}
      </div>
      {hasMenu && (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="-my-1 shrink-0" aria-label={`More for ${name}'s message`}>
              <Icon name="ellipsis" size="sm" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {author && !msg.mine && (
              <DropdownMenuItem onSelect={() => onOpenPlayer?.(author.address)}>
                <Icon name="user" size="xs" fixedWidth />
                Profile
              </DropdownMenuItem>
            )}
            {mayMute && !msg.mine && author && (
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
            {msg.mayDelete && (
              <DropdownMenuItem variant="destructive" onSelect={() => onDelete(msg)}>
                <Icon name="trash" size="xs" fixedWidth />
                Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
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
      <DialogContent data-slot="chat-report">{message && <ReportBody key={message.id} message={message} encrypted={encrypted} onCancel={onCancel} onReport={onReport} />}</DialogContent>
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
        <DialogTitle className="wrap-anywhere">Report {authorName(message)}'s message?</DialogTitle>
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
 * player's own request waits. Each message's menu: Profile, Mute (the World and the guild), Report, Delete. A write refused by
 * the rules says why; the rate limits count down to when the player may send again. End-to-end encryption (#997): a line under the
 * title says what is encrypted (the World is public), a joiner's line in the guild, the other's key changes among the messages,
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

  // With the keyboard open, the field stays in view: the box shrinks with the visual viewport, and the field is brought back.
  useEffect(() => {
    if (viewport !== null && document.activeElement === field.current) field.current?.scrollIntoView({ block: "nearest" });
  }, [viewport]);

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

  // A tall box on a phone, the field at its foot; with a keyboard open, no taller than what is left above it.
  // On the chat page (`fill`), the page's header, its tabs and their gaps (`CHAT_PAGE_CHROME`) are all there is above and under it.
  const tall = viewport !== null ? `${Math.round(viewport)}px` : "100dvh";
  const height = fill ? `max(20rem, ${tall} - ${CHAT_PAGE_CHROME})` : `min(44rem, max(20rem, ${tall} - 9rem))`;

  return (
    <section aria-label={name ? `${name} conversation` : "Conversation"} data-slot="chat-conversation" className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card" style={{ height }}>
      <header className="flex min-w-0 items-center gap-2 border-b border-border p-2">
        {onBack && (
          <Button size="icon" variant="ghost" aria-label="Back to the conversations" onClick={onBack}>
            <Icon name="chevron-left" size="sm" />
          </Button>
        )}
        {c ? (
          <button
            type="button"
            disabled={!onOpenTitle || c.kind === "world"}
            onClick={onOpenTitle}
            className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg px-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {c.kind === "world" && <Icon name="users" size="sm" className="text-primary" />}
            {c.kind === "guild" && <Icon name="shield-halved" size="sm" className="text-primary" />}
            {c.kind === "private" && c.other ? (
              <PlayerName name={c.other.name} address={c.other.address} className="min-w-0 font-semibold" />
            ) : (
              <span title={name} className="min-w-0 truncate font-semibold">
                {name}
              </span>
            )}
            {c.kind === "guild" && c.guild && <span className="numeric shrink-0 text-xs text-muted-foreground">{c.guild.tag}</span>}
          </button>
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
      {encryption && (
        <div className="border-b border-border">
          <EncryptionLine mode={encryption.mode} otherName={name} onOpen={isPrivate ? () => setEncryptionOpen(true) : undefined} />
        </div>
      )}

      {head?.pinned && (
        <div data-slot="chat-pinned" className="flex min-w-0 gap-2 border-b border-border bg-secondary/40 px-3 py-2 text-sm">
          <Icon name="scroll" size="xs" className="mt-1 shrink-0 text-primary" label="Pinned announcement" />
          <div className="flex min-w-0 flex-col">
            <span className="text-xs text-muted-foreground">
              <span className="font-semibold">{head.pinned.authorName ?? shortAddress(head.pinned.author)}</span> · <span className="numeric">{messageTime(head.pinned.at, now, timeZone)}</span>
            </span>
            <ScrollRegion className="max-h-20">
              <p className="whitespace-pre-wrap wrap-break-word">{head.pinned.text}</p>
            </ScrollRegion>
          </div>
        </div>
      )}

      <div className="relative min-h-0 flex-1">
        <ScrollRegion ref={scroller} onScroll={onScroll} role="log" aria-label="Messages" aria-busy={head === undefined || loadingOlder} className="size-full overscroll-contain px-1 py-2 [overflow-anchor:none]">
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
                <Skeleton key={i} className="h-12 rounded-xl" />
              ))}
            </div>
          )}
          {head === null && <p className="px-4 py-8 text-center text-sm text-muted-foreground">This conversation is not there any more.</p>}
          {encryption?.joinedAt != null && !hasOlder && <JoinerLine />}
          {head && messages.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted-foreground">No messages yet: say hello.</p>}
          {messages.length > 0 && (
            <ul className="flex flex-col gap-0.5">
              {messages.map((msg, i) => [
                ...keyChangeRows(i),
                <MessageRow
                  key={msg.id}
                  message={msg}
                  now={now}
                  timeZone={timeZone}
                  showTag={c?.kind === "world"}
                  mayMute={c?.kind !== "private"}
                  arrived={baseline !== null && msg.at > baseline}
                  onOpenPlayer={onOpenPlayer}
                  onDelete={(x) => actions.ask({ title: "Delete this message?", text: x.mine ? "Everyone sees “Message deleted” in its place." : `${authorName(x)}'s message shows “Message deleted” for everyone.`, confirm: "Delete", destructive: true }, () => ({ type: "delete", id: x.id }))}
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

      <div className="flex flex-col gap-2 border-t border-border p-2">
        <InlineError title="Chat" message={error ?? actions.error} detail={error ? errorDetail : undefined} action={error && onRetry ? <Button size="sm" variant="secondary" onClick={onRetry}>Try again</Button> : undefined} />
        {c?.kind === "private" && !noticeSeen && (
          <Notice tone="warning" icon="lock" action={onSeeNotice && <Button size="sm" variant="secondary" onClick={onSeeNotice}>Got it</Button>}>
            {PRIVATE_NOTICE}
          </Notice>
        )}
        {request && c?.other && (
          <div data-slot="chat-request" className="flex flex-col gap-2 rounded-lg border border-border bg-secondary/40 p-2">
            <p className="text-sm">
              <PlayerName name={c.other.name} address={c.other.address} className="font-semibold whitespace-normal wrap-anywhere" /> wants to message you. Reply or accept to let them write to you; decline and they cannot write again.
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button size="sm" variant="outline" loading={answering === false} disabled={answering !== null} onClick={() => answer(false)}>
                Decline
              </Button>
              <Button size="sm" loading={answering === true} disabled={answering !== null} onClick={() => answer(true)}>
                Accept
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
            <form className="flex min-w-0 items-end gap-2" onSubmit={send}>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <input
                  ref={field}
                  type="text"
                  aria-label={`Message ${name}`}
                  placeholder={c?.kind === "world" ? "Message the World" : "Message"}
                  enterKeyHint="send"
                  autoComplete="off"
                  value={draft}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    if (sendError) setSendError(null);
                  }}
                  className="min-h-11 w-full min-w-0 rounded-lg border border-input bg-secondary/60 px-3 py-2 text-base outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring tablet:text-sm"
                />
                <span aria-live="polite" className={cn("numeric self-end text-xs", tooLong ? "text-warning" : "text-muted-foreground")}>
                  {formatInteger(length)}/{formatInteger(CHAT_MESSAGE_MAX)}
                </span>
              </div>
              <Button type="submit" className="mb-5 shrink-0" loading={sending} disabled={draft.trim() === "" || tooLong || wait > 0} aria-label={wait > 0 ? `Send, in ${formatInteger(wait)} s` : "Send"}>
                {wait > 0 ? <span className="numeric">{formatInteger(wait)} s</span> : "Send"}
              </Button>
            </form>
          )
        )}
        <InlineError title="Send" message={sendError} />
      </div>
      <ReportDialog message={reporting} encrypted={encrypted} onCancel={() => setReporting(null)} onReport={(reason) => onAction?.({ type: "report", id: reporting!.id, reason }) ?? Promise.resolve()} />
      {isPrivate && encryption && <EncryptionSheet open={encryptionOpen} onOpenChange={setEncryptionOpen} otherName={name} safetyCode={encryption.safetyCode} />}
      {actions.dialog}
    </section>
  );
}
