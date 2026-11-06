import { useMemo } from "react";
import type { BoardTile } from "@paved/chain";
import { CENTER, DAY_S, OrientationType, PlanType, dayOf, levelStatus, pvpChestRank } from "@paved/game-core";
import type { FinalBoardProps } from "../components/containers/final-board";
import { PvpEndScene, type PvpEndChest, type PvpEndXp } from "../components/scenes/pvp-end-scene";
import { PvpSearchScene } from "../components/scenes/pvp-search-scene";
import type { PvpPlayer } from "../lib/pvp-rules";
import { useBoardSkins } from "../data/board-skins";
import { sideSettings } from "../data/board-side";
import { attackV2Board, type AttackV2 } from "../data/free-attack";
import { useFreeVillage, type ChestOrigin } from "../data/free-village";
import { usePlayerStatus } from "../data/indexer";
import { usePvpLeague } from "../data/pvp-league";
import { RENDERER_ASSETS } from "../data/renderer-manifest";
import { useBoardSettings } from "../data/settings";
import { useNow } from "./now";
import { useEndChest } from "./end-chest";
import { useAppNavigate, useUpTo } from "./ref";

// `/pvp/result/:id` on PvP v2 (#790), its own chunk: the end screen of the attacker's attack `id`, read by its id (`attackV2Of`,
// the mock's record, #741; an id with no v2 attack is v1's result), so a reload or a link shows it again, after later attacks
// too. The attack's last move goes here with `replace` (`pvp-v2.tsx`), and Back goes up to the league: never into the finished
// attack.

const PLANS = Object.values(PlanType);
const ORIENTATIONS = Object.values(OrientationType);

/** A finished attack on the engine: its final board's tiles (the closings' window left the end, the owner's ask of 2026-11-06). */
export function attackEnd(attack: Pick<AttackV2, "moves">): { tiles: BoardTile[] } {
  const run = attackV2Board({ moves: [] });
  for (const m of attack.moves) run.apply(m.discard ? { plan: m.plan, discard: true } : { plan: m.plan, discard: false, orientation: m.orientation, cell: m.cell });
  const tiles = run.game.placed().map((t) => ({ id: t.id, plan: PLANS.indexOf(t.plan), orientation: ORIENTATIONS.indexOf(t.orientation), x: CENTER + t.x, y: CENTER + t.y }));
  return { tiles };
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

/**
 * Whether a chest's origin is the attack's: a PvP chest of the attack's day in the slot it filled (`chestSlot`), so a result
 * revisited after a later win of the same rank that day opens its own chest, not the later one. An origin the read does not say
 * passes (nothing to tell the chests apart); a slot the attack does not know never takes a chest that has one: it could be another
 * attack's (the end then says the chest opened rather than open the wrong one).
 */
export function attackChestOrigin(attack: Pick<AttackV2, "finishedAt" | "chestSlot">, origin: ChestOrigin | null | undefined): boolean {
  if (origin == null) return true;
  if (origin.source !== "pvp" || origin.day !== dayOf(attack.finishedAt)) return false;
  if (origin.slot == null) return true;
  return attack.chestSlot != null && origin.slot === attack.chestSlot;
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
  return <End me={me} attack={attack} />;
}

function End({ me, attack }: { me: string; attack: AttackV2 }) {
  const go = useAppNavigate();
  const now = useNow();
  const name = usePlayerStatus(attack.defender).data?.player.name ?? null;
  const village = useFreeVillage(me);
  const league = usePvpLeague(me);
  const skins = useBoardSkins(attack.defender);
  const settings = useBoardSettings();
  const { tiles } = useMemo(() => attackEnd(attack), [attack]);
  // The rival's red void under the results, as the attack showed it (#772).
  const board = useMemo<FinalBoardProps>(() => {
    const { squareGrid, fog } = settings.renderer;
    const renderer = squareGrid ? { ...settings.renderer, ...sideSettings("rival", squareGrid, fog) } : settings.renderer;
    return { tiles, skins, basePath: RENDERER_ASSETS, settings: renderer };
  }, [tiles, skins, settings.renderer]);
  const crowns = attack.gained - attack.lost;
  const xp = village.data ? endXp(village.data.xp, attack.xp) : null;
  // The chest won opens here (END-CHEST, the owner's ask of 2026-11-06): this attack's, a PvP chest of its day.
  const base = endChest(attack);
  const end = useEndChest(me, base.state === "won" ? { rank: base.rank, mine: (o) => attackChestOrigin(attack, o) } : null);
  return (
    <>
      <PvpEndScene
        defender={{ name, address: attack.defender, level: 0, crowns: 0 }}
        stars={attack.stars}
        score={attack.score}
        target={attack.target}
        surrendered={attack.status === "surrendered"}
        crowns={crowns}
        crownsAfter={league.data?.crowns ?? crowns}
        xp={xp}
        chest={base.state === "won" ? end.chest : base}
        board={board}
        now={now}
        tileArt={end.tileArt}
        onOpenChest={end.open}
        onVillage={() => go("/")}
        onAgain={() => go("/pvp")}
      />
      {end.modal}
    </>
  );
}
