import { toastError } from "../../components/containers/error-toast";
import type { PlayerStatusData } from "../../components/containers/profile-sheet";
import { HomeScene } from "../../components/scenes/home-scene";
import { useActiveGame, useSpawnPaused } from "../../data/chain";
import { useCobbleAccount } from "../../data/cobbles";
import { freeGameMessage, usePlayFree } from "../../data/play-free";
import { usePlayerStatus } from "../../data/indexer";
import { useAccount } from "../../wallet/wallet";
import { useConnectError } from "../connect-error";
import { errorDetail } from "../error-detail";
import { useNow } from "../now";
import { PrefetchOnIntent } from "../prefetch";
import { useAppNavigate, useTabNavigate } from "../ref";

/**
 * `/` (P6, section 6.4): the connected player's status (the indexer), the active Challenge game (`GameSpawned` events,
 * then `game(id)`), `spawn_paused` (Training reads nothing: it is not saved, #718). No podium: the ranks left the UI (#623). Each read that is not
 * there yet, or fails, leaves its part empty rather than holding the page: no game to resume, not paused (the purchase page reads the pause again). The Cobbles balance shows once connected; "Play free" is
 * there with a credit and a signer that can spend it, disabled while spawn is paused, and opens the new game's board.
 */
export default function Page() {
  const go = useAppNavigate();
  const onNavigate = useTabNavigate();
  const now = useNow();
  const wallet = useAccount();
  useConnectError(wallet.error);
  const address = wallet.address;
  const status = usePlayerStatus(address);
  const active = useActiveGame(address);
  const paused = useSpawnPaused();
  const account = useCobbleAccount(address);
  const free = usePlayFree(address);
  const playFree = () => {
    free
      .spend()
      .then((id) => id !== null && go(`/game/${id}`))
      .catch((e: unknown) => toastError({ title: "The free game did not start", message: freeGameMessage(e), detail: errorDetail(e) }));
  };

  // A connected player the indexer has not answered for yet (or cannot) is shown by their address, with zero figures.
  const player: PlayerStatusData | null = address
    ? (status.data ?? {
        player: { playerId: address, name: wallet.username, created: null },
        stats: { challengeGames: 0, challengeFinished: 0, bestScore: 0, paidGames: 0, settledGames: 0, rewards: "0" },
      })
    : null;

  const activeGameId = address ? (active.data?.id ?? null) : null;
  // The pages the buttons lead to: Play (the mode choice), the Challenge, and the game to resume.
  const next = activeGameId === null ? ["/play", "/play/challenge"] : ["/play", "/play/challenge", `/game/${activeGameId}`];
  return (
    <PrefetchOnIntent routes={next}>
      <HomeScene
        player={player}
        activeGame={address ? (active.data ?? null) : null}
        spawnPaused={paused.data ?? false}
        cobbles={address && account.data ? { balance: account.data.cobbles, credits: free.available ? account.data.credits : 0 } : null}
        now={now}
        connecting={wallet.status === "connecting"}
        onPlay={() => go("/play")}
        onPlayFree={playFree}
        onChallenge={() => (address ? go("/play/challenge") : void wallet.connect())}
        onTraining={() => go("/training")}
        onStory={() => go("/story")}
        onResume={(id) => go(`/game/${id}`)}
        onConnect={() => void wallet.connect()}
        onNavigate={onNavigate}
      />
    </PrefetchOnIntent>
  );
}
