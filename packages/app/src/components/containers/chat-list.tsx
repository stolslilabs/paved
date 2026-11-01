import { formatAgo, formatInteger, type ConversationId } from "@paved/game-core";
import type { ChatMessage, ChatOverview, ConversationSummary } from "../../data/social-source";
import { conversationName } from "../../lib/chat-text";
import { logLine } from "../../lib/guild-text";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Skeleton } from "../ui/skeleton";
import { GuildEmblem } from "../elements/guild-emblem";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { PlayerAvatar } from "../elements/player-avatar";
import { PlayerName } from "../elements/player-name";
import { shortAddress } from "../elements/short-address";

/** A count on a row, a tab or a button: "99+" past 99. */
export const countText = (n: number): string => (n > 99 ? "99+" : formatInteger(n));

/** What a row says of a conversation's last line: who, then what (a deletion, an event of the guild's log). */
function lastLine(m: ChatMessage | null): string {
  if (!m) return "No messages yet.";
  if (m.kind === "event" && m.event) return logLine(m.event);
  const who = m.mine ? "You" : (m.author?.name ?? shortAddress(m.author?.address ?? ""));
  return `${who}: ${m.deleted ? "Message deleted" : m.text}`;
}

/** A conversation's picture: the World's globe, the guild's emblem, or the other player's avatar. */
function ConversationMark({ c }: { c: ConversationSummary }) {
  if (c.kind === "world") return <span className="grid size-11 shrink-0 place-items-center rounded-full border border-border bg-secondary text-primary"><Icon name="users" size="md" /></span>;
  if (c.kind === "guild" && c.guild) return <span className="grid size-11 shrink-0 place-items-center"><GuildEmblem emblem={c.guild.emblem} size="sm" /></span>;
  return <PlayerAvatar player={c.other ? { name: c.other.name, address: c.other.address } : null} look={c.other?.look ?? null} />;
}

export interface ChatRowProps {
  conversation: ConversationSummary;
  now: number;
  onOpen?: (id: ConversationId) => void;
}

/** One conversation of the chat page's Private tab (#973; of the Chat tab, #955, before): its picture, its name, its last line and when, and its unread count. A tap opens it. */
export function ChatRow({ conversation: c, now, onOpen }: ChatRowProps) {
  const name = conversationName(c, shortAddress);
  const line = lastLine(c.last);
  // The World counts its unread, never badged (#955): a quiet count, not the gold one.
  const quiet = c.kind === "world";
  return (
    <button
      type="button"
      data-slot="chat-row"
      aria-label={`${name}${c.unread > 0 ? `, ${formatInteger(c.unread)} unread` : ""}`}
      onClick={() => onOpen?.(c.id)}
      className="state-layer flex min-h-16 w-full min-w-0 items-center gap-3 rounded-xl border border-border bg-card p-2 pr-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ConversationMark c={c} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-baseline gap-2">
          {c.kind === "private" && c.other ? <PlayerName name={c.other.name} address={c.other.address} className="min-w-0 font-semibold" /> : <span className="min-w-0 truncate font-semibold" title={name}>{name}</span>}
          {c.kind === "guild" && c.guild && <span className="numeric shrink-0 text-xs text-muted-foreground">{c.guild.tag}</span>}
          {c.last && <span className="numeric ml-auto shrink-0 text-xs text-muted-foreground">{formatAgo(c.last.at - now)}</span>}
        </span>
        <span className="flex min-w-0 items-center gap-2">
          <span title={line} className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{line}</span>
          {c.unread > 0 && (
            <span aria-hidden className={quiet ? "numeric shrink-0 rounded-full bg-secondary px-1.5 text-xs leading-5 text-muted-foreground" : "numeric shrink-0 rounded-full bg-primary px-1.5 text-xs leading-5 font-semibold text-primary-foreground"}>
              {countText(c.unread)}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

export interface ChatListProps {
  /** The player's conversations and requests; null while read. */
  overview: ChatOverview | null;
  error?: string | null;
  errorDetail?: ErrorDetail;
  onRetry?: () => void;
  now: number;
  onOpen?: (id: ConversationId) => void;
  /** New message (#973): the friends, the guildmates, then the player search. */
  onNewMessage?: () => void;
}

/**
 * The chat page's Private tab (#973; the Chat tab's list of #955 before): New message, then the private conversations by their
 * last message, each with its unread count, then the requests from strangers, waiting to be opened, accepted or declined. A row
 * opens the conversation over the list. The World and the guild have tabs of their own.
 */
export function ChatList({ overview, error, errorDetail, onRetry, now, onOpen, onNewMessage }: ChatListProps) {
  const requests = overview?.requests ?? [];
  const privates = overview?.conversations.filter((c) => c.kind === "private") ?? [];
  return (
    <div data-slot="chat-list" className="flex flex-col gap-5">
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
        <Button className="self-stretch" onClick={onNewMessage}>
          <Icon name="pen" size="xs" />
          New message
        </Button>
      )}
      <section aria-label="Conversations" className="flex flex-col gap-2">
        {overview === null && !error && (
          <div aria-busy className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        )}
        {privates.length > 0 && (
          <ul className="flex flex-col gap-2">
            {privates.map((c) => (
              <li key={c.id}>
                <ChatRow conversation={c} now={now} onOpen={onOpen} />
              </li>
            ))}
          </ul>
        )}
        {overview && privates.length === 0 && (
          <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">No private messages yet. Tap New message, or Message on a friend's profile.</p>
        )}
      </section>
      {requests.length > 0 && (
        <section aria-label="Requests" className="flex flex-col gap-2">
          <h3 className="flex items-center gap-2 font-semibold">
            Requests
            <span className="numeric rounded-full bg-primary px-1.5 text-xs leading-5 font-semibold text-primary-foreground">{countText(requests.length)}</span>
          </h3>
          <p className="text-sm text-muted-foreground">Players you do not know yet. Open one to read it: replying or accepting lets them write to you.</p>
          <ul className="flex flex-col gap-2">
            {requests.map((c) => (
              <li key={c.id}>
                <ChatRow conversation={c} now={now} onOpen={onOpen} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
