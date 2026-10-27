import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { BoardTile } from "@paved/chain";
import { AttackRun, CENTER, OrientationType, PlanType } from "@paved/game-core";
import { PvpMatchScene, type MatchView } from "../../components/scenes/pvp-match-scene";
import { PvpSearchScene } from "../../components/scenes/pvp-search-scene";
import { ATTACK_STAR_PERCENTS } from "../../lib/pvp-v2-rules";
import { useBoardSkins } from "../../data/board-skins";
import { queryKeys } from "../../data/keys";
import { layoutBoard, matchBoardSide, useMatchesV2, type MatchRecord } from "../../data/matches";
import { useDataSources } from "../../data/sources";
import { useAccount } from "../../wallet/wallet";
import { errorDetail } from "../error-detail";
import { READ_ONLY_PLACEMENT, useGameBoard } from "../game-board";
import { useUpTo } from "../ref";
import NotFound from "./not-found";

/** A replay's step while it plays. */
const STEP_MS = 700;

const PLANS = Object.values(PlanType);
const ORIENTATIONS = Object.values(OrientationType);

/** The build after `move` moves of `match`: its board (from the starter, an unbounded board) and the last move's result. */
function buildAt(match: MatchRecord, move: number) {
  const codes = match.moves.slice(0, move).map((m) => (m.discard ? { plan: m.plan, discard: true as const } : { plan: m.plan, discard: false as const, orientation: m.orientation, cell: m.cell }));
  const run = AttackRun.replay({ territory: null }, codes.slice(0, -1));
  const last = codes.length > 0 ? run.apply(codes.at(-1)!) : null;
  const tiles: BoardTile[] = run.game.placed().map((t) => ({ id: t.id, plan: PLANS.indexOf(t.plan), orientation: ORIENTATIONS.indexOf(t.orientation), x: CENTER + t.x, y: CENTER + t.y }));
  return { run, last, tiles };
}

/**
 * `/pvp/match/:id` (#786): a match of the League page's list, `a<id>` the player's attack, `d<id>` an attack on their village.
 * One board, two views: the attacked village from the snapshot kept at the attack's start, whatever its owner changed since, and
 * the attack's build stepped through as a replay. A full-screen flow opened from the League: Back goes up to it (BACK-RULE #783).
 */
export default function Page() {
  const { id } = useParams();
  if (!id || !/^[ad]\d+$/.test(id)) return <NotFound />;
  return <Match id={id} />;
}

function Match({ id }: { id: string }) {
  const onBack = useUpTo("/pvp/league");
  const wallet = useAccount();
  const me = useDataSources().signer?.address ?? null;
  const matches = useMatchesV2(me);
  const match = matches.data?.find((m) => m.id === id) ?? null;
  const [view, setView] = useState<MatchView>("village");
  // The build opens whole; Play steps through it from the start.
  const total = match?.moves.length ?? 0;
  const [move, setMove] = useState<number | null>(null);
  const shown = move ?? total;
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    if (shown >= total) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(() => setMove(Math.min(total, shown + 1)), STEP_MS);
    return () => clearTimeout(timer);
  }, [playing, shown, total]);
  // A step back has no undo on the engine: the build up to a move is rebuilt from the start, as the replay does.
  const build = useMemo(() => (match ? buildAt(match, shown) : null), [match, shown]);
  const village = useMemo(() => (match ? layoutBoard(match.village) : []), [match]);
  const side = match?.side ?? "attack";
  // The attacked village's skins: the rival's in an attack, the player's own in a defence.
  const skins = useBoardSkins(match ? (side === "attack" ? match.rival.address : me) : null);
  const { scene } = useGameBoard({ skins, side: matchBoardSide(side, view), summerDay: true, resetKey: id, placement: READ_ONLY_PLACEMENT });

  const client = useQueryClient();
  const self = { name: wallet.username ?? null, address: me ?? "0x0", level: 0, crowns: 0 };
  if (me === null) return <PvpSearchScene state="error" player={self} error="Connect to see your matches." onRetry={() => void wallet.connect()} onCancel={onBack} />;
  if (!match || !build) {
    const missing = matches.data === null ? "Matches are not on this network yet." : matches.data ? "This match is not recorded on this device." : null;
    const error = matches.error;
    return (
      <PvpSearchScene
        state={missing || error ? "error" : "searching"}
        player={self}
        error={missing ?? error?.message}
        errorDetail={error ? errorDetail(error) : undefined}
        onCancel={onBack}
        onRetry={error ? () => void client.invalidateQueries({ queryKey: queryKeys.chain.v2.matches(me) }) : undefined}
      />
    );
  }
  const attacker = side === "attack" ? self : { ...match.rival, crowns: 0 };
  return (
    <PvpMatchScene
      side={side}
      rival={{ ...match.rival, crowns: 0 }}
      view={view}
      onView={setView}
      target={match.target}
      final={{ score: match.score, stars: match.stars }}
      starPercents={ATTACK_STAR_PERCENTS}
      {...scene({ tiles: view === "village" ? village : build.tiles, bubble: null })}
      score={build.run.score}
      delta={build.last?.delta ?? null}
      lastScored={[]}
      remaining={0}
      hand={{ tile: null, state: "empty" }}
      replay={{
        attacker,
        move: shown,
        total,
        playing,
        onPlay: () => {
          if (shown >= total) setMove(0);
          setPlaying(true);
        },
        onPause: () => setPlaying(false),
        onStep: (by) => {
          setPlaying(false);
          setMove(Math.max(0, Math.min(total, shown + by)));
        },
      }}
      onBack={onBack}
    />
  );
}
