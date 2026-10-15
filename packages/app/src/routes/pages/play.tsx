import { PlayScene } from "../../components/scenes/play-scene";
import { useSpawnPaused } from "../../data/chain";
import { useAccount } from "../../wallet/wallet";
import { useConnectError } from "../connect-error";
import { useAppNavigate, useBack } from "../ref";

/**
 * `/play`, the mode choice (P6): the Challenge is bought on `/play/challenge` (P7b) once a wallet is connected, a guest's
 * tap connects first; `spawn_paused` disables it. Training and the Tutorial need no wallet; Multiplayer is "coming soon".
 * An unread pause counts as not paused: the purchase page reads it again.
 */
export default function Page() {
  const go = useAppNavigate();
  const onBack = useBack();
  const wallet = useAccount();
  const paused = useSpawnPaused();
  useConnectError(wallet.error);
  return (
    <PlayScene
      connected={wallet.address !== null}
      spawnPaused={paused.data ?? false}
      onBack={onBack}
      onChallenge={() => go("/play/challenge")}
      onTraining={() => go("/training")}
      onTutorial={() => go("/tutorial")}
      onConnect={() => void wallet.connect()}
    />
  );
}
