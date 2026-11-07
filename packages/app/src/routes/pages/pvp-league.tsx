import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { MatchCardData } from "../../components/containers/match-list";
import { PvpLeagueScene, type PvpLeagueSceneProps } from "../../components/scenes/pvp-league-scene";
import { LEAGUES, type PvpPlayer } from "../../lib/pvp-rules";
import { addressKey, queryKeys } from "../../data/keys";
import { layoutBoard, useMatchesV2 } from "../../data/matches";
import { useAttackV2 } from "../../data/free-attack";
import { isUnranked, lastAttack } from "../../data/pvp-standing";
import { pvpKeys, useAttackLog, useDefenceLog, usePvpStatus, useSeasonSpan } from "../../data/pvp";
import { useDataSources } from "../../data/sources";
import { useAccount } from "../../wallet/wallet";
import { useDrawerRoute } from "../drawer-route";
import { errorDetail } from "../error-detail";
import { useNow } from "../now";
import { useAppNavigate, useBack } from "../ref";
import { useOpenPlayer } from "../open-player";

/**
 * `/pvp/league` (#647 PR 2): the player's crowns, league and season from `Matchmaker.league` (#644), the season's end from
 * `season_start(season + 1)`; no Attack on the page (#833: the phone's bar has it). The latest attacks and defences are rows in the page (#786, in
 * place of the defence log; its old link, `/pvp/defence`, lands here), each opening its match (`/pvp/match/:id`, v2) or its
 * replay (`/pvp/replay/:attacker/:id`, v1), whose Back comes up here. No shield on the page (#859): the home's overlay shows it.
 * LEAGUE-PAGE: drawn in the HUD's drawer over the home at every width (`PageDef.drawer`, `home-hosts.tsx`), its waits and refusals
 * in it; the rivals' profiles (#952) are the home's host's, the home mounted under the drawer.
 */
export default function Page() {
  // The HUD's drawer over the home (`home-hosts.tsx`), shown while its route is the current one; alone (a story's route), open, its
  // Back up to the village.
  const drawer = useDrawerRoute();
  const back = useBack();
  const onBack = drawer?.onClose ?? back;
  const now = useNow();
  const wallet = useAccount();
  const me = useDataSources().signer?.address ?? null;
  const status = usePvpStatus(me);
  // The v2 attack (open or last), for the Unranked rule: a first attack open is not Unranked, on v1 or v2 (#917).
  const v2 = useAttackV2(me);
  const league = status.data?.league ?? null;
  const span = useSeasonSpan(league?.season ?? null);
  const matches = useMatches(me);
  const client = useQueryClient();
  const frame = { now, onBack, open: drawer?.open ?? true, returnFocus: drawer?.returnFocus, crowns: 0, season: null };
  // No guest (NO-GUEST): until the account is in, the league loads.
  if (me === null) return <PvpLeagueScene {...frame} wait={{ kind: "loading" }} />;
  if (status.data === null) return <PvpLeagueScene {...frame} wait={{ kind: "unavailable" }} />;
  const error = status.error ?? span.error;
  if (!league || span.data === undefined) {
    // The chain's PvP reads again (the standing, the season's span).
    const retry = () => void client.invalidateQueries({ queryKey: ["chain", "pvp"] });
    return <PvpLeagueScene {...frame} wait={error ? { kind: "error", message: error.message, detail: errorDetail(error), onRetry: retry } : { kind: "loading" }} />;
  }
  // Season 0 is before the owner's clock (#644): no season, no end.
  const season = league.season > 0 && span.data && span.data.end > 0 ? { name: `Season ${league.season}`, endsAt: span.data.end } : null;
  const last = lastAttack(status.data?.attack, v2.data);
  return (
    <PvpLeagueScene
      {...frame}
      crowns={league.crowns}
      league={league.league}
      season={season}
      unranked={last ? isUnranked(league, last) : false}
      {...matches}
    />
  );
}

/** A match card's player: its address, and its name, level and avatar (a decimal look) where known. */
const playerOf = (address: string, name: string | null = null, level = 0, look: string | null = null): PvpPlayer => ({ name, address, level, crowns: 0, look: look ? BigInt(look) : null });

/**
 * The league's matches (#786): the latest attacks and defences as cards. Where the sources serve PvP v2's matches
 * (the mock; the chain from step 3), each with its snapshot, opening its match (`/pvp/match/:id`). Else v1's indexer rows, the
 * attacks on the village and those the player made mixed, with no snapshot (no village behind the card), opening their replay.
 */
function useMatches(me: string | null): Pick<PvpLeagueSceneProps, "matches" | "onOpenMatch" | "onRetryMatches"> {
  const go = useAppNavigate();
  const client = useQueryClient();
  // The rival's avatar or name opens their public profile (#952).
  const openPlayer = useOpenPlayer();
  const v2 = useMatchesV2(me);
  const v1 = v2.data === null;
  const defences = useDefenceLog(v1 ? me : null);
  const attacks = useAttackLog(v1 ? me : null);
  const shown = useMemo<{ cards: MatchCardData[]; paths: Map<string, string> } | null>(() => {
    if (v2.data) {
      const cards = v2.data.map(
        (m): MatchCardData => ({
          id: m.id,
          side: m.side,
          rival: playerOf(m.rival.address, m.rival.name, m.rival.level, m.rival.look),
          // The rival's league where the sources know it (#917): its crest on the card.
          ...(m.rival.league !== undefined && { league: LEAGUES[m.rival.league] }),
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
      error: error?.message ?? null,
      errorDetail: error ? errorDetail(error) : undefined,
      onOpenPlayer: openPlayer,
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
