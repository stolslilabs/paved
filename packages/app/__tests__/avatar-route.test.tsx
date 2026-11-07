import { slow } from "../test-slow";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

// The avatar creator's route (#626 PR 2; AVATAR-PAGE: the HUD's drawer over the home) on `@paved/chain`'s fakes: the catalogue of the fresh deployment on `FakeGameViews`,
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

preloadPages("home", "avatar");

beforeEach(async () => {
  await import("../src/routes/pages/avatar");
  queryClient.clear();
  localStorage.clear();
  resetWelcomedForTests();
  markWelcomed();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
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
    await userEvent.click(screen.getByRole("radio", { name: "Helmet, owned" }));
    // A priced item tried on: Save waits for it, Buy at its price.
    await userEvent.click(screen.getByRole("radio", { name: "Wizard hat, 40 Cobbles" }));
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Buy" }));
    expect(await screen.findByRole("radio", { name: "Wizard hat, owned" })).toBeInTheDocument();
    expect(c.views.cobblePlayer(PLAYER_ID).account.cobbles).toBe(10);
    await userEvent.click(screen.getByRole("tab", { name: "Skin tone" }));
    await userEvent.click(screen.getByRole("radio", { name: "Brown, owned" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    const look = encodeTraits({ ...KING_TRAITS, headwear: "wizard", skin: "brown" });
    // Saved: nothing changed since, Save is off.
    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeDisabled());
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
    await userEvent.click(screen.getByRole("radio", { name: "Long, owned" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute("aria-busy", "true"));
    // A tap on another option while the save is on its way changes nothing, and the save stays pending.
    const other = screen.getByRole("radio", { name: "Bald, owned" });
    expect(other).toBeDisabled();
    await userEvent.click(other);
    expect(screen.getByRole("radio", { name: "Long, owned" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute("aria-busy", "true");
    release();
    const look = encodeTraits({ ...KING_TRAITS, hairStyle: "long" });
    // Saved: nothing changed since, Save is off.
    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeDisabled());
    expect(c.views.avatarPlayer(PLAYER_ID).look).toBe(look);
    expect(c.writer.sent).toEqual([`set ${look}`]);
    // Once saved, the options can be picked again.
    await userEvent.click(screen.getByRole("radio", { name: "Bald, owned" }));
    expect(screen.getByRole("radio", { name: "Bald, owned" })).toHaveAttribute("aria-checked", "true");
  });

  it("a player with no avatar saved: Save waits for a change (the owner's ask of 2026-11-07), then writes the look shown", async () => {
    const c = chain();
    open(c, "/avatar");
    await userEvent.click(await screen.findByRole("tab", { name: "Skin tone" }, { timeout: slow(5000) }));
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    await userEvent.click(screen.getByRole("radio", { name: "Brown, owned" }));
    const save = screen.getByRole("button", { name: "Save" });
    await waitFor(() => expect(save).toBeEnabled());
    await userEvent.click(save);
    await waitFor(() => expect(c.views.avatarPlayer(PLAYER_ID).look).toBe(encodeTraits({ ...KING_TRAITS, skin: "brown" })));
    expect(c.writer.sent).toEqual([`set ${encodeTraits({ ...KING_TRAITS, skin: "brown" })}`]);
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
    expect(screen.getByRole("radio", { name: "Long, owned" })).toHaveAttribute("aria-checked", "true");
  });

  it("the editor is the HUD's drawer over the village (AVATAR-PAGE): Back returns to the Profile, the red cross to the village", async () => {
    const c = chain();
    const { router } = open(c, "/");
    await screen.findByRole("heading", { level: 1, name: "Home" }, { timeout: slow(5000) });
    const profile = async () => screen.findByRole("dialog", { name: "Profile" }, { timeout: slow(5000) });
    await userEvent.click((await screen.findAllByRole("button", { name: /^Profile: / }, { timeout: slow(5000) }))[0]!);
    await userEvent.click(within(await profile()).getByRole("button", { name: /Edit avatar/ }));
    const drawer = await screen.findByRole("dialog", { name: "Avatar" }, { timeout: slow(5000) });
    expect(router.state.location.pathname).toBe("/avatar");
    expect(drawer).toHaveAttribute("data-hud-drawer", "avatar");
    // The village stays mounted under it; the Profile closed (never a sheet over a sheet).
    expect(screen.getByRole("navigation", { name: "Village", hidden: true })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Profile" })).toBeNull(), { timeout: slow(5000) });
    // Back: the Profile again, over the village.
    await userEvent.click(within(drawer).getByRole("button", { name: "Back" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    await userEvent.click(within(await profile()).getByRole("button", { name: /Edit avatar/ }));
    // The red cross: the village, no Profile.
    await userEvent.click(within(await screen.findByRole("dialog", { name: "Avatar" }, { timeout: slow(5000) })).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), { timeout: slow(5000) });
  });

  /** The Feathered cap (headwear 5) on sale until `until` (seconds), the only seasonal item (the Night's season left out). */
  function seasonal(c: ReturnType<typeof chain>, until: number) {
    const headwear = AVATAR_ITEMS[7]![5]!;
    const night = AVATAR_ITEMS[AVATAR_ITEMS.length - 1]!.find((item) => item.until > 0);
    c.views.listAvatarItem({ ...headwear, until });
    if (night) c.views.listAvatarItem({ ...night, until: 0 });
  }
  const seconds = () => Math.floor(Date.now() / 1000);

  it("a seasonal offer past its end while the drawer was closed: reopened, it is off sale (issue #1051)", async () => {
    const c = chain();
    seasonal(c, seconds() + 3600);
    const { router } = open(c, "/");
    await screen.findByRole("heading", { level: 1, name: "Home" }, { timeout: slow(5000) });
    const editor = async () => {
      await userEvent.click((await screen.findAllByRole("button", { name: /^Profile: / }, { timeout: slow(5000) }))[0]!);
      await userEvent.click(within(await screen.findByRole("dialog", { name: "Profile" }, { timeout: slow(5000) })).getByRole("button", { name: /Edit avatar/ }));
      const drawer = await screen.findByRole("dialog", { name: "Avatar" }, { timeout: slow(5000) });
      await userEvent.click(await within(drawer).findByRole("tab", { name: "Headwear" }, { timeout: slow(5000) }));
      return drawer;
    };
    expect(within(await editor()).getByRole("radio", { name: /^Feathered cap, \d+ Cobbles$/ })).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole("dialog", { name: "Avatar" })).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), { timeout: slow(5000) });
    // Two hours later (the season ended an hour ago), the drawer opened again from the Profile.
    const real = Date.now.bind(Date);
    vi.spyOn(Date, "now").mockImplementation(() => real() + 7200_000);
    const drawer = await editor();
    expect(within(drawer).getByRole("radio", { name: "Feathered cap, not for sale" })).toBeInTheDocument();
    expect(within(drawer).queryByRole("radio", { name: /^Feathered cap, \d+ Cobbles$/ })).toBeNull();
  });

  it("a seasonal offer whose end passes while the drawer is open goes off sale without a reload (issue #1051)", async () => {
    // The clock and the timers faked but running (the page's loads as they are): the end is reached by advancing the clock, not by
    // waiting for it, so a loaded machine cannot pass it before the offer shows.
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["setTimeout", "clearTimeout", "Date"] });
    const c = chain();
    seasonal(c, seconds() + 3600);
    open(c, "/avatar?part=headwear");
    expect(await screen.findByRole("radio", { name: /^Feathered cap, \d+ Cobbles$/ }, { timeout: slow(5000) })).toBeInTheDocument();
    // The hour passes with the drawer open: the timer to the end reads the offers again.
    vi.advanceTimersByTime(3600_000);
    expect(await screen.findByRole("radio", { name: "Feathered cap, not for sale" }, { timeout: slow(5000) })).toBeInTheDocument();
  });

  it("a seasonal offer whose end passes before the catalogue arrives is off sale as soon as it shows (issue #1051)", async () => {
    const c = chain();
    seasonal(c, seconds() + 3600);
    // The catalogue's items held back past the drawer's opening.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const items = c.views.avatarItems.bind(c.views);
    c.views.avatarItems = async (part: number) => {
      await gate;
      return items(part);
    };
    open(c, "/avatar?part=headwear");
    await screen.findByRole("dialog", { name: "Avatar" }, { timeout: slow(5000) });
    // Two hours after the opening (the season ended an hour ago), the catalogue comes in.
    const real = Date.now.bind(Date);
    vi.spyOn(Date, "now").mockImplementation(() => real() + 7200_000);
    release();
    expect(await screen.findByRole("radio", { name: "Feathered cap, not for sale" }, { timeout: slow(5000) })).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /^Feathered cap, \d+ Cobbles$/ })).toBeNull();
  });

  it("the category is the URL's: a link opens it, a tab replaces it", async () => {
    const c = chain();
    const { router } = open(c, "/avatar?part=beard");
    expect(await screen.findByRole("radiogroup", { name: "Beard" }, { timeout: slow(5000) })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Eyes" }));
    await waitFor(() => expect(router.state.location.search).toBe("?part=eyes"));
    expect(router.state.historyAction).toBe("REPLACE");
  });

  it("no Connect (every player has an account): while the account is restored, the editor shows its loading", async () => {
    const c = chain();
    const { router } = open(c, "/avatar", { guest: true });
    const drawer = await screen.findByRole("dialog", { name: "Avatar" }, { timeout: slow(5000) });
    // The editor's own body (the header's balances are the shell's, not this page's).
    const body = drawer.querySelector<HTMLElement>("[data-hud-drawer-body]")!;
    expect(within(body).getByRole("status", { name: "Loading" })).toBeInTheDocument();
    expect(within(body).queryByRole("button", { name: "Connect" })).toBeNull();
    expect(router.state.location.pathname).toBe("/avatar");
  });

  it("a network without Avatar says so", async () => {
    const c = chain();
    c.views.avatarFail = new (await import("@paved/chain")).ViewError("not-configured", "Avatar address is not configured");
    open(c, "/avatar");
    expect(await screen.findByText("Avatars are coming", {}, { timeout: 5000 })).toBeInTheDocument();
  });
});
