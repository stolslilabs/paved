import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { TabFrame } from "../../components/containers/tab-frame";
import type { DefenceEntry } from "../../components/containers/defence-log";
import { PvpLeagueScene, type PvpLeagueSceneProps } from "../../components/scenes/pvp-league-scene";
import { PvpSearchScene } from "../../components/scenes/pvp-search-scene";
import { pvpKeys, useDefenceLog, usePvpStatus, useSeasonSpan } from "../../data/pvp";
import { useDataSources } from "../../data/sources";
import { useAccount } from "../../wallet/wallet";
import { errorDetail } from "../error-detail";
import { useNow } from "../now";
import { useAppNavigate, useBack, useTabNavigate } from "../ref";

/**
 * `/pvp/league` (#647 PR 2): the player's crowns, league and season from `Matchmaker.league` (#644), the season's end from
 * `season_start(season + 1)`; Attack opens the flow (`/pvp`). The defence log is a section of the page (BACK-RULE #783: no page
 * opens another page; it was `/pvp/defence`, whose old link lands here): the attacks on the village, newest first, from the
 * indexer's `pvp_attacks` (each with its stars against the village's score then, the crowns it cost or won, and its replay,
 * `/pvp/replay/:attacker/:id`, whose Back comes up here), and the village's shield from `Matchmaker.shield`.
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
  const defences = useDefences(me);
  const self = { name: wallet.username ?? null, address: me ?? "0x0", level: 0, crowns: 0 };
  // Its waits and refusals in the League tab's frame too (#763): the bar stays while the league is read. In the side panel from
  // `desktop` (#762) a click outside it or Escape closes it (#782).
  const wait = (scene: ReactNode) => (
    <TabFrame tab="league" onNavigate={onNavigate}>
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
      {...defences}
    />
  );
}

/** The defence log's section of the league: its rows, the shield, and their replay and retry. */
function useDefences(me: string | null): Pick<PvpLeagueSceneProps, "defences" | "onReplay" | "onRetryDefences"> {
  const go = useAppNavigate();
  const client = useQueryClient();
  const log = useDefenceLog(me);
  const status = usePvpStatus(me);
  const rows = log.data ?? null;
  // The scene names an attack by one number: its row here.
  const attacks: DefenceEntry[] | null = rows
    ? rows.map((a, i) => ({
        id: i,
        attacker: { name: null, address: a.attacker, level: 0, crowns: 0 },
        stars: a.stars,
        score: a.score,
        target: a.target,
        // The defender lost what the attacker gained; a defence held won the attacker's 0-star cost.
        crowns: a.stars > 0 ? -a.gained : a.lost,
        at: a.finishedAt,
        replay: true,
      }))
    : null;
  const shield = status.data?.shield;
  const error = log.error;
  return {
    defences: {
      attacks,
      shieldEndsAt: shield?.up ? shield.until : null,
      shieldUnknown: status.data == null,
      error: error?.message ?? null,
      errorDetail: error ? errorDetail(error) : undefined,
    },
    onReplay: (row) => {
      const a = rows?.[row];
      if (a) go(`/pvp/replay/${a.attacker}/${a.id}`);
    },
    onRetryDefences: () => {
      if (me) void client.invalidateQueries({ queryKey: pvpKeys.attacks(me, "defender") });
    },
  };
}
