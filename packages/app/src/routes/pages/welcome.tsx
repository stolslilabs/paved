import { WelcomeScene } from "../../components/scenes/welcome-scene";
import { useWallet } from "../../wallet/wallet";
import { useAppNavigate } from "../ref";
import { markWelcomed } from "../welcomed";

/**
 * `/welcome`, the first visit. Connect opens the wallet (P6): once connected the visit is marked and Home opens; a
 * failed or closed connect stays here with its reason. Training is the way in without a wallet.
 */
export default function Page() {
  const go = useAppNavigate();
  const wallet = useWallet();
  return (
    <WelcomeScene
      connecting={wallet.status === "connecting"}
      error={wallet.error}
      onConnect={async () => {
        if (!(await wallet.connect())) return;
        markWelcomed();
        go("/", { replace: true });
      }}
      onTraining={() => {
        markWelcomed();
        go("/training", { replace: true });
      }}
    />
  );
}
