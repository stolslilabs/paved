import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import type { ConversationId } from "@paved/game-core";
import { useEffect, useMemo } from "react";
import { addressKey } from "./keys";
import type { SocialRead } from "./social";
import { ChatRefusedError, type ChatEvent, type ChatMessage, type ChatOverview, type ChatPage, type ChatSource, type ChatWriteRefusal, type PublicProfile } from "./social-source";
import { useDataSources } from "./sources";

// The messages' hooks (#955): the Chat tab's overview, one conversation, the mutes, and the writes, read from the social source's
// chat part (`social.chat`: the mock's ledger today, a service later, #956). Without one each read answers `unavailable`, with
// no data and no error. Nothing polls: a conversation is read once, then kept up to date by subscribing to it (the source's
// `subscribe`, which a socket can serve, #956); the overview is read again when anything comes to the player. The Chat tab's
// chunk carries them, not the home's.

export type { ChatAuthor, ChatEvent, ChatMessage, ChatOverview, ChatPage, ChatPageHead, ChatSource, ChatWriteRefusal, ConversationSummary } from "./social-source";
export { ChatRefusedError } from "./social-source";

/** The keys of the chat reads: under the social domain, `[social, chat, player, read, ...args]`. */
export const chatKeys = {
  /** Everything of the chat as `player` sees it: what a write of theirs makes stale. */
  all: (player: string) => ["social", "chat", addressKey(player)] as const,
  overview: (player: string) => ["social", "chat", addressKey(player), "overview"] as const,
  conversation: (player: string, id: ConversationId) => ["social", "chat", addressKey(player), "conversation", id] as const,
  mutes: (player: string) => ["social", "chat", addressKey(player), "mutes"] as const,
};

const UNAVAILABLE = { data: undefined, isPending: false, error: null, unavailable: true, refetch: () => undefined } as const;

const chatOf = (social: { chat?: ChatSource } | null | undefined): ChatSource | null => social?.chat ?? null;

/**
 * The Chat tab (#955): the conversations, the requests, the badge and the notice; disabled without a player. Read again whenever
 * a message comes to any conversation of the player (the source's subscription), so the badge follows.
 */
export function useChatOverview(me: string | null): SocialRead<ChatOverview> {
  const { social } = useDataSources();
  const chat = chatOf(social);
  const client = useQueryClient();
  const query = useQuery({ queryKey: chatKeys.overview(me ?? "0x0"), queryFn: () => chat!.overview(me!), enabled: me !== null && chat !== null, staleTime: 0 });
  useEffect(() => {
    if (!chat || me === null) return;
    return chat.subscribe(me, null, () => void client.invalidateQueries({ queryKey: chatKeys.overview(me) }));
  }, [chat, me, client]);
  if (!chat) return UNAVAILABLE;
  return { data: query.data, isPending: me !== null && query.isPending && !query.error, error: query.error, unavailable: false, refetch: () => void query.refetch() };
}

/** The pages of a conversation as the cache keeps them: the latest first, each older one after it. */
type ConversationPages = InfiniteData<ChatPage | null, string | null>;

/**
 * The pages with one event of the subscription applied: a new message at the end of the latest page, a deletion where it is, and
 * the conversation's head as the event gives it (the standing, whether it awaits a reply, the write refusal, the rate limit, the
 * summary) on the latest page, so that the page shown stays true without another read.
 */
export function applyChatEvent(data: ConversationPages | undefined, event: ChatEvent): ConversationPages | undefined {
  if (!data || data.pages.length === 0 || data.pages[0] === null) return data;
  const [latest, ...older] = data.pages as [ChatPage, ...(ChatPage | null)[]];
  if (event.type === "deleted") {
    const gone = (p: ChatPage): ChatPage => ({ ...p, messages: p.messages.map((m) => (m.id === event.id ? { ...m, deleted: true, text: "", mayDelete: false, mayReport: false } : m)) });
    return { ...data, pages: [{ ...gone(latest), ...event.head }, ...older.map((p) => p && gone(p))] };
  }
  const message = event.message;
  const known = data.pages.some((p) => p?.messages.some((m) => m.id === message.id));
  return { ...data, pages: [{ ...latest, ...event.head, messages: known ? latest.messages : [...latest.messages, message] }, ...older] };
}

/** One conversation as the page shows it. */
export interface ConversationRead extends SocialRead<ChatPage | null> {
  /** Every message read, oldest first: the older pages loaded, then the latest one, then those that came since. */
  messages: readonly ChatMessage[];
  /** There are older messages to load (on scrolling up). */
  hasOlder: boolean;
  /** Loads the page before the oldest shown. */
  loadOlder: () => void;
  isLoadingOlder: boolean;
}

/**
 * One conversation (#955): its latest messages, the older ones on `loadOlder`, and what comes after, heard by subscribing to it
 * while shown (the source's `subscribe`). `data` is its latest page's head (the pinned announcement, the standing, the write
 * refusal, the rate limit), or null when the player may not read it. Disabled without a player or an ID.
 */
export function useConversation(me: string | null, id: ConversationId | null): ConversationRead {
  const { social } = useDataSources();
  const chat = chatOf(social);
  const client = useQueryClient();
  const enabled = me !== null && id !== null && chat !== null;
  const key = chatKeys.conversation(me ?? "0x0", id ?? "");
  const query = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => chat!.conversation(me!, id!, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page?.before ?? undefined,
    enabled,
    staleTime: 0,
  });
  useEffect(() => {
    if (!chat || me === null || id === null) return;
    const queryKey = chatKeys.conversation(me, id);
    return chat.subscribe(me, id, (event) => client.setQueryData<ConversationPages>(queryKey, (data) => applyChatEvent(data, event)));
  }, [chat, me, id, client]);
  const pages = query.data?.pages;
  const messages = useMemo(() => (pages ? [...pages].reverse().flatMap((p) => p?.messages ?? []) : []), [pages]);
  if (!chat) return { ...UNAVAILABLE, messages: [], hasOlder: false, loadOlder: () => undefined, isLoadingOlder: false };
  return {
    data: pages ? (pages[0] ?? null) : undefined,
    isPending: me !== null && id !== null && query.isPending && !query.error,
    error: query.error,
    unavailable: false,
    refetch: () => void query.refetch(),
    messages,
    hasOlder: query.hasNextPage,
    loadOlder: () => void query.fetchNextPage(),
    isLoadingOlder: query.isFetchingNextPage,
  };
}

/** The players the connected player mutes, the latest first; disabled without a player. */
export function useChatMutes(me: string | null): SocialRead<readonly PublicProfile[]> {
  const { social } = useDataSources();
  const chat = chatOf(social);
  const query = useQuery({ queryKey: chatKeys.mutes(me ?? "0x0"), queryFn: () => chat!.mutes(me!), enabled: me !== null && chat !== null, staleTime: 0 });
  if (!chat) return UNAVAILABLE;
  return { data: query.data, isPending: me !== null && query.isPending && !query.error, error: query.error, unavailable: false, refetch: () => void query.refetch() };
}

/** Why a chat write was refused (game-core's reason, or `unknown-player`), or null for another error or none. */
export const chatRefusal = (error: unknown): ChatWriteRefusal | null => (error instanceof ChatRefusedError ? error.reason : null);

/** A chat write for the connected player: one of `ChatSource`'s writes, the player passed for it. */
export type ChatWriteRun = (chat: ChatSource, player: string) => Promise<unknown>;

/** The chat writes' state: `run` one, its wait, its error and refusal; `unavailable` without a chat part or a player. */
export interface ChatWrites {
  run: (write: ChatWriteRun) => Promise<unknown>;
  isPending: boolean;
  error: Error | null;
  refusal: ChatWriteRefusal | null;
  /** When a rate limit lets the player write again (seconds), after a `too-fast` or `per-minute` refusal; else null. */
  retryAt: number | null;
  reset: () => void;
  unavailable: boolean;
}

/**
 * The chat writes of the connected player: `run((c, me) => c.send(me, id, text))`. Each one, done or refused, makes every chat
 * read of the player stale (`chatKeys.all`), so the pages read what the write left; a refusal is also kept as `refusal`.
 */
export function useChatWrites(me: string | null): ChatWrites {
  const { social } = useDataSources();
  const chat = chatOf(social);
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (write: ChatWriteRun) => (chat && me ? write(chat, me) : Promise.reject(new Error("No chat source or player"))),
    onSettled: () => client.invalidateQueries({ queryKey: chatKeys.all(me ?? "0x0") }),
  });
  const error = mutation.error;
  return {
    run: mutation.mutateAsync,
    isPending: mutation.isPending,
    error,
    refusal: chatRefusal(error),
    retryAt: error instanceof ChatRefusedError ? error.retryAt : null,
    reset: mutation.reset,
    unavailable: !chat || me === null,
  };
}
