import { slow } from "../test-slow";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AVATAR_PART_KEYS, decodeAvatar, encodeAvatar, seededRandom } from "@paved/renderer";
import { App } from "../src/App";
import { shortAddress } from "../src/components/elements/short-address";
import { MOCK_KEY, MockLedger } from "../src/data/mock/ledger";
import { drawNewPlayer, welcomeNewPlayer } from "../src/data/mock/new-player";
import { mockConnector } from "../src/data/mock/overlay";
import { PLAYER_NAME } from "../src/lib/player-names";
import { AVATAR_FREE_IDS, AVATAR_ITEMS, AVATAR_PARTS_IN_USE, ownedIds } from "../src/mocks/avatar";
import { SETTINGS_KEY } from "../src/data/settings";
import { queryClient } from "../src/lib/query-client";
import { createTestRouter } from "../src/routes/router";
import { resetWelcomedForTests } from "../src/routes/welcomed";
import { PvpPlayerRow } from "../src/components/containers/pvp-player-row";
import { usePvpPlayer } from "../src/data/pvp";
import { mockRivalsV2 } from "../src/data/mock/v2";
import { generatedLook } from "../src/mocks/avatar";
import { dataOf, memoryStore, renderData } from "./data-fakes";
import { mockImplementation } from "./mock-fakes";
import { preloadPages } from "./route-helpers";
import { fakeWallet } from "./wallet-fakes";

// A new player on the mock (#926): a plausible name and a look of free items drawn at their first connection, kept by the
// ledger, so no screen names them by their address. A reload keeps both; a Reset's new account draws its own.

const WAIT = { timeout: slow(8000) };

const ledgerOn = (store = memoryStore()) => new MockLedger({ store: () => store, seller: "0x3", latencyMs: 0 });
const catalogue = (owned: bigint[] = AVATAR_ITEMS.map(() => 0n)) => ({ parts: AVATAR_PARTS_IN_USE, items: AVATAR_ITEMS, owned });
/** Whether every part of `look` is one of the free base set. */
const allFree = (look: bigint) => AVATAR_PART_KEYS.every((part) => decodeAvatar(look)[part] < AVATAR_FREE_IDS);
/** What an older account owns: the Crown (headwear 6) alone. */
const OWNS_CROWN = AVATAR_PART_KEYS.map((key) => (key === "headwear" ? ownedIds(6) : 0n));

describe("drawNewPlayer (#926)", () => {
  it("draws a name of the generator's shape and a look of free items only, for a player who owns nothing", () => {
    const random = seededRandom(926);
    for (let i = 0; i < 200; i++) {
      const { name, look } = drawNewPlayer(catalogue(), random);
      expect(name).toMatch(PLAYER_NAME);
      expect(look).not.toBe(0n);
      expect(allFree(look)).toBe(true);
    }
  });

  it("draws the same name and look from the same seed", () => {
    expect(drawNewPlayer(catalogue(), seededRandom(7))).toEqual(drawNewPlayer(catalogue(), seededRandom(7)));
  });

  it("draws among the owned items too, for an older account that bought some", () => {
    const random = seededRandom(3);
    const drawn = new Set(Array.from({ length: 300 }, () => decodeAvatar(drawNewPlayer(catalogue(OWNS_CROWN), random).look).headwear));
    expect(drawn.has(6)).toBe(true);
    expect([...drawn].every((id) => id < AVATAR_FREE_IDS || id === 6)).toBe(true);
  });
});

describe("MockLedger's name (#926)", () => {
  it("has no name for a player before their first connection, then the one drawn, stored with the look", async () => {
    const store = memoryStore();
    const ledger = ledgerOn(store);
    expect(await ledger.name("0x5f1")).toBeNull();
    expect(await welcomeNewPlayer(ledger, "0x5f1", seededRandom(1))).toBe(true);
    const name = await ledger.name("0x5f1");
    expect(name).toMatch(PLAYER_NAME);
    const look = await ledger.avatar("0x5f1");
    expect(allFree(look)).toBe(true);
    expect({ name, look }).toEqual(drawNewPlayer(catalogue(), seededRandom(1)));
    // A reload (a ledger on the same store) reads both.
    expect(await ledgerOn(store).name("0x5f1")).toBe(name);
    expect(await ledgerOn(store).avatar("0x5f1")).toBe(look);
  });

  it("names a player once: a second connection draws nothing and stores nothing", async () => {
    const store = memoryStore();
    const ledger = ledgerOn(store);
    await welcomeNewPlayer(ledger, "0x5f1", seededRandom(1));
    const before = store.getItem(MOCK_KEY);
    expect(await welcomeNewPlayer(ledger, "0x5f1", seededRandom(2))).toBe(false);
    expect(store.getItem(MOCK_KEY)).toBe(before);
  });

  it("keeps a look saved before the name: an account made before #926 is named, its face unchanged", async () => {
    const ledger = ledgerOn();
    const saved = encodeAvatar({ ...decodeAvatar(drawNewPlayer(catalogue(), seededRandom(5)).look), skin: 1 });
    await ledger.writesFor("0x5f1").setAvatar(saved);
    expect(await welcomeNewPlayer(ledger, "0x5f1", seededRandom(9))).toBe(true);
    expect(await ledger.name("0x5f1")).toMatch(PLAYER_NAME);
    expect(await ledger.avatar("0x5f1")).toBe(saved);
  });

  it("stores the look through set_avatar's checks: a paid item a new player does not own is refused, nothing stored", async () => {
    const store = memoryStore();
    const ledger = ledgerOn(store);
    const paid = encodeAvatar({ ...decodeAvatar(drawNewPlayer(catalogue(), seededRandom(5)).look), headwear: 6 });
    await expect(ledger.nameAtConnection("0x5f1", () => ({ name: "MossyMason27", look: paid }))).rejects.toMatchObject({ reason: "not-owned" });
    expect(await ledger.name("0x5f1")).toBeNull();
    expect(store.getItem(MOCK_KEY)).toBeNull();
  });

  it("setName takes letters and digits, 3 to 19 characters (#928), and refuses any other", async () => {
    const ledger = ledgerOn();
    await ledger.writesFor("0x5f1").setName("A".repeat(19));
    await ledger.writesFor("0x5f1").setName("AmberReeve61");
    expect(await ledger.name("0x5f1")).toBe("AmberReeve61");
    for (const bad of ["ab", "A".repeat(20), "Amber Reeve", "Ambre_61", "Évêque12"]) await expect(ledger.writesFor("0x5f1").setName(bad)).rejects.toThrow(/Not a name/);
    expect(await ledger.name("0x5f1")).toBe("AmberReeve61");
  });
});

describe("mockConnector's new player (#926)", () => {
  it("names each account it connects, a Reset's new one with its own name, and answers it as the username", async () => {
    const ledger = ledgerOn();
    const wallet = fakeWallet({ addresses: ["0xa1", "0xa2"], restored: true, address: "0xa1" });
    const connector = mockConnector(wallet.connector, ledger, { random: seededRandom(4) });
    expect(await connector.username()).toBeNull();
    await connector.connect();
    const first = await connector.username();
    expect(first).toMatch(PLAYER_NAME);
    expect(first).toBe(await ledger.name("0xa1"));
    expect(allFree(await ledger.avatar("0xa1"))).toBe(true);
    // A reload: the probe finds the same account, its name and look kept.
    const look = await ledger.avatar("0xa1");
    await connector.probe();
    expect(await connector.username()).toBe(first);
    expect(await ledger.avatar("0xa1")).toBe(look);
    // A Reset: a new account, a new name and look.
    await connector.reset();
    const second = await connector.username();
    expect(second).toMatch(PLAYER_NAME);
    expect(second).toBe(await ledger.name("0xa2"));
    expect(await ledger.avatar("0xa2")).not.toBe(0n);
    await connector.disconnect();
    expect(await connector.username()).toBeNull();
  });

  it("names nobody without an account", async () => {
    const store = memoryStore();
    const connector = mockConnector(fakeWallet().connector, ledgerOn(store));
    expect(await connector.probe()).toBeNull();
    expect(await connector.username()).toBeNull();
    expect(store.getItem(MOCK_KEY)).toBeNull();
  });
});

describe("mockIndexer's player (#926)", () => {
  it("answers the ledger's name for a player of the device, and none for an address the ledger never saw", async () => {
    const s = mockImplementation();
    const indexer = s.sources.indexer;
    expect((await indexer.player("0x777")).data).toEqual({ player: null, stats: null });
    await s.ledger.writesFor("0x777").setName("SwiftCarter04");
    expect((await indexer.player("0x777")).data.player).toMatchObject({ name: "SwiftCarter04", created: null });
  });
});

describe("a new player in the PvP rows (#926)", () => {
  it("usePvpPlayer gives the drawn name and look on the mock, and the row draws that avatar beside the name", async () => {
    const s = mockImplementation();
    const me = s.sources.signer!.address;
    await welcomeNewPlayer(s.ledger, me, seededRandom(926));
    const name = (await s.ledger.name(me))!;
    const look = await s.ledger.avatar(me);
    const { result } = renderData(() => usePvpPlayer(me, name), s.sources);
    await waitFor(() => expect(result.current.data?.look).toBe(look));
    const player = await dataOf(result);
    expect(player).toMatchObject({ name, address: me, look });

    render(<PvpPlayerRow player={player!} />);
    const avatar = document.querySelector("[data-slot=player-avatar]");
    expect(avatar).not.toBeNull();
    // The initial under the look's still: the name's first letter.
    expect(within(avatar as HTMLElement).getByText(name.slice(0, 1))).toBeInTheDocument();
    expect(screen.getByText(name)).toBeInTheDocument();
    expect(screen.queryByText(shortAddress(me))).toBeNull();
  });

  it("a rival of the mock wears the face of its battle logs, read as its saved look", async () => {
    const ledger = ledgerOn();
    const rival = mockRivalsV2()[0]!.address;
    expect(await ledger.avatar(rival)).toBe(generatedLook(rival));
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

describe("a new player's name and look on the screens, on the mock (#926)", () => {
  it("Connect on the welcome: the home's profile and Settings show the drawn name, never the address", async () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ quality: "low" }));
    const s = mockImplementation();
    const me = s.sources.signer!.address;
    const wallet = fakeWallet({ address: me });
    const router = createTestRouter("/");
    render(<App router={router} sources={{ ...s.sources, signer: null }} connector={async () => mockConnector(wallet.connector, s.ledger, { random: seededRandom(926) })} />);
    await waitFor(() => expect(router.state.location.pathname).toBe("/welcome"), WAIT);
    expect(await s.ledger.name(me)).toBeNull();

    await userEvent.click(await screen.findByRole("button", { name: "Connect" }, WAIT));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"), WAIT);
    const name = (await s.ledger.name(me))!;
    expect(name).toMatch(PLAYER_NAME);
    expect(allFree(await s.ledger.avatar(me))).toBe(true);
    const badge = await screen.findByRole("button", { name: new RegExp(`^Profile: ${name}`) }, WAIT);
    // The default avatar's initial, under the look's still: the name's first letter.
    expect(within(badge).getByText(name)).toBeInTheDocument();
    expect(within(badge).getByText(name.slice(0, 1))).toBeInTheDocument();
    expect(screen.queryByText(shortAddress(me))).toBeNull();

    await router.navigate("/settings");
    expect(await screen.findByTitle(name, {}, WAIT)).toHaveTextContent(name);
  }, slow(30_000));
});
