import { useNavigate, useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { PlayerScene } from "../../components/scenes/player-scene";
import { useCurrentDay } from "../../data/chain";
import { addressKey, queryKeys } from "../../data/keys";
import { useIndexedPlayerGames, useLeaderboardEntry, usePlayerProfile } from "../../data/indexer";
import { lagInfo, useIndexerLag } from "../../data/leaderboard";
import { useAccount } from "../../wallet/wallet";
import { useCanGoBack } from "../history";
import { useNow } from "../now";
import { useAppNavigate, useTabNavigate } from "../ref";
import NotFound from "./not-found";

/** A Starknet address the indexer takes as a player id: hex, below 2^252. */
const isPlayerId = (id: string): boolean => /^0x[0-9a-fA-F]{1,64}$/.test(id) && BigInt(id) < 1n << 252n;

/**
 * `/player/:id` (P8, under Ranks): the player's stats (`/v1/players/:id`), their last Challenge games with the "Free" mark,
 * and their rank today. Back is the previous page of the app, the leaderboard when there is none (a deep link). An id that
 * is not an address is a page that does not exist.
 */
export default function Page() {
  const { id } = useParams();
  return id !== undefined && isPlayerId(id) ? <PlayerPage id={id} /> : <NotFound />;
}

function PlayerPage({ id }: { id: string }) {
  const go = useAppNavigate();
  const navigate = useNavigate();
  const onNavigate = useTabNavigate();
  const canGoBack = useCanGoBack();
  const client = useQueryClient();
  const now = useNow();
  const viewerId = useAccount().address;
  const chainDay = useCurrentDay();
  const today = chainDay.isPending ? null : (chainDay.data ?? Math.floor(now / 86_400));
  const profile = usePlayerProfile(id);
  const games = useIndexedPlayerGames(id);
  const row = useLeaderboardEntry(today, id);
  const lag = useIndexerLag();
  const error = profile.error ?? games.error;

  return (
    <PlayerScene
      playerId={id}
      profile={profile.data ?? null}
      today={row.data ?? null}
      games={games.data ?? null}
      self={viewerId !== null && addressKey(viewerId) === addressKey(id)}
      error={error?.message ?? null}
      lag={lagInfo(lag)}
      onRetry={() => void client.invalidateQueries({ queryKey: queryKeys.indexer.all })}
      onBack={() => (canGoBack() ? navigate(-1) : go("/leaderboard", { replace: true }))}
      onNavigate={onNavigate}
    />
  );
}
