import { useState } from "react";
import { formatInteger, type ConversationId } from "@paved/game-core";
import type { ChatMessage, ChatOverview, ConversationSummary } from "../../data/social-source";
import { UNREADABLE_MESSAGE, chatErrorText, conversationName } from "../../lib/chat-text";
import { logLine } from "../../lib/guild-text";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { ScrollRegion } from "../ui/scroll-region";
import { Skeleton } from "../ui/skeleton";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { LevelStar } from "../elements/level-star";
import { PlayerAvatar } from "../elements/player-avatar";
import { PlayerName } from "../elements/player-name";
import { SectionTitle } from "../elements/section-title";
import { shortAddress } from "../elements/short-address";
import { UiIcon } from "../elements/ui-icon";
import { GOLD_RAISED, chatLeague, messageTime } from "./chat-conversation";
import { LeaguePortrait } from "./league-control";

/** A count on a row, a tab or a button: "99+" past 99. */
export const countText = (n: number): string => (n > 99 ? "99+" : formatInteger(n));

/** A count waiting (the book's red square, the dock's badges'): the tabs' and the rows' unread. Decorative: the control's name says it. */
export function CountBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span aria-hidden data-slot="count-badge" className={cn("numeric grid h-5 min-w-5 shrink-0 place-items-center rounded-[0.3rem] bg-dock-badge px-1 text-xs leading-none font-bold text-foreground ring-2 ring-background", className)}>
      {countText(count)}
    </span>
  );
}

/** What a private row says of its conversation's last line: the player's own with "You: ", the other's as is (the row names them). */
function lastLine(m: ChatMessage | null): string {
  if (!m) return "No messages yet.";
  if (m.kind === "event" && m.event) return logLine(m.event);
  const text = m.deleted ? "Message deleted" : m.unreadable ? UNREADABLE_MESSAGE : m.text;
  return m.mine ? `You: ${text}` : text;
}

/** A private conversation's other player in their league's rim, or a guest's silhouette while they are unknown. */
function OtherPortrait({ c }: { c: ConversationSummary }) {
  if (!c.other) return <PlayerAvatar player={null} />;
  return <LeaguePortrait player={{ name: c.other.name, address: c.other.address }} look={c.other.look} league={chatLeague(c.other.league)} className="text-[3rem]" />;
}

/** The other player's name, then their level in the profile's blue star (no guild's tag: the name's profile has it). */
function OtherLine({ c, name }: { c: ConversationSummary; name: string }) {
  return (
    <span className="flex max-w-full min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
      {c.other ? <PlayerName name={c.other.name} address={c.other.address} className="text-outline min-w-0 text-base leading-snug font-bold" /> : <span className="text-outline min-w-0 truncate text-base leading-snug font-bold">{name}</span>}
      {c.other && <LevelStar level={c.other.level} />}
    </span>
  );
}

export interface ChatRowProps {
  conversation: ConversationSummary;
  now: number;
  /** The times' zone (the stories' fixed one); omitted, the viewer's. */
  timeZone?: string;
  onOpen?: (id: ConversationId) => void;
}

/**
 * One conversation of the chat page's Private tab (#973; CHAT-PAGE, the book's private rows): the other player in their league's
 * rim, their name and level, the last message's time; under them its last line in a bubble, and its unread count in a
 * red square. A tap opens it.
 */
export function ChatRow({ conversation: c, now, timeZone, onOpen }: ChatRowProps) {
  const name = conversationName(c, shortAddress);
  const line = lastLine(c.last);

  return (
    <button
      type="button"
      data-slot="chat-row"
      aria-label={`${name}${c.unread > 0 ? `, ${formatInteger(c.unread)} unread` : ""}`}
      onClick={() => onOpen?.(c.id)}
      className="state-layer flex min-h-18 w-full min-w-0 items-center gap-2.5 px-2.5 py-2.5 text-left outline-none"
    >
      <OtherPortrait c={c} />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <OtherLine c={c} name={name} />
        <span className="flex min-w-0 items-center gap-2">
          <span title={line} className="drawer-carved min-w-0 truncate rounded-lg px-2.5 py-1 text-sm font-semibold text-muted-foreground">
            {line}
          </span>
          {/* The time at the last line's end (the book's is at the name's): the name and its level keep the first line's room. */}
          {c.last && <span className="ml-auto shrink-0 pl-1 text-xs font-semibold text-muted-foreground tabular-nums">{messageTime(c.last.at, now, timeZone)}</span>}
          <CountBadge count={c.unread} className={c.last ? undefined : "ml-auto"} />
        </span>
      </span>
    </button>
  );
}

interface RequestRowProps {
  request: ConversationSummary;
  onOpen?: (id: ConversationId) => void;
  /** Accept (the conversation opens to them) or decline (it goes away); omitted, the row only opens it. */
  onAnswer?: (id: ConversationId, accept: boolean) => Promise<unknown>;
}

/**
 * A stranger's request (the book's): its sender in their league's rim, name and level, "Wants to chat" (what they wrote
 * stays for the conversation, opened by a tap), then the gold check to accept and the dark cross to decline.
 */
function RequestRow({ request: c, onOpen, onAnswer }: RequestRowProps) {
  const name = conversationName(c, shortAddress);
  const [answering, setAnswering] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const answer = (accept: boolean) => {
    if (!onAnswer) return;
    setAnswering(accept);
    setError(null);
    onAnswer(c.id, accept)
      .catch((e: unknown) => setError(chatErrorText(e)))
      .finally(() => setAnswering(null));
  };
  return (
    <div className="flex flex-col gap-1">
      <div className="flex min-w-0 items-center gap-1.5">
        <button
          type="button"
          data-slot="chat-request-row"
          aria-label={`${name}${c.unread > 0 ? `, ${formatInteger(c.unread)} unread` : ""}`}
          onClick={() => onOpen?.(c.id)}
          className="state-layer flex min-h-16 min-w-0 flex-1 items-center gap-2.5 rounded-xl p-1 text-left outline-none"
        >
          <OtherPortrait c={c} />
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <OtherLine c={c} name={name} />
            <span className="drawer-carved self-start rounded-lg px-2.5 py-1 text-sm font-semibold text-muted-foreground">Wants to chat</span>
          </span>
        </button>
        {onAnswer && (
          <>
            <Button aria-label={`Accept ${name}`} className="size-11 shrink-0 rounded-xl px-0" style={GOLD_RAISED} loading={answering === true} disabled={answering !== null} onClick={() => answer(true)}>
              <UiIcon name="check" px={28} className="drawer-icon size-7" />
            </Button>
            <Button aria-label={`Decline ${name}`} variant="secondary" className="drawer-raised size-11 shrink-0 rounded-xl px-0" loading={answering === false} disabled={answering !== null} onClick={() => answer(false)}>
              <UiIcon name="cross" px={24} className="drawer-icon size-6" />
            </Button>
          </>
        )}
      </div>
      <InlineError title="Request" message={error} />
    </div>
  );
}

export interface ChatListProps {
  /** The player's conversations and requests; null while read. */
  overview: ChatOverview | null;
  error?: string | null;
  errorDetail?: ErrorDetail;
  onRetry?: () => void;
  now: number;
  /** The times' zone (the stories' fixed one); omitted, the viewer's. */
  timeZone?: string;
  onOpen?: (id: ConversationId) => void;
  /** A request's check and cross: accept or decline it from the list. */
  onAnswer?: (id: ConversationId, accept: boolean) => Promise<unknown>;
  /** New message (#973): the friends, the guildmates, then the player search. */
  onNewMessage?: () => void;
}

/**
 * The chat page's Private tab (#973; CHAT-PAGE, the Paved UX Book's "chat-private"): in one carved panel that scrolls, New message at
 * its top right, then the requests from strangers under their title, each with its check and cross, then the private conversations
 * by their last message on a raised card, each with its unread count. A row opens the conversation over the list. The World and the
 * guild have tabs of their own.
 */
export function ChatList({ overview, error, errorDetail, onRetry, now, timeZone, onOpen, onAnswer, onNewMessage }: ChatListProps) {
  const requests = overview?.requests ?? [];
  const privates = overview?.conversations.filter((c) => c.kind === "private") ?? [];
  return (
    <div data-slot="chat-list" className="drawer-carved flex min-h-80 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl">
      <ScrollRegion className="flex min-h-0 flex-1 flex-col gap-3 overscroll-contain p-2.5">
        <InlineError
          title="Chat"
          message={error ?? null}
          detail={errorDetail}
          action={
            onRetry && (
              <Button size="sm" variant="secondary" onClick={onRetry}>
                Try again
              </Button>
            )
          }
        />
        {onNewMessage && (
          <Button className="text-outline h-11 shrink-0 self-end rounded-xl px-4 text-base font-bold text-foreground" style={GOLD_RAISED} onClick={onNewMessage}>
            New message
          </Button>
        )}
        {requests.length > 0 && (
          <section aria-label="Requests" className="flex shrink-0 flex-col gap-1.5">
            <SectionTitle>
              Requests <span className="font-sans font-bold">{formatInteger(requests.length)}</span>
            </SectionTitle>
            <ul className="flex flex-col gap-1">
              {requests.map((c) => (
                <li key={c.id}>
                  <RequestRow request={c} onOpen={onOpen} onAnswer={onAnswer} />
                </li>
              ))}
            </ul>
          </section>
        )}
        <section aria-label="Conversations" className="flex shrink-0 flex-col">
          {overview === null && !error && (
            <div aria-busy className="flex flex-col gap-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-18 rounded-xl" />
              ))}
            </div>
          )}
          {privates.length > 0 && (
            <ul className="drawer-raised flex flex-col divide-y divide-border overflow-hidden rounded-xl">
              {privates.map((c) => (
                <li key={c.id}>
                  <ChatRow conversation={c} now={now} timeZone={timeZone} onOpen={onOpen} />
                </li>
              ))}
            </ul>
          )}
          {overview && privates.length === 0 && (
            <p className="rounded-xl px-4 py-6 text-center text-sm font-semibold text-muted-foreground">No private messages yet. Tap New message, or Message on a friend's profile.</p>
          )}
        </section>
      </ScrollRegion>
    </div>
  );
}
