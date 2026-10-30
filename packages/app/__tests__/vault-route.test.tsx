import { slow } from "../test-slow";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hash } from "starknet";
import {
  PavedClient,
  VaultBalanceError,
  VaultExitFeeChangedError,
  createCodecs,
  createEconomyClient,
  parseUnits as chainParseUnits,
  resolveDeployment,
  resolveEconomyDeployment,
  withdrawFee as chainWithdrawFee,
  type PavedRpc,
  type WriteResult,
} from "@paved/chain";
import { FAKE_CHAIN_ID, FAKE_ROUTER_FILE } from "@paved/chain/testing";
import { App } from "../src/App";
import { parseUnits, withdrawFee } from "../src/components/containers/vault-form";
import type { DataSources, GameSigner } from "../src/data";
import { queryKeys } from "../src/data/keys";
import type { VaultWrites } from "../src/data/sources";
import { exactUnits, positionAfter } from "../src/data/vault";
import { vaultWritesFor } from "../src/data/vault-client";
import { queryClient } from "../src/lib/query-client";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { fakeSources } from "./data-fakes";
import { fakeWallet } from "./wallet-fakes";

// `/vault` (P10) on `@paved/chain`'s fakes: `FakeEconomy` for the Vault (OpenZeppelin's ERC4626 arithmetic, the 5 % exit fee,
// 1,000 PAVED of dead shares), and the Vault's writes as a double that records what it is asked, or the real writer.

const PLAYER = "0x5f1";
const P = 10n ** 18n;
const ok = (events: WriteResult["events"] = []): WriteResult => ({ transactionHash: "0x1", events });
const depositEvent = (assets: bigint, shares: bigint) => ({ name: "Deposit", fields: { sender: PLAYER, owner: PLAYER, assets, shares }, fromAddress: "0x12" });
const withdrawEvent = (assets: bigint, shares: bigint) => ({ name: "Withdraw", fields: { sender: PLAYER, receiver: PLAYER, owner: PLAYER, assets, shares }, fromAddress: "0x12" });

function setup(options: { viewer?: string | "guest"; shares?: bigint; paved?: bigint; writes?: Partial<VaultWrites> } = {}) {
  const f = fakeSources();
  f.economy.setBalance("paved", PLAYER, options.paved ?? 50n * P);
  if (options.shares) f.economy.setShares(PLAYER, options.shares);
  const writes = {
    deposit: vi.fn(options.writes?.deposit ?? (async () => ok())),
    withdraw: vi.fn(options.writes?.withdraw ?? (async () => ok())),
    withdrawAll: vi.fn(options.writes?.withdrawAll ?? (async () => ok())),
  };
  const viewer = options.viewer ?? PLAYER;
  const signer = viewer === "guest" ? null : ({ address: viewer } as unknown as GameSigner);
  const sources: DataSources = { ...f.sources, signer, vault: () => writes };
  return { ...f, sources, writes };
}

function open(s: ReturnType<typeof setup>, wallet = fakeWallet({ address: PLAYER })) {
  render(<App router={createTestRouter("/vault")} sources={s.sources} connector={wallet.load} />);
  return wallet;
}

const position = () => screen.findByRole("region", { name: "Your position" }, { timeout: slow(5000) });
const field = (name: RegExp) => screen.getByRole("textbox", { name });

beforeEach(() => {
  queryClient.clear();
  localStorage.clear();
  resetWelcomedForTests();
  markWelcomed();
});
afterEach(() => {
  queryClient.clear();
  resetWelcomedForTests();
  vi.restoreAllMocks();
});

describe("/vault (P10)", { timeout: slow(20_000) }, () => {
  it("a guest is asked to connect, and Connect opens the wallet", async () => {
    const s = setup({ viewer: "guest" });
    const wallet = open(s);
    // The page waits for the wallet's look for an earlier session (its probe) before it asks.
    await waitFor(() => expect(wallet.calls).toContain("probe"));
    await waitFor(() => expect(screen.queryByRole("status", { name: "Reading the Vault" })).toBeNull());
    const notice = (await screen.findByText("Connect to use the Vault", {}, { timeout: slow(5000) })).closest("[role=status]") as HTMLElement;
    // Nothing of the Vault is read for a guest.
    expect(s.economy.calls.filter((c) => c.startsWith("vault"))).toEqual([]);
    await userEvent.click(within(notice).getByRole("button", { name: "Connect" }));
    await waitFor(() => expect(wallet.calls).toContain("connect"));
    // Connected: the account's position is read.
    expect(await position()).toHaveTextContent("No vPAVED yet");
  });

  it("shows the position from the chain: vPAVED, its PAVED value, the share of the Vault, the rate, the exit fee, the wallet", async () => {
    const s = setup({ shares: 250n * P });
    open(s);
    const region = await position();
    // 250 vPAVED at a rate of 1 (the fake's 1,000 dead shares for 1,000 PAVED): worth 250, 238.09... after the 5 % fee.
    expect(region).toHaveTextContent("250.00vPAVED");
    expect(within(region).getByText("Your share of the Vault").parentElement).toHaveTextContent("20%");
    expect(within(region).getByText("Rate").parentElement).toHaveTextContent("1 : 1.0000");
    expect(within(region).getByText("Exit fee").parentElement).toHaveTextContent("5%");
    expect(within(region).getByText("Withdrawable now").parentElement).toHaveTextContent("238.09");
    expect(within(region).getByText("Votes").parentElement).toHaveTextContent("Not delegated");
    expect(document.body).toHaveTextContent(/Wallet\s*50.00\s*\PAVED/);
    expect(s.economy.calls).toEqual(expect.arrayContaining([`vault ${PLAYER}`, `paved ${PLAYER}`, `delegates ${PLAYER}`]));
  });

  it("shows the delegate when the vPAVED is delegated, and offers no delegate write", async () => {
    const s = setup({ shares: P });
    s.economy.setDelegate(PLAYER, "0x04d1328dbe2c9441a5b7f1fca8da91e94bfd7de2bdc7550dbd989f7af72f99ef");
    open(s);
    const region = await position();
    await waitFor(() => expect(within(region).getByText("Votes").parentElement).toHaveTextContent("0x04d1"));
    expect(screen.queryByRole("button", { name: /Delegate/ })).toBeNull();
  });

  it("a failed read shows the error with Retry, which reads again", async () => {
    const s = setup({ shares: P });
    s.economy.fail = "node down";
    open(s);
    // The balances' own inline error (the rail's) comes with the page's.
    const alerts = await screen.findAllByRole("alert", {}, { timeout: slow(8000) });
    const vault = alerts.find((a) => /The Vault cannot be read/.test(a.textContent ?? ""));
    expect(vault).toBeDefined();
    s.economy.fail = null;
    // The page's Retry (the balances' error has its own, #918).
    await userEvent.click(within(vault!).getByRole("button", { name: "Retry" }));
    expect(await position()).toHaveTextContent("1.00vPAVED");
  });

  it("nothing deposited: a first deposit previews its vPAVED, then sends the exact amount", async () => {
    const s = setup({ writes: { deposit: async (amount) => ok([depositEvent(amount, amount)]) } });
    open(s);
    expect(await position()).toHaveTextContent("No vPAVED yet");
    await userEvent.type(field(/Amount to deposit/), "12.5");
    expect(await screen.findByText(/You get about/)).toHaveTextContent("12.50vPAVED");
    expect(s.economy.calls).toContain(`preview_deposit ${125n * 10n ** 17n}`);
    await userEvent.click(screen.getByRole("button", { name: "Deposit" }));
    await waitFor(() => expect(s.writes.deposit).toHaveBeenCalledOnce());
    expect(s.writes.deposit).toHaveBeenCalledWith(125n * 10n ** 17n, { confirmedAmount: 125n * 10n ** 17n });
    expect(await screen.findByText("Deposited")).toBeInTheDocument();
    expect(screen.getByText("Deposited").parentElement).toHaveTextContent("12.50 PAVED in the Vault for 12.50 vPAVED.");
    expect(field(/Amount to deposit/)).toHaveValue("");
  });

  it("the receipt's Deposit goes into the cache, then the position and the wallet are read once more", async () => {
    let release: () => void = () => {};
    const s = setup({ shares: P, writes: { deposit: async (amount) => ok([depositEvent(amount, amount)]) } });
    open(s);
    await position();
    // The reconciling reads wait, so the cache's own values can be seen first.
    const pending = new Promise<void>((resolve) => (release = resolve));
    const vault = s.economy.vault.bind(s.economy);
    const paved = s.economy.pavedBalance.bind(s.economy);
    const reads: string[] = [];
    vi.spyOn(s.economy, "vault").mockImplementation(async (a) => (reads.push(`vault ${a}`), await pending, vault(a)));
    vi.spyOn(s.economy, "pavedBalance").mockImplementation(async (a) => (reads.push(`paved ${a}`), await pending, paved(a)));
    await userEvent.type(field(/Amount to deposit/), "2");
    await userEvent.click(screen.getByRole("button", { name: "Deposit" }));
    await waitFor(() => expect(queryClient.getQueryData<{ shares: bigint }>(queryKeys.chain.vault(PLAYER))?.shares).toBe(3n * P));
    expect(queryClient.getQueryData(queryKeys.chain.pavedBalance(PLAYER))).toBe(48n * P);
    await waitFor(() => expect(reads.sort()).toEqual([`paved ${PLAYER}`, `vault ${PLAYER}`]));
    release();
  });

  it("not enough PAVED: a deposit above the wallet is refused before any send", async () => {
    const s = setup({ paved: 3n * P });
    open(s);
    await position();
    await userEvent.type(field(/Amount to deposit/), "3.000000000000000001");
    expect(screen.getByRole("alert")).toHaveTextContent("Not enough PAVED");
    expect(screen.getByRole("button", { name: "Deposit" })).toBeDisabled();
    expect(s.writes.deposit).not.toHaveBeenCalled();
  });

  it("Max fills the wallet's exact PAVED, sent to the base unit", async () => {
    const balance = 7n * P + 123_456_789n;
    const s = setup({ paved: balance });
    open(s);
    await position();
    await userEvent.click(screen.getByRole("button", { name: "Max" }));
    expect(field(/Amount to deposit/)).toHaveValue("7.000000000123456789");
    await userEvent.click(screen.getByRole("button", { name: "Deposit" }));
    await waitFor(() => expect(s.writes.deposit).toHaveBeenCalledWith(balance, { confirmedAmount: balance }));
  });

  it("withdraw: the exit fee is shown before it is sent, then withdraw(assets) at that fee", async () => {
    const s = setup({ shares: 100n * P, writes: { withdraw: async (amount) => ok([withdrawEvent(amount, 42n * P)]) } });
    open(s);
    await position();
    await userEvent.click(screen.getByRole("tab", { name: "Withdraw" }));
    await userEvent.type(field(/Amount to withdraw/), "40");
    // 5 % of 40, on top; the vPAVED of 42 burn (preview_withdraw at a rate of about 1).
    expect(screen.getByTestId("withdraw-fee")).toHaveTextContent("2.00");
    expect(screen.getByLabelText("Before you withdraw")).toHaveTextContent(/You receive\s*40.00/);
    expect(await screen.findByText(/Uses about/)).toHaveTextContent("42.00vPAVED");
    expect(screen.getByText(/Withdraw all pays/)).toHaveTextContent("95.23");
    await userEvent.click(screen.getByRole("button", { name: "Withdraw" }));
    await waitFor(() => expect(s.writes.withdraw).toHaveBeenCalledWith(40n * P, { confirmedAmount: 40n * P, confirmedExitFeeBps: 500 }));
    expect(await screen.findByText("Withdrawn")).toBeInTheDocument();
  });

  it("withdraw all redeems every vPAVED held, at the fee shown", async () => {
    const s = setup({ shares: 100n * P });
    open(s);
    await position();
    await userEvent.click(screen.getByRole("tab", { name: "Withdraw" }));
    await userEvent.click(screen.getByRole("button", { name: /Withdraw all/ }));
    await waitFor(() => expect(s.writes.withdrawAll).toHaveBeenCalledWith({ confirmedShares: 100n * P, confirmedExitFeeBps: 500 }));
  });

  it("an amount over max_withdraw is refused before any send", async () => {
    const s = setup({ shares: 10n * P });
    open(s);
    await position();
    await userEvent.click(screen.getByRole("tab", { name: "Withdraw" }));
    await userEvent.type(field(/Amount to withdraw/), "10");
    expect(screen.getByRole("alert")).toHaveTextContent("Over max_withdraw");
    expect(screen.getByRole("button", { name: "Withdraw" })).toBeDisabled();
    expect(s.writes.withdraw).not.toHaveBeenCalled();
  });

  it("pending: the button says the approve and the deposit wait in the wallet, and the field is held", async () => {
    let finish: (r: WriteResult) => void = () => {};
    const s = setup({ writes: { deposit: () => new Promise<WriteResult>((resolve) => (finish = resolve)) } });
    open(s);
    await position();
    await userEvent.type(field(/Amount to deposit/), "1");
    await userEvent.click(screen.getByRole("button", { name: "Deposit" }));
    const busy = await screen.findByRole("button", { name: /Confirm in your wallet/ });
    expect(screen.getByText(/Approve and deposit in your wallet: one transaction for both/)).toBeInTheDocument();
    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(field(/Amount to deposit/)).toBeDisabled();
    // A second tap sends nothing more.
    await userEvent.click(busy);
    expect(s.writes.deposit).toHaveBeenCalledOnce();
    finish(ok([depositEvent(P, P)]));
    expect(await screen.findByText("Deposited")).toBeInTheDocument();
  });

  it("a typed refusal shows its message, keeps the amount, and the button is ready again", async () => {
    const s = setup({
      shares: 10n * P,
      writes: {
        deposit: async () => Promise.reject(new VaultBalanceError(P)),
        withdraw: async () => Promise.reject(new VaultExitFeeChangedError(500, 1_000)),
      },
    });
    open(s);
    await position();
    await userEvent.type(field(/Amount to deposit/), "2");
    await userEvent.click(screen.getByRole("button", { name: "Deposit" }));
    expect(await screen.findByText("Deposit refused")).toBeInTheDocument();
    expect(screen.getByText("Deposit refused").parentElement).toHaveTextContent("Not enough PAVED: your wallet holds 1 PAVED. Nothing was sent.");
    expect(field(/Amount to deposit/)).toHaveValue("2");
    expect(screen.getByRole("button", { name: "Deposit" })).toBeEnabled();
    await userEvent.click(screen.getByRole("tab", { name: "Withdraw" }));
    expect(screen.queryByText("Deposit refused")).toBeNull();
    await userEvent.type(field(/Amount to withdraw/), "1");
    await userEvent.click(screen.getByRole("button", { name: "Withdraw" }));
    expect(await screen.findByText("Withdraw refused")).toBeInTheDocument();
    expect(screen.getByText("Withdraw refused").parentElement).toHaveTextContent("The exit fee changed: confirm again");
  });

  it("the real writer: one multicall of the approve of exactly the amount and deposit, its Deposit into the cache", async () => {
    const ECON = { economy: "0x10", pavedToken: "0x11", vault: "0x12", usdc: "0x13" };
    const sent: Array<{ contractAddress: string; entrypoint: string; calldata: string[] }> = [];
    const f = fakeSources();
    f.economy.setBalance("paved", PLAYER, 5n * P);
    const u256 = (v: bigint) => [`0x${v.toString(16)}`, "0x0"];
    const receipt = {
      execution_status: "SUCCEEDED",
      events: [{ from_address: ECON.vault, keys: [hash.getSelectorFromName("Deposit"), PLAYER, PLAYER], data: [...u256(2n * P), ...u256(2n * P)] }],
    };
    const rpc = { callContract: async () => [], getChainId: async () => FAKE_CHAIN_ID, getEvents: async () => ({ events: [] }), waitForTransaction: async () => receipt } as unknown as PavedRpc;
    const base = resolveDeployment({ network: "devnet", file: FAKE_ROUTER_FILE, env: { rpcUrl: "http://x", addresses: { Challenge: "0x2", Setup: "0x3" } } });
    const client = new PavedClient({ ...base, chainId: FAKE_CHAIN_ID }, rpc, createCodecs(), f.views);
    const econ = createEconomyClient(resolveEconomyDeployment({ base: { ...base, chainId: FAKE_CHAIN_ID }, file: FAKE_ROUTER_FILE, env: ECON }), client, f.economy, f.pool)!;
    const writer = client.writer({ address: PLAYER, execute: async (calls: typeof sent) => (sent.push(...calls), { transaction_hash: "0x1" }) });
    const sources: DataSources = { ...f.sources, signer: writer as unknown as GameSigner, vault: (signer) => vaultWritesFor(econ, signer) };
    render(<App router={createTestRouter("/vault")} sources={sources} connector={fakeWallet({ address: PLAYER }).load} />);
    await position();
    await userEvent.type(field(/Amount to deposit/), "2");
    await userEvent.click(screen.getByRole("button", { name: "Deposit" }));
    await waitFor(() => expect(sent).toHaveLength(2));
    expect(sent.map((c) => [BigInt(c.contractAddress), c.entrypoint, c.calldata])).toEqual([
      [BigInt(ECON.pavedToken), "approve", [ECON.vault, ...u256(2n * P)]],
      [BigInt(ECON.vault), "deposit", [...u256(2n * P), PLAYER]],
    ]);
    expect(await screen.findByText("Deposited")).toBeInTheDocument();
    expect(screen.getByText("Deposited").parentElement).toHaveTextContent("2.00 PAVED in the Vault for 2.00 vPAVED.");
  });
});

describe("the vault page's exact amounts", () => {
  it("a typed amount is a bigint of 18 decimals, and Max's text reads back to the same base units (no float)", () => {
    for (const value of [0n, 1n, 10n ** 18n, 10n ** 18n + 1n, 123_456_789_012_345_678_901_234_567n, 2n ** 128n + 7n]) {
      const text = exactUnits(value);
      expect(text).not.toMatch(/e|,/);
      expect(parseUnits(text, 18), text).toBe(value);
      // The chain's own parser reads it the same (it refuses 0, which is no amount to send).
      expect(chainParseUnits(text, 18), text).toBe(value === 0n ? null : value);
    }
    expect(parseUnits("0.1", 18)).toBe(10n ** 17n);
    expect(parseUnits("0.1", 18)! + parseUnits("0.2", 18)!).toBe(parseUnits("0.3", 18));
    for (const bad of ["", "1e18", "-1", "1,5", "0x10", "1.0000000000000000001", "1..2", " "]) expect(parseUnits(bad, 18), bad).toBeNull();
  });

  it("the scene's exit fee is the chain's, and a receipt's position is the Vault's arithmetic", async () => {
    for (const [a, f] of [[1n, 500], [40n * P, 500], [7n * P + 3n, 1_000], [0n, 500], [P, 0]] as const) expect(withdrawFee(a, f)).toBe(chainWithdrawFee(a, f));
    const { economy } = fakeSources();
    economy.vaultAssets = 1_337n * P;
    const before = await economy.vault(PLAYER);
    const shares = await economy.previewDeposit(25n * P);
    economy.setShares(PLAYER, shares);
    economy.vaultAssets = before.totalAssets + 25n * P;
    expect(positionAfter(before, shares, 25n * P)).toEqual(await economy.vault(PLAYER));
  });

  it("the route's chunk imports @paved/chain as types only; the writer is loaded at the first write", () => {
    for (const file of ["../src/routes/pages/vault.tsx", "../src/data/vault.ts", "../src/routes/pages/referral.tsx", "../src/data/referral.ts"]) {
      const text = readFileSync(join(__dirname, file), "utf8");
      const imports = [...text.matchAll(/^import (.*) from "@paved\/chain";$/gm)].map((m) => m[1]);
      for (const what of imports) expect(what, file).toMatch(/^type /);
    }
    const sources = readFileSync(join(__dirname, "../src/routes/sources.ts"), "utf8");
    expect(sources).toMatch(/import\("\.\.\/data\/vault-client"\)/);
  });
});
