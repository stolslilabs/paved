import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { Attack } from "@paved/chain";
import { AttackRun, CENTER, OrientationType, PlanType } from "@paved/game-core";
import { PvpAttackScene } from "../../components/scenes/pvp-attack-scene";
import { PvpSearchScene } from "../../components/scenes/pvp-search-scene";
import { useBoardSkins } from "../../data/board-skins";
import { usePlayerStatus } from "../../data/indexer";
import { addressKey } from "../../data/keys";
import { useDataSources } from "../../data/sources";
import { ATTACK_FINISHED, moveCodes, pvpKeys, usePvpAttack, usePvpPlayer, usePvpSettled, usePvpStatus } from "../../data/pvp";
import { errorDetail } from "../error-detail";
import { useUpTo } from "../ref";
import { READ_ONLY_PLACEMENT, useGameBoard } from "../game-board";
import NotFound from "./not-found";

/** An address in a path: `0x` and 1 to 64 hex digits. */
const ADDRESS = /^0x[0-9a-f]{1,64}$/i;
/** A replay's step while it plays. */
const STEP_MS = 700;
/** Every parcel: a past attack's snapshot is not kept by the indexer, and a territory only grows, so its moves all fit. */
const ALL_PARCELS = 91;

const PLANS = Object.values(PlanType);
const ORIENTATIONS = Object.values(OrientationType);

/**
 * `/pvp/replay/:attacker/:id` (#647 PR 2): attack `id` of `attacker` stepped through, move by move: its moves from
 * `Arena.moves` replayed on game-core's engine on the defender's board (the snapshot's parcels for the attacker's last attack,
 * `Arena.attack`; the territory now for an older one, which holds every cell it had), its target from the indexer's row. A
 * full-screen flow opened from a match card of the league (v1, #786) or a result: Back goes up to the league (BACK-RULE #783).
 */
export default function Page() {
  const { attacker, id } = useParams();
  if (!attacker || !ADDRESS.test(attacker) || !id || !/^\d+$/.test(id)) return <NotFound />;
  return <Replay attacker={attacker} id={Number(id)} />;
}

function Replay({ attacker, id }: { attacker: string; id: number }) {
  const onBack = useUpTo("/pvp/league");
  const status = usePvpStatus(attacker);
  const settled = usePvpSettled(attacker, id);
  const last = status.data?.attack.id === id ? status.data.attack : null;
  const row = settled.data;
  const attack: Attack | null =
    last ??
    (row?.defender !== undefined && row.target !== undefined
      ? { id, status: ATTACK_FINISHED, defender: row.defender, npc: row.npc ?? false, parcels: ALL_PARCELS, target: row.target, board: 0, placed: 0, startedAt: 0, score: row.score, stars: row.stars }
      : null);
  const read = usePvpAttack(attacker, attack, null);
  const name = usePlayerStatus(attacker).data?.player.name ?? null;
  const by = usePvpPlayer(attacker, name).data ?? { name, address: attacker, level: 0, crowns: 0 };
  const defenderName = usePlayerStatus(attack?.defender ?? null).data?.player.name ?? null;
  const defender = usePvpPlayer(attack?.defender ?? null, defenderName).data ?? { name: defenderName, address: attack?.defender ?? "0x0", level: 0, crowns: 0 };
  const total = read.data?.moves.length ?? 0;
  const [move, setMove] = useState(0);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    if (move >= total) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(() => setMove((m) => Math.min(total, m + 1)), STEP_MS);
    return () => clearTimeout(timer);
  }, [playing, move, total]);
  // A step back has no undo on the engine: the replay up to a move is rebuilt from the start, the replay's own way.
  const step = useMemo(() => {
    if (!read.data) return null;
    const run = new AttackRun({ territory: read.data.board.territory, placed: read.data.board.placed });
    let last: ReturnType<AttackRun["apply"]> | null = null;
    for (const m of read.data.moves.slice(0, move)) last = run.apply(moveCodes(m));
    return { run, last };
  }, [read.data, move]);

  const tiles = useMemo(
    () => step?.run.game.placed().map((t) => ({ id: t.id, plan: PLANS.indexOf(t.plan), orientation: ORIENTATIONS.indexOf(t.orientation), x: CENTER + t.x, y: CENTER + t.y })) ?? [],
    [step],
  );
  // The 3D board of every game, read only (#772): green on a replay of an attack on the viewer's own village (a defence's card),
  // red on someone else's (open point 5). The defender's skins, as the attack drew them.
  const me = useDataSources().signer?.address ?? null;
  const own = me !== null && attack !== null && addressKey(attack.defender) === addressKey(me);
  const skins = useBoardSkins(attack?.defender ?? null);
  const { scene } = useGameBoard({ skins, side: own ? "own" : "rival", resetKey: id, placement: READ_ONLY_PLACEMENT });

  const client = useQueryClient();
  /** Reads the attack's metadata, its moves and the attacker's state again. */
  const retry = () => {
    void client.invalidateQueries({ queryKey: pvpKeys.attackRow(attacker, id) });
    void client.invalidateQueries({ queryKey: pvpKeys.all });
  };
  const self = { name, address: attacker, level: 0, crowns: 0 };
  if (!read.data || !step || !attack) {
    // Every read the replay waits on: the attack's moves and board, its metadata (the indexer's row) and the attacker's last
    // attack. A failed one ends the wait with its error: the moves' read waits on the metadata, so it never fails alone.
    const error = read.error ?? (last ? null : settled.error) ?? status.error ?? null;
    // Not the attacker's last attack: its target and defender are the indexer's row's. Read and absent (a receipt alone, the
    // indexer behind), the replay cannot be built yet.
    const unrecorded = status.data != null && !last && !settled.isPending && !settled.error && settled.data?.target === undefined;
    const missing = read.data === null || unrecorded ? "This attack cannot be replayed: it is not recorded on this network." : (error?.message ?? null);
    return <PvpSearchScene state={missing ? "error" : "searching"} player={self} error={missing} errorDetail={error ? errorDetail(error) : undefined} onCancel={onBack} onRetry={error || unrecorded ? retry : undefined} />;
  }
  return (
    <PvpAttackScene
      defender={defender}
      target={attack.target}
      territory={read.data.territory}
      {...scene({ tiles, bubble: null })}
      score={step.run.score}
      delta={step.last?.delta ?? null}
      lastScored={[]}
      remaining={total - move}
      hand={{ tile: null, state: "empty" }}
      replay={{
        attacker: by,
        move,
        total,
        playing,
        onPlay: () => {
          if (move >= total) setMove(0);
          setPlaying(true);
        },
        onPause: () => setPlaying(false),
        onStep: (by) => {
          setPlaying(false);
          setMove((m) => Math.max(0, Math.min(total, m + by)));
        },
      }}
      onBack={onBack}
    />
  );
}
