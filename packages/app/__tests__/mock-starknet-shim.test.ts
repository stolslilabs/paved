import { describe, expect, it } from "vitest";
import * as starknet from "starknet";
import { LOCAL_ACCOUNT_CLASS_HASH } from "@paved/chain";
import * as shim from "../src/data/mock/starknet-shim";
import viteConfig, { mockWithoutStarknet } from "../vite.config";

// The starknet.js of a mock build (#927, `vite.config.ts`): the helpers `@paved/chain` calls on the mock's way answer what
// starknet.js answers, on the same `@scure/starknet`; its node classes refuse. Only a mock build resolves `starknet` to it.

const KEYS = ["0x1", "0x2d6a3c8a1f2c9d1b5e4f7a6b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4", "0x7ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff", starknet.ec.starkCurve.utils.randomPrivateKey()];

describe("the starknet shim of a mock build (#927)", () => {
  it("gives a key's public key and its account's address as starknet.js does: the same account for the same key", () => {
    for (const key of KEYS) {
      const privateKey = typeof key === "string" ? key : shim.encode.addHexPrefix(shim.encode.buf2hex(key));
      expect(privateKey).toBe(typeof key === "string" ? key : starknet.encode.addHexPrefix(starknet.encode.buf2hex(key)));
      const publicKey = shim.ec.starkCurve.getStarkKey(privateKey);
      expect(publicKey).toBe(starknet.ec.starkCurve.getStarkKey(privateKey));
      expect(shim.hash.calculateContractAddressFromHash(publicKey, LOCAL_ACCOUNT_CLASS_HASH, [publicKey], 0)).toBe(
        starknet.hash.calculateContractAddressFromHash(publicKey, LOCAL_ACCOUNT_CLASS_HASH, [publicKey], 0),
      );
    }
  });

  it("gives the selectors, hex, short strings and Poseidon hashes starknet.js gives", () => {
    for (const name of ["spawn", "GameSpawned", "claim_tutorial", "AchievementProgressed", ""]) expect(shim.hash.getSelectorFromName(name)).toBe(starknet.hash.getSelectorFromName(name));
    for (const value of [0, 255, "0x00ff", "1234", 2n ** 250n]) expect(shim.num.toHex(value)).toBe(starknet.num.toHex(value));
    for (const text of ["", "Village: cell not owned", "x".repeat(31)]) expect(shim.shortString.encodeShortString(text)).toBe(starknet.shortString.encodeShortString(text));
    expect(() => shim.shortString.encodeShortString("x".repeat(32))).toThrow(/too long/);
    expect(() => shim.shortString.encodeShortString("é")).toThrow(/ASCII/);
    expect(shim.hash.computePoseidonHashOnElements([1, "0x2", 3n])).toBe(starknet.hash.computePoseidonHashOnElements([1, "0x2", 3n]));
  });

  it("refuses a node's provider, an account and the UDC's constants", () => {
    expect(() => new shim.RpcProvider()).toThrow(shim.NOT_IN_A_MOCK_BUILD);
    expect(() => new shim.Account()).toThrow(shim.NOT_IN_A_MOCK_BUILD);
    expect(() => shim.constants.UDC).toThrow(shim.NOT_IN_A_MOCK_BUILD);
    expect(() => shim.getChecksumAddress()).toThrow(shim.NOT_IN_A_MOCK_BUILD);
  });
});

describe("vite.config.ts", () => {
  /** The config of a build or a dev server under `env` (the config is a function of the command, `defineConfig`'s). */
  type Config = (env: { command: "build" | "serve"; mode: string }) => { plugins: unknown[] };
  const pluginNames = (env: Record<string, string | undefined>, command: "build" | "serve" = "build") => {
    const saved = { ...process.env };
    try {
      for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k];
      else process.env[k] = v;
      const config = (viteConfig as unknown as Config)({ command, mode: "production" });
      return (config.plugins.flat() as Array<{ name?: string } | null>).map((p) => p?.name);
    } finally {
      process.env = saved;
    }
  };

  it("resolves starknet to the shim in a mock build only: Sepolia's default and VITE_DATA_SOURCE=mock, never devnet or the chain", () => {
    const name = mockWithoutStarknet().name;
    expect(pluginNames({ VITE_NETWORK: "sepolia", VITE_DATA_SOURCE: undefined })).toContain(name);
    expect(pluginNames({ VITE_NETWORK: "devnet", VITE_DATA_SOURCE: "mock" })).toContain(name);
    expect(pluginNames({ VITE_NETWORK: "sepolia", VITE_DATA_SOURCE: "chain" })).not.toContain(name);
    expect(pluginNames({ VITE_NETWORK: "devnet", VITE_DATA_SOURCE: undefined })).not.toContain(name);
    // The dev server without a network is devnet's: the chain.
    expect(pluginNames({ VITE_NETWORK: undefined, VITE_DATA_SOURCE: undefined }, "serve")).not.toContain(name);
  });

  it("aliases the bare `starknet` alone, to the shim", () => {
    const config = mockWithoutStarknet().config as () => { resolve: { alias: Array<{ find: RegExp; replacement: string }> } };
    const [alias] = config().resolve.alias;
    expect(alias!.find.test("starknet")).toBe(true);
    expect(alias!.find.test("starknet/dist/index.mjs")).toBe(false);
    expect(alias!.replacement).toMatch(/src\/data\/mock\/starknet-shim\.ts$/);
  });
});
