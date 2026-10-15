import type { Leaderboard } from "@paved/chain";
import type { PlayerStatusData } from "../../components/containers/player-status";
import { HomeScene } from "../../components/scenes/home-scene";
import { useActiveGame, useCurrentDay, useSpawnPaused } from "../../data/chain";
import { usePlayerStatus, useTopThree } from "../../data/indexer";
import { useTrainingSave } from "../../data/training";
import { useAccount } from "../../wallet/wallet";
import { useConnectError } from "../connect-error";
import { useNow } from "../now";
import { useAppNavigate, useTabNavigate } from "../ref";

const DAY = 86_400;

/** Today's board before the indexer answers, or without one: the day, nobody on the podium. */
const emptyBoard = (day: number): Leaderboard => ({ tournamentId: day, startTime: day * DAY, endTime: (day + 1) * DAY, total: 0, entries: [], nextOffset: null });

/**
 * `/` (P6, section 6.4): the connected player's status (the indexer), the active Challenge game (`GameSpawned` events,
 * then `game(id)`), today's top 3 (the indexer, on the chain's `currentDay`), the Training save, `spawn_paused`. Each read
 * that is not there yet, or fails, leaves its part empty rather than holding the page: the podium empty, no game to
 * resume, not paused (the purchase page reads the pause again). The Cobbles and "Play free" come after P6.
 */
export default function Page() {
  const go = useAppNavigate();
  const onNavigate = useTabNavigate();
  const now = useNow();
  const wallet = useAccount();
  useConnectError(wallet.error);
  const address = wallet.address;
  // The day of the chain; the clock's until it answers.
  const day = useCurrentDay().data ?? Math.floor(now / DAY);
  const top = useTopThree(day);
  const status = usePlayerStatus(address, day);
  const active = useActiveGame(address);
  const training = useTrainingSave();
  const paused = useSpawnPaused();

  // A connected player the indexer has not answered for yet (or cannot) is shown by their address, with zero figures.
  const player: PlayerStatusData | null = address
    ? (status.data ?? {
        player: { playerId: address, name: wallet.username, created: null },
        stats: { challengeGames: 0, challengeFinished: 0, bestScore: 0, paidGames: 0, settledGames: 0, rewards: "0" },
        today: null,
        usdc: 0n,
        paved: 0n,
      })
    : null;

  return (
    <HomeScene
      player={player}
      leaderboard={top.data ?? emptyBoard(day)}
      activeGame={address ? (active.data ?? null) : null}
      training={training.data ?? null}
      spawnPaused={paused.data ?? false}
      now={now}
      connecting={wallet.status === "connecting"}
      onPlay={() => go("/play")}
      onChallenge={() => (address ? go("/play/challenge") : void wallet.connect())}
      onTraining={() => go("/training")}
      onTutorial={() => go("/tutorial")}
      onResume={(id) => go(`/game/${id}`)}
      onConnect={() => void wallet.connect()}
      onNavigate={onNavigate}
    />
  );
}
