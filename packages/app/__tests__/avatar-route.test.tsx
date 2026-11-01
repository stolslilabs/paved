import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { KING_TRAITS, encodeTraits } from "@paved/renderer";
import { App } from "../src/App";
import type { GameSigner } from "../src/data";
import { avatarKeys } from "../src/data/avatar";
import { queryClient } from "../src/lib/query-client";
import { AVATAR_ITEMS, AVATAR_PARTS_IN_USE, AVATAR_PRICE_BOUNDS } from "../src/mocks/avatar";
import { PLAYER_ID } from "../src/mocks/players";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { FakeAvatarWriter } from "./avatar-fakes";
import { fakeSources } from "./data-fakes";
import { preloadPages } from "./route-helpers";
import { fakeWallet } from "./wallet-fakes";

// The avatar creator's route (#626 PR 2) on `@paved/chain`'s fakes: the catalogue of the fresh deployment on `FakeGameViews`,
// the writes on `FakeAvatarWriter` (with `Avatar`'s checks), the player restored by the wallet, through the app's query client.

/** One chain (the fakes) the devices share; the player with `cobbles`. */
function chain(cobbles = 50) {
  const fakes = fakeSources();
  const { views } = fakes;
  views.avatars.parts = AVATAR_PARTS_IN_USE;
  views.avatars.bounds = [...AVATAR_PRICE_BOUNDS];
  for (const item of AVATAR_ITEMS.flat()) views.listAvatarItem(item);
  const ledger = views.cobblePlayer(PLAYER_ID);
  ledger.account = { ...ledger.account, cobbles };
  const writer = new FakeAvatarWriter(views, PLAYER_ID);
  return { ...fakes, writer };
}

/** A device: the app at `path` on that chain, the player restored by its wallet, whose signer writes the avatar. */
function open(c: ReturnType<typeof chain>, path: string, options: { guest?: boolean } = {}) {
  const wallet = fakeWallet({ address: PLAYER_ID, restored: !options.guest });
  wallet.connector.signer = () => c.writer as unknown as GameSigner;
  const router = createTestRouter(path);
  const view = render(<App router={router} sources={c.sources} connector={wallet.load} />);
  return { router, wallet, ...view };
}

preloadPages("home", "welcome");

beforeEach(async () => {
  await import("../src/routes/pages/avatar");
  queryClient.clear();
  localStorage.clear();
  resetWelcomedForTests();
  markWelcomed();
});
afterEach(() => {
  queryClient.clear();
  localStorage.clear();
  resetWelcomedForTests();
});

describe("/avatar: the creator", () => {
  it("builds an avatar, buys a priced item, saves it; another device's menus read it", async () => {
    const c = chain(50);
    const first = open(c, "/avatar");
    await userEvent.click(await screen.findByRole("tab", { name: "Headwear" }, { timeout: 5000 }));
    // A free item: picked, Save on.
    await userEvent.click(screen.getByRole("radio", { name: "Helmet, free" }));
    // A priced item tried on: Save waits for it, Buy at its price.
    await userEvent.click(screen.getByRole("radio", { name: "Wizard hat, 40 Cobbles" }));
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Buy" }));
    expect(await screen.findByRole("radio", { name: "Wizard hat, owned" })).toBeInTheDocument();
    expect(c.views.cobblePlayer(PLAYER_ID).account.cobbles).toBe(10);
    await userEvent.click(screen.getByRole("tab", { name: "Skin tone" }));
    await userEvent.click(screen.getByRole("radio", { name: "Brown, free" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    const look = encodeTraits({ ...KING_TRAITS, headwear: "wizard", skin: "brown" });
    expect(await screen.findByRole("button", { name: "Saved" })).toBeDisabled();
    // Headwear is the look's part 7, the Wizard hat its item 4.
    expect(c.writer.sent).toEqual(["buy 7 4", `set ${look}`]);
    expect(c.views.avatarPlayer(PLAYER_ID).look).toBe(look);
    first.unmount();

    // Another device: nothing in its cache; its menus read the look from the chain.
    queryClient.clear();
    open(c, "/");
    await screen.findByRole("heading", { level: 1, name: "Home" }, { timeout: 5000 });
    await waitFor(() => expect(queryClient.getQueryData(avatarKeys.look(PLAYER_ID))).toBe(String(look)));
  });

  it("a save on its way keeps the draft: no option can be picked, and its receipt leaves the page on the saved look", async () => {
    const c = chain();
    let release!: () => void;
    c.writer.gate = new Promise<void>((resolve) => (release = resolve));
    open(c, "/avatar");
    await userEvent.click(await screen.findByRole("tab", { name: "Hair" }, { timeout: 5000 }));
    await userEvent.click(screen.getByRole("radio", { name: "Long, free" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute("aria-busy", "true"));
    // A tap on another option while the save is on its way changes nothing, and the save stays pending.
    const other = screen.getByRole("radio", { name: "Bald, free" });
    expect(other).toBeDisabled();
    await userEvent.click(other);
    expect(screen.getByRole("radio", { name: "Long, free" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute("aria-busy", "true");
    release();
    const look = encodeTraits({ ...KING_TRAITS, hairStyle: "long" });
    expect(await screen.findByRole("button", { name: "Saved" })).toBeDisabled();
    expect(c.views.avatarPlayer(PLAYER_ID).look).toBe(look);
    expect(c.writer.sent).toEqual([`set ${look}`]);
    // Once saved, the options can be picked again.
    await userEvent.click(screen.getByRole("radio", { name: "Bald, free" }));
    expect(screen.getByRole("radio", { name: "Bald, free" })).toHaveAttribute("aria-checked", "true");
  });

  it("a player with no avatar saved can save the king as he is", async () => {
    const c = chain();
    open(c, "/avatar");
    const save = await screen.findByRole("button", { name: "Save" }, { timeout: 5000 });
    await waitFor(() => expect(save).toBeEnabled());
    await userEvent.click(save);
    expect(await screen.findByRole("button", { name: "Saved" })).toBeDisabled();
    expect(c.views.avatarPlayer(PLAYER_ID).look).toBe(encodeTraits(KING_TRAITS));
    expect(c.writer.sent).toEqual([`set ${encodeTraits(KING_TRAITS)}`]);
  });

  it("Edit avatar in the profile sheet opens the creator on the saved avatar", async () => {
    const c = chain();
    c.views.avatarPlayer(PLAYER_ID).look = encodeTraits({ ...KING_TRAITS, hairStyle: "long" });
    const { router } = open(c, "/");
    await screen.findByRole("heading", { level: 1, name: "Home" }, { timeout: 5000 });
    await userEvent.click((await screen.findAllByRole("button", { name: /^Profile: / }, { timeout: 5000 }))[0]!);
    const sheet = await screen.findByRole("dialog");
    await userEvent.click(within(sheet).getByRole("button", { name: /Edit avatar/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/avatar"));
    await userEvent.click(await screen.findByRole("tab", { name: "Hair" }, { timeout: 5000 }));
    expect(screen.getByRole("radio", { name: "Long, free" })).toHaveAttribute("aria-checked", "true");
  });

  it("a returning guest connects from the creator, and stays on it", async () => {
    const c = chain();
    const { router, wallet } = open(c, "/avatar", { guest: true });
    // The creator's own Connect (the balances' strip has one too).
    const notice = (await screen.findByText("Connect to make your avatar", {}, { timeout: 5000 })).closest<HTMLElement>("[role=status]")!;
    await userEvent.click(within(notice).getByRole("button", { name: "Connect" }));
    expect(wallet.calls).toContain("connect");
    // Connected: the creator opens on the chain's catalogue, on the same page.
    expect(await screen.findByRole("tab", { name: "Skin tone" }, { timeout: 5000 })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/avatar");
  });

  it("a network without Avatar says so", async () => {
    const c = chain();
    c.views.avatarFail = new (await import("@paved/chain")).ViewError("not-configured", "Avatar address is not configured");
    open(c, "/avatar");
    expect(await screen.findByText("Avatars are coming", {}, { timeout: 5000 })).toBeInTheDocument();
  });
});
