import { shortString } from "starknet";
import { describe, expect, test, vi } from "vitest";
import { FAUCET_USDC_AMOUNT, FAUCET_ABI, createCodecs } from "../src/abis";
import { AbiCodec } from "../src/codec";
import { resolveDeployment } from "../src/deployment";
import { PavedClient, type PavedRpc } from "../src/paved-client";
import { FakeGameViews } from "../src/views";
import { FaucetCapError, WriteError } from "../src/writer";

const FAUCET_ADDR = "0x77";
const PLAYER = "0x5";
const CHALLENGE = "0x2";
const deployment = resolveDeployment({
  network: "devnet",
  env: { rpcUrl: "http://x", addresses: { Challenge: CHALLENGE, Setup: "0x3", Token: "0x4" }, faucet: FAUCET_ADDR },
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

describe("the devnet faucet is Faucet.mint(self, N)", () => {
  test("mint() calls Faucet at contracts.Faucet, never the old Token", async () => {
    const { writer, execute } = writerWith();
    await writer.mint();
    const [call] = sent(execute);
    expect([BigInt(call.contractAddress), call.entrypoint]).toEqual([BigInt(FAUCET_ADDR), "mint"]);
    expect(call.calldata).toEqual(new AbiCodec(FAUCET_ABI).encodeCall("mint", [PLAYER, FAUCET_USDC_AMOUNT]));
    expect(BigInt(call.calldata[0])).toBe(BigInt(PLAYER));
    expect(call.calldata.slice(1).map(BigInt)).toEqual(u256(FAUCET_USDC_AMOUNT).map(BigInt));
    expect(BigInt(call.contractAddress)).not.toBe(BigInt(deployment.addresses.Token));
  });

  test("a deployment with no Faucet offers no faucet: nothing is sent", async () => {
    const dep = resolveDeployment({ network: "mainnet", env: { rpcUrl: "http://x", addresses: { Challenge: CHALLENGE, Setup: "0x3", Token: "0x4" } } });
    expect(dep.faucet).toBe("");
    const { writer, execute } = writerWith({ dep });
    await expect(writer.mint()).rejects.toThrow(WriteError);
    expect(execute).not.toHaveBeenCalled();
  });

  test("never on mainnet: a deployment with a Faucet in its file and env resolves none, and sends no mint", async () => {
    const file = { contracts: { Faucet: { address: "0x9" } } };
    const env = { rpcUrl: "http://x", addresses: { Challenge: CHALLENGE, Setup: "0x3", Token: "0x4" }, faucet: FAUCET_ADDR };
    for (const network of ["mainnet", "", "goerli", "Sepolia"]) {
      const dep = resolveDeployment({ network, file, env });
      expect(dep.faucet, network).toBe("");
      const { writer, execute } = writerWith({ dep });
      await expect(writer.mint()).rejects.toThrow(/No faucet/);
        expect(execute).not.toHaveBeenCalled();
    }
  });

  test("sepolia resolves the Faucet of its file or env, and mints 100 USDC, under both caps of the contract", async () => {
    const file = { contracts: { Faucet: { address: "0x9" } } };
    const env = { rpcUrl: "http://x", addresses: { Challenge: CHALLENGE, Setup: "0x3", Token: "0x4" } };
    expect(resolveDeployment({ network: "sepolia", file, env }).faucet).toBe("0x9");
    expect(resolveDeployment({ network: "sepolia", file, env: { ...env, faucet: "0xa" } }).faucet).toBe("0xa");
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
      ["Faucet: over the address cap", "address", /received everything the faucet gives/],
      ["Faucet: over the call cap", "call", /over what one request may mint/],
      // The Faucet still deployed on Sepolia until the fresh deployment (P-53).
      ["MockUSDC: over the address cap", "address", /received everything the faucet gives/],
      ["MockUSDC: over the call cap", "call", /over what one request may mint/],
    ] as const)("%s", async (reason, cap, words) => {
      for (const revert of [reason, asHex(reason)]) {
        const { writer } = writerWith({ receipt: reverted(revert) });
        const error = await writer.mint().catch((e) => e);
        expect(error).toBeInstanceOf(FaucetCapError);
        expect(error).toBeInstanceOf(WriteError);
        expect(error.cap).toBe(cap);
        expect(error.message).toMatch(words);
        expect(error.message).not.toMatch(/Faucet|Faucet:|0x/);
        expect(error.reverted).toBe(true);
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
  });

  test("the address comes from the deployments file's contracts.Faucet, the env first", () => {
    const file = { contracts: { Faucet: { address: "0x9" } } };
    const base = { network: "devnet", env: { rpcUrl: "http://x", addresses: { Challenge: CHALLENGE, Setup: "0x3", Token: "0x4" } } };
    expect(resolveDeployment({ ...base, file }).faucet).toBe("0x9");
    expect(resolveDeployment({ ...base, file, env: { ...base.env, faucet: "0xa" } }).faucet).toBe("0xa");
    expect(resolveDeployment({ ...base, file: { contracts: { Faucet: { address: "0x0" } } } }).faucet).toBe("");
  });
});
