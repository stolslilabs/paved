import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { privateConversation } from "@paved/game-core";
import { FriendsPanel, type FriendsList } from "../../components/containers/friends-panel";
import { SocialEmpty, SocialUnavailable } from "../../components/containers/social-empty";
import { useGuildBadges } from "../../data/guilds";
import { addressKey } from "../../data/keys";
import { useFollowActions, useFollowLists, useFollowSuggestions, type FollowLists } from "../../data/social";
import { useDataSources } from "../../data/sources";
import { useAccount } from "../../wallet/wallet";
import { errorDetail } from "../error-detail";
import { useNow } from "../now";
import { useOpenChat } from "../open-chat";
import { useOpenPlayer } from "../open-player";

// The friends page's lists (#954; the Social page's Friends tab until #973): the player's friends, following and followers, the suggestions and the
// blocked players, on the social source's follows (the mock's ledger today, a service later, #956).

/** The lists with the followers marked new while the page is shown: seen once on screen, they keep their mark until the page goes. */
function withMarks(lists: FollowLists, marked: ReadonlySet<string>): FollowLists {
  if (marked.size === 0) return lists;
  return { ...lists, followers: lists.followers.map((r) => (r.isNew || !marked.has(addressKey(r.profile.address)) ? r : { ...r, isNew: true })) };
}

export function FriendsContent() {
  const wallet = useAccount();
  const me = useDataSources().signer?.address ?? wallet.address ?? null;
  const now = useNow();
  const lists = useFollowLists(me);
  const suggestions = useFollowSuggestions(me);
  const actions = useFollowActions(me);
  const openPlayer = useOpenPlayer();
  const openChat = useOpenChat();
  const [list, setList] = useState<FriendsList>("friends");

  // The new followers on screen keep their New mark while the page is shown. Seeing them at the source (the badges go) marks
  // every follower seen, so it waits until every new one has been on screen (the panel lists them first).
  const [onScreen, setOnScreen] = useState<ReadonlySet<string>>(() => new Set());
  const onFollowersShown = useCallback((addresses: readonly string[]) => setOnScreen(new Set(addresses.map(addressKey))), []);
  const [marked, setMarked] = useState<ReadonlySet<string>>(() => new Set());
  const unseen = lists.data?.followers.filter((r) => r.isNew).map((r) => addressKey(r.profile.address)) ?? [];
  const fresh = list === "followers" ? unseen.filter((k) => onScreen.has(k)) : [];
  if (fresh.some((k) => !marked.has(k))) setMarked(new Set([...marked, ...fresh]));
  // Once for each batch of new followers all shown: the write's own state changes `actions`, which must not send it again.
  const toSee = list === "followers" && unseen.length > 0 && fresh.length === unseen.length && actions !== null;
  const seeing = useRef(false);
  useEffect(() => {
    if (!toSee) {
      seeing.current = false;
      return;
    }
    if (seeing.current || !actions) return;
    seeing.current = true;
    void actions.seeFollowers().catch(() => undefined);
  }, [toSee, actions]);

  const shown = useMemo(() => (lists.data ? withMarks(lists.data, marked) : null), [lists.data, marked]);
  // The guild of each player on screen (#953): the lists and the suggestions.
  const addresses = useMemo(() => {
    const all = [...(shown?.[list] ?? []).map((r) => r.profile.address), ...(suggestions.data ?? []).map((p) => p.address)];
    return [...new Map(all.map((a) => [addressKey(a), a])).values()];
  }, [shown, list, suggestions.data]);
  const guildOf = useGuildBadges(addresses);

  if (lists.unavailable) return <SocialUnavailable>Follows are not on this network yet.</SocialUnavailable>;
  if (me === null) return <SocialEmpty page="friends" />;
  return (
    <FriendsPanel
      lists={shown}
      error={lists.error?.message ?? null}
      errorDetail={lists.error ? errorDetail(lists.error) : undefined}
      onRetry={lists.refetch}
      suggestions={suggestions.data ?? (suggestions.error ? [] : null)}
      list={list}
      onListChange={setList}
      now={now}
      guildOf={guildOf}
      onOpenPlayer={openPlayer}
      onMessage={me ? (address) => openChat(privateConversation(me, address)) : undefined}
      onAction={(action, address) => actions?.run(action, address)}
      onFollowersShown={onFollowersShown}
    />
  );
}
