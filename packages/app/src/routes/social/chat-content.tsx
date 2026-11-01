import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import { otherPlayer, privateConversation, WORLD_CONVERSATION, type ConversationId } from "@paved/game-core";
import { ChatConversation, type ChatMessageAction } from "../../components/containers/chat-conversation";
import { ChatList } from "../../components/containers/chat-list";
import { ChatMenu } from "../../components/containers/chat-menu";
import { ChatNewMessage } from "../../components/containers/chat-new-message";
import { ChatGuildless, type ChatBadges } from "../../components/containers/chat-tabs";
import { SocialEmpty, SocialUnavailable } from "../../components/containers/social-empty";
import { ChatScene } from "../../components/scenes/chat-scene";
import { Skeleton } from "../../components/ui/skeleton";
import { chatKeys, useChatMutes, useChatOverview, useChatWrites, useConversation, type ChatOverview, type ChatWrites } from "../../data/chat";
import { usePlayerGuild } from "../../data/guilds";
import { addressKey } from "../../data/keys";
import { useFollowLists, usePlayerSearch } from "../../data/social";
import { useDataSources } from "../../data/sources";
import type { Tab } from "../pages";
import { useAccount } from "../../wallet/wallet";
import { CHAT_PARAM, chatParamOf, chatPathOf, chatPlayerOf, chatTabOf, chatTabPath, privateChatPath, type ChatSheetState, type ChatTab } from "../chat-param";
import { chatTabStored, storeChatTab } from "../chat-tab";
import { errorDetail } from "../error-detail";
import { useNow } from "../now";
import { useOpenGuild } from "../open-guild";
import { useOpenPlayer } from "../open-player";
import { useAppNavigate } from "../ref";

// The chat page's content (#973; the Social page's Chat tab of #955 before): its three tabs, World, Guild and Private, named by
// the URL (`/chat/<tab>`, `/chat/private/<player>`, `chat-param.ts`), on the social source's chat part (the mock's ledger today, a
// service later, #956).

/** A message's menu as a write of the source. */
const actionWrite = (id: ConversationId, a: ChatMessageAction) => (writes: ChatWrites) =>
  writes.run((c, p) => (a.type === "delete" ? c.deleteMessage(p, id, a.id) : a.type === "report" ? c.report(p, id, a.id, a.reason) : c.mute(p, a.address)));

interface ConversationViewProps {
  me: string;
  id: ConversationId;
  now: number;
  noticeSeen: boolean;
  /** Back to the Private tab's list; none for the World's and the guild's, which are their tabs. */
  onBack?: () => void;
}

/** One conversation: read while shown (its subscription keeps it up to date), marked read as its messages come. */
function ConversationView({ me, id, now, noticeSeen, onBack }: ConversationViewProps) {
  const read = useConversation(me, id);
  const writes = useChatWrites(me);
  const chat = useDataSources().social?.chat ?? null;
  const client = useQueryClient();
  const openPlayer = useOpenPlayer();
  const openGuild = useOpenGuild();
  const head = read.data;

  // Read up to now whenever unread messages are on screen: the overview, and so the badges, follow.
  const unread = head?.conversation.unread ?? 0;
  const lastId = read.messages.at(-1)?.id ?? null;
  useEffect(() => {
    if (!chat || unread === 0) return;
    void chat
      .markRead(me, id)
      .then(() => client.invalidateQueries({ queryKey: chatKeys.overview(me) }))
      .catch(() => undefined);
  }, [chat, me, id, unread, lastId, client]);

  // The notice of the first private conversation shows once: seen when the player taps Got it, or leaves the conversation.
  const showsNotice = head?.conversation.kind === "private" && !noticeSeen;
  const { run } = writes;
  const seeNotice = useCallback(() => void run((c, p) => c.seeNotice(p)).catch(() => undefined), [run]);
  const leaving = useRef<(() => void) | null>(null);
  useEffect(() => {
    leaving.current = showsNotice ? seeNotice : null;
  }, [showsNotice, seeNotice]);
  useEffect(() => () => leaving.current?.(), []);

  const c = head?.conversation;
  return (
    <ChatConversation
      fill
      head={head}
      messages={read.messages}
      hasOlder={read.hasOlder}
      loadingOlder={read.isLoadingOlder}
      onLoadOlder={read.loadOlder}
      error={read.error?.message ?? null}
      errorDetail={read.error ? errorDetail(read.error) : undefined}
      onRetry={read.refetch}
      now={now}
      noticeSeen={noticeSeen}
      onSeeNotice={seeNotice}
      onBack={onBack}
      onOpenTitle={c?.kind === "private" && c.other ? () => openPlayer(c.other!.address) : c?.kind === "guild" && c.guild ? () => openGuild(c.guild!.id) : undefined}
      onOpenPlayer={openPlayer}
      onSend={(text) => writes.run((s, p) => s.send(p, id, text))}
      onAction={(a) => actionWrite(id, a)(writes)}
      onAnswer={async (accept) => {
        await writes.run((s, p) => s.answerRequest(p, id, accept));
        if (!accept) onBack?.();
      }}
    />
  );
}

/** The tabs' badges (#973): Guild, the guild's unread messages; Private, the private unread messages and the requests. */
export function chatBadges(overview: ChatOverview | undefined): ChatBadges {
  if (!overview) return { guild: 0, private: 0 };
  const guild = overview.conversations.find((c) => c.kind === "guild")?.unread ?? 0;
  const privates = overview.conversations.filter((c) => c.kind === "private").reduce((n, c) => n + c.unread, 0);
  return { guild, private: privates + overview.requests.length };
}

/** New message (#973): the friends, the guildmates, then the player search; picking a player opens the conversation. */
function NewMessage({ me, open, onOpenChange, onPick }: { me: string; open: boolean; onOpenChange: (open: boolean) => void; onPick: (address: string) => void }) {
  const lists = useFollowLists(me);
  const guild = usePlayerGuild(me);
  const [query, setQuery] = useState("");
  const search = usePlayerSearch(query, me);
  const mine = addressKey(me);
  const roster = guild.data === undefined ? null : guild.data.guild ? guild.data.guild.roster.map((m) => m.profile).filter((p) => addressKey(p.address) !== mine) : undefined;
  return (
    <ChatNewMessage
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setQuery("");
      }}
      friends={lists.data ? lists.data.friends.map((r) => r.profile) : lists.unavailable || lists.error ? [] : null}
      guildmates={guild.unavailable || guild.error ? undefined : roster}
      search={{
        query,
        onQueryChange: setQuery,
        results: search.data ?? null,
        error: search.error?.message ?? null,
        errorDetail: search.error ? errorDetail(search.error) : undefined,
        onRetry: search.refetch,
        unavailable: search.unavailable,
      }}
      onPick={onPick}
    />
  );
}

export interface ChatContentProps {
  /** Back, up to the village (BACK-RULE #783). */
  onBack?: () => void;
  onNavigate?: (tab: Tab) => void;
}

/**
 * The chat page (#973). `/chat` opens on the last tab used on this device, else on Guild for a member and on the World for anyone
 * else, and names it in the URL (in place of the entry). A tab change takes the entry's place too, so Back leaves the page; a
 * private conversation opened from the list is a new entry, so Back returns to the list. An old link to a conversation
 * (`?chat=<id>`) lands on its tab.
 */
export function ChatContent({ onBack, onNavigate }: ChatContentProps) {
  const wallet = useAccount();
  const me = useDataSources().signer?.address ?? wallet.address ?? null;
  const now = useNow();
  const overview = useChatOverview(me);
  const mutes = useChatMutes(me);
  const writes = useChatWrites(me);
  const openPlayer = useOpenPlayer();
  const go = useAppNavigate();
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const [searchParams] = useSearchParams();
  const [composing, setComposing] = useState(false);

  // The first visit to the chat: on the mock, a stranger's request comes a little later.
  const { run, unavailable } = writes;
  useEffect(() => {
    if (!unavailable) void run((c, p) => c.visitChat(p)).catch(() => undefined);
  }, [unavailable, run]);

  const data = overview.data;
  const guildConversation = data?.conversations.find((c) => c.kind === "guild") ?? null;
  // Whether the player is in a guild: unknown while the overview is read (a failed read opens on the World).
  const member = data ? guildConversation !== null : overview.error ? false : null;
  const player = params.player === undefined ? null : chatPlayerOf(params.player);
  const urlTab: ChatTab | null = params.player !== undefined ? "private" : chatTabOf(params.tab);
  const legacy = chatParamOf(searchParams.get(CHAT_PARAM));
  const opening = urlTab ?? chatTabStored() ?? (member === null ? null : member ? "guild" : "world");

  // The URL names the tab: an old conversation's link, `/chat` and a tab it does not know take the named one's path, the rest of
  // the query kept (a profile's `?player=`, the `?ref=`).
  const rest = new URLSearchParams(searchParams);
  rest.delete(CHAT_PARAM);
  const query = rest.toString() === "" ? "" : `?${rest}`;
  const target = me === null ? null : legacy !== null ? chatPathOf(legacy, me) : urlTab === null && opening !== null ? chatTabPath(opening) : params.player !== undefined && player === null ? chatTabPath("private") : null;
  useEffect(() => {
    if (target !== null) go(target + query, { replace: true, state: location.state });
  }, [target, query, go, location.state]);
  useEffect(() => {
    if (urlTab !== null) storeChatTab(urlTab);
  }, [urlTab]);

  const openConversation = useCallback(
    (id: ConversationId) => {
      const other = me === null ? null : otherPlayer(id, me);
      if (other !== null) go(privateChatPath(other), { state: { chatSheet: true } satisfies ChatSheetState });
    },
    [me, go],
  );
  const openPrivate = useCallback((address: string) => go(privateChatPath(address), { state: { chatSheet: true } satisfies ChatSheetState }), [go]);
  const closePrivate = useCallback(() => {
    if ((location.state as ChatSheetState | null)?.chatSheet) return void navigate(-1);
    go(chatTabPath("private"), { replace: true });
  }, [location.state, navigate, go]);

  if (overview.unavailable)
    return (
      <ChatScene onBack={onBack} onNavigate={onNavigate}>
        <SocialUnavailable>Messages are not on this network yet.</SocialUnavailable>
      </ChatScene>
    );
  if (me === null) return <ChatScene onBack={onBack} onNavigate={onNavigate} />;

  const tab = target !== null ? null : urlTab;
  const noticeSeen = data?.noticeSeen ?? true;
  let body = null;
  if (tab === "world") body = <ConversationView me={me} id={WORLD_CONVERSATION} now={now} noticeSeen={noticeSeen} />;
  else if (tab === "guild")
    body =
      member === null ? (
        <Skeleton aria-busy className="h-64 rounded-xl" />
      ) : guildConversation ? (
        <ConversationView key={guildConversation.id} me={me} id={guildConversation.id} now={now} noticeSeen={noticeSeen} />
      ) : (
        <ChatGuildless onFindGuild={() => go("/guild")} />
      );
  else if (tab === "private")
    body =
      player !== null ? (
        <ConversationView key={player} me={me} id={privateConversation(me, player)} now={now} noticeSeen={noticeSeen} onBack={closePrivate} />
      ) : (
        <>
          <ChatList
            overview={data ?? null}
            error={overview.error?.message ?? null}
            errorDetail={overview.error ? errorDetail(overview.error) : undefined}
            onRetry={overview.refetch}
            now={now}
            onOpen={openConversation}
            onNewMessage={() => setComposing(true)}
          />
          <NewMessage me={me} open={composing} onOpenChange={setComposing} onPick={openPrivate} />
        </>
      );

  return (
    <ChatScene
      tab={tab}
      onTabChange={(next) => go(chatTabPath(next), { replace: true })}
      badges={chatBadges(data)}
      menu={<ChatMenu mutes={mutes.data ?? null} onUnmute={(address) => writes.run((c, p) => c.unmute(p, address))} onOpenPlayer={openPlayer} />}
      onBack={onBack}
      onNavigate={onNavigate}
    >
      {body}
    </ChatScene>
  );
}
