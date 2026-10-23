import type { Decoded } from "./codec";
import { fromCell, type VillageCell } from "./village";
import { vrfSalt, withVrfRequest } from "./vrf";
import type { Call } from "./writer";

// The village rewards and the tiers (#642, docs/architecture/village-rewards.md): the writes a player sends to `Rewards` (open
// a pending reward, claim its offer) and the shapes of its views, decoded from their ABI structs. A game's end grants the
// reward on chain (`Setup` calls `Rewards.grant`); opening it draws its 3 tiles on Cartridge's VRF, so its write puts the
// provider's request first; the claim is one gesture: place the tile, merge it as a copy of its plan, or take the Cobbles.
// `Rewards` is not deployed yet, as `Village`: the village screen's wiring (#646) takes its address from the deployment.

/** `Rewards.grants(player_id)`: the chain day, the rewards granted that day, the rewards pending, the rewards opened. */
export interface RewardGrants {
  day: number;
  today: number;
  pending: number;
  /** The rewards opened so far: the next offer's index, which its VRF salt takes. */
  opened: number;
}

/** `Rewards.offer(player_id)`: the open offer's index and its 3 plan codes; plans 0 when none is open. */
export interface RewardOffer {
  index: number;
  plans: [number, number, number];
}

/** The struct fields of the views, in ABI order (camelCased); a test checks them against `contracts/abis/Rewards.json`. */
export const REWARD_GRANTS_FIELDS = ["day", "today", "pending", "opened"];
export const REWARD_OFFER_FIELDS = ["index", "plan1", "plan2", "plan3"];

/** The kind of an offer's VRF draw (`REWARD_KIND`): its salt is `vrfSalt(REWARD_DRAW_KIND, player, opened)`. */
export const REWARD_DRAW_KIND = "REWARD";

/** The Cobbles of the "take Cobbles" choice (`REWARD_COBBLES`, rule B, validated by the owner on 2026-10-23). */
export const REWARD_COBBLES = 5;

/** The choices of `claim_reward` (`CHOICE_PLACE`, `CHOICE_MERGE`, `CHOICE_COBBLES`). */
export const REWARD_CHOICE = { place: 1, merge: 2, cobbles: 3 } as const;

/** One claim: a slot (0 to 2) placed at a cell turned to an orientation code (1 North to 4 West), merged, or the Cobbles. */
export type RewardClaim =
  | { choice: "place"; slot: number; orientation: number; cell: VillageCell }
  | { choice: "merge"; slot: number }
  | { choice: "cobbles" };

/** The tier of `copies` copies of a plan, as `tier_of` computes it: 0 under 2, then `floor(log2(copies))`. */
export function tierOf(copies: number): number {
  let tier = 0;
  for (let left = copies; left >= 2; left = Math.floor(left / 2)) tier += 1;
  return tier;
}

const n = (value: Decoded | undefined): number => Number(value ?? 0);

export const rewardGrants = (s: Record<string, Decoded>): RewardGrants => ({
  day: n(s.day),
  today: n(s.today),
  pending: n(s.pending),
  opened: n(s.opened),
});

export const rewardOffer = (s: Record<string, Decoded>): RewardOffer => ({
  index: n(s.index),
  plans: [n(s.plan1), n(s.plan2), n(s.plan3)],
});

/** Whether the offer is open (its plans are drawn). */
export const isOfferOpen = (offer: RewardOffer): boolean => offer.plans[0] !== 0;

/**
 * `Rewards.open_reward()`, its VRF request first: the salt of the player's reward `opened` (`grants(player).opened`), the
 * consumer `Rewards`. One draw per transaction: nothing else that draws goes in the same multicall.
 */
export function openRewardCalls(rewards: string, provider: string, playerId: string, opened: number): Call[] {
  const call: Call = { contractAddress: rewards, entrypoint: "open_reward", calldata: [] };
  return withVrfRequest([call], { provider, consumer: rewards, salt: vrfSalt(REWARD_DRAW_KIND, playerId, opened) });
}

/** `Rewards.claim_reward(choice, slot, orientation, x, y)`: the offer claimed in one gesture. */
export function claimRewardCall(rewards: string, claim: RewardClaim): Call {
  const slot = claim.choice === "cobbles" ? 0 : claim.slot;
  if (!Number.isInteger(slot) || slot < 0 || slot > 2) throw new Error(`Not an offer slot: ${slot}`);
  let orientation = 0;
  let cell: [string, string] = ["0x0", "0x0"];
  if (claim.choice === "place") {
    if (!Number.isInteger(claim.orientation) || claim.orientation < 1 || claim.orientation > 4) {
      throw new Error(`Not an orientation code: ${claim.orientation}`);
    }
    orientation = claim.orientation;
    cell = fromCell(claim.cell);
  }
  return {
    contractAddress: rewards,
    entrypoint: "claim_reward",
    calldata: [`0x${REWARD_CHOICE[claim.choice].toString(16)}`, `0x${slot.toString(16)}`, `0x${orientation.toString(16)}`, ...cell],
  };
}
