import { slotsOf } from "@paved/game-core";
import type { PvpPlayer, PvpVillage } from "../lib/pvp-rules";
import { ATTACK_STAR_PERCENTS, attackStars } from "../lib/pvp-v2-rules";
import type { MatchView, PvpMatchSceneProps } from "../components/scenes/pvp-match-scene";
import { ME } from "./pvp";
import { RIVAL_V2, RIVAL_V2_VILLAGE, V2_ATTACK_STEPS } from "./pvp-v2";
import { attackDeckOf, buildFreeVillage, playAttackV2, type AttackStep } from "./pvp-attack";

/**
 * The match page's fakes (#786), played on the engine: the player's attack on a rival (`RIVAL_V2`'s village, the v2 attack of
 * the stories), and a rival's attack on the player's own village (a level-9 free village of the player's, 17 slots, and the
 * attack's build on the deck drawn from it). Each with its two views, the village from the snapshot and the build.
 */

/** The rival who attacked the player's village. */
export const DEFENCE_RIVAL: PvpPlayer = { name: "Bram of Saltmarsh", address: "0x07a1c4e2b3d5f6071829304a5b6c7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e8", level: 10, crowns: 1_190 };

/** The player's village at the attack's start: level 9, 17 slots. */
export const MY_V2_VILLAGE = buildFreeVillage(57, slotsOf(9));
/** The rival's build on the deck drawn from the player's village. */
export const DEFENCE_STEPS = playAttackV2(attackDeckOf(MY_V2_VILLAGE, slotsOf(9), 14), 5);

/** A scene's data without its callbacks. */
type Data<P> = { [K in keyof P as K extends `on${string}` ? never : K]: P[K] };

interface MatchFake {
  side: "attack" | "defence";
  rival: PvpPlayer;
  attacker: PvpPlayer;
  village: PvpVillage;
  steps: readonly AttackStep[];
}

export const MATCH_ATTACK: MatchFake = { side: "attack", rival: RIVAL_V2, attacker: ME, village: RIVAL_V2_VILLAGE, steps: V2_ATTACK_STEPS };
export const MATCH_DEFENCE: MatchFake = { side: "defence", rival: DEFENCE_RIVAL, attacker: DEFENCE_RIVAL, village: MY_V2_VILLAGE, steps: DEFENCE_STEPS };

/** The match scene of `m` on `view`, the replay at `move` (the build's last by default). */
export function matchAt(m: MatchFake, view: MatchView, move = m.steps.length - 1, playing = false): Data<PvpMatchSceneProps> {
  const total = m.steps.length - 1;
  const at = Math.min(move, total);
  const step = m.steps[at]!;
  const last = m.steps[total]!;
  return {
    side: m.side,
    rival: m.rival,
    view,
    target: m.village.score,
    final: { score: last.score, stars: attackStars(last.score, m.village.score) },
    starPercents: ATTACK_STAR_PERCENTS,
    tiles: view === "village" ? [...m.village.tiles] : step.tiles,
    score: step.score,
    delta: step.delta,
    lastScored: step.lastScored,
    remaining: 0,
    hand: { tile: null, state: "empty" },
    replay: { attacker: m.attacker, move: at, total, playing },
  };
}

export const PVP_MATCH = {
  attackVillage: matchAt(MATCH_ATTACK, "village"),
  attackBuild: matchAt(MATCH_ATTACK, "build"),
  /** The build halfway through the replay, playing. */
  attackMidway: matchAt(MATCH_ATTACK, "build", 11, true),
  defenceVillage: matchAt(MATCH_DEFENCE, "village"),
  defenceBuild: matchAt(MATCH_DEFENCE, "build"),
} satisfies Record<string, Data<PvpMatchSceneProps>>;
