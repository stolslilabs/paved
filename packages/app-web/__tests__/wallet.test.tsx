// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { getChecksumAddress } from "starknet";
import { PavedClient, VAULT_SESSION_APPROVE_CAP, controllerPolicies, createCodecs, createControllerConnector, indexerPlayerId, usePaved } from "@paved/chain";
import type { ControllerConfig, GameViews, PavedRpc, WriteResult } from "@paved/chain";
import { ConnectionBanner } from "../src/components/ConnectionBanner";
import { ENTRY_MAX_STAKE, WalletProvider, useWallet, vaultPolicy } from "../src/components/WalletProvider";
import { shortId } from "../src/utils/indexer-view";
import { usePlayerLabel } from "../src/utils/player-label";
import { resolveAppNetwork } from "../src/utils/network";

const SEPOLIA = "0x534e5f5345504f4c4941";
const ENTRY = 25n;
const CONTRACTS = { Challenge: { address: "0x2" }, Setup: { address: "0x3" }, Token: { address: "0x4" } };
const FILES = {
  "x/devnet.json": { default: { rpc_url: "http://devnet/rpc", contracts: CONTRACTS } },
  "x/sepolia.json": { default: { rpc_url: "http://sepolia/rpc", chain_id: SEPOLIA, contracts: CONTRACTS } },
};
const BURNER_ENV = { VITE_PLAYER_ADDRESS: "0xb0", VITE_PLAYER_PRIVATE_KEY: "0xb1" };
const SEPOLIA_ENV = { VITE_NETWORK: "sepolia", ...BURNER_ENV };
/** Another player, as the indexer writes ids. */
const OTHER = indexerPlayerId("0x5f3a2b4c6d8e0f1a3b5c7d9e1f3a5b7c9d1e3f5a7b9c1d3e5f7a9b1c3d59a1c");


/** `@cartridge/controller` as the connector uses it: a session the player approves on `connect`. */
function fakeController(options: { approved?: boolean; rpcChainId?: string } = {}) {
  const execute = vi.fn(async () => ({ transaction_hash: "0xabc" }));
  const account = { address: "0xc0ffee", execute };
  const seen: { options: Record<string, unknown> | null; disconnects: number } = { options: null, disconnects: 0 };
  let session = options.approved ? account : undefined;
  class Controller {
    constructor(opts: Record<string, unknown>) {
      seen.options = opts;
    }
    async probe() {
      return session;
    }
    async connect() {
      session = account;
      return account;
    }
    async disconnect() {
      seen.disconnects += 1;
      session = undefined;
    }
    username() {
      return session ? Promise.resolve("ada") : undefined;
    }
  }
  const module = { default: Controller };
  const configs: ControllerConfig[] = [];
  const createConnector = (config: ControllerConfig) => {
    configs.push(config);
    return createControllerConnector(config, { load: async () => module, chainId: async () => options.rpcChainId ?? SEPOLIA });
  };
  return { account, execute, seen, configs, createConnector };
}

type EntryPrice = () => Promise<{ token: string; amount: bigint }>;

function clientOf(network: ReturnType<typeof resolveAppNetwork>, entryPrice: EntryPrice) {
  const rpc = {
    callContract: async () => [],
    getEvents: async () => ({ events: [] }),
    waitForTransaction: async () => ({ execution_status: "SUCCEEDED", events: [] }),
  } as unknown as PavedRpc;
  const views = { entryPrice } as unknown as GameViews;
  return new PavedClient(network.deployment, rpc, createCodecs(), views);
}

let lastWrite: Promise<WriteResult> | null = null;

function Probe() {
  const { status, address, writer } = usePaved();
  const label = usePlayerLabel();
  return (
    <div>
      <output data-testid="status">{status}</output>
      <output data-testid="address">{address ?? "none"}</output>
      <output data-testid="username">{useWallet()?.username ?? "none"}</output>
      <output data-testid="labels">{address ? `${label(address)} ${label(OTHER)}` : "none"}</output>
      <button type="button" disabled={!writer} onClick={() => (lastWrite = writer!.discard({ mode: "challenge", gameId: 7 }))}>
        discard
      </button>
    </div>
  );
}

/** The build's economy in these tests: not deployed unless a test gives one (the Vault's policies then join the session). */
type EconomyOf = NonNullable<React.ComponentProps<typeof WalletProvider>["economy"]>;
const NO_ECONOMY: EconomyOf = () => ({ configured: false, addresses: { Economy: "", PavedToken: "", Vault: "", USDC: "" } });

function setup(env: Record<string, string>, fake = fakeController(), entryPrice: EntryPrice = async () => ({ token: "0x4", amount: ENTRY }), economy: EconomyOf = NO_ECONOMY) {
  const network = resolveAppNetwork(env, FILES);
  render(
    <WalletProvider env={env} network={network} createConnector={fake.createConnector} client={clientOf(network, entryPrice)} economy={economy}>
      <ConnectionBanner />
      <Probe />
    </WalletProvider>,
  );
  return { network, fake };
}

const status = () => screen.getByTestId("status").textContent;
const address = () => screen.getByTestId("address").textContent;

afterEach(() => {
  cleanup();
  lastWrite = null;
});

describe("signing (P-14)", () => {
  it("devnet signs with the env's burner and builds no controller", () => {
    const { fake } = setup(BURNER_ENV);
    expect(status()).toBe("ready");
    expect(address()).toBe("0xb0");
    expect(fake.configs).toEqual([]);
    expect(screen.queryByRole("button", { name: "Connect" })).toBeNull();
  });

  it("another network with no connection is read-only, and the env's key is not used there", async () => {
    const { fake } = setup(SEPOLIA_ENV);
    await act(async () => {});
    expect(status()).toBe("read-only");
    expect(address()).toBe("none");
    expect(screen.getByRole("alert").textContent).toContain("Read only: connect to play.");
    expect(screen.getByRole("button", { name: "Connect" })).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "discard" }).disabled).toBe(true);
    expect(fake.execute).not.toHaveBeenCalled();
  });

  it("connect, then a write goes through the writer with the controller's account", async () => {
    const { fake, network } = setup(SEPOLIA_ENV);
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    await waitFor(() => expect(status()).toBe("ready"));
    expect(address()).toBe("0xc0ffee");
    expect(screen.getByText(/Signed in with Cartridge Controller \(0xc0ffee\)/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "discard" }));
    await expect(lastWrite).resolves.toMatchObject({ transactionHash: "0xabc" });
    const challenge = network.deployment.addresses.Challenge;
    expect(fake.execute).toHaveBeenCalledTimes(1);
    expect(fake.execute.mock.calls[0][0]).toEqual([{ contractAddress: challenge, entrypoint: "discard", calldata: ["0x7"] }]);
  });

  // D-25 (E): the name is the Controller's username, off chain, for the connected player only.
  it("connect reads the Controller username: the player's own label is it, another player's a short address", async () => {
    setup(SEPOLIA_ENV);
    expect(screen.getByTestId("username").textContent).toBe("none");
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    await waitFor(() => expect(screen.getByTestId("username").textContent).toBe("ada"));
    expect(screen.getByTestId("labels").textContent).toBe(`ada ${shortId(OTHER)}`);
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    await waitFor(() => expect(screen.getByTestId("username").textContent).toBe("none"));
  });

  it("devnet's burner has no username: its own label is a short address", () => {
    setup(BURNER_ENV);
    expect(screen.getByTestId("username").textContent).toBe("none");
    expect(screen.getByTestId("labels").textContent).toBe(`0xb0 ${shortId(OTHER)}`);
  });

  it("the controller's writes are serialised by the writer", async () => {
    const fake = fakeController();
    let release!: () => void;
    fake.execute.mockImplementationOnce(() => new Promise((resolve) => (release = () => resolve({ transaction_hash: "0x1" }))));
    setup(SEPOLIA_ENV, fake);
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    await waitFor(() => expect(status()).toBe("ready"));
    fireEvent.click(screen.getByRole("button", { name: "discard" }));
    const first = lastWrite!;
    fireEvent.click(screen.getByRole("button", { name: "discard" }));
    await expect(lastWrite).rejects.toThrow("Another write is pending");
    release();
    await expect(first).resolves.toMatchObject({ transactionHash: "0x1" });
    expect(fake.execute).toHaveBeenCalledTimes(1);
  });

  it("disconnect returns to read-only", async () => {
    const { fake } = setup(SEPOLIA_ENV);
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    await waitFor(() => expect(status()).toBe("ready"));
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    expect(status()).toBe("read-only");
    expect(address()).toBe("none");
    await waitFor(() => expect(fake.seen.disconnects).toBe(1));
    expect(screen.getByRole("button", { name: "Connect" })).toBeTruthy();
  });

  it("a session approved earlier in this browser comes back without a click", async () => {
    setup(SEPOLIA_ENV, fakeController({ approved: true }));
    await waitFor(() => expect(status()).toBe("ready"));
    expect(address()).toBe("0xc0ffee");
  });

  it("a connect the player abandons stays read-only and says why", async () => {
    const load = async () => ({ default: Abandoned });
    setup(SEPOLIA_ENV, { ...fakeController(), createConnector: (config) => createControllerConnector(config, { load, chainId: async () => SEPOLIA }) });
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Not connected: The controller did not connect"));
    expect(status()).toBe("read-only");
  });

  it("the session holds the client's policies on the deployment's chain, approve on the entry token (Token before E3) pinned to Challenge, up to 10 stakes", async () => {
    const { fake, network } = setup(SEPOLIA_ENV);
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    await waitFor(() => expect(status()).toBe("ready"));
    expect(fake.configs).toHaveLength(1);
    expect(fake.configs[0]).toMatchObject({ rpc: "http://sepolia/rpc", chainId: SEPOLIA });
    expect(fake.seen.options).toMatchObject({ chains: [{ rpcUrl: "http://sepolia/rpc" }], defaultChainId: SEPOLIA });
    const session = fake.seen.options!.policies as { contracts: Record<string, { methods: Array<Record<string, string>> }> };
    const sessionKeys = Object.entries(session.contracts).flatMap(([target, { methods }]) => methods.map((m) => `${BigInt(target)}:${m.entrypoint}`));
    const expected = controllerPolicies(network.deployment, { approve: { token: "0x4", cap: 10n * ENTRY } });
    expect(sessionKeys.sort()).toEqual(expected.map((p) => `${BigInt(p.target)}:${p.method}`).sort());
    expect(session.contracts[getChecksumAddress("0x4")].methods).toEqual([{ entrypoint: "approve", spender: getChecksumAddress("0x2"), amount: "0xfa" }]);
  });

  const sessionOf = (fake: ReturnType<typeof fakeController>) =>
    fake.seen.options!.policies as { contracts: Record<string, { methods: Array<Record<string, string>> }> };

  it("after E3 the entry is in USDC: the session's approve targets USDC, capped at 10 x the unit price", async () => {
    const fake = fakeController();
    setup(SEPOLIA_ENV, fake, async () => ({ token: "0x5", amount: 2_000_000n }));
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    await waitFor(() => expect(status()).toBe("ready"));
    const session = sessionOf(fake);
    expect(session.contracts[getChecksumAddress("0x5")].methods).toEqual([{ entrypoint: "approve", spender: getChecksumAddress("0x2"), amount: "0x1312d00" }]);
    expect(session.contracts[getChecksumAddress("0x4")]).toBeUndefined();
  });

  it("with the economy deployed, the session holds the Vault's deposit, withdraw and redeem and a PAVED approve to the Vault up to its cap (P-56)", async () => {
    const fake = fakeController();
    const economy: EconomyOf = () => ({ configured: true, addresses: { Economy: "0x10", PavedToken: "0x11", Vault: "0x12", USDC: "0x5" } });
    setup(SEPOLIA_ENV, fake, async () => ({ token: "0x5", amount: 2_000_000n }), economy);
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    await waitFor(() => expect(status()).toBe("ready"));
    const session = sessionOf(fake);
    expect(session.contracts[getChecksumAddress("0x12")].methods.map((m) => m.entrypoint)).toEqual(["deposit", "withdraw", "redeem"]);
    expect(session.contracts[getChecksumAddress("0x11")].methods).toEqual([
      { entrypoint: "approve", spender: getChecksumAddress("0x12"), amount: `0x${VAULT_SESSION_APPROVE_CAP.toString(16)}` },
    ]);
    const methods = Object.values(session.contracts).flatMap((c) => c.methods.map((m) => m.entrypoint));
    for (const gone of ["stake", "unstake", "claim"]) expect(methods).not.toContain(gone);
  });

  it("without the economy, no Vault policy: its writes prompt", async () => {
    const fake = fakeController();
    setup(SEPOLIA_ENV, fake);
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    await waitFor(() => expect(status()).toBe("ready"));
    const methods = Object.values(sessionOf(fake).contracts).flatMap((c) => c.methods.map((m) => m.entrypoint));
    for (const vault of ["deposit", "withdraw", "redeem"]) expect(methods).not.toContain(vault);
    expect(vaultPolicy({ configured: false, addresses: { Economy: "", PavedToken: "", Vault: "", USDC: "" } })).toBeNull();
  });

  it("the cap counts the economy's MAX_STAKE stakes (10)", () => {
    expect(ENTRY_MAX_STAKE).toBe(10n);
  });

  it("an entry that cannot be read puts no approve in the session", async () => {
    const fake = fakeController();
    setup(SEPOLIA_ENV, fake, async () => {
      throw new Error("node down");
    });
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    await waitFor(() => expect(status()).toBe("ready"));
    const methods = Object.values(sessionOf(fake).contracts).flatMap((c) => c.methods.map((m) => m.entrypoint));
    expect(methods).not.toContain("approve");
    expect(methods).toContain("spawn");
  });

  it("Disconnect is disabled while a write is in flight", async () => {
    const fake = fakeController();
    let release!: () => void;
    fake.execute.mockImplementationOnce(() => new Promise((resolve) => (release = () => resolve({ transaction_hash: "0x1" }))));
    setup(SEPOLIA_ENV, fake);
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    await waitFor(() => expect(status()).toBe("ready"));
    const disconnect = () => screen.getByRole<HTMLButtonElement>("button", { name: "Disconnect" });
    expect(disconnect().disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "discard" }));
    await waitFor(() => expect(disconnect().disabled).toBe(true));
    fireEvent.click(disconnect());
    expect(status()).toBe("ready");
    expect(fake.seen.disconnects).toBe(0);
    await act(async () => {
      release();
      await lastWrite;
    });
    expect(disconnect().disabled).toBe(false);
  });

  it("a deployment and an RPC on different chains: no connection, and the banner says why", async () => {
    const { fake } = setup(SEPOLIA_ENV, fakeController({ rpcChainId: "0x534e5f4d41494e" }));
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Chain id mismatch"));
    expect(status()).toBe("read-only");
    expect(fake.seen.options).toBeNull();
  });

  it("a deployment that is not configured gets no controller and no Connect", () => {
    const { fake } = setup({ VITE_NETWORK: "mainnet" });
    expect(status()).toBe("not-configured");
    expect(fake.configs).toEqual([]);
    expect(screen.queryByRole("button", { name: "Connect" })).toBeNull();
  });
});

class Abandoned {
  async probe() {
    return undefined;
  }
  async connect() {
    return undefined;
  }
  async disconnect() {}
}
