import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SKIN_REFUSAL_TEXT, SkinRefusedError, WriteError } from "@paved/chain";
import { App } from "../src/App";
import { planCode } from "../src/components/elements/tile-chip";
import type { GameSigner } from "../src/data";
import { THEME_KEY } from "../src/data/skins";
import { queryClient } from "../src/lib/query-client";
import { PLAYER_ID } from "../src/mocks/players";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { fakeSources } from "./data-fakes";
import { FOREST_PRICES, FakeSkinWriter } from "./skin-fakes";
import { preloadPages } from "./route-helpers";

// `/settings/theme` (P11b) on `@paved/chain`'s fakes: Forest's prices, the player's owned and active skins and the balance
// on `FakeGameViews`, the writes on `FakeSkinWriter`, through the app's own query client.

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

function open(s: ReturnType<typeof setup>) {
  const router = createTestRouter("/settings/theme");
  render(<App router={router} sources={s.sources} />);
  return router;
}

const name = (plan: number) => `Tile ${planCode(plan).toLowerCase()}`;
const cell = (plan: number) => screen.findByRole("listitem", { name: name(plan) }, { timeout: 5000 });
const toggle = async (plan: number) => userEvent.click(within(await cell(plan)).getByRole("switch", { name: `${name(plan)} skin active` }));
const buyButton = async (plan: number) => within(await cell(plan)).getByRole("button", { name: `Buy ${name(plan)} for ${FOREST_PRICES[plan - 1]} Cobbles` });
const activeCount = () => screen.getByText((_, el) => el?.tagName === "SPAN" && /^\d+ of 19 active$/.test(el.textContent ?? "") && el.children.length > 0);

preloadPages("theme", "welcome");

beforeEach(() => {
  queryClient.clear();
  localStorage.clear();
  resetWelcomedForTests();
  markWelcomed();
});
afterEach(() => {
  vi.restoreAllMocks();
  resetWelcomedForTests();
});

describe("/settings/theme (P11b)", () => {
  it("shows each Forest skin's price, owned and active state, the balance and N of 19 active", async () => {
    open(setup());
    expect(await screen.findByRole("heading", { level: 1, name: "Theme" }, { timeout: 5000 })).toBeInTheDocument();
    expect(await screen.findByRole("img", { name: "240 Cobbles" }, { timeout: 3000 })).toBeInTheDocument();
    expect((await cell(13)).dataset.state).toBe("active");
    expect((await cell(7)).dataset.state).toBe("owned");
    expect((await cell(10)).dataset.state).toBe("none");
    expect(await buyButton(10)).toBeEnabled();
    expect(activeCount().textContent).toBe("1 of 19 active");
  });

  it("asks a guest to connect, and Connect goes to the welcome", async () => {
    const router = open(setup({ signer: false }));
    const connect = await screen.findByRole("button", { name: "Connect" }, { timeout: 5000 });
    // A first visit, so that the welcome stays open rather than sending a welcomed player home.
    resetWelcomedForTests();
    localStorage.clear();
    await userEvent.click(connect);
    await waitFor(() => expect(router.state.location.pathname).toBe("/welcome"));
  });

  it("shows the loading state while the skins are read", async () => {
    const s = setup();
    s.views.activeSkins = () => new Promise(() => undefined);
    open(s);
    expect(await screen.findByRole("status", { name: "Loading the skins" }, { timeout: 5000 })).toBeInTheDocument();
  });

  it("shows a failed read with Retry, which reads again", async () => {
    const s = setup();
    s.views.skinsFail = new Error("rpc down");
    open(s);
    expect(await screen.findByText("The skins could not be read", undefined, { timeout: 5000 })).toBeInTheDocument();
    s.views.skinsFail = null;
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect((await cell(13)).dataset.state).toBe("active");
  });

  it("disables Buy with the reason when the Cobbles are short", async () => {
    open(setup({ cobbles: 60 }));
    const plan1 = await buyButton(1);
    expect(plan1).toBeDisabled();
    expect(plan1).toHaveAccessibleDescription("Need 40 more");
    expect(await buyButton(10)).toBeEnabled();
  });

  it("buys a skin: the balance follows the receipt, the skin turns owned, not active", async () => {
    const s = setup();
    open(s);
    await userEvent.click(await buyButton(10));
    expect(await screen.findByRole("img", { name: "185 Cobbles" }, { timeout: 3000 })).toBeInTheDocument();
    await waitFor(async () => expect((await cell(10)).dataset.state).toBe("owned"));
    expect(s.writer.sent).toEqual([{ buy: { theme: FOREST, plan: 10 } }]);
    expect(activeCount().textContent).toBe("1 of 19 active");
  });

  it("shows a purchase on its way, the other Buy buttons waiting", async () => {
    const s = setup();
    let release!: () => void;
    s.writer.gate = new Promise((done) => (release = done));
    open(s);
    await userEvent.click(await buyButton(10));
    await waitFor(async () => expect(await buyButton(1)).toBeDisabled());
    release();
    await waitFor(async () => expect((await cell(10)).dataset.state).toBe("owned"));
  });

  it("activates and deactivates in a batch, and Save sends only the plans that changed, in one set_skins", async () => {
    const s = setup();
    s.skins.owned.set(FOREST, (1 << 7) | (1 << 8) | (1 << 13));
    open(s);
    await toggle(7); // on
    await toggle(13); // off
    await toggle(8); // on, then off again: back to the saved value, not sent
    await toggle(8);
    expect(await screen.findByRole("region", { name: "Unsaved changes" })).toHaveTextContent("2 changes to save");
    expect(activeCount().textContent).toBe("1 of 19 active");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Skins saved", undefined, { timeout: 3000 })).toBeInTheDocument();
    expect(s.writer.sent).toEqual([{ save: [{ plan: 7, theme: FOREST }, { plan: 13, theme: 0 }] }]);
    expect((await cell(7)).dataset.state).toBe("active");
    expect((await cell(13)).dataset.state).toBe("owned");
    expect(s.skins.active.flatMap((t, i) => (t === FOREST ? [i + 1] : []))).toEqual([7]);
  });

  it("shows the save on its way, then a refusal with its reason, the batch kept to try again", async () => {
    const s = setup();
    let release!: () => void;
    s.writer.gate = new Promise((done) => (release = done));
    s.writer.failNext = new SkinRefusedError("not-owned", "0x9");
    open(s);
    await toggle(7);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("button", { name: "Saving…" })).toBeDisabled();
    release();
    expect(await screen.findByText(SKIN_REFUSAL_TEXT["not-owned"], undefined, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Unsaved changes" })).toHaveTextContent("1 change to save");
    s.writer.gate = null;
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Skins saved", undefined, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.queryByText(SKIN_REFUSAL_TEXT["not-owned"])).not.toBeInTheDocument();
  });

  it("a save whose receipt cannot be read: once the active set is read again, the changes it already holds are dropped", async () => {
    const s = setup();
    s.skins.owned.set(FOREST, (1 << 7) | (1 << 9) | (1 << 13));
    open(s);
    await toggle(7);
    await toggle(9);
    expect(await screen.findByRole("region", { name: "Unsaved changes" })).toHaveTextContent("2 changes to save");
    // The batch lands, but its receipt is unreadable: the writer says so.
    const setSkins = s.writer.setSkins.bind(s.writer);
    s.writer.setSkins = async (changes) => {
      await setSkins(changes);
      throw new WriteError("Transaction sent (0xfd1), receipt unreadable");
    };
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    // The reconciling read shows both plans active: nothing is left to save.
    await waitFor(() => expect(screen.queryByRole("region", { name: "Unsaved changes" })).toBeNull(), { timeout: 3000 });
    expect((await cell(7)).dataset.state).toBe("active");
    expect((await cell(9)).dataset.state).toBe("active");
  });

  it("a save that did not land keeps its changes: the active set read again does not hold them", async () => {
    const s = setup();
    open(s);
    await toggle(7);
    s.writer.failNext = new WriteError("Transaction sent (0xfd1), receipt unreadable");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText(/receipt unreadable/, undefined, { timeout: 3000 });
    expect(screen.getByRole("region", { name: "Unsaved changes" })).toHaveTextContent("1 change to save");
  });

  it("shows a refused purchase", async () => {
    const s = setup();
    s.writer.failNext = new SkinRefusedError("not-enough-cobbles", "0x9");
    open(s);
    await userEvent.click(await buyButton(10));
    expect(await screen.findByText(SKIN_REFUSAL_TEXT["not-enough-cobbles"], undefined, { timeout: 3000 })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText(SKIN_REFUSAL_TEXT["not-enough-cobbles"])).not.toBeInTheDocument();
  });

  it("keeps the owned skins of a theme withdrawn from sale, switchable; the others are not for sale", async () => {
    open(setup({ priced: false }));
    expect((await cell(13)).dataset.state).toBe("active");
    expect(within(await cell(7)).getByRole("switch")).toBeEnabled();
    expect(within(await cell(10)).getByText("Not for sale")).toBeInTheDocument();
    expect(within(await cell(10)).queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows Snow, Desert and Volcano as coming soon, without reading them", async () => {
    const s = setup();
    open(s);
    await cell(13);
    await userEvent.click(screen.getByRole("tab", { name: "Snow" }));
    expect(await screen.findByText("Snow skins: coming soon")).toBeInTheDocument();
    expect(s.views.calls.filter((c) => c.startsWith("skin_price 2 ") || (c.startsWith("skins ") && c.endsWith(" 2")))).toEqual([]);
  });

  it("keeps the board's look chosen on this device", async () => {
    open(setup());
    await userEvent.click(await screen.findByRole("radio", { name: "Forest" }, { timeout: 5000 }));
    expect(screen.getByRole("radio", { name: "Forest" })).toHaveAttribute("aria-checked", "true");
    expect(localStorage.getItem(THEME_KEY)).toBe("forest");
  });
});
