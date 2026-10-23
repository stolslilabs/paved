/** The PvP attacks (#643, `docs/architecture/pvp-attacks.md`): `Arena`'s writes and the shapes of its views. */
import { describe, expect, test } from "vitest";
import arenaAbi from "../../../contracts/abis/Arena.json";
import matchmakerAbi from "../../../contracts/abis/Matchmaker.json";
import villageAbi from "../../../contracts/abis/Village.json";
import {
  ATTACK_DECK_FIELDS,
  ATTACK_FIELDS,
  ATTACK_MOVE_FIELDS,
  attack,
  attackDeck,
  attackMove,
  drawIndex,
  playCall,
  playCalls,
  startAttackCalls,
  starsOf,
  surrenderCall,
} from "../src/arena";
import { AbiCodec, type Abi } from "../src/codec";
import { vrfSalt } from "../src/vrf";

const codec = new AbiCodec(arenaAbi as Abi);

describe("Arena's ABI", () => {
  test("the view structs have the fields the decoders read, in order", () => {
    expect(codec.structFields("paved::systems::arena::Attack")).toEqual(ATTACK_FIELDS);
    expect(codec.structFields("paved::components::deckable::Deck")).toEqual(ATTACK_DECK_FIELDS);
    expect(codec.structFields("paved::components::recordable::AttackMove")).toEqual(ATTACK_MOVE_FIELDS);
  });

  test("it has the writes and views the client uses; Matchmaker the hold, Village the snapshot's parcel", () => {
    for (const name of ["start", "play", "surrender", "attack", "deck", "moves", "npc_level"]) {
      expect(codec.hasFunction(name), name).toBe(true);
    }
    expect(new AbiCodec(matchmakerAbi as Abi).hasFunction("held")).toBe(true);
    expect(new AbiCodec(villageAbi as Abi).hasFunction("parcel_of")).toBe(true);
  });
});

describe("the stars", () => {
  test("come at 70, 85 and 110 % of the target, none for a score of 0", () => {
    expect([0, 69, 70, 84, 85, 109, 110, 500].map((score) => starsOf(score, 100))).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
    expect(starsOf(0, 0)).toBe(0);
    expect(starsOf(1, 0)).toBe(3);
  });
});

describe("the writes", () => {
  test("start puts the VRF request of draw 0 of the next attack first", () => {
    const calls = startAttackCalls("0x9", "0x5", "0x1234", 2);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual({ contractAddress: "0x5", entrypoint: "request_random", calldata: ["0x9", "0x1", vrfSalt("ATTACK", "0x1234", 3 * 128)] });
    expect(calls[1]).toEqual({ contractAddress: "0x9", entrypoint: "start", calldata: [] });
  });

  test("play draws the next tile while one is left, not after the last", () => {
    const build = { discard: false as const, orientation: 2, cell: { x: 1, y: -1 } };
    const open = playCalls("0x9", "0x5", "0x1234", 4, { size: 3, drawn: 2, hand: 17, bitmap: 3n }, build);
    expect(open).toHaveLength(2);
    expect(open[0]?.calldata).toEqual(["0x9", "0x1", vrfSalt("ATTACK", "0x1234", 4 * 128 + 2)]);
    expect(open[1]).toEqual({ contractAddress: "0x9", entrypoint: "play", calldata: ["0x0", "0x2", "0x80000000", "0x7ffffffe"] });
    const last = playCalls("0x9", "0x5", "0x1234", 4, { size: 3, drawn: 3, hand: 17, bitmap: 7n }, { discard: true });
    expect(last).toEqual([{ contractAddress: "0x9", entrypoint: "play", calldata: ["0x1", "0x0", "0x0", "0x0"] }]);
    expect(() => playCall("0x9", { discard: false, orientation: 5, cell: { x: 1, y: 0 } })).toThrow("Not an orientation");
    expect(surrenderCall("0x9")).toEqual({ contractAddress: "0x9", entrypoint: "surrender", calldata: [] });
  });

  test("a draw index stays within its attack", () => {
    expect(drawIndex(1, 0)).toBe(128);
    expect(drawIndex(1, 127)).toBe(255);
    expect(() => drawIndex(1, 128)).toThrow("Not a draw of an attack");
  });
});

describe("the views", () => {
  test("decode the structs", () => {
    expect(
      attack({ id: 2n, status: 1n, defender: "0xb0b", npc: false, parcels: 3n, target: 600n, board: 7n, placed: 0n, startedAt: 1_800_000_000n, score: 0n, stars: 0n }),
    ).toEqual({ id: 2, status: 1, defender: "0xb0b", npc: false, parcels: 3, target: 600, board: 7, placed: 0, startedAt: 1_800_000_000, score: 0, stars: 0 });
    expect(attackDeck({ size: 38n, drawn: 5n, hand: 17n, bitmap: 0x1fn })).toEqual({ size: 38, drawn: 5, hand: 17, bitmap: 0x1fn });
    expect(attackMove({ plan: 17n, discard: false, orientation: 1n, x: 0x80000000n, y: 0x7fffffffn })).toEqual({
      plan: 17,
      discard: false,
      orientation: 1,
      cell: { x: 1, y: 0 },
    });
    expect(attackMove({ plan: 3n, discard: true, orientation: 0n, x: 0n, y: 0n })).toEqual({ plan: 3, discard: true });
  });
});
