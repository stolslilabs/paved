import { slow } from "../test-slow";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, domMax } from "motion/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RENAME_REFUSAL_TEXT, RenameRefusedError, isPlayerName } from "@paved/chain";
import { App } from "../src/App";
import type { GameSigner } from "../src/data";
import { RenameView, type RenameViewProps } from "../src/components/containers/rename-view";
import { avatarKeys } from "../src/data/avatar";
import { NAME_TAKEN_TEXT, useRename, useRenameWrite } from "../src/data/rename";
import { isPlayerNameText, nameRules, normalizeName } from "../src/lib/name-limit";
import { queryClient } from "../src/lib/query-client";
import { AVATAR_RENAME_PRICE } from "../src/mocks/avatar";
import { PLAYER_ID } from "../src/mocks/players";
import { RENAME, RENAME_PRICE_CHANGED, RENAME_TAKEN } from "../src/mocks/rename";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { SEEDED_PLAYERS } from "../src/data/mock/players";
import { MOCK_KEY, type MockLedger } from "../src/data/mock/ledger";
import { addressKey } from "../src/data/keys";
import { FakeAvatarWriter } from "./avatar-fakes";
import { dataOf, fakeSources, renderData } from "./data-fakes";
import { mockImplementation } from "./mock-fakes";
import { preloadPages } from "./route-helpers";
import { fakeWallet } from "./wallet-fakes";

// PLAYER-RENAME: a player renames themselves from their own profile, the first change free, every later one 50 Cobbles. The view
// (`RenameView`) per state, its reads and write on `@paved/chain`'s fakes, the mock's ledger, and the route: the profile's pencil, the
// name's view, the new name shown at once.

const wrap = (ui: ReactNode) => <LazyMotion features={domMax}>{ui}</LazyMotion>;
const view = (props: Partial<RenameViewProps> = {}) => render(wrap(<RenameView {...RENAME.free} onBack={() => {}} {...props} />));
const rename = () => screen.getByRole("button", { name: "Rename" });
const marks = () => Array.from(document.querySelectorAll("[data-slot=rename-rules] li"), (li) => li.getAttribute("data-mark"));

describe("the name's rules", () => {
  it("are the chain's: any script's letters and digits, single spaces or hyphens between words, 3 to 15 characters (`isPlayerName`)", () => {
    const names = ["abc", "MossyMason27", "Mossy Mason", "Jean-Luc", "李小龙", "Élodie", "Анна", "李小龙 Lee 7", "佐々木", "मोहन", "محمد", "ab", "1234567890123456", " abc", "ab  c", "ab--c", "ab_c", "a\u200bbc", "b\u0430l7hazar", "ab\u{1F600}", "محمد؟", "", "Mossy  Mason!"];
    for (const name of names) {
      const rules = nameRules(name);
      expect(rules.length && rules.characters, JSON.stringify(name)).toBe(isPlayerName(name));
      expect(isPlayerNameText(name), JSON.stringify(name)).toBe(isPlayerName(name));
    }
    // The characters judged whatever the count; typed decomposed or with spaces at its ends, sent composed and trimmed
    expect(nameRules("李")).toEqual({ length: false, characters: true });
    expect(nameRules("a b")).toEqual({ length: true, characters: true });
    expect(normalizeName(" E\u0301lodie ")).toBe("Élodie");
    // The rules are @paved/chain's, copied: the two texts are one
    const rules = (path: string) => {
      const text = readFileSync(resolve(__dirname, path), "utf8");
      return text.slice(text.indexOf("const SPACE = 0x20;"), text.indexOf("/** Unicode's letters, marks and numbers")).trim();
    };
    expect(rules("../src/lib/name-limit.ts")).toBe(rules("../../chain/src/avatar.ts"));
  });

  it("the mocks' refusals are the chain's texts, and its price `scripts/deploy.sh`'s", () => {
    expect(RENAME_TAKEN).toBe(RENAME_REFUSAL_TEXT.taken);
    expect(NAME_TAKEN_TEXT).toBe(RENAME_REFUSAL_TEXT.taken);
    expect(RENAME_PRICE_CHANGED).toBe(RENAME_REFUSAL_TEXT["price-changed"]);
    const script = readFileSync(resolve(__dirname, "../../../scripts/deploy.sh"), "utf8");
    expect(Number(/^FRESH_AVATAR_RENAME_PRICE=(\d+)$/m.exec(script)![1])).toBe(AVATAR_RENAME_PRICE);
  });
});

describe("RenameView (PLAYER-RENAME)", () => {
  it("the first change: the name now, the field, its rules met, Free, Rename sends the name typed", async () => {
    const onRename = vi.fn();
    const onBack = vi.fn();
    view({ onRename, onBack });
    // Outside a drawer: its own header, Back to the profile.
    expect(screen.getByRole("heading", { name: "Name" })).toBeInTheDocument();
    expect(screen.getByText("bal7hazar")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "New name" })).toHaveValue("Quarry Queen");
    expect(marks()).toEqual(["met", "met", "open"]);
    expect(within(screen.getByRole("group", { name: "Cost" })).getByText("Free")).toBeInTheDocument();
    await userEvent.click(rename());
    expect(onRename).toHaveBeenCalledWith("Quarry Queen");
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("a later change: the Cobble and 50, a Chinese name counted in characters; Enter sends it", async () => {
    const onRename = vi.fn();
    view({ ...RENAME.paid, onRename });
    expect(within(screen.getByRole("group", { name: "Cost" })).getByText("50")).toBeInTheDocument();
    // The characters typed, at the end of the length's rule under the field (TILE-COUNTS: out of the title).
    const typed = screen.getByText("3/15");
    expect(typed.closest('[data-mark]')).toHaveTextContent(/^3 to 15 characters/);
    expect(screen.getByText("New name").closest("h3")).toHaveTextContent(/^New name$/);
    expect(rename()).toBeEnabled();
    await userEvent.type(screen.getByRole("textbox", { name: "New name" }), "{Enter}");
    expect(onRename).toHaveBeenCalledWith("李小龙");
  });

  it("fewer Cobbles than the price: the field and Rename held, the cost says how many are missing; no error box", () => {
    view(RENAME.short);
    expect(rename()).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "New name" })).toBeDisabled();
    const cost = screen.getByRole("group", { name: "Cost" });
    expect(cost).toHaveTextContent("30 Cobbles missing");
    expect(cost).toHaveTextContent("50");
    expect(cost).toHaveAttribute("data-short", "true");
    expect(screen.queryByRole("button", { name: /Copy/ })).toBeNull();
  });

  it("a name that breaks a rule, or the name already held: Rename held, the rules crossed", async () => {
    view(RENAME.invalid);
    expect(rename()).toBeDisabled();
    expect(marks()).toEqual(["met", "broken", "open"]);
    expect(screen.getByText("Letters, digits, single spaces or hyphens")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "New name" })).toHaveAttribute("aria-invalid", "true");
    const field = screen.getByRole("textbox", { name: "New name" });
    await userEvent.clear(field);
    await userEvent.type(field, "ab");
    expect(marks()).toEqual(["broken", "met", "open"]);
    await userEvent.clear(field);
    await userEvent.type(field, "bal7hazar");
    expect(rename()).toBeDisabled();
    expect(screen.getByText("This is your name already.")).toBeInTheDocument();
    // Typing tells the page (the last refusal is cleared there).
  });

  it("a name taken: said on its rule's line, crossed; no error box", () => {
    view(RENAME.taken);
    expect(screen.getByText("Taken by another player")).toBeInTheDocument();
    expect(marks()).toEqual(["met", "met", "broken"]);
    expect(rename()).toBeDisabled();
    expect(screen.queryByText(RENAME_TAKEN)).toBeNull();
    expect(screen.queryByRole("button", { name: /Copy/ })).toBeNull();
  });

  it("on its way: the field and Rename held, busy; another refusal: the app's error", () => {
    const { unmount } = view(RENAME.pending);
    expect(rename()).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("textbox", { name: "New name" })).toBeDisabled();
    unmount();
    view(RENAME.refused);
    expect(screen.getByText("Rename refused")).toBeInTheDocument();
    expect(screen.getByText(RENAME_PRICE_CHANGED)).toBeInTheDocument();
  });

  it("done: said under the field, the field emptied, the name now the new one", () => {
    view(RENAME.done);
    expect(document.querySelector("[data-slot=rename-done]")).toHaveTextContent("Renamed: you are now QuarryQueen.");
    expect(screen.getByRole("textbox", { name: "New name" })).toHaveValue("");
    expect(within(document.querySelector("[data-slot=rename-current]")!).getByText("QuarryQueen")).toBeInTheDocument();
    expect(rename()).toBeDisabled();
  });

  it("the cost on its way: an ellipsis, Rename held; no name: the short address", () => {
    const { unmount } = view(RENAME.loading);
    expect(within(screen.getByRole("group", { name: "Cost" })).getByText("…")).toBeInTheDocument();
    expect(rename()).toBeDisabled();
    unmount();
    view(RENAME.noName);
    expect(document.querySelector("[data-slot=rename-current]")).toHaveTextContent(/^#0x/);
  });
});

describe("the name's reads and write (`useRename`, `useRenameWrite`)", () => {
  it("reads the next change's cost and the Cobbles: free first, then the rename price", async () => {
    const { sources, views } = fakeSources();
    views.names.price = 50;
    views.cobblePlayer(PLAYER_ID).account = { ...views.cobblePlayer(PLAYER_ID).account, cobbles: 70 };
    const first = renderData(() => useRename(PLAYER_ID), sources);
    expect(await dataOf(first.result)).toEqual({ name: null, count: 0, price: 50, cost: 0, balance: 70 });
    views.namePlayer(PLAYER_ID).count = 1;
    views.namePlayer(PLAYER_ID).name = "Mason";
    const later = renderData(() => useRename(PLAYER_ID), sources);
    expect(await dataOf(later.result)).toEqual({ name: "Mason", count: 1, price: 50, cost: 50, balance: 70 });
  });

  it("a failed read ends the wait", async () => {
    const { sources, views } = fakeSources();
    views.avatarFail = new Error("down");
    const { result } = renderData(() => useRename(PLAYER_ID), sources);
    await waitFor(() => expect(result.current.error?.message).toBe("down"));
    expect(result.current.isPending).toBe(false);
  });

  it("`refetch` reads the failed ones again: the network back, the cost and the Cobbles", async () => {
    const { sources, views } = fakeSources();
    views.avatarFail = new Error("down");
    const { result } = renderData(() => useRename(PLAYER_ID), sources);
    await waitFor(() => expect(result.current.error?.message).toBe("down"));
    views.avatarFail = null;
    result.current.refetch();
    await waitFor(() => expect(result.current.data).toMatchObject({ name: null, count: 0, cost: 0 }));
    expect(result.current.error).toBeNull();
  });

  it("renames through the signer: the name and the count in the cache at once, the Cobbles debited, every name read invalidated", async () => {
    const { sources, views } = fakeSources();
    views.names.price = 50;
    views.cobblePlayer(PLAYER_ID).account = { ...views.cobblePlayer(PLAYER_ID).account, cobbles: 70 };
    const writer = new FakeAvatarWriter(views, PLAYER_ID);
    const { result, client } = renderData(() => ({ read: useRename(PLAYER_ID), write: useRenameWrite(PLAYER_ID) }), { ...sources, signer: writer as unknown as GameSigner });
    await waitFor(() => expect(result.current.read.data).toBeTruthy());
    const invalidate = vi.spyOn(client, "invalidateQueries");
    await result.current.write.rename("Mason", 0);
    expect(client.getQueryData(avatarKeys.name(PLAYER_ID))).toBe("Mason");
    await waitFor(() => expect(result.current.write.done).toBe("Mason"));
    const keys = invalidate.mock.calls.map(([filters]) => JSON.stringify(filters?.queryKey));
    expect(keys).toEqual(expect.arrayContaining(['["indexer"]', '["social"]', JSON.stringify(avatarKeys.name(PLAYER_ID))]));
    await waitFor(() => expect(result.current.read.data?.cost).toBe(50));
    // The second change: 50 Cobbles.
    await result.current.write.rename("Carter", 50);
    await waitFor(() => expect(result.current.read.data?.balance).toBe(20));
    expect(writer.sent).toEqual(["rename Mason 0", "rename Carter 50"]);
  });

  it("a Cartridge username another player holds (the indexer's): refused before anything is sent; an indexer down does not stop the chain's check", async () => {
    const { sources, views, fixture } = fakeSources();
    const writer = new FakeAvatarWriter(views, PLAYER_ID);
    fixture.holders.set("ada", { playerId: `0x${"a".padStart(64, "0")}`, source: "cartridge" });
    // The player's own Cartridge username is theirs to set.
    fixture.holders.set("bal7hazar", { playerId: PLAYER_ID, source: "cartridge" });
    const { result } = renderData(() => useRenameWrite(PLAYER_ID), { ...sources, signer: writer as unknown as GameSigner });
    await expect(result.current.rename("ADA", 0)).rejects.toMatchObject({ reason: "taken", message: NAME_TAKEN_TEXT });
    expect(writer.sent).toEqual([]);
    await result.current.rename("Bal7hazar", 0);
    expect(writer.sent).toEqual(["rename Bal7hazar 0"]);
    fixture.state.down = true;
    await result.current.rename("Carter", 50).catch(() => undefined);
    expect(writer.sent).toEqual(["rename Bal7hazar 0"]);
    views.names.price = 50;
    views.cobblePlayer(PLAYER_ID).account = { ...views.cobblePlayer(PLAYER_ID).account, cobbles: 50 };
    await result.current.rename("Carter", 50);
    expect(writer.sent).toEqual(["rename Bal7hazar 0", "rename Carter 50"]);
  });

  it("a refusal is the write's error until it is reset; nothing changed", async () => {
    const { sources, views } = fakeSources();
    views.namePlayer("0x99").name = "Mason";
    const writer = new FakeAvatarWriter(views, PLAYER_ID);
    const { result } = renderData(() => useRenameWrite(PLAYER_ID), { ...sources, signer: writer as unknown as GameSigner });
    await expect(result.current.rename("MASON", 0)).rejects.toBeInstanceOf(RenameRefusedError);
    await waitFor(() => expect(result.current.error).toMatchObject({ reason: "taken" }));
    expect(views.namePlayer(PLAYER_ID).name).toBeNull();
    result.current.reset();
    await waitFor(() => expect(result.current.error).toBeNull());
  });
});

/** Gives `player` `cobbles` in the mock's stored state (its first connection made it, a drawn name if none), as earned Cobbles would be. */
async function giveCobbles(ledger: MockLedger, store: { getItem(k: string): string | null; setItem(k: string, v: string): void }, player: string, cobbles: number) {
  await ledger.nameAtConnection(player, () => ({ name: "DrawnName42", look: 0n }));
  const state = JSON.parse(store.getItem(MOCK_KEY)!) as { players: Record<string, { cobbles: number }> };
  state.players[addressKey(player)]!.cobbles = cobbles;
  store.setItem(MOCK_KEY, JSON.stringify(state));
}

describe("the mock's ledger (PLAYER-RENAME)", () => {
  it("the drawn name is not a change: the first rename is free, the next 50 Cobbles; the receipt is the contract's", async () => {
    const { ledger, store } = mockImplementation();
    const player = "0xabc1";
    await ledger.nameAtConnection(player, () => ({ name: "MossyMason27", look: 0n }));
    await giveCobbles(ledger, store, player, 70);
    expect(await ledger.playerName(player)).toBe("MossyMason27");
    expect(await ledger.renameCount(player)).toBe(0);
    expect(await ledger.renamePrice()).toBe(50);
    const writes = ledger.writesFor(player);
    const free = await writes.rename({ name: "李小龙", confirmedPrice: 0 });
    expect(free.events.map((e) => e.name)).toEqual(["Renamed"]);
    expect(await ledger.playerName(player)).toBe("李小龙");
    expect(await ledger.name(player)).toBe("李小龙");
    expect((await ledger.account(player)).cobbles).toBe(70);
    // The name left is free; the new one is the player's in any case.
    expect(await ledger.nameOwner("mossymason27")).toBeNull();
    expect(await ledger.nameOwner("李小龙")).toBe(addressKey(player));
    const paid = await writes.rename({ name: "Élodie Paver", confirmedPrice: 50 });
    expect(await ledger.nameOwner("ÉLODIE PAVER")).toBe(addressKey(player));
    expect(paid.events.map((e) => e.name)).toEqual(["Renamed", "CobblesSpent"]);
    expect(paid.events[1]!.fields).toMatchObject({ reason: "RENAME", cobbles: 50, balance: 20 });
    expect((await ledger.account(player)).cobbles).toBe(20);
    expect(await ledger.renameCount(player)).toBe(2);
  });

  it("refuses as the contract: invalid, the same name, another price, a name another player shows in any case, too few Cobbles", async () => {
    const { ledger, store } = mockImplementation();
    const player = "0xabc2";
    const writes = ledger.writesFor(player);
    await giveCobbles(ledger, store, player, 10);
    const reason = (p: Promise<unknown>) => p.then(() => "sent", (e: unknown) => (e as RenameRefusedError).reason);
    expect(await reason(writes.rename({ name: "a  b", confirmedPrice: 0 }))).toBe("invalid-name");
    expect(await reason(writes.rename({ name: "b\u0430l7hazar", confirmedPrice: 0 }))).toBe("invalid-name");
    expect(await reason(writes.rename({ name: "Mason", confirmedPrice: 50 }))).toBe("price-changed");
    expect(await reason(writes.rename({ name: SEEDED_PLAYERS[0]!.name.toUpperCase(), confirmedPrice: 0 }))).toBe("taken");
    await writes.rename({ name: "Mason", confirmedPrice: 0 });
    expect(await reason(writes.rename({ name: "Mason", confirmedPrice: 50 }))).toBe("same-name");
    expect(await reason(writes.rename({ name: "Carter", confirmedPrice: 50 }))).toBe("not-enough-cobbles");
    expect(await ledger.playerName(player)).toBe("Mason");
  });
});

describe("the route: the profile's pencil, the name's view, the new name at once", () => {
  preloadPages("home");

  beforeEach(() => {
    queryClient.clear();
    localStorage.clear();
    resetWelcomedForTests();
    markWelcomed();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    queryClient.clear();
    localStorage.clear();
    resetWelcomedForTests();
  });

  it(
    "renames from the profile: free first, Back to the profile showing the new name; the next change shows 50",
    async () => {
      const fakes = fakeSources();
      fakes.views.names.price = 50;
      const writer = new FakeAvatarWriter(fakes.views, PLAYER_ID);
      const wallet = fakeWallet({ address: PLAYER_ID, restored: true });
      wallet.connector.signer = () => writer as unknown as GameSigner;
      render(<App router={createTestRouter("/")} sources={fakes.sources} connector={wallet.load} />);
      await userEvent.click(await screen.findByRole("button", { name: /^Profile:/ }, { timeout: slow(5000) }));
      const sheet = await screen.findByRole("dialog", { name: "Profile" }, { timeout: slow(5000) });
      await userEvent.click(await within(sheet).findByRole("button", { name: "Edit name" }, { timeout: slow(5000) }));
      const field = await within(sheet).findByRole("textbox", { name: "New name" }, { timeout: slow(5000) });
      await waitFor(() => expect(within(sheet).getByText("Free")).toBeInTheDocument(), { timeout: slow(5000) });
      await userEvent.type(field, "Quarry Queen");
      await userEvent.click(within(sheet).getByRole("button", { name: "Rename" }));
      await waitFor(() => expect(sheet.querySelector("[data-slot=rename-done]")).toHaveTextContent("Renamed: you are now Quarry Queen."), { timeout: slow(5000) });
      expect(writer.sent).toEqual(["rename Quarry Queen 0"]);
      // The next change costs 50 Cobbles.
      await waitFor(() => expect(within(within(sheet).getByRole("group", { name: "Cost" })).getByText("50")).toBeInTheDocument(), { timeout: slow(5000) });
      // Back: the profile shows the new name, and so does the home's player card.
      await userEvent.click(within(sheet).getAllByRole("button", { name: "Back" })[0]!);
      expect(await within(sheet).findByText("Quarry Queen")).toBeInTheDocument();
      // Under the drawer (a modal: hidden from the tree while it is open).
      expect(screen.getAllByRole("button", { name: /^Profile: Quarry Queen/, hidden: true }).length).toBeGreaterThan(0);
    },
    slow(20_000),
  );

  it(
    "a failed read (#1080): Names cannot be read and Retry in the drawer, Rename held; Retry reads again and the view recovers",
    async () => {
      const fakes = fakeSources();
      fakes.views.names.price = 50;
      // The price read fails until the network is back, past the query client's own retry.
      let down = true;
      const price = fakes.views.renamePrice.bind(fakes.views);
      vi.spyOn(fakes.views, "renamePrice").mockImplementation(() => (down ? Promise.reject(new Error("The chain did not answer")) : price()));
      const writer = new FakeAvatarWriter(fakes.views, PLAYER_ID);
      const wallet = fakeWallet({ address: PLAYER_ID, restored: true });
      wallet.connector.signer = () => writer as unknown as GameSigner;
      render(<App router={createTestRouter("/")} sources={fakes.sources} connector={wallet.load} />);
      await userEvent.click(await screen.findByRole("button", { name: /^Profile:/ }, { timeout: slow(5000) }));
      const sheet = await screen.findByRole("dialog", { name: "Profile" }, { timeout: slow(5000) });
      await userEvent.click(await within(sheet).findByRole("button", { name: "Edit name" }, { timeout: slow(5000) }));
      expect(await within(sheet).findByText("Names cannot be read", undefined, { timeout: slow(8000) })).toBeInTheDocument();
      expect(within(sheet).getByText("The chain did not answer")).toBeInTheDocument();
      expect(within(sheet).getByRole("button", { name: "Rename" })).toBeDisabled();
      // The network back: Retry reads the price again, the error gone, the first change free.
      down = false;
      await userEvent.click(within(sheet).getByRole("button", { name: "Retry" }));
      await waitFor(() => expect(within(within(sheet).getByRole("group", { name: "Cost" })).getByText("Free")).toBeInTheDocument(), { timeout: slow(5000) });
      expect(within(sheet).queryByText("Names cannot be read")).not.toBeInTheDocument();
      expect(within(sheet).queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
      await userEvent.type(within(sheet).getByRole("textbox", { name: "New name" }), "Quarry Queen");
      expect(within(sheet).getByRole("button", { name: "Rename" })).toBeEnabled();
    },
    slow(20_000),
  );
});
