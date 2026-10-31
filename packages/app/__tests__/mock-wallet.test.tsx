import { slow } from "../test-slow";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { seededRandom } from "@paved/renderer";
import { DEVICE_KEY, DEVICE_KEY_SIGNED_OUT, PavedClient, WriteError, localKey, refusedBeforeSending, resolveDeployment, type KeyStorage, type PavedRpc, type WriteAccount } from "@paved/chain";
import type { GameSigner } from "../src/data";
import { MockLedger } from "../src/data/mock/ledger";
import { mockConnector } from "../src/data/mock/overlay";
import { MOCK_ACCOUNT_UNSENT, MockAccountError, mockKeyConnector } from "../src/wallet/mock-key";
import { App } from "../src/App";
import { SETTINGS_KEY } from "../src/data/settings";
import { queryClient } from "../src/lib/query-client";
import { createTestRouter } from "../src/routes/router";
import { resetWelcomedForTests } from "../src/routes/welcomed";
import { memoryStore } from "./data-fakes";
import { mockImplementation } from "./mock-fakes";
import { preloadPages } from "./route-helpers";

// The mock's wallet (#927, PR 2 of 6): the device's key in its storage, as today, and its account the ledger's. Nothing reads
// a node and nothing is deployed; Connect, Disconnect and Reset work as the chain's connector does, and Reset forgets the
// ledger's account with the key.

function memoryStorage(): KeyStorage & { items: Map<string, string> } {
  const items = new Map<string, string>();
  return { items, getItem: (k) => items.get(k) ?? null, setItem: (k, v) => void items.set(k, v), removeItem: (k) => void items.delete(k) };
}

const ledgerOn = (store = memoryStore()) => new MockLedger({ store: () => store, seller: "0x3", latencyMs: 0 });

/** The signer of an account, recorded: the app gives the chain's writer, the tests a stand-in. */
const signerOf = (from: WriteAccount) => ({ address: from.address, account: from }) as unknown as GameSigner;

/** The mock's key connector on `storage`, and the app's mock overlay over it (`mockConnector`), as `appConnector` builds them. */
function wallet(storage = memoryStorage(), ledger = ledgerOn()) {
  const keys = mockKeyConnector({ storage, ledger, signer: signerOf });
  return { storage, ledger, keys, connector: mockConnector(keys, ledger, { random: seededRandom(927) }) };
}

/** Within a describe: `fetch` refused, and each test ends with no call to it (no node read, no deployment). */
function noNetwork() {
  let fetched: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetched = vi.fn(() => Promise.reject(new Error("no network in the mock's wallet")));
    vi.stubGlobal("fetch", fetched);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    expect(fetched).not.toHaveBeenCalled();
  });
}

describe("mockKeyConnector (#927)", () => {
  noNetwork();

  it("a new browser: no account until Connect, which keeps a key in the storage; its account is the key's, as on the chain", async () => {
    const { storage, keys } = wallet();
    expect(await keys.probe()).toBeNull();
    const account = await keys.connect();
    const key = storage.items.get(DEVICE_KEY)!;
    // The same address the chain's connector gives the same key: a device keeps its ledger's account across the switch.
    expect(account.address).toBe(localKey(key).address);
    expect(await keys.username()).toBeNull();
  });

  it("a reload finds the same account without a prompt, and a second Connect keeps the key", async () => {
    const storage = memoryStorage();
    const first = await wallet(storage).keys.connect();
    expect((await wallet(storage).keys.probe())!.address).toBe(first.address);
    expect((await wallet(storage).keys.connect()).address).toBe(first.address);
  });

  it("Disconnect keeps the key and stops the reconnect; Connect finds the same account", async () => {
    const { storage, keys } = wallet();
    const account = await keys.connect();
    await keys.disconnect();
    expect(storage.items.get(DEVICE_KEY_SIGNED_OUT)).toBe("1");
    expect(await keys.probe()).toBeNull();
    expect((await keys.connect()).address).toBe(account.address);
    expect(await keys.probe()).not.toBeNull();
  });

  it("the account sends nothing: a write the mock does not answer is refused before sending, nothing deployed", async () => {
    const { keys } = wallet();
    const account = await keys.connect();
    const call = { contractAddress: "0x1", entrypoint: "build", calldata: [] };
    const refusal = await account.execute([call]).catch((e: unknown) => e);
    expect(refusal).toBeInstanceOf(MockAccountError);
    expect(refusedBeforeSending(refusal)).toBe(true);
    // Through the chain's writer (the signer of the app): a `WriteError` with the mock's words, no hash, not an unknown outcome.
    const deployment = resolveDeployment({ network: "sepolia", env: { rpcUrl: "http://rpc.invalid", addresses: { Challenge: "0x123" } } });
    const writer = new PavedClient(deployment, {} as PavedRpc).writer(account);
    const sent = await writer.surrender({ mode: "challenge", gameId: 1 }).catch((e: unknown) => e);
    expect(sent).toBeInstanceOf(WriteError);
    expect(sent).toMatchObject({ message: MOCK_ACCOUNT_UNSENT, transactionHash: undefined });
  });
});

describe("the mock's wallet with the ledger (#927)", () => {
  noNetwork();

  it("Connect gives the ledger's account: its village founded and its name drawn, the username the ledger's", async () => {
    const { ledger, connector } = wallet();
    const account = await connector.connect();
    expect((await ledger.freeVillage(account.address)).founded).toBe(true);
    const name = await ledger.name(account.address);
    expect(name).toMatch(/^[A-Za-z0-9]{3,20}$/);
    expect(await connector.username()).toBe(name);
  });

  it("Reset forgets the key and the ledger's account, then connects a new one, founded and named", async () => {
    const { storage, ledger, connector } = wallet();
    const old = await connector.connect();
    const oldKey = storage.items.get(DEVICE_KEY);
    await ledger.writesFor(old.address).setName("OldAccount1");
    const fresh = await connector.reset();
    expect(fresh.address).not.toBe(old.address);
    expect(storage.items.get(DEVICE_KEY)).not.toBe(oldKey);
    expect(fresh.address).toBe(localKey(storage.items.get(DEVICE_KEY)!).address);
    // The old account is gone from the ledger: no name, no village, a new player's state.
    expect(await ledger.name(old.address)).toBeNull();
    expect((await ledger.freeVillage(old.address)).founded).toBe(false);
    expect((await ledger.freeVillage(fresh.address)).founded).toBe(true);
    expect(await ledger.name(fresh.address)).not.toBeNull();
    expect(await connector.username()).toBe(await ledger.name(fresh.address));
  });

  it("Reset after Disconnect forgets the kept key's account too, and connects", async () => {
    const { storage, ledger, connector } = wallet();
    const old = await connector.connect();
    await connector.disconnect();
    const fresh = await connector.reset();
    expect(fresh.address).not.toBe(old.address);
    expect(storage.items.has(DEVICE_KEY_SIGNED_OUT)).toBe(false);
    expect(await ledger.name(old.address)).toBeNull();
  });
});

describe("MockLedger.forget (#927)", () => {
  it("drops the account's record, stored: a reload reads a new player", async () => {
    const store = memoryStore();
    const ledger = ledgerOn(store);
    await ledger.foundAtConnection("0x5f1");
    await ledger.foundAtConnection("0x5f2");
    expect(await ledger.forget("0x5f1")).toBe(true);
    expect((await ledgerOn(store).freeVillage("0x5f1")).founded).toBe(false);
    // The other account stays.
    expect((await ledgerOn(store).freeVillage("0x5f2")).founded).toBe(true);
    // An account the ledger never held: nothing to forget, nothing stored.
    const before = store.data.get("paved.mock.v1");
    expect(await ledger.forget("0x5f3")).toBe(false);
    expect(store.data.get("paved.mock.v1")).toBe(before);
  });

  it("takes the account's Vault shares out with their value: the share's price stays for the others", async () => {
    // An account that won 1,000 PAVED (a new one holds none, #927).
    const ledger = new MockLedger({ store: () => memoryStore(), seller: "0x3", latencyMs: 0, starting: { usdc: 0n, paved: 10n ** 21n } });
    const amount = 10n ** 20n;
    await ledger.writesFor("0x5f1").deposit(amount, { confirmedAmount: amount });
    const price = async () => {
      const { totalAssets, totalSupply } = await ledger.vault("0x5f2");
      return (totalAssets * 10n ** 18n) / totalSupply;
    };
    const before = await price();
    const held = await ledger.vault("0x5f1");
    expect(held.shares).toBeGreaterThan(0n);
    await ledger.forget("0x5f1");
    const after = await ledger.vault("0x5f2");
    expect(after.totalSupply).toBe(held.totalSupply - held.shares);
    expect(await price()).toBe(before);
    expect((await ledger.vault("0x5f1")).shares).toBe(0n);
  });
});

preloadPages("home", "welcome", "settings");
beforeAll(async () => {
  await Promise.all([import("../src/routes/pages/home"), import("../src/routes/home-stage")]);
}, slow(60_000));
beforeEach(() => {
  queryClient.clear();
  localStorage.clear();
  resetWelcomedForTests();
});
afterEach(() => {
  queryClient.clear();
  localStorage.clear();
  resetWelcomedForTests();
});

const WAIT = { timeout: slow(8000) };

describe("the mock's wallet in the app (#927)", () => {
  it("Connect on the welcome, a reload keeps the account, and Settings' Reset starts a new one", async () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ quality: "low" }));
    const s = mockImplementation();
    const storage = memoryStorage();
    // The app's wiring on the mock (`appConnector`): the key connector, the ledger's overlay over it. One draw across the visits.
    const random = seededRandom(248);
    const load = async () => mockConnector(mockKeyConnector({ storage, ledger: s.ledger, signer: signerOf }), s.ledger, { random });
    const visit = (path: string) => {
      const router = createTestRouter(path);
      render(<App router={router} sources={{ ...s.sources, signer: null }} connector={load} />);
      return router;
    };

    let router = visit("/");
    await waitFor(() => expect(router.state.location.pathname).toBe("/welcome"), WAIT);
    await userEvent.click(await screen.findByRole("button", { name: "Connect" }, WAIT));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"), WAIT);
    const first = localKey(storage.items.get(DEVICE_KEY)!).address;
    const name = (await s.ledger.name(first))!;
    expect(await screen.findByRole("button", { name: new RegExp(`^Profile: ${name}`) }, WAIT)).toBeInTheDocument();
    expect(await screen.findByRole("img", { name: "Village layout of 9 tiles" }, WAIT)).toBeInTheDocument();

    // A reload: the same key, the same account, no prompt.
    cleanup();
    queryClient.clear();
    visit("/settings");
    expect(await screen.findByTitle(name, {}, WAIT)).toHaveTextContent(name);

    await userEvent.click(await screen.findByRole("button", { name: "Reset" }, WAIT));
    await waitFor(() => expect(localKey(storage.items.get(DEVICE_KEY)!).address).not.toBe(first), WAIT);
    const fresh = localKey(storage.items.get(DEVICE_KEY)!).address;
    const freshName = (await s.ledger.name(fresh))!;
    expect(freshName).not.toBe(name);
    expect(await screen.findByTitle(freshName, {}, WAIT)).toHaveTextContent(freshName);
    // The old account is gone from the ledger with its key.
    expect(await s.ledger.name(first)).toBeNull();
    expect((await s.ledger.freeVillage(first)).founded).toBe(false);
  }, slow(40_000));
});
