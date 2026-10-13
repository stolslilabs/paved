import { shortString } from "starknet";
import { describe, expect, test, vi } from "vitest";
import { FAUCET_USDC_AMOUNT, MOCK_USDC_ABI, createCodecs } from "../src/abis";
import { AbiCodec } from "../src/codec";
import { resolveDeployment } from "../src/deployment";
import { PavedClient, type PavedRpc } from "../src/paved-client";
import { FakeGameViews } from "../src/views";
import { FaucetCapError, WriteError } from "../src/writer";

const MOCK_USDC = "0x77";
const PLAYER = "0x5";
const DAILY = "0x2";
const deployment = resolveDeployment({
  network: "devnet",
  env: { rpcUrl: "http://x", addresses: { Account: "0x1", Daily: DAILY, Tutorial: "0x3", Token: "0x4" }, mockUsdc: MOCK_USDC },
});
const codecs = createCodecs();
const u256 = (value: bigint) => [`0x${(value & ((1n << 128n) - 1n)).toString(16)}`, `0x${(value >> 128n).toString(16)}`];

type Receipt = { execution_status?: string; revert_reason?: string; events?: unknown[] };

function writerWith(options: { receipt?: Receipt; views?: FakeGameViews; dep?: typeof deployment } = {}) {
  const execute = vi.fn(async (_calls: Array<{ contractAddress: string; entrypoint: string; calldata: string[] }>) => ({ transaction_hash: "0x1" }));
  const rpc = {
    callContract: async () => [],
    getEvents: async () => ({ events: [] }),
    waitForTransaction: async () => options.receipt ?? { execution_status: "SUCCEEDED", events: [] },
  } as unknown as PavedRpc;
  const client = new PavedClient(options.dep ?? deployment, rpc, codecs, options.views ?? new FakeGameViews());
  const writer = client.writer({ address: PLAYER, execute });
  return { writer, execute, client };
}

const sent = (execute: ReturnType<typeof writerWith>["execute"]) => execute.mock.calls[0][0];

describe("the devnet faucet is MockUSDC.mint(self, N)", () => {
  test("mint() calls MockUSDC at contracts.MockUSDC, never the old Token", async () => {
    const { writer, execute } = writerWith();
    await writer.mint();
    const [call] = sent(execute);
    expect([BigInt(call.contractAddress), call.entrypoint]).toEqual([BigInt(MOCK_USDC), "mint"]);
    expect(call.calldata).toEqual(new AbiCodec(MOCK_USDC_ABI).encodeCall("mint", [PLAYER, FAUCET_USDC_AMOUNT]));
    expect(BigInt(call.calldata[0])).toBe(BigInt(PLAYER));
    expect(call.calldata.slice(1).map(BigInt)).toEqual(u256(FAUCET_USDC_AMOUNT).map(BigInt));
    expect(BigInt(call.contractAddress)).not.toBe(BigInt(deployment.addresses.Token));
  });

  test("createPlayer with mintTestToken mints USDC first, then creates the account", async () => {
    const { writer, execute } = writerWith();
    await writer.createPlayer("ada", { mintTestToken: true });
    const calls = sent(execute);
    expect(calls.map((c) => [BigInt(c.contractAddress), c.entrypoint])).toEqual([[BigInt(MOCK_USDC), "mint"], [BigInt("0x1"), "create"]]);
    await writer.createPlayer("ada", { mintTestToken: false });
    expect(execute.mock.calls[1][0].map((c) => c.entrypoint)).toEqual(["create"]);
  });

  test("a deployment with no MockUSDC offers no faucet: nothing is sent", async () => {
    const dep = resolveDeployment({ network: "mainnet", env: { rpcUrl: "http://x", addresses: { Account: "0x1", Daily: DAILY, Tutorial: "0x3", Token: "0x4" } } });
    expect(dep.mockUsdc).toBe("");
    const { writer, execute } = writerWith({ dep });
    await expect(writer.mint()).rejects.toThrow(WriteError);
    await expect(writer.createPlayer("ada", { mintTestToken: true })).rejects.toThrow(/No faucet/);
    expect(execute).not.toHaveBeenCalled();
  });

  test("never on mainnet: a deployment with a MockUSDC in its file and env resolves none, and sends no mint", async () => {
    const file = { contracts: { MockUSDC: { address: "0x9" } } };
    const env = { rpcUrl: "http://x", addresses: { Account: "0x1", Daily: DAILY, Tutorial: "0x3", Token: "0x4" }, mockUsdc: MOCK_USDC };
    for (const network of ["mainnet", "", "goerli", "Sepolia"]) {
      const dep = resolveDeployment({ network, file, env });
      expect(dep.mockUsdc, network).toBe("");
      const { writer, execute } = writerWith({ dep });
      await expect(writer.mint()).rejects.toThrow(/No faucet/);
      await expect(writer.createPlayer("ada", { mintTestToken: true })).rejects.toThrow(/No faucet/);
      expect(execute).not.toHaveBeenCalled();
    }
  });

  test("sepolia resolves the MockUSDC of its file or env, and mints 100 USDC, under both caps of the contract", async () => {
    const file = { contracts: { MockUSDC: { address: "0x9" } } };
    const env = { rpcUrl: "http://x", addresses: { Account: "0x1", Daily: DAILY, Tutorial: "0x3", Token: "0x4" } };
    expect(resolveDeployment({ network: "sepolia", file, env }).mockUsdc).toBe("0x9");
    expect(resolveDeployment({ network: "sepolia", file, env: { ...env, mockUsdc: "0xa" } }).mockUsdc).toBe("0xa");
    const dep = resolveDeployment({ network: "sepolia", file, env });
    const { writer, execute } = writerWith({ dep });
    await writer.mint();
    const [call] = sent(execute);
    expect([BigInt(call.contractAddress), call.entrypoint]).toEqual([9n, "mint"]);
    // contracts/src/mocks/usdc.cairo: MINT_CAP_PER_CALL 10,000 USDC, MINT_CAP_PER_ADDRESS 20,000 USDC (6 decimals).
    expect(FAUCET_USDC_AMOUNT).toBeLessThanOrEqual(10_000_000_000n);
    expect(FAUCET_USDC_AMOUNT).toBeLessThanOrEqual(20_000_000_000n);
  });

  describe("a cap the contract enforces is told in words, not as a raw revert", () => {
    const reverted = (reason: string) => ({ execution_status: "REVERTED", revert_reason: reason });
    const asHex = (reason: string) => `Error in the called contract: ${shortString.encodeShortString(reason)}`;

    test.each([
      ["MockUSDC: over the address cap", "address", /received everything the faucet gives/],
      ["MockUSDC: over the call cap", "call", /over what one request may mint/],
    ] as const)("%s", async (reason, cap, words) => {
      for (const revert of [reason, asHex(reason)]) {
        const { writer } = writerWith({ receipt: reverted(revert) });
        for (const run of [() => writer.mint(), () => writer.createPlayer("ada", { mintTestToken: true })]) {
          const error = await run().catch((e) => e);
          expect(error).toBeInstanceOf(FaucetCapError);
          expect(error).toBeInstanceOf(WriteError);
          expect(error.cap).toBe(cap);
          expect(error.message).toMatch(words);
          expect(error.message).not.toMatch(/MockUSDC|0x/);
          expect(error.reverted).toBe(true);
        }
      }
    });

    test("rejected at the fee estimation (nothing sent) it is the same error; any other revert stays raw", async () => {
      const { writer, execute } = writerWith();
      execute.mockRejectedValueOnce(new Error("Execution failed: MockUSDC: over the address cap"));
      const error = await writer.mint().catch((e) => e);
      expect(error).toBeInstanceOf(FaucetCapError);
      expect(error.transactionHash).toBeUndefined();
      expect(error.reverted).toBe(false);
      const other = writerWith({ receipt: reverted("ERC20: insufficient balance") });
      const raw = await other.writer.mint().catch((e) => e);
      expect(raw).not.toBeInstanceOf(FaucetCapError);
      expect(raw.message).toBe("ERC20: insufficient balance");
    });

    test("a plain createPlayer keeps its own errors: a cap name there is not turned into the faucet's", async () => {
      const { writer } = writerWith({ receipt: reverted("MockUSDC: over the call cap") });
      expect(await writer.createPlayer("ada").catch((e) => e)).not.toBeInstanceOf(FaucetCapError);
    });
  });

  test("the address comes from the deployments file's contracts.MockUSDC, the env first", () => {
    const file = { contracts: { MockUSDC: { address: "0x9" } } };
    const base = { network: "devnet", env: { rpcUrl: "http://x", addresses: { Account: "0x1", Daily: DAILY, Tutorial: "0x3", Token: "0x4" } } };
    expect(resolveDeployment({ ...base, file }).mockUsdc).toBe("0x9");
    expect(resolveDeployment({ ...base, file, env: { ...base.env, mockUsdc: "0xa" } }).mockUsdc).toBe("0xa");
    expect(resolveDeployment({ ...base, file: { contracts: { MockUSDC: { address: "0x0" } } } }).mockUsdc).toBe("");
  });
});
