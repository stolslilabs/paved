/** The village (#640, `docs/architecture/village-territory.md`): `Village`'s writes and the shapes of its views. */
import { describe, expect, test } from "vitest";
import villageAbi from "../../../contracts/abis/Village.json";
import { AbiCodec, type Abi } from "../src/codec";
import {
  DEMOLITION_OFFER_FIELDS,
  VILLAGE_CELL_FIELDS,
  VILLAGE_INFO_FIELDS,
  VILLAGE_TILE_FIELDS,
  buyParcelCall,
  demolishCall,
  demolitionOffer,
  foundVillageCall,
  fromCell,
  toCell,
  villageInfo,
  villageTile,
} from "../src/village";

const codec = new AbiCodec(villageAbi as Abi);
const CENTER = 0x7fffffff;

describe("Village's ABI", () => {
  test("the view structs have the fields the decoders read, in order", () => {
    expect(codec.structFields("paved::systems::village::VillageInfo")).toEqual(VILLAGE_INFO_FIELDS);
    expect(codec.structFields("paved::systems::village::DemolitionOffer")).toEqual(DEMOLITION_OFFER_FIELDS);
    expect(codec.structFields("paved::systems::village::VillageCell")).toEqual(VILLAGE_CELL_FIELDS);
    expect(codec.structFields("paved::systems::village::VillageTile")).toEqual(VILLAGE_TILE_FIELDS);
  });

  test("it has the writes and views the client uses", () => {
    for (const name of ["found", "buy_parcel", "demolish", "village", "cells", "tiles", "next_demolition", "parcel_price", "parcel_level"]) {
      expect(codec.hasFunction(name), name).toBe(true);
    }
  });
});

describe("the writes", () => {
  test("found, buy_parcel and demolish take the chain's coordinates", () => {
    expect(foundVillageCall("0x9")).toEqual({ contractAddress: "0x9", entrypoint: "found", calldata: [] });
    expect(buyParcelCall("0x9", { x: 2, y: -1 })).toEqual({
      contractAddress: "0x9",
      entrypoint: "buy_parcel",
      calldata: [`0x${(CENTER + 2).toString(16)}`, `0x${(CENTER - 1).toString(16)}`],
    });
    expect(demolishCall("0x9", { x: 0, y: 1 }).calldata).toEqual(["0x7fffffff", "0x80000000"]);
    expect(() => fromCell({ x: 0.5, y: 0 })).toThrow("Not a village cell");
    expect(() => fromCell({ x: 0, y: 65 })).toThrow("Not a village cell");
  });
});

describe("the views", () => {
  test("decode the structs, cells relative to the starter", () => {
    expect(villageInfo({ gameId: 3n, cells: 10n, tiles: 2n, score: 438n, nextParcel: 2n, nextPrice: 20n, nextLevel: 2n })).toEqual({
      gameId: 3,
      cells: 10,
      tiles: 2,
      score: 438,
      nextParcel: 2,
      nextPrice: 20,
      nextLevel: 2,
    });
    expect(demolitionOffer({ day: 20_000n, count: 2n, price: 20n })).toEqual({ day: 20_000, count: 2, price: 20 });
    expect(villageTile({ id: 1n, plan: 9n, orientation: 3n, x: BigInt(CENTER), y: BigInt(CENTER) })).toEqual({
      id: 1,
      plan: 9,
      orientation: 3,
      x: 0,
      y: 0,
    });
    expect(toCell(CENTER - 1, CENTER + 2)).toEqual({ x: -1, y: 2 });
  });
});
