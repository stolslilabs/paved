import { describe, expect, test, vi } from "vitest";
import { createSystems } from "../src/contracts";

const manifest = {
  contracts: [
    { tag: "paved-Daily", address: "0x111" },
    { tag: "paved-Configurable", address: "0x999" },
  ],
};

function createProvider() {
  return {
    execute: vi.fn(async () => ({ transaction_hash: "0xabc" })),
    call: vi.fn(async () => [0]),
  } as any;
}

describe("createSystems.createGame", () => {
  test("routes template creation through Configurable with approve", async () => {
    const provider = createProvider();
    const systems = createSystems(provider, manifest);

    await systems.createGame({ account: {} as any, templateId: 7 });

    expect(provider.execute).toHaveBeenCalledTimes(1);
    const [, calls, namespace] = provider.execute.mock.calls[0];
    expect(namespace).toBe("paved");
    expect(calls).toEqual([
      {
        contractName: "Token",
        entrypoint: "approve",
        calldata: ["0x999", "0xde0b6b3a7640000"],
      },
      {
        contractName: "Configurable",
        entrypoint: "create_with_template",
        calldata: [7],
      },
    ]);
  });

  test("routes explicit config creation through Configurable entrypoint", async () => {
    const provider = createProvider();
    const systems = createSystems(provider, manifest);

    await systems.createGame({
      account: {} as any,
      configInput: {
        mode: "daily" as any,
        deckId: 2,
        entryPrice: 1000n,
        durationSeconds: 86400,
        tileLimit: 38,
        allowDiscard: true,
        allowSurrender: false,
        privateGame: false,
        accessRoot: 0,
        metadataUriHash: 123,
      },
    });

    expect(provider.execute).toHaveBeenCalledTimes(1);
    const [, calls] = provider.execute.mock.calls[0];
    expect(calls[1]).toEqual({
      contractName: "Configurable",
      entrypoint: "create_with_config",
      calldata: [1, 2, 1000n, 86400, 38, 1, 0, 0, 0, 123],
    });
  });

  test("routes preview validation call through Configurable", async () => {
    const provider = createProvider();
    const systems = createSystems(provider, manifest);

    const code = await systems.previewValidation({
      configInput: {
        mode: "daily" as any,
        deckId: 2,
        entryPrice: 1000n,
        durationSeconds: 86400,
        tileLimit: 38,
        allowDiscard: true,
        allowSurrender: false,
        privateGame: false,
        accessRoot: 0,
        metadataUriHash: 123,
      },
    });

    expect(code).toBe(0);
    expect(provider.call).toHaveBeenCalledTimes(1);
    expect(provider.call).toHaveBeenCalledWith("paved", {
      contractName: "Configurable",
      entrypoint: "preview_validation",
      calldata: [1, 2, 1000n, 86400, 38, 1, 0, 0, 0, 123],
    });
  });

  test("routes token mint through Token.mint", async () => {
    const provider = createProvider();
    const systems = createSystems(provider, manifest);

    await systems.mintToken({ account: {} as any });

    expect(provider.execute).toHaveBeenCalledTimes(1);
    const [, call, namespace] = provider.execute.mock.calls[0];
    expect(namespace).toBe("paved");
    expect(call).toEqual({
      contractName: "Token",
      entrypoint: "mint",
      calldata: [],
    });
  });

  test("parses economy preview multiplier tuple from array-shaped call result", async () => {
    const provider = createProvider();
    provider.call = vi.fn(async () => ["420", "500", "1250000"]);
    const systems = createSystems(provider, manifest);

    const result = await systems.previewEconomyMultiplier({ time: 100 });

    expect(provider.call).toHaveBeenCalledWith("paved", {
      contractName: "Economy",
      entrypoint: "preview_multiplier",
      calldata: [100],
    });
    expect(result).toEqual({
      supply: "420",
      target: "500",
      multiplierFp: 1250000,
    });
  });

  test("parses economy preview multiplier tuple from object-shaped call result", async () => {
    const provider = createProvider();
    provider.call = vi.fn(async () => ({
      supply: "700",
      target: "900",
      multiplier_fp: "800000",
    }));
    const systems = createSystems(provider, manifest);

    const result = await systems.previewEconomyMultiplier({ time: 100 });

    expect(result).toEqual({
      supply: "700",
      target: "900",
      multiplierFp: 800000,
    });
  });
});
