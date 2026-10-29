import { useCallback } from "react";
import { useErrorDetail } from "../error-detail";
import { WelcomeScene } from "../../components/scenes/welcome-scene";
import { useWallet } from "../../wallet/wallet";
import { useAppNavigate } from "../ref";
import { markWelcomed } from "../welcomed";

/**
 * `/welcome`, the first visit. Connect opens the wallet (P6): once connected the visit is marked and Home opens; a
 * failed or closed connect stays here with its reason. Training is the way in without a wallet. Back (#760) goes to the
 * village as a guest: the visit is marked, or Home would send the visitor back here. Its header shows no balances (#855).
 */
export default function Page() {
  const go = useAppNavigate();
  const wallet = useWallet();
  const detail = useErrorDetail(wallet.error);
  const { connect } = wallet;
  const onConnect = useCallback(async () => {
    if (!(await connect())) return;
    markWelcomed();
    go("/", { replace: true });
  }, [connect, go]);
  return (
    <WelcomeScene
      connecting={wallet.status === "connecting"}
      error={wallet.error}
      errorDetail={detail}
      onConnect={onConnect}
      onBack={() => {
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
