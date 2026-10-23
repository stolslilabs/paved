/** The village rewards (#642, `docs/architecture/village-rewards.md`): `Rewards`' writes and the shapes of its views. */
import { describe, expect, test } from "vitest";
import rewardsAbi from "../../../contracts/abis/Rewards.json";
import setupAbi from "../../../contracts/abis/Setup.json";
import { AbiCodec, type Abi } from "../src/codec";
import {
  REWARD_GRANTS_FIELDS,
  REWARD_OFFER_FIELDS,
  claimRewardCall,
  isOfferOpen,
  openRewardCalls,
  rewardGrants,
  rewardOffer,
  tierOf,
} from "../src/rewards";
import { vrfSalt } from "../src/vrf";

const codec = new AbiCodec(rewardsAbi as Abi);

describe("Rewards' ABI", () => {
  test("the view structs have the fields the decoders read, in order", () => {
    expect(codec.structFields("paved::systems::rewards::RewardGrants")).toEqual(REWARD_GRANTS_FIELDS);
    expect(codec.structFields("paved::systems::rewards::RewardOffer")).toEqual(REWARD_OFFER_FIELDS);
  });

  test("it has the writes and views the client uses, and Setup the skins' tier", () => {
    for (const name of ["open_reward", "claim_reward", "grants", "offer", "copies", "tier", "daily_cap"]) {
      expect(codec.hasFunction(name), name).toBe(true);
    }
    expect(new AbiCodec(setupAbi as Abi).hasFunction("skin_tier")).toBe(true);
  });
});

describe("the tier", () => {
  test("is floor(log2(copies)), 0 under 2 copies", () => {
    expect([0, 1, 2, 3, 4, 7, 8, 16, 31, 32].map(tierOf)).toEqual([0, 0, 1, 1, 2, 2, 3, 4, 4, 5]);
  });
});

describe("the writes", () => {
  test("open_reward puts the VRF request of the reward's salt first", () => {
    const calls = openRewardCalls("0x9", "0x5", "0x1234", 3);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual({ contractAddress: "0x5", entrypoint: "request_random", calldata: ["0x9", "0x1", vrfSalt("REWARD", "0x1234", 3)] });
    expect(calls[1]).toEqual({ contractAddress: "0x9", entrypoint: "open_reward", calldata: [] });
  });

  test("claim_reward takes the choice, the slot, the orientation and the chain's coordinates", () => {
    expect(claimRewardCall("0x9", { choice: "place", slot: 2, orientation: 4, cell: { x: 1, y: -1 } })).toEqual({
      contractAddress: "0x9",
      entrypoint: "claim_reward",
      calldata: ["0x1", "0x2", "0x4", "0x80000000", "0x7ffffffe"],
    });
    expect(claimRewardCall("0x9", { choice: "merge", slot: 1 }).calldata).toEqual(["0x2", "0x1", "0x0", "0x0", "0x0"]);
    expect(claimRewardCall("0x9", { choice: "cobbles" }).calldata).toEqual(["0x3", "0x0", "0x0", "0x0", "0x0"]);
    expect(() => claimRewardCall("0x9", { choice: "merge", slot: 3 })).toThrow("Not an offer slot");
    expect(() => claimRewardCall("0x9", { choice: "place", slot: 0, orientation: 0, cell: { x: 1, y: 0 } })).toThrow("Not an orientation");
  });
});

describe("the views", () => {
  test("decode the structs", () => {
    expect(rewardGrants({ day: 20_000n, today: 2n, pending: 1n, opened: 5n })).toEqual({ day: 20_000, today: 2, pending: 1, opened: 5 });
    const offer = rewardOffer({ index: 4n, plan1: 13n, plan2: 10n, plan3: 1n });
    expect(offer).toEqual({ index: 4, plans: [13, 10, 1] });
    expect(isOfferOpen(offer)).toBe(true);
    expect(isOfferOpen(rewardOffer({ index: 0n, plan1: 0n, plan2: 0n, plan3: 0n }))).toBe(false);
  });
});
