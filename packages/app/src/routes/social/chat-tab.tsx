import { useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import type { ConversationId } from "@paved/game-core";
import { ChatConversation, type ChatMessageAction } from "../../components/containers/chat-conversation";
import { ChatList } from "../../components/containers/chat-list";
import { SocialEmptyTab } from "../../components/containers/social-tabs";
import { chatKeys, useChatMutes, useChatOverview, useChatWrites, useConversation, type ChatWrites } from "../../data/chat";
import { useDataSources } from "../../data/sources";
import { useAccount } from "../../wallet/wallet";
import { CHAT_PARAM, chatParamOf, type ChatSheetState } from "../chat-param";
import { errorDetail } from "../error-detail";
import { useNow } from "../now";
import { useOpenGuild } from "../open-guild";
import { useOpenPlayer } from "../open-player";

// The Social page's Chat tab (#955), its own chunk: the conversations and the requests, and one conversation at `?chat=<id>`,
// on the social source's chat part (the mock's ledger today, a service later, #956).

/** A message's menu as a write of the source. */
const actionWrite = (id: ConversationId, a: ChatMessageAction) => (writes: ChatWrites) =>
  writes.run((c, p) => (a.type === "delete" ? c.deleteMessage(p, id, a.id) : a.type === "report" ? c.report(p, id, a.id, a.reason) : c.mute(p, a.address)));

interface ConversationViewProps {
  me: string;
  id: ConversationId;
  now: number;
  noticeSeen: boolean;
  onBack: () => void;
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
        if (!accept) onBack();
      }}
    />
  );
}

export default function ChatTab() {
  const wallet = useAccount();
  const me = useDataSources().signer?.address ?? wallet.address ?? null;
  const now = useNow();
  const overview = useChatOverview(me);
  const mutes = useChatMutes(me);
  const writes = useChatWrites(me);
  const openPlayer = useOpenPlayer();

  // The first visit to the tab: on the mock, a stranger's request comes a little later.
  const { run, unavailable } = writes;
  useEffect(() => {
    if (!unavailable) void run((c, p) => c.visitChat(p)).catch(() => undefined);
  }, [unavailable, run]);

  // The conversation open, at `?chat=`: a new history entry from the list, so Back closes it.
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const open = chatParamOf(params.get(CHAT_PARAM));
  const openChat = useCallback(
    (id: ConversationId) =>
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.set(CHAT_PARAM, id);
          return next;
        },
        { state: { chatSheet: true } satisfies ChatSheetState, preventScrollReset: true },
      ),
    [setParams],
  );
  const closeChat = useCallback(() => {
    if ((location.state as ChatSheetState | null)?.chatSheet) return void navigate(-1);
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete(CHAT_PARAM);
        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  }, [location.state, navigate, setParams]);

  if (overview.unavailable) return <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">Messages are not on this network yet.</p>;
  if (me === null) return <SocialEmptyTab tab="chat" />;
  if (open !== null) return <ConversationView key={open} me={me} id={open} now={now} noticeSeen={overview.data?.noticeSeen ?? true} onBack={closeChat} />;
  return (
    <ChatList
      overview={overview.data ?? null}
      error={overview.error?.message ?? null}
      errorDetail={overview.error ? errorDetail(overview.error) : undefined}
      onRetry={overview.refetch}
      now={now}
      onOpen={openChat}
      mutes={mutes.data ?? null}
      onUnmute={(address) => writes.run((c, p) => c.unmute(p, address))}
      onOpenPlayer={openPlayer}
    />
  );
}
