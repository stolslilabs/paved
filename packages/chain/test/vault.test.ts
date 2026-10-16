/** The Vault behind `VaultViews` (P10): vPAVED, an OpenZeppelin ERC4626 over PAVED (`contracts/src/systems/vault.cairo`). */
import { describe, expect, test, vi } from "vitest";
import { hash } from "starknet";
import { createCodecs, createEconomyCodecs } from "../src/abis";
import { resolveDeployment } from "../src/deployment";
import { PavedClient, type PavedRpc } from "../src/paved-client";
import { FakeGameViews } from "../src/views";
import { WriteError } from "../src/writer";
import {
  RpcEconomyViews,
  VaultAllowanceError,
  VaultBalanceError,
  VaultExitFeeChangedError,
  VaultOverMaxDepositError,
  VaultOverMaxRedeemError,
  VaultOverMaxWithdrawError,
  VaultZeroSharesError,
  createEconomyClient,
  redeemFee,
  resolveEconomyDeployment,
  vaultRate,
  withdrawFee,
  type VaultViews,
} from "../src/economy";
import { FAKE_ROUTER_FILE, FAKE_UNIT, FakeEconomy, FakePoolQuoter } from "../src/testing";

const ADDR = { Challenge: "0x2", Setup: "0x3", Token: "0x4" };
const ECON = { economy: "0x10", pavedToken: "0x11", vault: "0x12", usdc: "0x13" };
const PLAYER = "0x5";
const P = 10n ** 18n;
const base = resolveDeployment({ network: "devnet", file: FAKE_ROUTER_FILE, env: { rpcUrl: "http://x", addresses: ADDR } });
const economyDeployment = resolveEconomyDeployment({ base, file: FAKE_ROUTER_FILE, env: ECON });

function setup(options: { wait?: () => Promise<unknown> } = {}) {
  const economy = new FakeEconomy();
  const gameViews = new FakeGameViews();
  gameViews.price = { token: ECON.usdc, amount: FAKE_UNIT };
  const rpc = {
    callContract: async () => [],
    getEvents: async () => ({ events: [] }),
    waitForTransaction: options.wait ?? (async () => ({ execution_status: "SUCCEEDED", events: [] })),
  } as unknown as PavedRpc;
  const execute = vi.fn(async () => ({ transaction_hash: "0x1" }));
  const client = new PavedClient(base, rpc, createCodecs(), gameViews);
  const econ = createEconomyClient(economyDeployment, client, economy, new FakePoolQuoter())!;
  const econWriter = econ.writer(client.writer({ address: PLAYER, execute }));
  return { economy, execute, econWriter };
}

describe("VaultViews: the page's reads, on the fake and over RPC", () => {
  test("the fake is a VaultViews: max_redeem is the vPAVED held, a delegate only once set", async () => {
    const views: VaultViews = new FakeEconomy();
    const economy = views as FakeEconomy;
    economy.setShares(PLAYER, 3n * P);
    expect(await views.maxRedeem(PLAYER)).toBe(3n * P);
    expect(await views.maxRedeem("0x6")).toBe(0n);
    expect(await views.delegateOf(PLAYER)).toBeNull();
    economy.setDelegate(PLAYER, "0x9");
    expect(await views.delegateOf(PLAYER)).toBe("0x9");
  });

  test("RPC: max_redeem a u256, delegates an address (0 reads as none)", async () => {
    const felts: Record<string, string[]> = { max_redeem: ["0x5", "0x1"], delegates: ["0x0"] };
    const calls: Array<{ contractAddress: string; entrypoint: string; calldata: string[] }> = [];
    const provider = {
      callContract: async (c: { contractAddress: string; entrypoint: string; calldata: string[] }) => (calls.push(c), felts[c.entrypoint]),
    };
    const views = new RpcEconomyViews(provider, economyDeployment, createEconomyCodecs());
    expect(await views.maxRedeem(PLAYER)).toBe((1n << 128n) + 5n);
    expect(await views.delegateOf(PLAYER)).toBeNull();
    felts.delegates = ["0x00abc"];
    expect(await views.delegateOf(PLAYER)).toBe("0xabc");
    expect(calls.map((c) => [c.contractAddress, c.entrypoint, c.calldata])).toEqual([
      [ECON.vault, "max_redeem", [PLAYER]],
      [ECON.vault, "delegates", [PLAYER]],
      [ECON.vault, "delegates", [PLAYER]],
    ]);
  });

  test("the rate is OpenZeppelin's (total_assets + 1) / (total_supply + 1), rounded down", () => {
    expect(vaultRate(1_000n * P, 1_000n * P)).toBe(P);
    expect(vaultRate(2n, 0n)).toBe(3n * P);
    expect(vaultRate(1_500n * P, 1_000n * P)).toBe(((1_500n * P + 1n) * P) / (1_000n * P + 1n));
  });
});

describe("the exit fee, rounded as the Vault rounds it (always for the Vault)", () => {
  test("withdraw: on top, ceil(a x f / 10,000), as preview_withdraw counts it", async () => {
    expect(withdrawFee(100n * P, 500)).toBe(5n * P);
    expect(withdrawFee(1n, 500)).toBe(1n);
    expect(withdrawFee(0n, 500)).toBe(0n);
    expect(withdrawFee(7n * P, 0)).toBe(0n);
    // The fake's preview_withdraw burns the shares of a + fee, rounded up: the same fee.
    const economy = new FakeEconomy();
    for (const a of [1n, 3n, 999n, 7n * P + 3n]) {
      const total = a + withdrawFee(a, economy.exitFeeBps);
      expect(await economy.previewWithdraw(a)).toBe((total * (economy.vaultSupply + 1n) + economy.vaultAssets) / (economy.vaultAssets + 1n));
    }
  });

  test("redeem: inside, ceil(v x f / (f + 10,000)); preview_redeem and max_withdraw are the value less it", async () => {
    const economy = new FakeEconomy();
    economy.vaultAssets = 1_084n * P;
    for (const shares of [1n, 17n, 2n * P + 5n, 1_250_400n * 10n ** 15n]) {
      economy.setShares(PLAYER, shares);
      const { value, maxWithdraw } = await economy.vault(PLAYER);
      expect(maxWithdraw).toBe(value - redeemFee(value, economy.exitFeeBps));
      expect(await economy.previewRedeem(shares)).toBe(maxWithdraw);
    }
    expect(redeemFee(105n * P, 500)).toBe(5n * P);
    expect(redeemFee(1n, 500)).toBe(1n);
  });
});

describe("Vault writes: each revert a typed error", () => {
  const reverted = (reason: string) => async () => ({ execution_status: "REVERTED", revert_reason: `Failure reason: '${reason}'` });

  test("every revert a client's write can meet", async () => {
    const cases: Array<[string, "deposit" | "withdraw" | "redeem", new (...args: never[]) => Error, RegExp]> = [
      ["Vault: zero shares", "deposit", VaultZeroSharesError, /too small to get any vPAVED/],
      ["ERC4626: exceeds max deposit", "deposit", VaultOverMaxDepositError, /no deposit this large/],
      ["ERC20: insufficient allowance", "deposit", VaultAllowanceError, /not allowed to take your PAVED/],
      ["ERC20: insufficient balance", "deposit", VaultBalanceError, /Not enough PAVED in your wallet/],
      ["ERC4626: exceeds max withdraw", "withdraw", VaultOverMaxWithdrawError, /More than you can withdraw now/],
      ["ERC4626: exceeds max redeem", "redeem", VaultOverMaxRedeemError, /More than you can withdraw now/],
    ];
    for (const [reason, write, type, text] of cases) {
      const s = setup({ wait: reverted(reason) });
      s.economy.setBalance("paved", PLAYER, P);
      s.economy.setShares(PLAYER, P);
      const send =
        write === "deposit"
          ? s.econWriter.deposit(P, { confirmedAmount: P })
          : write === "withdraw"
            ? s.econWriter.withdraw(1n, { confirmedAmount: 1n })
            : s.econWriter.withdrawAll({ confirmedShares: P });
      const error = await send.catch((e: unknown) => e);
      expect(error, reason).toBeInstanceOf(type);
      expect((error as Error).message, reason).toMatch(text);
      expect((error as WriteError).transactionHash, reason).toBe("0x1");
      expect((error as WriteError).reverted, reason).toBe(true);
    }
    // A redeem's refusal is an exit above the max too, as a withdraw's.
    expect(new VaultOverMaxRedeemError()).toBeInstanceOf(VaultOverMaxWithdrawError);
  });

  test("a deposit above the wallet is refused before sending, with the balance read", async () => {
    const s = setup();
    s.economy.setBalance("paved", PLAYER, P);
    const error = await s.econWriter.deposit(P + 1n, { confirmedAmount: P + 1n }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(VaultBalanceError);
    expect((error as VaultBalanceError).balance).toBe(P);
    expect((error as Error).message).toBe("Not enough PAVED: your wallet holds 1 PAVED. Nothing was sent.");
    expect(s.execute).not.toHaveBeenCalled();
  });

  test("an exit sends only at the exit fee the player confirmed", async () => {
    const s = setup();
    s.economy.setShares(PLAYER, 2n * P);
    s.economy.exitFeeBps = 1_000;
    const one = await s.econWriter.withdraw(P, { confirmedAmount: P, confirmedExitFeeBps: 500 }).catch((e: unknown) => e);
    expect(one).toBeInstanceOf(VaultExitFeeChangedError);
    expect(one).toMatchObject({ confirmed: 500, current: 1_000, message: "The exit fee changed: confirm again" });
    await expect(s.econWriter.withdrawAll({ confirmedShares: 2n * P, confirmedExitFeeBps: 500 })).rejects.toBeInstanceOf(VaultExitFeeChangedError);
    expect(s.execute).not.toHaveBeenCalled();
    // At the fee seen, both send.
    await s.econWriter.withdraw(P, { confirmedAmount: P, confirmedExitFeeBps: 1_000 });
    await s.econWriter.withdrawAll({ confirmedShares: 2n * P, confirmedExitFeeBps: 1_000 });
    expect(s.execute).toHaveBeenCalledTimes(2);
  });
});

describe("the Vault's receipt events decode from the committed ABI", () => {
  const codec = createEconomyCodecs().Vault;

  test("Deposit: sender and owner keys, assets and shares as u256", () => {
    const deposit = codec.decodeEvent({
      keys: [hash.getSelectorFromName("Deposit"), PLAYER, PLAYER],
      data: ["0x1bc16d674ec80000", "0x0", "0xde0b6b3a7640000", "0x0"],
    });
    expect(deposit).toMatchObject({ name: "Deposit", fields: { sender: PLAYER, owner: PLAYER, assets: 2n * P, shares: P } });
  });

  test("Withdraw: sender, receiver and owner keys, assets and shares as u256", () => {
    const withdraw = codec.decodeEvent({
      keys: [hash.getSelectorFromName("Withdraw"), PLAYER, PLAYER, PLAYER],
      data: ["0x3", "0x0", "0x4", "0x0"],
    });
    expect(withdraw).toMatchObject({ name: "Withdraw", fields: { sender: PLAYER, receiver: PLAYER, owner: PLAYER, assets: 3n, shares: 4n } });
  });
});
