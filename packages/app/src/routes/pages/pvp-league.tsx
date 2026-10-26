import type { ReactNode } from "react";
import { PanelClose } from "../../components/containers/panel-close";
import { TabFrame } from "../../components/containers/tab-frame";
import { PvpLeagueScene } from "../../components/scenes/pvp-league-scene";
import { PvpSearchScene } from "../../components/scenes/pvp-search-scene";
import { usePvpStatus, useSeasonSpan } from "../../data/pvp";
import { useDataSources } from "../../data/sources";
import { useAccount } from "../../wallet/wallet";
import { errorDetail } from "../error-detail";
import { useNow } from "../now";
import { useAppNavigate, useBack, useTabNavigate } from "../ref";

/**
 * `/pvp/league` (#647 PR 2): the player's crowns, league and season from `Matchmaker.league` (#644), the season's end from
 * `season_start(season + 1)`; Attack opens the flow (`/pvp`), Defence log the attacks on the village (`/pvp/defence`).
 */
export default function Page() {
  const go = useAppNavigate();
  const onNavigate = useTabNavigate();
  const onBack = useBack();
  const now = useNow();
  const wallet = useAccount();
  const me = useDataSources().signer?.address ?? null;
  const status = usePvpStatus(me);
  const league = status.data?.league ?? null;
  const span = useSeasonSpan(league?.season ?? null);
  const self = { name: wallet.username ?? null, address: me ?? "0x0", level: 0, crowns: 0 };
  // Its waits and refusals in the League tab's frame too (#763): the bar stays while the league is read. In the side panel from
  // `desktop` (#762) they have no header: the panel's close sits at their top right.
  const wait = (scene: ReactNode) => (
    <TabFrame tab="league" onNavigate={onNavigate}>
      <PanelClose className="absolute top-2 right-2 z-20" />
      {scene}
    </TabFrame>
  );
  if (me === null) return wait(<PvpSearchScene state="error" player={self} error="Connect to see your league." onRetry={() => void wallet.connect()} onCancel={onBack} className="h-full" />);
  if (status.data === null) return wait(<PvpSearchScene state="error" player={self} error="PvP is not on this network yet." onCancel={onBack} className="h-full" />);
  const error = status.error ?? span.error;
  if (!league || span.data === undefined) {
    return wait(
      <PvpSearchScene state={error ? "error" : "searching"} player={self} error={error?.message} errorDetail={error ? errorDetail(error) : undefined} onCancel={onBack} className="h-full" />,
    );
  }
  // Season 0 is before the owner's clock (#644): no season, no end.
  const season = league.season > 0 && span.data && span.data.end > 0 ? { name: `Season ${league.season}`, endsAt: span.data.end } : null;
  return (
    <PvpLeagueScene
      crowns={league.crowns}
      league={league.league}
      season={season}
      now={now}
      unranked={league.crowns === 0 && league.attacks === 0 && status.data?.attack.id === 0}
      attacks={season ? league.attacks : undefined}
      onBack={onBack}
      onNavigate={onNavigate}
      onAttack={() => go("/pvp")}
      onDefence={() => go("/pvp/defence")}
    />
  );
}
