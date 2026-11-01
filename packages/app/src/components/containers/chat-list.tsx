import { useState } from "react";
import { formatAgo, formatInteger, type ConversationId } from "@paved/game-core";
import type { ChatMessage, ChatOverview, ConversationSummary, PublicProfile } from "../../data/social-source";
import { conversationName } from "../../lib/chat-text";
import { logLine } from "../../lib/guild-text";
import { useSidePanel } from "../../lib/side-panel";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { ScrollRegion } from "../ui/scroll-region";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../ui/sheet";
import { Skeleton } from "../ui/skeleton";
import { GuildEmblem } from "../elements/guild-emblem";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { PlayerAvatar } from "../elements/player-avatar";
import { PlayerName } from "../elements/player-name";
import { shortAddress } from "../elements/short-address";

/** The side panel from `desktop`; the bottom sheet under it. */
const DESKTOP_QUERY = "(min-width: 64rem)";

/** A count on a row or a button: "99+" past 99. */
const countText = (n: number): string => (n > 99 ? "99+" : formatInteger(n));

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

/** One conversation of the Chat tab: its picture, its name, its last line and when, and its unread count. A tap opens it. */
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
  /** The players the player mutes, the latest first; null while read. */
  mutes?: readonly PublicProfile[] | null;
  onUnmute?: (address: string) => Promise<unknown> | void;
  onOpenPlayer?: (address: string) => void;
  /** Where the muted players' sheet starts: open for its story. */
  initialMutedOpen?: boolean;
}

/**
 * The chat page's list (#955; the Social page's Chat tab until #973): the World, the guild's conversation (none for a player in no guild), then the private ones
 * by their last message, each with its unread count; the requests from strangers, waiting to be opened, accepted or declined;
 * and the page's menu, the muted players, with Unmute.
 */
export function ChatList({ overview, error, errorDetail, onRetry, now, onOpen, mutes = null, onUnmute, onOpenPlayer, initialMutedOpen = false }: ChatListProps) {
  const [mutedOpen, setMutedOpen] = useState(initialMutedOpen);
  const requests = overview?.requests ?? [];
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
      <section aria-label="Conversations" className="flex flex-col gap-2">
        {overview === null && !error && (
          <div aria-busy className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        )}
        {overview && (
          <ul className="flex flex-col gap-2">
            {overview.conversations.map((c) => (
              <li key={c.id}>
                <ChatRow conversation={c} now={now} onOpen={onOpen} />
              </li>
            ))}
          </ul>
        )}
        {overview && !overview.conversations.some((c) => c.kind === "private") && <p className="text-sm text-muted-foreground">No private messages yet. Open a friend's profile and tap Message.</p>}
      </section>
      <Button variant="outline" className="self-center" onClick={() => setMutedOpen(true)}>
        <Icon name="volume-xmark" size="xs" />
        Muted players{mutes && mutes.length > 0 && <span className="numeric">({formatInteger(mutes.length)})</span>}
      </Button>
      <MutedSheet open={mutedOpen} onOpenChange={setMutedOpen} mutes={mutes} onUnmute={onUnmute} onOpenPlayer={onOpenPlayer} />
    </div>
  );
}

interface MutedSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mutes: readonly PublicProfile[] | null;
  onUnmute?: (address: string) => Promise<unknown> | void;
  onOpenPlayer?: (address: string) => void;
}

/** The Chat tab's menu: the muted players, each with Unmute. A mute is the player's own: the muted player is not told. */
function MutedSheet({ open, onOpenChange, mutes, onUnmute, onOpenPlayer }: MutedSheetProps) {
  const desktop = useSidePanel(DESKTOP_QUERY);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const unmute = (address: string) => {
    setBusy(address);
    setError(null);
    void Promise.resolve(onUnmute?.(address))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Something went wrong."))
      .finally(() => setBusy(null));
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={desktop ? "right" : "bottom"} data-slot="muted-players" className="max-h-[92dvh]">
        <SheetHeader>
          <SheetTitle>Muted players</SheetTitle>
          <SheetDescription>Their messages are hidden from you in the World and in your guild. They are not told.</SheetDescription>
        </SheetHeader>
        <ScrollRegion className="-mx-6 min-h-0 px-6">
          {mutes === null && <Skeleton aria-busy className="h-16 rounded-xl" />}
          {mutes?.length === 0 && <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">You mute no one. Mute a player from one of their messages.</p>}
          {mutes && mutes.length > 0 && (
            <ul className="flex flex-col gap-2">
              {mutes.map((p) => (
                <li key={p.address} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border bg-card p-2 pr-3">
                  <button
                    type="button"
                    aria-label={p.name ?? p.address}
                    onClick={() => onOpenPlayer?.(p.address)}
                    className="state-layer flex min-h-12 min-w-0 flex-[1_1_10rem] items-center gap-3 rounded-lg px-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <PlayerAvatar player={{ name: p.name, address: p.address }} look={p.look} />
                    <PlayerName name={p.name} address={p.address} className="min-w-0 font-semibold" />
                  </button>
                  <Button size="sm" variant="outline" className="ml-auto" aria-label={`Unmute ${p.name ?? "this player"}`} loading={busy === p.address} disabled={busy !== null} onClick={() => unmute(p.address)}>
                    <Icon name="volume-high" size="xs" />
                    Unmute
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <InlineError title="Unmute" message={error} className="mt-2" />
        </ScrollRegion>
      </SheetContent>
    </Sheet>
  );
}
