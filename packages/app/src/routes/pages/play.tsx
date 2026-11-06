import { Suspense, lazy } from "react";
import { PlayScene } from "../../components/scenes/play-scene";
import { Notice } from "../../components/elements/notice";
import { useActiveGame, useSpawnPaused } from "../../data/chain";
import { useAccount } from "../../wallet/wallet";
import { useConnectError } from "../connect-error";
import { useDrawerRoute } from "../drawer-route";
import { useRoutePage } from "../handle";
import { useNow } from "../now";
import { prefetchAllowed } from "../prefetch";
import { useAppNavigate, useUpTo } from "../ref";

/** The Challenge's stake (`/play/challenge`): its reads and its purchase, a chunk of their own, fetched as the Challenge is pointed at. */
const loadStake = () => import("./purchase");
const ChallengeStake = lazy(loadStake);

/**
 * `/play` and `/play/challenge` (PLAY-PAGE, the Paved UX Book's "modes" and "challenge", then the owner's asks of 2026-11-06): one page,
 * the HUD's drawer over the home (`PageDef.drawer`, `home-hosts.tsx`), its two paths one component (`page-loaders.ts`), so the drawer
 * stays as the stake opens and closes. The modes (P6): Attack opens the PvP flow (`/pvp`), a guest's tap connecting first; the Challenge
 * is bought on its stake (P7b, `./purchase`) once a wallet is connected, a guest's tap connects first; `spawn_paused` disables it. The
 * player's newest Challenge game still open (`useActiveGame`, the home's) shows its time left and its score, Resume opening its board.
 * Training and Story need no wallet (Story a sheet over this page). Free Challenge (a free game from the missions' credits) left with
 * the owner's ask of 2026-11-06. An unread pause counts as not paused: the stake reads it again. Play's close goes back along the pages
 * walked from the home, else to it; the stake's Back up to the modes.
 */
export default function Page() {
  const go = useAppNavigate();
  const drawer = useDrawerRoute();
  const home = useUpTo("/");
  const onBack = drawer?.onClose ?? home;
  const onChallengeBack = useUpTo("/play");
  // The stake by the matched route's page, never by the path's text: the router matches `/PLAY/CHALLENGE/` as `/play/challenge`.
  const staking = useRoutePage()?.path === "play/challenge";
  const wallet = useAccount();
  const paused = useSpawnPaused();
  useConnectError(wallet.error);
  const active = useActiveGame(wallet.address);
  const now = useNow();
  const running = wallet.address ? (active.data ?? null) : null;
  // The stake's chunk as the page is pointed at or focused (`PrefetchOnIntent`'s rule; the drawer's portal bubbles its events here).
  const warm = () => {
    if (prefetchAllowed()) void loadStake().catch(() => {});
  };
  return (
    <div className="contents" onPointerOver={warm} onFocus={warm}>
      <PlayScene
        open={drawer?.open ?? true}
        returnFocus={drawer?.returnFocus}
        connected={wallet.address !== null}
        spawnPaused={paused.data ?? false}
        running={running}
        now={now}
        challenge={
          staking ? (
            <Suspense fallback={<Notice title="Reading the price…">The stake's price, its split and your balance.</Notice>}>
              <ChallengeStake />
            </Suspense>
          ) : null
        }
        onBack={onBack}
        onChallengeBack={onChallengeBack}
        onChallenge={() => go("/play/challenge")}
        onResume={(id) => go(`/game/${id}`)}
        onTraining={() => go("/training")}
        onStory={() => go("/story")}
        onAttack={() => go("/pvp")}
        onConnect={() => void wallet.connect()}
      />
    </div>
  );
}
