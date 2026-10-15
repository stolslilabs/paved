import { WelcomeScene } from "../../components/scenes/welcome-scene";
import { useAppNavigate } from "../ref";
import { markWelcomed } from "../welcomed";

/**
 * `/welcome`, the first visit. The wallet connect is wired with the account (P6): until then Connect marks the
 * visit and goes Home, and Training is the way in without a wallet.
 */
export default function Page() {
  const go = useAppNavigate();
  return (
    <WelcomeScene
      onConnect={() => {
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
