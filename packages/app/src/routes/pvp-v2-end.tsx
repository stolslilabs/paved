import { useMemo } from "react";
import type { BoardTile } from "@paved/chain";
import { CENTER, CategoryType, DAY_S, OrientationType, PlanType, dayOf, levelStatus, pvpChestRank } from "@paved/game-core";
import type { FinalBoardProps } from "../components/containers/final-board";
import { PvpEndScene, type PvpEndChest, type PvpEndSceneProps, type PvpEndXp } from "../components/scenes/pvp-end-scene";
import { PvpSearchScene } from "../components/scenes/pvp-search-scene";
import type { PvpPlayer } from "../lib/pvp-rules";
import { useBoardSkins } from "../data/board-skins";
import { sideSettings } from "../data/board-side";
import { attackV2Board, type AttackV2 } from "../data/free-attack";
import { useFreeVillage } from "../data/free-village";
import { usePlayerStatus } from "../data/indexer";
import { usePvpLeague } from "../data/pvp-league";
import { RENDERER_ASSETS } from "../data/renderer-manifest";
import { useBoardSettings } from "../data/settings";
import { useNow } from "./now";
import { useAppNavigate, useUpTo } from "./ref";

// `/pvp/result/:id` on PvP v2 (#790), its own chunk: the end screen of the attacker's attack `id`, read by its id (`attackV2Of`,
// the mock's record, #741; an id with no v2 attack is v1's result), so a reload or a link shows it again, after later attacks
// too. The attack's last move goes here with `replace` (`pvp-v2.tsx`), and Back goes up to the league: never into the finished
// attack.

const PLANS = Object.values(PlanType);
const ORIENTATIONS = Object.values(OrientationType);
const CATEGORIES = Object.values(CategoryType);

/** A finished attack on the engine: its final board's tiles and every closing, with the move (from 1) that closed it. */
export function attackEnd(attack: Pick<AttackV2, "moves">): { tiles: BoardTile[]; closings: PvpEndSceneProps["closings"] } {
  const run = attackV2Board({ moves: [] });
  const closings: { category: number; size: number; points: number; move: number }[] = [];
  attack.moves.forEach((m, i) => {
    const step = run.apply(m.discard ? { plan: m.plan, discard: true } : { plan: m.plan, discard: false, orientation: m.orientation, cell: m.cell });
    for (const s of step.result.scored) closings.push({ category: CATEGORIES.indexOf(s.category), size: s.size, points: s.points, move: i + 1 });
  });
  const tiles = run.game.placed().map((t) => ({ id: t.id, plan: PLANS.indexOf(t.plan), orientation: ORIENTATIONS.indexOf(t.orientation), x: CENTER + t.x, y: CENTER + t.y }));
  return { tiles, closings };
}

/**
 * The chest of a finished attack: the record's when one was granted; with stars and none granted, the day's slots were full
 * (the record's chest is null then, #741): shown disabled, its slots back at the UTC day after the attack's end (the day the
 * ledger counted it in), not the day of the clock; nothing with no star or a surrender.
 */
export function endChest(attack: Pick<AttackV2, "chest" | "stars" | "status" | "finishedAt">): PvpEndChest {
  if (attack.chest) return { state: "won", rank: attack.chest };
  const rank = attack.status === "surrendered" ? null : pvpChestRank(attack.stars);
  return rank ? { state: "capped", rank, resetsAt: (dayOf(attack.finishedAt) + 1) * DAY_S } : { state: "none" };
}

/** The XP the attack gave and the level it leaves, from the player's XP now. */
export function endXp(xp: number, gained: number): PvpEndXp {
  const after = levelStatus(xp);
  return { gained, xp: after.xp, level: after.level, floor: after.floor, next: after.next, levelBefore: levelStatus(xp - gained).level };
}

export interface PvpV2EndProps {
  me: string;
  /** The player's v2 attack of the route's id. */
  attack: AttackV2;
  /** The attacker as the waiting screens show them. */
  self: PvpPlayer;
}

export default function PvpV2End({ me, attack, self }: PvpV2EndProps) {
  const go = useAppNavigate();
  const onBack = useUpTo("/pvp/league");
  if (attack.status === "open") {
    return <PvpSearchScene state="error" player={self} error="This attack is still under way." onRetry={() => go("/pvp", { replace: true })} onCancel={onBack} />;
  }
  return <End me={me} attack={attack} onBack={onBack} />;
}

function End({ me, attack, onBack }: { me: string; attack: AttackV2; onBack: () => void }) {
  const go = useAppNavigate();
  const now = useNow();
  const name = usePlayerStatus(attack.defender).data?.player.name ?? null;
  const village = useFreeVillage(me);
  const league = usePvpLeague(me);
  const skins = useBoardSkins(attack.defender);
  const settings = useBoardSettings();
  const { tiles, closings } = useMemo(() => attackEnd(attack), [attack]);
  // The rival's red void under the results, as the attack showed it (#772).
  const board = useMemo<FinalBoardProps>(() => {
    const { squareGrid, fog } = settings.renderer;
    const renderer = squareGrid ? { ...settings.renderer, ...sideSettings("rival", squareGrid, fog) } : settings.renderer;
    return { tiles, skins, basePath: RENDERER_ASSETS, settings: renderer };
  }, [tiles, skins, settings.renderer]);
  const crowns = attack.gained - attack.lost;
  const xp = village.data ? endXp(village.data.xp, attack.xp) : null;
  return (
    <PvpEndScene
      defender={{ name, address: attack.defender, level: 0, crowns: 0 }}
      stars={attack.stars}
      score={attack.score}
      target={attack.target}
      surrendered={attack.status === "surrendered"}
      crowns={crowns}
      crownsAfter={league.data?.crowns ?? crowns}
      xp={xp}
      chest={endChest(attack)}
      closings={closings}
      board={board}
      now={now}
      onOpenChest={() => go("/village/chests")}
      onAgain={() => go("/pvp")}
      onLeague={() => go("/pvp/league")}
      onBack={onBack}
    />
  );
}
