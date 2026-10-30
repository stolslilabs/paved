import { slow } from "../test-slow";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { layoutScore, starterLayout } from "@paved/game-core";
import { App } from "../src/App";
import type { FreeVillageWrites } from "../src/data/free-village-base";
import { MOCK_KEY, MockLedger } from "../src/data/mock/ledger";
import { mockConnector } from "../src/data/mock/overlay";
import { SETTINGS_KEY } from "../src/data/settings";
import { queryClient } from "../src/lib/query-client";
import { createTestRouter } from "../src/routes/router";
import { resetWelcomedForTests } from "../src/routes/welcomed";
import { memoryStore } from "./data-fakes";
import { mockImplementation } from "./mock-fakes";
import { preloadPages } from "./route-helpers";
import { fakeWallet } from "./wallet-fakes";

// A new account on the mock (#927, PR 1 of 6; #753): the ledger founds its free village at its first connection, so the home
// shows the starter and its 8 tiles and Edit opens, with no Found. The connector is the app's mock one (`mockConnector`) over a
// key in memory (`fakeWallet`).

const WAIT = { timeout: slow(8000) };

const ledgerOn = (store = memoryStore()) => new MockLedger({ store: () => store, seller: "0x3", latencyMs: 0 });

describe("MockLedger.foundAtConnection (#927)", () => {
  it("founds a new account's village as Found does: the starter layout of its address, its tiles in the inventory", async () => {
    const store = memoryStore();
    const ledger = ledgerOn(store);
    const viaFound = ledgerOn();
    await viaFound.writesFor("0x5f1").foundFreeVillage();
    expect(await ledger.foundAtConnection("0x5f1")).toBe(true);
    const village = await ledger.freeVillage("0x5f1");
    expect(village).toMatchObject({ founded: true, tiles: starterLayout(0x5f1n), score: layoutScore(starterLayout(0x5f1n)) });
    expect(village).toEqual(await viaFound.freeVillage("0x5f1"));
    expect(await ledger.inventory("0x5f1")).toEqual(await viaFound.inventory("0x5f1"));
    // Stored: a ledger on the same store (a reload) reads it founded.
    expect((await ledgerOn(store).freeVillage("0x5f1")).founded).toBe(true);
  });

  it("leaves a founded village as it was, nothing stored, and Found then refuses", async () => {
    const store = memoryStore();
    const ledger = ledgerOn(store);
    await ledger.foundAtConnection("0x5f1");
    const layout = starterLayout(0x5f1n).slice(0, 3);
    await ledger.writesFor("0x5f1").saveLayout(layout);
    const before = store.getItem(MOCK_KEY);
    expect(await ledger.foundAtConnection("0x5f1")).toBe(false);
    expect(store.getItem(MOCK_KEY)).toBe(before);
    expect((await ledger.freeVillage("0x5f1")).tiles).toEqual(layout);
    await expect(ledger.writesFor("0x5f1").foundFreeVillage()).rejects.toMatchObject({ reason: "founded" });
  });

  it("founds one account's village only", async () => {
    const ledger = ledgerOn();
    await ledger.foundAtConnection("0x5f1");
    expect((await ledger.freeVillage("0x5f2")).founded).toBe(false);
  });
});

describe("mockConnector (#927)", () => {
  it("founds the village of the account each connection gives: connect, a restore, a Reset's new key", async () => {
    const ledger = ledgerOn();
    const wallet = fakeWallet({ addresses: ["0xa1", "0xa2"], restored: true, address: "0xa3" });
    const connector = mockConnector(wallet.connector, ledger);
    expect((await connector.connect()).address).toBe("0xa1");
    expect((await ledger.freeVillage("0xa1")).founded).toBe(true);
    expect((await connector.reset()).address).toBe("0xa2");
    expect((await ledger.freeVillage("0xa2")).founded).toBe(true);
    expect((await connector.probe())!.address).toBe("0xa3");
    expect((await ledger.freeVillage("0xa3")).founded).toBe(true);
  });

  it("founds nothing without an account, and its signer writes to the ledger", async () => {
    const store = memoryStore();
    const ledger = ledgerOn(store);
    const connector = mockConnector(fakeWallet().connector, ledger);
    expect(await connector.probe()).toBeNull();
    expect(store.getItem(MOCK_KEY)).toBeNull();
    // The signer alone founds nothing: Found (the `chain` source's way) still writes to the ledger.
    const signer = connector.signer({ address: "0x5f1", execute: async () => ({ transaction_hash: "0x1" }) }) as unknown as FreeVillageWrites;
    expect((await ledger.freeVillage("0x5f1")).founded).toBe(false);
    await expect(signer.foundFreeVillage()).resolves.toMatchObject({ transactionHash: expect.stringMatching(/^0x6d6f636b/) });
    expect((await ledger.freeVillage("0x5f1")).founded).toBe(true);
  });
});

preloadPages("home", "welcome");
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

describe("a new account from Connect to the editor, on the mock (#927, #753)", () => {
  it("first visit: Connect on the welcome, the home's 9 starter tiles, then Edit opens the editor", async () => {
    // The plan view (jsdom has no WebGL): its label counts the tiles.
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ quality: "low" }));
    const s = mockImplementation();
    const me = s.sources.signer!.address;
    const wallet = fakeWallet({ address: me });
    const router = createTestRouter("/");
    render(<App router={router} sources={{ ...s.sources, signer: null }} connector={async () => mockConnector(wallet.connector, s.ledger)} />);
    await waitFor(() => expect(router.state.location.pathname).toBe("/welcome"), WAIT);
    expect((await s.ledger.freeVillage(me)).founded).toBe(false);

    await userEvent.click(await screen.findByRole("button", { name: "Connect" }, WAIT));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"), WAIT);
    expect(await screen.findByRole("img", { name: "Village layout of 9 tiles" }, WAIT)).toBeInTheDocument();
    expect((await s.ledger.freeVillage(me)).tiles).toEqual(starterLayout(BigInt(me)));
    expect(screen.queryByRole("button", { name: "Found" })).toBeNull();

    await userEvent.click(await screen.findByRole("button", { name: "Edit village" }, WAIT));
    await waitFor(() => expect(router.state.location.search).toBe("?edit"), WAIT);
    expect(await screen.findByRole("button", { name: "Leave edit mode" }, WAIT)).toBeInTheDocument();
  }, slow(30_000));
});
