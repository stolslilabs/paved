import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import { otherPlayer, privateConversation, WORLD_CONVERSATION, type ConversationId } from "@paved/game-core";
import { ChatConversation, type ChatMessageAction } from "../../components/containers/chat-conversation";
import { ChatList } from "../../components/containers/chat-list";
import { ChatMenu } from "../../components/containers/chat-menu";
import { ChatNewMessage } from "../../components/containers/chat-new-message";
import { ChatGuildless, type ChatBadges } from "../../components/containers/chat-tabs";
import { SocialUnavailable } from "../../components/containers/social-unavailable";
import { ChatScene } from "../../components/scenes/chat-scene";
import { Skeleton } from "../../components/ui/skeleton";
import { chatKeys, useChatMutes, useChatOverview, useChatWrites, useConversation, type ChatOverview, type ChatWrites } from "../../data/chat";
import { usePlayerGuild } from "../../data/guilds";
import { addressKey } from "../../data/keys";
import { useFollowLists, usePlayerSearch } from "../../data/social";
import { useDataSources } from "../../data/sources";
import { useAccount } from "../../wallet/wallet";
import { CHAT_PARAM, chatParamOf, chatPathOf, chatPlayerOf, chatTabOf, chatTabPath, mailPath, privateChatPath, type ChatSheetState, type ChatTab } from "../chat-param";
import { puzzleDayEnd } from "@paved/game-core";
import { MailSection, PrizeMail, type InboxMail } from "../../components/containers/inbox-mail";
import { GIFT_REVEAL_S } from "../../components/containers/milestones-bar";
import { puzzleMailDay, puzzleMailId, useClaimPuzzle, useHiddenMails, usePuzzlePrizes, usePuzzleVisit, type PuzzlePrize } from "../../data/puzzle";
import { chatErrorText } from "../../lib/chat-text";
import { chatTabStored, storeChatTab } from "../chat-tab";
import { errorDetail } from "../error-detail";
import { useNow } from "../now";
import { useOpenGuild } from "../open-guild";
import { useOpenPlayer } from "../open-player";
import { useAppNavigate } from "../ref";

// The chat page's content (#973; the Social page's Chat tab of #955 before): its three tabs, World, Guild and Private, named by
// the URL (`/chat/<tab>`, `/chat/private/<player>`, `chat-param.ts`), on the social source's chat part (the mock's ledger today, a
// service later, #956).

/** A message's menu as a write of the source (no Delete: the source's `deleteMessage` is not offered, CHAT-PAGE). */
const actionWrite = (id: ConversationId, a: ChatMessageAction) => (writes: ChatWrites) =>
  writes.run((c, p) => (a.type === "report" ? c.report(p, id, a.id, a.reason) : c.mute(p, a.address)));

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

  // The notice of the first private conversation shows once, before its first message (CHAT-PAGE, the owner's ask): seen when the
  // player taps Got it, or leaves a conversation where it showed (the first message hides it, the leaving still counts).
  const showsNotice = head?.conversation.kind === "private" && !noticeSeen && read.messages.length === 0;
  const { run } = writes;
  const seeNotice = useCallback(() => void run((c, p) => c.seeNotice(p)).catch(() => undefined), [run]);
  const leaving = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (noticeSeen) leaving.current = null;
    else if (showsNotice) leaving.current = seeNotice;
  }, [noticeSeen, showsNotice, seeNotice]);
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

/** The Inbox's badge with its mails' gifts waiting (the owner's asks of 2026-11-08): the DMs' unread, the requests and the prizes. */
export const withMail = (badges: ChatBadges, gifts: number): ChatBadges => ({ ...badges, private: badges.private + gifts });

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

/** One Puzzle prize's mail of the Inbox (the owner's asks of 2026-11-08): its gift claims it; its bin claims a waiting gift, then hides it. */
function PrizeMailView({ me, prize, claim, onHide, onBack }: { me: string; prize: PuzzlePrize; claim: ReturnType<typeof useClaimPuzzle>; onHide: () => void; onBack: () => void }) {
  const openPlayer = useOpenPlayer();
  const [deleting, setDeleting] = useState(false);
  const claiming = claim.isPending && (claim.variables?.includes(prize.day) ?? false);
  // A delete waits for the gift's opening (its claim landed): then the mail goes, back to the list.
  useEffect(() => {
    if (!deleting || !prize.claimed) return;
    const timer = setTimeout(() => {
      onHide();
      onBack();
    }, GIFT_REVEAL_S * 1000);
    return () => clearTimeout(timer);
  }, [deleting, prize.claimed, onHide, onBack]);
  return (
    <PrizeMail
      day={prize.day}
      score={prize.score}
      players={prize.players}
      top={prize.top}
      me={me}
      claimed={prize.claimed}
      claiming={claiming || (deleting && !prize.claimed)}
      error={claim.error && !claim.isPending ? chatErrorText(claim.error) : null}
      onClaim={() => claim.mutate([prize.day])}
      onDelete={() => {
        if (prize.claimed) {
          onHide();
          onBack();
          return;
        }
        setDeleting(true);
        claim.mutate([prize.day], { onError: () => setDeleting(false) });
      }}
      onBack={onBack}
      onOpenPlayer={openPlayer}
    />
  );
}

export interface ChatContentProps {
  /** Back, up to the village (BACK-RULE #783): the drawer's close. */
  onBack?: () => void;
  /** Whether the drawer is shown (CHAT-PAGE): false while it slides out. Omitted, shown. */
  open?: boolean;
  /** Where the focus goes back as the drawer closes (the home's Chat tab). */
  returnFocus?: () => HTMLElement | null;
}

/**
 * The chat page (#973). `/chat` opens on the last tab used on this device, else on Guild for a member and on the World for anyone
 * else, and names it in the URL (in place of the entry). A tab change takes the entry's place too, so Back leaves the page; a
 * private conversation opened from the list is a new entry, so Back returns to the list. An old link to a conversation
 * (`?chat=<id>`) lands on its tab.
 */
export function ChatContent({ onBack, open, returnFocus }: ChatContentProps) {
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
  // A mail of the Inbox (`/chat/mail/puzzle-<day>`), over the Private tab's list.
  const mailDay = puzzleMailDay(params.mail);
  const urlTab: ChatTab | null = params.player !== undefined || params.mail !== undefined ? "private" : chatTabOf(params.tab);
  const legacy = chatParamOf(searchParams.get(CHAT_PARAM));
  const opening = urlTab ?? chatTabStored() ?? (member === null ? null : member ? "guild" : "world");

  // The URL names the tab: an old conversation's link, `/chat` and a tab it does not know take the named one's path, the rest of
  // the query kept (a profile's `?player=`, the `?ref=`).
  const rest = new URLSearchParams(searchParams);
  rest.delete(CHAT_PARAM);
  const query = rest.toString() === "" ? "" : `?${rest}`;
  // The Inbox's mails (the owner's asks of 2026-11-08): the Puzzle's prizes the player won, but those they deleted on this device.
  usePuzzleVisit(me);
  const prizes = usePuzzlePrizes(me);
  const { hidden, hide } = useHiddenMails(me);
  const claim = useClaimPuzzle(me);
  const kept = (prizes.data ?? []).filter((p) => !hidden.has(puzzleMailId(p.day)));
  const mails: InboxMail[] = kept.map((p) => ({ id: puzzleMailId(p.day), day: p.day, at: puzzleDayEnd(p.day), claimed: p.claimed }));
  const waiting = kept.filter((p) => !p.claimed).map((p) => p.day);
  const mailPrize = mailDay === null ? null : (kept.find((p) => p.day === mailDay) ?? null);
  // A mail that is none (no such prize, or deleted) once the prizes are read: the Inbox's list.
  const lostMail = params.mail !== undefined && (mailDay === null || (prizes.data !== undefined && mailPrize === null));
  const target =
    me === null
      ? null
      : legacy !== null
        ? chatPathOf(legacy, me)
        : urlTab === null && opening !== null
          ? chatTabPath(opening)
          : (params.player !== undefined && player === null) || lostMail
            ? chatTabPath("private")
            : null;
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
  const openMail = useCallback((mail: InboxMail) => go(mailPath(mail.id), { state: { chatSheet: true } satisfies ChatSheetState }), [go]);
  const hideMail = useCallback(() => {
    if (mailDay !== null) hide(puzzleMailId(mailDay));
  }, [hide, mailDay]);

  const frame = { onBack, open, returnFocus };
  if (overview.unavailable)
    return (
      <ChatScene {...frame}>
        <SocialUnavailable>Messages are not on this network yet.</SocialUnavailable>
      </ChatScene>
    );
  // The account still read (NO-GUEST: every player has one): the chat's loading.
  if (me === null)
    return (
      <ChatScene {...frame}>
        <Skeleton aria-busy className="h-40 rounded-xl" />
      </ChatScene>
    );

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
      params.mail !== undefined ? (
        mailPrize ? (
          <PrizeMailView key={mailPrize.day} me={me} prize={mailPrize} claim={claim} onHide={hideMail} onBack={closePrivate} />
        ) : (
          <Skeleton aria-busy className="h-64 rounded-xl" />
        )
      ) : player !== null ? (
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
            onAnswer={(id, accept) => writes.run((c, p) => c.answerRequest(p, id, accept))}
            onNewMessage={() => setComposing(true)}
            mail={
              <MailSection
                mails={mails}
                now={now}
                claiming={claim.isPending}
                error={claim.error && !claim.isPending ? chatErrorText(claim.error) : null}
                onClaimAll={waiting.length > 0 ? () => claim.mutate(waiting) : undefined}
                onOpen={openMail}
              />
            }
          />
          <NewMessage me={me} open={composing} onOpenChange={setComposing} onPick={openPrivate} />
        </>
      );

  return (
    <ChatScene
      {...frame}
      tab={tab}
      onTabChange={(next) => go(chatTabPath(next), { replace: true })}
      badges={withMail(chatBadges(data), waiting.length)}
      menu={<ChatMenu mutes={mutes.data ?? null} onUnmute={(address) => writes.run((c, p) => c.unmute(p, address))} onOpenPlayer={openPlayer} />}
    >
      {body}
    </ChatScene>
  );
}
