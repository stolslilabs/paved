import { slow } from "../test-slow";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SKIN_REFUSAL_TEXT, SkinRefusedError, WriteError } from "@paved/chain";
import { App } from "../src/App";
import type { GameSigner } from "../src/data";
import { queryClient } from "../src/lib/query-client";
import { PLAYER_ID } from "../src/mocks/players";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { fakeSources } from "./data-fakes";
import { FOREST_PRICES, FakeSkinWriter } from "./skin-fakes";
import { preloadPages } from "./route-helpers";

// Themes, a theme's shop and My tiles (THEMES-RENDERS) on `@paved/chain`'s fakes: Forest's prices, the player's owned and
// active skins and the balance on `FakeGameViews`, the writes on `FakeSkinWriter`, through the app's own query client.

const FOREST = 1;

/** The player with `cobbles`, Forest priced (or not), plans 7 and 13 owned, 13 active; a skin writer, or none. */
function setup(options: { cobbles?: number; priced?: boolean; signer?: boolean } = {}) {
  const fakes = fakeSources();
  const { views } = fakes;
  views.priceSkins(FOREST, options.priced === false ? new Array<number>(19).fill(0) : FOREST_PRICES);
  const ledger = views.cobblePlayer(PLAYER_ID);
  ledger.account = { ...ledger.account, cobbles: options.cobbles ?? 240 };
  const skins = views.skinPlayer(PLAYER_ID);
  skins.owned.set(FOREST, (1 << 7) | (1 << 13));
  skins.active[12] = FOREST;
  const writer = new FakeSkinWriter(views, PLAYER_ID);
  fakes.sources.signer = options.signer === false ? null : (writer as unknown as GameSigner);
  return { ...fakes, writer, skins, ledger };
}

function open(s: ReturnType<typeof setup>, path: string) {
  const router = createTestRouter(path);
  render(<App router={router} sources={s.sources} />);
  return router;
}

const forestActive = (s: ReturnType<typeof setup>) => s.skins.active.flatMap((t, i) => (t === FOREST ? [i + 1] : []));

// Settings too: the theme's pages are sheets drawn over it (BACK-RULE #783), so the first test loaded it cold. And the hosts:
// Settings is the home's panel (#762), each sheet in its own chunk.
preloadPages("settings", "theme", "theme-shop", "my-tiles", "welcome", "home-panel", "page-sheets");

beforeEach(() => {
  queryClient.clear();
  localStorage.clear();
  resetWelcomedForTests();
  markWelcomed();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  resetWelcomedForTests();
});

describe("/settings/theme: the themes", () => {
  const card = (name: string) => screen.findByRole("article", { name }, { timeout: slow(5000) });

  it("counts the tiles owned per theme, and none is in use over a mix", async () => {
    open(setup(), "/settings/theme");
    expect(await screen.findByRole("heading", { level: 1, name: "Themes" }, { timeout: slow(10_000) })).toBeInTheDocument();
    await waitFor(async () => expect(await card("Forest")).toHaveTextContent("2 / 19 tiles"));
    expect(within(await card("Forest")).getByRole("button", { name: "Use Forest" })).toBeEnabled();
    expect(within(await card("Default")).getByRole("button", { name: "Use Default" })).toBeEnabled();
  }, slow(30_000));

  it("Use Forest makes every owned Forest tile active in one set_skins (Forest whole from Default whole: nothing asked)", async () => {
    const s = setup();
    s.skins.active[12] = 0;
    open(s, "/settings/theme");
    await waitFor(async () => expect(within(await card("Default")).getByRole("button", { name: "Default in use" })).toBeDisabled());
    await userEvent.click(within(await card("Forest")).getByRole("button", { name: "Use Forest" }));
    await waitFor(async () => expect(within(await card("Forest")).getByRole("button", { name: "Forest in use" })).toBeDisabled());
    expect(s.writer.sent).toEqual([{ save: [{ plan: 7, theme: FOREST }, { plan: 13, theme: FOREST }] }]);
    expect(forestActive(s)).toEqual([7, 13]);
  });

  it("asks first over a tile-by-tile mix, then sends only the plans that change", async () => {
    const s = setup();
    open(s, "/settings/theme");
    await waitFor(async () => expect(await card("Forest")).toHaveTextContent("2 / 19 tiles"));
    await userEvent.click(within(await card("Forest")).getByRole("button", { name: "Use Forest" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Use Forest" }));
    await waitFor(() => expect(s.writer.sent).toEqual([{ save: [{ plan: 7, theme: FOREST }] }]));
    expect(forestActive(s)).toEqual([7, 13]);
  });

  it("shows a refused Use, and Dismiss clears it", async () => {
    const s = setup();
    s.skins.active[12] = 0;
    s.writer.failNext = new SkinRefusedError("not-owned", "0x9");
    open(s, "/settings/theme");
    await waitFor(async () => expect(within(await card("Forest")).getByRole("button", { name: "Use Forest" })).toBeEnabled());
    await userEvent.click(within(await card("Forest")).getByRole("button", { name: "Use Forest" }));
    expect(await screen.findByText(SKIN_REFUSAL_TEXT["not-owned"], undefined, { timeout: slow(3000) })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText(SKIN_REFUSAL_TEXT["not-owned"])).not.toBeInTheDocument();
  });

  it("asks a guest to connect, and Connect goes to the welcome", async () => {
    const router = open(setup({ signer: false }), "/settings/theme");
    // Beside the page's own call: the rail's and the pill's Connect come first in the DOM.
    const connect = (await screen.findAllByRole("button", { name: "Connect" }, { timeout: slow(5000) })).at(-1)!;
    resetWelcomedForTests();
    localStorage.clear();
    await userEvent.click(connect);
    await waitFor(() => expect(router.state.location.pathname).toBe("/welcome"));
  });

  it("shows a failed read with Retry, which reads again", async () => {
    const s = setup();
    s.views.skinsFail = new Error("rpc down");
    open(s, "/settings/theme");
    expect(await screen.findByText("The skins could not be read", undefined, { timeout: slow(5000) })).toBeInTheDocument();
    s.views.skinsFail = null;
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(async () => expect(await card("Forest")).toHaveTextContent("2 / 19 tiles"));
  });

  it("opens Forest's shop", async () => {
    const router = open(setup(), "/settings/theme");
    await userEvent.click(within(await card("Forest")).getByRole("button", { name: "Forest tiles" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/settings/theme/forest"));
  });

  it("opens My tiles", async () => {
    const router = open(setup(), "/settings/theme");
    await waitFor(async () => expect(await card("Forest")).toHaveTextContent("2 / 19 tiles"));
    await userEvent.click(screen.getByRole("button", { name: /^My tiles/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/settings/tiles"));
  });
});

describe("/settings/theme/forest: the shop", () => {
  const cell = (plan: number) => screen.findByRole("listitem", { name: `Tile ${plan}` }, { timeout: slow(5000) });
  const buyButton = async (plan: number) => within(await cell(plan)).getByRole("button", { name: `Buy Tile ${plan} for ${FOREST_PRICES[plan - 1]} Cobbles` });

  it("reserves no skin to a tier any more: Buy reads no tier (#739)", async () => {
    const s = setup();
    s.views.skinTierTable.set(`${FOREST}:10`, 1);
    open(s, "/settings/theme/forest");
    expect(await buyButton(10)).toBeEnabled();
    expect(within(await cell(10)).queryByLabelText(/Reserved to/)).toBeNull();
    expect(s.views.calls.filter((c) => c.startsWith("skin_tiers") || c.startsWith("copies"))).toEqual([]);
  });

  it("Get Cobbles opens the packs in place, over the theme's sheet (BACK-RULE #783); their close leaves the theme open", async () => {
    const router = open(setup(), "/settings/theme/forest");
    const theme = await screen.findByRole("dialog", { name: "Theme" }, { timeout: slow(5000) });
    await userEvent.click((await within(theme).findAllByRole("button", { name: /Get Cobbles/ }, { timeout: slow(5000) }))[0]!);
    await screen.findByRole("dialog", { name: "Cobbles" }, { timeout: slow(5000) });
    expect(router.state.location.pathname).toBe("/settings/theme/forest");
    // The packs' header may still swap its nodes as they load: the close is pressed again until the sheet goes.
    await waitFor(
      async () => {
        const packs = screen.queryByRole("dialog", { name: "Cobbles" });
        if (packs) await userEvent.click(within(packs).getByRole("button", { name: "Back" }));
        expect(screen.queryByRole("dialog", { name: "Cobbles" })).toBeNull();
      },
      { timeout: slow(5000) },
    );
    expect(router.state.location.pathname).toBe("/settings/theme/forest");
    expect(screen.getByRole("dialog", { name: "Theme" })).toBeInTheDocument();
  });

  it("shows each tile's price, owned and active state", async () => {
    open(setup(), "/settings/theme/forest");
    expect(await screen.findByRole("heading", { level: 1, name: "Forest" }, { timeout: slow(5000) })).toBeInTheDocument();
    expect((await cell(13)).dataset.state).toBe("active");
    expect((await cell(7)).dataset.state).toBe("owned");
    expect((await cell(10)).dataset.state).toBe("none");
    expect(await buyButton(10)).toBeEnabled();
  });

  it("disables Buy with the reason when the Cobbles are short", async () => {
    open(setup({ cobbles: 60 }), "/settings/theme/forest");
    const plan1 = await buyButton(1);
    expect(plan1).toBeDisabled();
    expect(plan1).toHaveAccessibleDescription("Need 40 more");
    expect(await buyButton(10)).toBeEnabled();
  });

  it("buys a tile with Cobbles: the balance follows the receipt, the tile turns owned, not active", async () => {
    const s = setup();
    open(s, "/settings/theme/forest");
    await userEvent.click(await buyButton(10));
    expect((await screen.findAllByRole("button", { name: "185 Cobbles: Buy packs" }, { timeout: slow(10_000) })).length).toBeGreaterThan(0);
    await waitFor(async () => expect((await cell(10)).dataset.state).toBe("owned"));
    expect(s.writer.sent).toEqual([{ buy: { theme: FOREST, plan: 10 } }]);
  });

  it("a tile whose price changed since the card was read: nothing is sent, the refusal is said, the card reads the new price", async () => {
    const s = setup();
    open(s, "/settings/theme/forest");
    const buy = await buyButton(10);
    s.views.skinPriceTable.set(`${FOREST}:10`, 70);
    await userEvent.click(buy);
    expect(await screen.findByText("This skin's price changed: check the new price and buy again. Nothing was sent.", undefined, { timeout: slow(3000) })).toBeInTheDocument();
    expect(s.writer.sent).toEqual([]);
    await waitFor(async () => expect(await cell(10)).toHaveTextContent("70"));
  });

  it("keeps the owned tiles of a theme withdrawn from sale; the others are not for sale", async () => {
    open(setup({ priced: false }), "/settings/theme/forest");
    expect((await cell(13)).dataset.state).toBe("active");
    expect(within(await cell(10)).getByText("Not for sale")).toBeInTheDocument();
    expect(within(await cell(10)).queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows Snow as coming soon, without reading it; a path that names no theme is not found", async () => {
    const s = setup();
    const router = open(s, "/settings/theme/snow");
    expect(await screen.findByText("Snow tiles: coming soon", undefined, { timeout: slow(5000) })).toBeInTheDocument();
    expect(s.views.calls.filter((c) => c.startsWith("skin_price 2 ") || (c.startsWith("skins ") && c.endsWith(" 2")))).toEqual([]);
    await router.navigate("/settings/theme/default");
    expect(await screen.findByTestId("not-found", undefined, { timeout: slow(5000) })).toBeInTheDocument();
  });
});

describe("/settings/tiles: My tiles", () => {
  const row = (plan: number) => screen.findByRole("listitem", { name: `Tile ${plan}` }, { timeout: slow(5000) });
  const pick = async (plan: number, name: string) => userEvent.click(within(await row(plan)).getByRole("radio", { name: `Tile ${plan}: ${name}` }));

  it("changes one tile only: Save sends the plans that changed, in one set_skins", async () => {
    const s = setup();
    s.skins.owned.set(FOREST, (1 << 7) | (1 << 8) | (1 << 13));
    open(s, "/settings/tiles");
    await pick(7, "Forest");
    await pick(8, "Forest"); // on, then back to the saved value: not sent
    await pick(8, "Default");
    expect(await screen.findByRole("region", { name: "Unsaved changes" })).toHaveTextContent("1 change to save");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/Tiles saved/, undefined, { timeout: slow(3000) })).toBeInTheDocument();
    expect(s.writer.sent).toEqual([{ save: [{ plan: 7, theme: FOREST }] }]);
    expect(forestActive(s)).toEqual([7, 13]);
  });

  it("shows the save on its way, then a refusal with its reason, the batch kept to try again", async () => {
    const s = setup();
    let release!: () => void;
    s.writer.gate = new Promise((done) => (release = done));
    s.writer.failNext = new SkinRefusedError("not-owned", "0x9");
    open(s, "/settings/tiles");
    await pick(7, "Forest");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("button", { name: "Saving…" })).toBeDisabled();
    release();
    expect(await screen.findByText(SKIN_REFUSAL_TEXT["not-owned"], undefined, { timeout: slow(3000) })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Unsaved changes" })).toHaveTextContent("1 change to save");
    s.writer.gate = null;
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/Tiles saved/, undefined, { timeout: slow(3000) })).toBeInTheDocument();
  });

  it("a save whose receipt cannot be read: once the active set is read again, the changes it already holds are dropped", async () => {
    const s = setup();
    open(s, "/settings/tiles");
    await pick(7, "Forest");
    await pick(13, "Default");
    expect(await screen.findByRole("region", { name: "Unsaved changes" })).toHaveTextContent("2 changes to save");
    const setSkins = s.writer.setSkins.bind(s.writer);
    s.writer.setSkins = async (changes) => {
      await setSkins(changes);
      throw new WriteError("Transaction sent (0xfd1), receipt unreadable");
    };
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Unsaved changes" })).toBeNull(), { timeout: slow(3000) });
    expect(within(await row(7)).getByRole("radio", { name: "Tile 7: Forest" })).toHaveAttribute("aria-checked", "true");
  });

  it("Discard drops the batch", async () => {
    const s = setup();
    open(s, "/settings/tiles");
    await pick(7, "Forest");
    await userEvent.click(await screen.findByRole("button", { name: "Discard" }));
    expect(screen.queryByRole("region", { name: "Unsaved changes" })).toBeNull();
    expect(s.writer.sent).toEqual([]);
  });
});
