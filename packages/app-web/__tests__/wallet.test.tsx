// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PavedClient, controllerPolicies, createControllerConnector, usePaved } from "@paved/chain";
import type { ControllerConfig, PavedRpc, WriteResult } from "@paved/chain";
import { ConnectionBanner } from "../src/components/ConnectionBanner";
import { WalletProvider } from "../src/components/WalletProvider";
import { resolveAppNetwork } from "../src/utils/network";

const CONTRACTS = { Account: { address: "0x1" }, Daily: { address: "0x2" }, Tutorial: { address: "0x3" }, Token: { address: "0x4" } };
const FILES = {
  "x/devnet.json": { default: { rpc_url: "http://devnet/rpc", contracts: CONTRACTS } },
  "x/sepolia.json": { default: { rpc_url: "http://sepolia/rpc", chain_id: "0x534e5f5345504f4c4941", contracts: CONTRACTS } },
};
const BURNER_ENV = { VITE_PLAYER_ADDRESS: "0xb0", VITE_PLAYER_PRIVATE_KEY: "0xb1" };
const SEPOLIA_ENV = { VITE_NETWORK: "sepolia", ...BURNER_ENV };

/** `@cartridge/controller` as the connector uses it: a session the player approves on `connect`. */
function fakeController(options: { approved?: boolean } = {}) {
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
  const module = { default: Controller, toSessionPolicies: (policies: unknown) => ({ converted: policies }) };
  const configs: ControllerConfig[] = [];
  const createConnector = (config: ControllerConfig) => {
    configs.push(config);
    return createControllerConnector(config, { load: async () => module, chainId: async () => "0xfeed" });
  };
  return { account, execute, seen, configs, createConnector };
}

function clientOf(network: ReturnType<typeof resolveAppNetwork>) {
  const rpc = {
    callContract: async () => [],
    getEvents: async () => ({ events: [] }),
    waitForTransaction: async () => ({ execution_status: "SUCCEEDED", events: [] }),
  } as unknown as PavedRpc;
  return new PavedClient(network.deployment, rpc);
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
    const load = async () => ({ default: Abandoned, toSessionPolicies: (policies: unknown) => policies });
    setup(SEPOLIA_ENV, { ...fakeController(), createConnector: (config) => createControllerConnector(config, { load }) });
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Not connected: The controller did not connect"));
    expect(status()).toBe("read-only");
  });

  it("the session policies list exactly the client's entry points, on the deployment's chain", async () => {
    const { fake, network } = setup(SEPOLIA_ENV);
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    await waitFor(() => expect(status()).toBe("ready"));
    const expected = [
      { target: "0x1", method: "create" },
      { target: "0x4", method: "approve" },
      ...["spawn", "build", "discard", "surrender", "claim", "sponsor"].map((method) => ({ target: "0x2", method })),
      ...["spawn", "build", "discard", "surrender"].map((method) => ({ target: "0x3", method })),
    ];
    expect(controllerPolicies(network.deployment)).toEqual(expected);
    expect(fake.configs).toEqual([{ rpc: "http://sepolia/rpc", chainId: "0x534e5f5345504f4c4941", policies: expected }]);
    expect(fake.seen.options).toMatchObject({
      chains: [{ rpcUrl: "http://sepolia/rpc" }],
      defaultChainId: "0x534e5f5345504f4c4941",
      policies: { converted: expected },
    });
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
