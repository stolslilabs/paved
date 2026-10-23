import { useQueryClient } from "@tanstack/react-query";
import { PvpDefenceScene, type DefenceEntry } from "../../components/scenes/pvp-defence-scene";
import { pvpKeys, useDefenceLog, usePvpStatus } from "../../data/pvp";
import { useDataSources } from "../../data/sources";
import { errorDetail } from "../error-detail";
import { useNow } from "../now";
import { useAppNavigate, useUpTo } from "../ref";

/**
 * `/pvp/defence` (#647 PR 2): the attacks on the player's village, newest first, from the indexer's `pvp_attacks` (each with
 * its stars against the village's score then, the crowns it cost or won, and its replay, `/pvp/replay/:attacker/:id`), and the
 * village's shield from `Matchmaker.shield`.
 */
export default function Page() {
  const go = useAppNavigate();
  const onBack = useUpTo("/pvp/league");
  const now = useNow();
  const client = useQueryClient();
  const me = useDataSources().signer?.address ?? null;
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
  const error = me === null ? new Error("Connect to see the attacks on your village.") : log.error;
  return (
    <PvpDefenceScene
      attacks={me === null ? [] : attacks}
      shieldEndsAt={shield?.up ? shield.until : null}
      now={now}
      error={error?.message ?? null}
      errorDetail={error && me !== null ? errorDetail(error) : undefined}
      onBack={onBack}
      onReplay={(row) => {
        const a = rows?.[row];
        if (a) go(`/pvp/replay/${a.attacker}/${a.id}`);
      }}
      onRetry={() => {
        if (me) void client.invalidateQueries({ queryKey: pvpKeys.attacks(me, "defender") });
      }}
    />
  );
}
