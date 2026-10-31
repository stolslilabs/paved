import { useCallback } from "react";
import { useLocation } from "react-router";
import { useErrorDetail } from "../error-detail";
import { WelcomeScene } from "../../components/scenes/welcome-scene";
import { useWallet } from "../../wallet/wallet";
import { useAppNavigate } from "../ref";
import { PLAYER_PARAM } from "../player-param";
import { markWelcomed } from "../welcomed";

/**
 * `/welcome`, the first visit. Connect opens the wallet (P6): once connected the visit is marked and Home opens; a
 * failed or closed connect stays here with its reason. Training is the way in without a wallet. Back (#760) goes to the
 * village as a guest: the visit is marked, or Home would send the visitor back here. A player's link (`?player=`, #952) that
 * led here opens their profile on Home after Connect or Back. Its header shows no balances (#855).
 */
export default function Page() {
  const go = useAppNavigate();
  // A player's link opened on a first visit (#952): Home opens with their profile once the visitor is in.
  const player = new URLSearchParams(useLocation().search).get(PLAYER_PARAM);
  const home = player ? `/?${PLAYER_PARAM}=${encodeURIComponent(player)}` : "/";
  const wallet = useWallet();
  const detail = useErrorDetail(wallet.error);
  const { connect } = wallet;
  const onConnect = useCallback(async () => {
    if (!(await connect())) return;
    markWelcomed();
    go(home, { replace: true });
  }, [connect, go, home]);
  return (
    <WelcomeScene
      connecting={wallet.status === "connecting"}
      error={wallet.error}
      errorDetail={detail}
      onConnect={onConnect}
      onBack={() => {
        markWelcomed();
        go(home, { replace: true });
      }}
      onTraining={() => {
        markWelcomed();
        go("/training", { replace: true });
      }}
    />
  );
}
