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
  VaultClosedError,
  VaultExitFeeChangedError,
  VaultNothingToClaimError,
  VaultOverMaxDepositError,
  VaultOverMaxRedeemError,
  VaultOverMaxWithdrawError,
  VaultPausedError,
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

  test("RPC earnings (D-31): earned_of, claimed_of and claimable_of as u256 USDC, is_paused and is_open as booleans", async () => {
    const felts: Record<string, string[]> = {
      earned_of: ["0x2dc6c0", "0x0"],
      claimed_of: ["0x1e8480", "0x0"],
      claimable_of: ["0xf4240", "0x0"],
      is_paused: ["0x0"],
      is_open: ["0x1"],
    };
    const calls: Array<{ contractAddress: string; entrypoint: string; calldata: string[] }> = [];
    const provider = {
      callContract: async (c: { contractAddress: string; entrypoint: string; calldata: string[] }) => (calls.push(c), felts[c.entrypoint]),
    };
    const views = new RpcEconomyViews(provider, economyDeployment, createEconomyCodecs());
    expect(await views.earnings(PLAYER)).toEqual({ earned: 3_000_000n, claimed: 2_000_000n, claimable: 1_000_000n, paused: false, open: true });
    expect(calls.map((c) => [c.contractAddress, c.entrypoint, c.calldata])).toEqual([
      [ECON.vault, "earned_of", [PLAYER]],
      [ECON.vault, "claimed_of", [PLAYER]],
      [ECON.vault, "claimable_of", [PLAYER]],
      [ECON.vault, "is_paused", []],
      [ECON.vault, "is_open", []],
    ]);
  });

  test("the fake's earnings: none by default; a claim moves the claimable to claimed and to the wallet's USDC", async () => {
    const economy = new FakeEconomy();
    expect(await economy.earnings(PLAYER)).toEqual({ earned: 0n, claimed: 0n, claimable: 0n, paused: false, open: true });
    economy.setEarnings(PLAYER, { claimed: 2n, claimable: 5n });
    expect(await economy.earnings(PLAYER)).toMatchObject({ earned: 7n, claimed: 2n, claimable: 5n });
    expect(economy.claimed(PLAYER)).toBe(5n);
    expect(await economy.earnings(PLAYER)).toMatchObject({ earned: 7n, claimed: 7n, claimable: 0n });
    expect(await economy.usdcBalance(PLAYER)).toBe(5n);
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

  test("mint (VAULT-PAGE): approves exactly preview_mint's PAVED, then mint(shares, self), in one multicall", async () => {
    const s = setup();
    s.economy.vaultAssets = 3_000n * P;
    s.economy.setBalance("paved", PLAYER, 100n * P);
    const shares = 10n * P;
    const assets = await s.economy.previewMint(shares);
    // `convert_to_assets` rounded up, no entry fee: never below what a deposit of it would need.
    expect(await s.economy.previewDeposit(assets)).toBeGreaterThanOrEqual(shares);
    await s.econWriter.mint(shares, { confirmedShares: shares });
    expect(s.execute).toHaveBeenCalledOnce();
    const [calls] = s.execute.mock.calls[0] as unknown as [Array<{ contractAddress: string; entrypoint: string; calldata: string[] }>];
    const u256 = (v: bigint) => [`0x${v.toString(16)}`, "0x0"];
    expect(calls.map((c) => [BigInt(c.contractAddress), c.entrypoint, c.calldata])).toEqual([
      [BigInt(ECON.pavedToken), "approve", [ECON.vault, ...u256(assets)]],
      [BigInt(ECON.vault), "mint", [...u256(shares), PLAYER]],
    ]);
  });

  test("mint: a wallet short of what it takes, or an amount not the one confirmed, sends nothing", async () => {
    const s = setup();
    s.economy.setBalance("paved", PLAYER, P);
    const short = await s.econWriter.mint(2n * P, { confirmedShares: 2n * P }).catch((e: unknown) => e);
    expect(short).toBeInstanceOf(VaultBalanceError);
    expect((short as VaultBalanceError).balance).toBe(P);
    await expect(s.econWriter.mint(P, { confirmedShares: 2n * P })).rejects.toThrow();
    expect(s.execute).not.toHaveBeenCalled();
  });

  test("redeem (VAULT-PAGE): redeem(shares, self, self) of exactly the vPAVED asked; more than held, or another fee, sends nothing", async () => {
    const s = setup();
    s.economy.setShares(PLAYER, 5n * P);
    const over = await s.econWriter.redeem(6n * P, { confirmedShares: 6n * P }).catch((e: unknown) => e);
    expect(over).toBeInstanceOf(VaultOverMaxRedeemError);
    await expect(s.econWriter.redeem(P, { confirmedShares: P, confirmedExitFeeBps: 1_000 })).rejects.toBeInstanceOf(VaultExitFeeChangedError);
    expect(s.execute).not.toHaveBeenCalled();
    await s.econWriter.redeem(2n * P, { confirmedShares: 2n * P, confirmedExitFeeBps: 500 });
    const [calls] = s.execute.mock.calls[0] as unknown as [Array<{ contractAddress: string; entrypoint: string; calldata: string[] }>];
    expect(calls.map((c) => [BigInt(c.contractAddress), c.entrypoint])).toEqual([[BigInt(ECON.vault), "redeem"]]);
    expect(calls[0]!.calldata).toEqual([`0x${(2n * P).toString(16)}`, "0x0", PLAYER, PLAYER]);
  });

  test("a mint above max_mint reverts as a deposit above max_deposit", async () => {
    const s = setup({ wait: reverted("ERC4626: exceeds max mint") });
    s.economy.setBalance("paved", PLAYER, 10n * P);
    const error = await s.econWriter.mint(P, { confirmedShares: P }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(VaultOverMaxDepositError);
  });

  test("RPC: preview_mint is the Vault's own, a u256", async () => {
    const calls: Array<{ entrypoint: string; calldata: string[] }> = [];
    const provider = { callContract: async (c: { entrypoint: string; calldata: string[] }) => (calls.push(c), ["0x7", "0x0"]) };
    const views = new RpcEconomyViews(provider, economyDeployment, createEconomyCodecs());
    expect(await views.previewMint(3n)).toBe(7n);
    expect(calls).toEqual([expect.objectContaining({ entrypoint: "preview_mint", calldata: ["0x3", "0x0"] })]);
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

describe("EconomyWriter.claim (D-31): the player's USDC from the Vault", () => {
  test("claims with a fresh read of the claimable USDC: one call, Vault.claim()", async () => {
    const s = setup();
    s.economy.setEarnings(PLAYER, { claimable: 1_500_000n });
    await s.econWriter.claim();
    expect(s.execute).toHaveBeenCalledTimes(1);
    const [calls] = s.execute.mock.calls[0] as unknown as [Array<{ contractAddress: string; entrypoint: string; calldata: string[] }>];
    expect(calls.map((c) => [c.contractAddress, c.entrypoint, c.calldata])).toEqual([[ECON.vault, "claim", []]]);
  });

  test("nothing to claim, a paused or a closed Vault sends nothing, each with its plain message", async () => {
    const none = setup();
    const error = await none.econWriter.claim().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(VaultNothingToClaimError);
    expect(error).toBeInstanceOf(WriteError);
    expect((error as Error).message).toBe("You have no USDC to claim yet. Nothing was sent.");
    const paused = setup();
    paused.economy.setEarnings(PLAYER, { claimable: 1n });
    paused.economy.vaultPaused = true;
    await expect(paused.econWriter.claim()).rejects.toBeInstanceOf(VaultPausedError);
    const closed = setup();
    closed.economy.setEarnings(PLAYER, { claimable: 1n });
    closed.economy.vaultOpen = false;
    await expect(closed.econWriter.claim()).rejects.toBeInstanceOf(VaultClosedError);
    for (const s of [none, paused, closed]) expect(s.execute).not.toHaveBeenCalled();
  });

  test("the contract's reverts read as the same errors after a race", async () => {
    for (const [revert, kind] of [
      ["Vault: nothing to claim", VaultNothingToClaimError],
      ["Vault: paused", VaultPausedError],
      ["Vault: closed", VaultClosedError],
    ] as const) {
      const s = setup({ wait: async () => ({ execution_status: "REVERTED", revert_reason: `Failure reason: '${revert}'` }) });
      s.economy.setEarnings(PLAYER, { claimable: 1n });
      const error = await s.econWriter.claim().catch((e: unknown) => e);
      expect(error, revert).toBeInstanceOf(kind);
      expect((error as WriteError).transactionHash, revert).toBe("0x1");
    }
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

  test("Paid, Claimed and Collected (D-31): their keys and USDC amounts as u256", () => {
    const paid = codec.decodeEvent({ keys: [hash.getSelectorFromName("Paid"), "0x10"], data: ["0x5", "0x0", "0x7", "0x0"] });
    expect(paid).toMatchObject({ name: "Paid", fields: { payer: "0x10", amount: 5n, index: 7n } });
    const claimed = codec.decodeEvent({ keys: [hash.getSelectorFromName("Claimed"), PLAYER], data: ["0xf4240", "0x0"] });
    expect(claimed).toMatchObject({ name: "Claimed", fields: { account: PLAYER, amount: 1_000_000n } });
    const collected = codec.decodeEvent({ keys: [hash.getSelectorFromName("Collected"), "0x99"], data: ["0x9", "0x2", "0x0"] });
    expect(collected).toMatchObject({ name: "Collected", fields: { holder: "0x99", recipient: "0x9", amount: 2n } });
  });

  test("Withdraw: sender, receiver and owner keys, assets and shares as u256", () => {
    const withdraw = codec.decodeEvent({
      keys: [hash.getSelectorFromName("Withdraw"), PLAYER, PLAYER, PLAYER],
      data: ["0x3", "0x0", "0x4", "0x0"],
    });
    expect(withdraw).toMatchObject({ name: "Withdraw", fields: { sender: PLAYER, receiver: PLAYER, owner: PLAYER, assets: 3n, shares: 4n } });
  });
});
