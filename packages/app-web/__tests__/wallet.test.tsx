// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { getChecksumAddress } from "starknet";
import { PavedClient, controllerPolicies, createCodecs, createControllerConnector, usePaved } from "@paved/chain";
import type { ControllerConfig, GameViews, PavedRpc, WriteResult } from "@paved/chain";
import { ConnectionBanner } from "../src/components/ConnectionBanner";
import { WalletProvider } from "../src/components/WalletProvider";
import { resolveAppNetwork } from "../src/utils/network";

const SEPOLIA = "0x534e5f5345504f4c4941";
const ENTRY = 25n;
const CONTRACTS = { Account: { address: "0x1" }, Daily: { address: "0x2" }, Tutorial: { address: "0x3" }, Token: { address: "0x4" } };
const FILES = {
  "x/devnet.json": { default: { rpc_url: "http://devnet/rpc", contracts: CONTRACTS } },
  "x/sepolia.json": { default: { rpc_url: "http://sepolia/rpc", chain_id: SEPOLIA, contracts: CONTRACTS } },
};
const BURNER_ENV = { VITE_PLAYER_ADDRESS: "0xb0", VITE_PLAYER_PRIVATE_KEY: "0xb1" };
const SEPOLIA_ENV = { VITE_NETWORK: "sepolia", ...BURNER_ENV };


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
  }
  const module = { default: Controller };
  const configs: ControllerConfig[] = [];
  const createConnector = (config: ControllerConfig) => {
    configs.push(config);
    return createControllerConnector(config, { load: async () => module, chainId: async () => options.rpcChainId ?? SEPOLIA });
  };
  return { account, execute, seen, configs, createConnector };
}

function clientOf(network: ReturnType<typeof resolveAppNetwork>) {
  const rpc = {
    callContract: async () => [],
    getEvents: async () => ({ events: [] }),
    waitForTransaction: async () => ({ execution_status: "SUCCEEDED", events: [] }),
  } as unknown as PavedRpc;
  const views = { entryPrice: async () => ({ token: "0x4", amount: ENTRY }) } as unknown as GameViews;
  return new PavedClient(network.deployment, rpc, createCodecs(), views);
}

let lastWrite: Promise<WriteResult> | null = null;

function Probe() {
  const { status, address, writer } = usePaved();
  return (
    <div>
      <output data-testid="status">{status}</output>
      <output data-testid="address">{address ?? "none"}</output>
      <button type="button" disabled={!writer} onClick={() => (lastWrite = writer!.discard({ mode: "daily", gameId: 7 }))}>
        discard
      </button>
    </div>
  );
}

function setup(env: Record<string, string>, fake = fakeController()) {
  const network = resolveAppNetwork(env, FILES);
  render(
    <WalletProvider env={env} network={network} createConnector={fake.createConnector} client={clientOf(network)}>
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
    const daily = network.deployment.addresses.Daily;
    expect(fake.execute).toHaveBeenCalledTimes(1);
    expect(fake.execute.mock.calls[0][0]).toEqual([{ contractAddress: daily, entrypoint: "discard", calldata: ["0x7"] }]);
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

  it("the session holds the client's policies on the deployment's chain, approve pinned to Daily up to the entry price", async () => {
    const { fake, network } = setup(SEPOLIA_ENV);
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    await waitFor(() => expect(status()).toBe("ready"));
    expect(fake.configs).toHaveLength(1);
    expect(fake.configs[0]).toMatchObject({ rpc: "http://sepolia/rpc", chainId: SEPOLIA });
    expect(fake.seen.options).toMatchObject({ chains: [{ rpcUrl: "http://sepolia/rpc" }], defaultChainId: SEPOLIA });
    const session = fake.seen.options!.policies as { contracts: Record<string, { methods: Array<Record<string, string>> }> };
    const sessionKeys = Object.entries(session.contracts).flatMap(([target, { methods }]) => methods.map((m) => `${BigInt(target)}:${m.entrypoint}`));
    const expected = controllerPolicies(network.deployment, { approveCap: ENTRY });
    expect(sessionKeys.sort()).toEqual(expected.map((p) => `${BigInt(p.target)}:${p.method}`).sort());
    expect(session.contracts[getChecksumAddress("0x4")].methods).toEqual([{ entrypoint: "approve", spender: getChecksumAddress("0x2"), amount: "0x19" }]);
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
