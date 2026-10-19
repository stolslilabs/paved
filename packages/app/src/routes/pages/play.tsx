import { toastError } from "../../components/containers/error-toast";
import { PlayScene } from "../../components/scenes/play-scene";
import { useSpawnPaused } from "../../data/chain";
import { useFreeCredits } from "../../data/cobbles";
import { freeGameMessage, usePlayFree } from "../../data/play-free";
import { useAccount } from "../../wallet/wallet";
import { useConnectError } from "../connect-error";
import { errorDetail } from "../error-detail";
import { PrefetchOnIntent } from "../prefetch";
import { useAppNavigate, useBack } from "../ref";

/**
 * `/play`, the mode choice (P6): the Challenge is bought on `/play/challenge` (P7b) once a wallet is connected, a guest's
 * tap connects first; `spawn_paused` disables it. Training and Story mode need no wallet; Multiplayer is "coming soon".
 * An unread pause counts as not paused: the purchase page reads it again. "Free Challenge" is there for a connected player
 * with a credit: it spends it (`Challenge.spawn_free`) and opens the new game's board.
 */
export default function Page() {
  const go = useAppNavigate();
  const onBack = useBack();
  const wallet = useAccount();
  const paused = useSpawnPaused();
  useConnectError(wallet.error);
  const credits = useFreeCredits(wallet.address);
  const free = usePlayFree(wallet.address);
  const playFree = () => {
    free
      .spend()
      .then((id) => id !== null && go(`/game/${id}`))
      .catch((e: unknown) => toastError({ title: "The free game did not start", message: freeGameMessage(e), detail: errorDetail(e) }));
  };
  return (
    <PrefetchOnIntent routes={["/play/challenge"]}>
      <PlayScene
        connected={wallet.address !== null}
        spawnPaused={paused.data ?? false}
        credits={free.available ? (credits.data ?? 0) : 0}
        onPlayFree={playFree}
        onBack={onBack}
        onChallenge={() => go("/play/challenge")}
        onTraining={() => go("/training")}
        onStory={() => go("/story")}
        onConnect={() => void wallet.connect()}
      />
    </PrefetchOnIntent>
  );
}
