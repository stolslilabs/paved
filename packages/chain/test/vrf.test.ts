import { describe, expect, test } from "vitest";
import { hash, num, shortString } from "starknet";
import {
  CARTRIDGE_VRF_PROVIDER,
  VRF_REQUEST_ENTRY_POINT,
  vrfPolicies,
  vrfProvider,
  vrfRequestCall,
  vrfSalt,
  withVrfRequest,
} from "../src/vrf";

const SYSTEM = "0x123";
const MOCK = "0x0456";

describe("vrfSalt mirrors draw_salt (contracts/src/vrf.cairo)", () => {
  test("the salt pinned by test_vrf_draw_salt_is_the_pinned_poseidon", () => {
    expect(vrfSalt("HARNESS", 7, 3)).toBe("0x78ba0793b93212b3136621ba381892ab3481825db0d2e7b81285b0cf59a3d14");
  });

  test("is Poseidon of the domain, the kind, the game and the index", () => {
    const expected = hash.computePoseidonHashOnElements([shortString.encodeShortString("PAVED_DRAW"), "0x2a", "0x7", "0x0"]);
    expect(vrfSalt(42n, "0x7", 0)).toBe(expected);
    expect(vrfSalt("42", 7, 0)).toBe(expected);
  });

  test("differs by kind, game and index", () => {
    const salt = vrfSalt("HARNESS", 7, 3);
    expect(vrfSalt("OTHER", 7, 3)).not.toBe(salt);
    expect(vrfSalt("HARNESS", 8, 3)).not.toBe(salt);
    expect(vrfSalt("HARNESS", 7, 4)).not.toBe(salt);
  });

  test("refuses an index that is not a u32", () => {
    for (const index of [-1, 1.5, 2 ** 32]) expect(() => vrfSalt("HARNESS", 7, index)).toThrow(/draw index/);
  });
});

describe("the request call", () => {
  test("request_random(consumer, Source::Salt(salt)) on the provider", () => {
    const salt = vrfSalt("HARNESS", 7, 0);
    expect(vrfRequestCall({ provider: MOCK, consumer: SYSTEM, salt })).toEqual({
      contractAddress: MOCK,
      entrypoint: VRF_REQUEST_ENTRY_POINT,
      calldata: ["0x123", "0x1", num.toHex(salt)],
    });
  });

  test("comes first in the multicall, the write's calls after it in order", () => {
    const write = [
      { contractAddress: SYSTEM, entrypoint: "a", calldata: [] },
      { contractAddress: SYSTEM, entrypoint: "b", calldata: ["0x1"] },
    ];
    const calls = withVrfRequest(write, { provider: MOCK, consumer: SYSTEM, salt: "0x9" });
    expect(calls.map((call) => call.entrypoint)).toEqual([VRF_REQUEST_ENTRY_POINT, "a", "b"]);
    expect(calls.slice(1)).toEqual(write);
  });
});

describe("the provider of each network", () => {
  test("Cartridge's on Sepolia and mainnet, whatever the file records", () => {
    const file = { contracts: { MockVrfProvider: { address: MOCK } } };
    expect(vrfProvider("sepolia", file)).toBe(CARTRIDGE_VRF_PROVIDER);
    expect(vrfProvider("mainnet", file)).toBe(CARTRIDGE_VRF_PROVIDER);
  });

  test("the mock the devnet file records, none without one", () => {
    expect(vrfProvider("devnet", { contracts: { MockVrfProvider: { address: MOCK } } })).toBe(MOCK);
    expect(vrfProvider("devnet", { contracts: { MockVrfProvider: { address: "0x0" } } })).toBe("");
    expect(vrfProvider("devnet", { contracts: {} })).toBe("");
    expect(vrfProvider("devnet", null)).toBe("");
  });

  test("none on any other network, never the mock", () => {
    expect(vrfProvider("katana", { contracts: { MockVrfProvider: { address: MOCK } } })).toBe("");
  });

  test("the request is a session policy on the provider only", () => {
    expect(vrfPolicies(CARTRIDGE_VRF_PROVIDER)).toEqual([{ target: CARTRIDGE_VRF_PROVIDER, method: "request_random" }]);
    expect(vrfPolicies("")).toEqual([]);
  });
});
