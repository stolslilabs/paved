import { useMemo, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { TabFrame } from "../../components/containers/tab-frame";
import type { MatchCardData } from "../../components/containers/match-list";
import { PvpLeagueScene, type PvpLeagueSceneProps } from "../../components/scenes/pvp-league-scene";
import { PvpSearchScene } from "../../components/scenes/pvp-search-scene";
import type { PvpPlayer } from "../../lib/pvp-rules";
import { addressKey, queryKeys } from "../../data/keys";
import { layoutBoard, useMatchesV2 } from "../../data/matches";
import { pvpKeys, useAttackLog, useDefenceLog, usePvpStatus, useSeasonSpan } from "../../data/pvp";
import { RENDERER_ASSETS } from "../../data/renderer-manifest";
import { useTileRenders } from "../../data/tile-renders";
import { useDataSources } from "../../data/sources";
import { useAccount } from "../../wallet/wallet";
import { errorDetail } from "../error-detail";
import { useNow } from "../now";
import { useAppNavigate, useBack, useTabNavigate } from "../ref";

/**
 * `/pvp/league` (#647 PR 2): the player's crowns, league and season from `Matchmaker.league` (#644), the season's end from
 * `season_start(season + 1)`; no Attack on the page (#833: the phone's bar has it). The latest attacks and defences are cards in the page (#786, in
 * place of the defence log; its old link, `/pvp/defence`, lands here), each opening its match (`/pvp/match/:id`, v2) or its
 * replay (`/pvp/replay/:attacker/:id`, v1), whose Back comes up here, with the village's shield from `Matchmaker.shield`.
 */
export default function Page() {
  const onNavigate = useTabNavigate();
  const onBack = useBack();
  const now = useNow();
  const wallet = useAccount();
  const me = useDataSources().signer?.address ?? null;
  const status = usePvpStatus(me);
  const league = status.data?.league ?? null;
  const span = useSeasonSpan(league?.season ?? null);
  const matches = useMatches(me);
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
      {...matches}
    />
  );
}

/** A match card's player: its address, and its name, level and avatar (a decimal look) where known. */
const playerOf = (address: string, name: string | null = null, level = 0, look: string | null = null): PvpPlayer => ({ name, address, level, crowns: 0, look: look ? BigInt(look) : null });

/**
 * The league's matches (#786): the latest attacks and defences as cards, with the shield. Where the sources serve PvP v2's matches
 * (the mock; the chain from step 3), each with its snapshot, opening its match (`/pvp/match/:id`). Else v1's indexer rows, the
 * attacks on the village and those the player made mixed, with no snapshot (no village behind the card), opening their replay.
 */
function useMatches(me: string | null): Pick<PvpLeagueSceneProps, "matches" | "onOpenMatch" | "onRetryMatches"> {
  const go = useAppNavigate();
  const client = useQueryClient();
  const v2 = useMatchesV2(me);
  const v1 = v2.data === null;
  const defences = useDefenceLog(v1 ? me : null);
  const attacks = useAttackLog(v1 ? me : null);
  const status = usePvpStatus(me);
  const shield = status.data?.shield;
  // The cards' backgrounds (#857): the build's renders, as the Story campaigns'.
  const renders = useTileRenders(RENDERER_ASSETS);
  const shown = useMemo<{ cards: MatchCardData[]; paths: Map<string, string> } | null>(() => {
    if (v2.data) {
      const cards = v2.data.map(
        (m): MatchCardData => ({
          id: m.id,
          side: m.side,
          rival: playerOf(m.rival.address, m.rival.name, m.rival.level, m.rival.look),
          village: layoutBoard(m.village),
          stars: m.stars,
          crowns: m.crowns,
          score: m.score,
          target: m.target,
          ...(m.side === "attack" ? { xp: m.xp, chest: m.chest } : {}),
          surrendered: m.surrendered,
          at: m.finishedAt,
        }),
      );
      return { cards, paths: new Map(cards.map((c) => [c.id, `/pvp/match/${c.id}`])) };
    }
    if (!v1 || !defences.data || !attacks.data) return null;
    const rows = [...attacks.data.map((a) => ({ a, side: "attack" as const })), ...defences.data.map((a) => ({ a, side: "defence" as const }))].sort((x, y) => y.a.finishedAt - x.a.finishedAt);
    const paths = new Map<string, string>();
    const cards = rows.map(({ a, side }): MatchCardData => {
      const id = `${side === "attack" ? "a" : "d"}${a.id}-${addressKey(side === "attack" ? a.defender : a.attacker)}`;
      paths.set(id, `/pvp/replay/${a.attacker}/${a.id}`);
      return {
        id,
        side,
        rival: playerOf(side === "attack" ? a.defender : a.attacker),
        village: null,
        stars: a.stars,
        // An attack's own crowns; a defence's are the attacker's, turned: lost what it gained, or won its 0-star cost.
        crowns: side === "attack" ? a.gained - a.lost : a.stars > 0 ? -a.gained : a.lost,
        score: a.score,
        target: a.target,
        surrendered: a.surrendered,
        at: a.finishedAt,
      };
    });
    return { cards, paths };
  }, [v2.data, v1, defences.data, attacks.data]);
  const error = v2.error ?? (v1 ? (defences.error ?? attacks.error) : null);
  return {
    matches: {
      matches: shown?.cards ?? null,
      shieldEndsAt: shield?.up ? shield.until : null,
      shieldUnknown: status.data == null,
      error: error?.message ?? null,
      errorDetail: error ? errorDetail(error) : undefined,
      renders,
    },
    onOpenMatch: (id) => {
      const path = shown?.paths.get(id);
      if (path) go(path);
    },
    onRetryMatches: () => {
      if (!me) return;
      void client.invalidateQueries({ queryKey: queryKeys.chain.v2.matches(me) });
      void client.invalidateQueries({ queryKey: pvpKeys.attacks(me, "defender") });
      void client.invalidateQueries({ queryKey: pvpKeys.attacks(me, "attacker") });
    },
  };
}
