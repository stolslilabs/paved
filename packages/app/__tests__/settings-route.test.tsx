import { slow } from "../test-slow";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NO_SKINS, type RendererSettingsInput, type TileSkins } from "@paved/renderer";
import type { GameCanvasProps } from "@paved/renderer/react";
import { getPlanKey, Plan } from "@paved/game-core";
import { App } from "../src/App";
import type { GameSigner } from "../src/data";
import { SETTINGS_KEY, deviceSettings, withVolume } from "../src/data/settings";
import { THEME_KEY, deviceTheme } from "../src/data/skins";
import { queryClient } from "../src/lib/query-client";
import { GAME_PLAYING } from "../src/mocks/games";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { fakeSources } from "./data-fakes";
import { preloadPages } from "./route-helpers";
import { fakeWallet } from "./wallet-fakes";

// `/settings` (P11a) on the app's own providers: the device settings and the viewer's skins switch kept on the device,
// the account through the wallet, the links; and the board reading the same stores.

// The board's 3D canvas, recorded instead of drawn (jsdom has no WebGL); the renderer's own canvas, for BoardViewport.
const drawn = vi.hoisted(() => ({ board: [] as Array<{ skins?: unknown; settings?: unknown; tilePreview?: boolean; placementHighlight?: boolean }>, canvas: null as unknown }));
vi.mock("../src/components/containers/board-viewport", async (actual) => ({
  ...(await actual<object>()),
  BoardViewport: (props: { skins?: unknown }) => {
    drawn.board.push(props);
    return null;
  },
}));
vi.mock("../src/components/containers/tile-view", async (actual) => ({ ...(await actual<object>()), hasWebGL: () => true, TileView: () => null }));
vi.mock("@paved/renderer/react", () => ({
  GameCanvas: (props: GameCanvasProps) => {
    drawn.canvas = props;
    return null;
  },
}));

// The pages these tests open, imported before the first test: a cold page import ran inside the first `findBy` that reached it
// (the defaults 2.9 to 5.1 s, the theme page 2.9 to 5.4 s, under load), against that lookup's 5 s.
// The hosts too: Settings is the home's panel (#762), the theme page a sheet over it (BACK-RULE #783), each a chunk of its own.
preloadPages("settings", "theme", "referral", "home", "board", "home-panel", "page-sheets");

const lastBoard = () => drawn.board.at(-1);
const key = (plan: number) => getPlanKey(Plan.from(plan).value);
const active = (themes: Record<number, number>) => Array.from({ length: 19 }, (_, i) => themes[i + 1] ?? 0);
const signer = (address: string) => ({ address, build: vi.fn(), discard: vi.fn(), surrender: vi.fn() }) as unknown as GameSigner;

beforeEach(() => {
  drawn.board.length = 0;
  drawn.canvas = null;
  queryClient.clear();
  localStorage.clear();
  deviceSettings.reset();
  deviceTheme.reset();
  resetWelcomedForTests();
  markWelcomed();
});
afterEach(() => resetWelcomedForTests());

const stored = () => JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}");
const open = (path = "/settings", wallet = fakeWallet({ restored: true })) => {
  const router = createTestRouter(path);
  const fakes = fakeSources({ signer: null });
  render(<App router={router} sources={fakes.sources} connector={wallet.load} />);
  return { router, wallet, ...fakes };
};

describe("/settings", () => {
  it("shows the defaults: Auto with what it resolves to, the day and night cycle on, music at 40 %, sound effects at 70 %, preview and highlight on, skins shown", async () => {
    open();
    expect(await screen.findByRole("radio", { name: /^Auto \((Low|Medium)\)$/ }, { timeout: slow(5000) })).toHaveAttribute("data-state", "on");
    expect(screen.getByRole("switch", { name: /Day\/night cycle/ })).toBeChecked();
    expect(screen.getByRole("slider", { name: "Music volume" })).toHaveAttribute("aria-valuenow", "40");
    expect(screen.getByRole("slider", { name: "Sound effects volume" })).toHaveAttribute("aria-valuenow", "70");
    expect(screen.getByRole("button", { name: "Mute music" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("switch", { name: /Tile preview/ })).toBeChecked();
    expect(screen.getByRole("switch", { name: /Placement highlight/ })).toBeChecked();
    expect(screen.getByRole("switch", { name: /Show other players' skins/ })).toBeChecked();
    expect(screen.queryByText(/High is heavier/)).not.toBeInTheDocument();
  });

  it("changes each setting and keeps it on the device", async () => {
    open();
    await userEvent.click(await screen.findByRole("radio", { name: "Low" }));
    await userEvent.click(screen.getByRole("switch", { name: /Day\/night cycle/ }));
    await userEvent.click(screen.getByRole("switch", { name: /Ambient effects/ }));
    await userEvent.click(screen.getByRole("button", { name: "Mute sound effects" }));
    await userEvent.click(screen.getByRole("switch", { name: /Tile preview/ }));
    await userEvent.click(screen.getByRole("switch", { name: /Placement highlight/ }));
    expect(stored()).toEqual({ quality: "low", dayNight: false, ambient: false, musicVolume: 0.4, musicBefore: 0.4, sfxVolume: 0, sfxBefore: 0.7, tilePreview: false, placementHighlight: false, squareGrid: true });
    expect(screen.getByRole("radio", { name: "Low" })).toHaveAttribute("data-state", "on");
  });

  it("warns that High is heavier, in the row, once High is picked", async () => {
    open();
    await userEvent.click(await screen.findByRole("radio", { name: "High" }));
    expect(screen.getByText(/High is heavier/)).toBeInTheDocument();
    expect(stored().quality).toBe("high");
  });

  it("shows a saved setting after a reload: the stores read the device again", async () => {
    // The first shape: the Sound switch off is a muted sound effects slider.
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ quality: "medium", sound: false }));
    open();
    expect(await screen.findByRole("radio", { name: "Medium" })).toHaveAttribute("data-state", "on");
    expect(screen.getByRole("button", { name: "Mute sound effects" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("slider", { name: "Sound effects volume" })).toHaveAttribute("aria-valuenow", "0");
  });

  it("holds the choices for the visit when storage is off", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    open();
    await userEvent.click(await screen.findByRole("button", { name: "Mute sound effects" }));
    expect(screen.getByRole("button", { name: "Mute sound effects" })).toHaveAttribute("aria-pressed", "true");
    vi.restoreAllMocks();
  });

  it("the switch for other players' skins writes its key, and no longer chooses the theme", async () => {
    const { router } = open();
    await userEvent.click(await screen.findByRole("switch", { name: /Show other players' skins/ }));
    expect(localStorage.getItem(THEME_KEY)).toBe("default");
    await act(() => router.navigate("/settings/theme"));
    expect(await screen.findByRole("region", { name: "Themes" }, { timeout: slow(10_000) })).toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: /skins/ })).not.toBeInTheDocument();
    await act(() => router.navigate("/settings"));
    expect(await screen.findByRole("region", { name: "Account" }, { timeout: slow(10_000) })).toBeInTheDocument();
    await userEvent.click(await screen.findByRole("switch", { name: /Show other players' skins/ }));
    expect(localStorage.getItem(THEME_KEY)).toBe("forest");
  }, slow(30_000));

  it("shows the username, and Disconnect goes Home keeping ?ref=", async () => {
    const wallet = fakeWallet({ restored: true });
    wallet.connector.username = async () => "bal7hazar";
    const { router } = open("/settings?ref=abc", wallet);
    const account = await screen.findByRole("region", { name: "Account" });
    await within(account).findByText("bal7hazar");
    await userEvent.click(within(account).getByRole("button", { name: "Disconnect" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(router.state.location.search).toBe("?ref=abc");
    expect(wallet.calls).toContain("disconnect");
  });

  it("shows the address when the account has no username", async () => {
    open();
    const account = await screen.findByRole("region", { name: "Account" });
    await within(account).findByRole("button", { name: "Disconnect" });
    expect(account).toHaveTextContent("0x5f1");
  });

  it("Reset connects a new account in place of the old one (#918, for testing)", async () => {
    const wallet = fakeWallet({ restored: true, addresses: ["0xbee"] });
    open("/settings", wallet);
    const account = await screen.findByRole("region", { name: "Account" });
    await within(account).findByRole("button", { name: "Disconnect" });
    expect(account).toHaveTextContent("0x5f1");
    await userEvent.click(within(account).getByRole("button", { name: "Reset" }));
    await waitFor(() => expect(account).toHaveTextContent("0xbee"));
    expect(wallet.calls).toContain("reset");
    expect(account).not.toHaveTextContent("0x5f1");
  });

  it("asks a guest to Connect, and Connect opens the wallet", async () => {
    const wallet = fakeWallet();
    open("/settings", wallet);
    const account = await screen.findByRole("region", { name: "Account" });
    expect(account).toHaveTextContent("Guest");
    await userEvent.click(within(account).getByRole("button", { name: "Connect" }));
    await waitFor(() => expect(wallet.calls).toContain("connect"));
  });

  it("links to Theme and Referral, keeping ?ref=", async () => {
    const { router } = open("/settings?ref=abc");
    await userEvent.click(await screen.findByRole("button", { name: /^Themes/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/settings/theme"));
    expect(router.state.location.search).toBe("?ref=abc");
    await act(() => router.navigate("/settings?ref=abc"));
    await userEvent.click(await screen.findByRole("button", { name: /Referral/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/referral"));
    expect(router.state.location.search).toBe("?ref=abc");
  });

  it("shows the app's version from the build", async () => {
    open();
    expect(await screen.findByText(/^Paved v\d+\.\d+\.\d+/)).toBeInTheDocument();
  });
});

describe("the board reads the settings", () => {
  it("passes the quality, the day and night cycle and the ambient effects to the renderer's settings, and a change applies to the open board without a reload", async () => {
    const fakes = fakeSources({ signer: null });
    render(<App router={createTestRouter("/training")} sources={fakes.sources} />);
    await waitFor(() => expect(lastBoard()).toBeDefined(), { timeout: slow(5000) });
    expect(lastBoard()?.settings).toEqual({ quality: "auto", dayNight: { enabled: true, freezeAt: null }, ambient: { enabled: true }, fog: { enabled: true }, smoke: { enabled: true }, squareGrid: { enabled: true } });
    act(() => deviceSettings.set({ ...deviceSettings.get(), quality: "high" }));
    await waitFor(() => expect(lastBoard()?.settings).toEqual({ quality: "high", dayNight: { enabled: true, freezeAt: null }, ambient: { enabled: true }, fog: { enabled: true }, smoke: { enabled: true }, squareGrid: { enabled: true } }));
    act(() => deviceSettings.set({ ...deviceSettings.get(), dayNight: false }));
    await waitFor(() => expect(lastBoard()?.settings).toEqual({ quality: "high", dayNight: { enabled: false, freezeAt: null }, ambient: { enabled: true }, fog: { enabled: true }, smoke: { enabled: true }, squareGrid: { enabled: true } }));
    act(() => deviceSettings.set({ ...deviceSettings.get(), ambient: false }));
    await waitFor(() => expect(lastBoard()?.settings).toEqual({ quality: "high", dayNight: { enabled: false, freezeAt: null }, ambient: { enabled: false }, fog: { enabled: true }, smoke: { enabled: true }, squareGrid: { enabled: true } }));
    act(() => deviceSettings.set({ ...deviceSettings.get(), squareGrid: false }));
    await waitFor(() => expect(lastBoard()?.settings).toEqual({ quality: "high", dayNight: { enabled: false, freezeAt: null }, ambient: { enabled: false }, fog: { enabled: true }, smoke: { enabled: true }, squareGrid: { enabled: false } }));
    // A render that changes nothing the renderer reads keeps the object, so the canvas does not call setSettings for nothing.
    const high = lastBoard()?.settings;
    act(() => deviceSettings.set(withVolume(deviceSettings.get(), "sfx", 0)));
    expect(lastBoard()?.settings).toBe(high);
    act(() => deviceSettings.set(withVolume(deviceSettings.get(), "music", 0)));
    expect(lastBoard()?.settings).toBe(high);
  });

  it("gives the tile preview and the placement highlight to the board", async () => {
    const fakes = fakeSources({ signer: null });
    render(<App router={createTestRouter("/training")} sources={fakes.sources} />);
    await waitFor(() => expect(lastBoard()).toBeDefined(), { timeout: slow(5000) });
    expect(lastBoard()).toMatchObject({ tilePreview: true, placementHighlight: true });
    act(() => deviceSettings.set({ ...deviceSettings.get(), tilePreview: false, placementHighlight: false }));
    await waitFor(() => expect(lastBoard()).toMatchObject({ tilePreview: false, placementHighlight: false }));
  });
});

describe("BoardViewport and the settings", () => {
  it("hands the settings to the canvas, hides the ghost without the preview and the slots without the highlight", async () => {
    const Real = (await vi.importActual<typeof import("../src/components/containers/board-viewport")>("../src/components/containers/board-viewport")).BoardViewport;
    const settings: RendererSettingsInput = { quality: "low" };
    const slots = [{ x: 2_147_483_647, y: 2_147_483_647 }];
    const ghost = { x: 2_147_483_647, y: 2_147_483_647, plan: 3, orientation: 1 };
    const { rerender } = render(<Real tiles={[]} settings={settings} slots={slots} ghost={ghost} />);
    const props = () => drawn.canvas as GameCanvasProps;
    expect(props().settings).toBe(settings);
    expect(props().availableSlots).toHaveLength(1);
    expect(props().hover).not.toBeNull();
    rerender(<Real tiles={[]} settings={settings} slots={slots} ghost={ghost} tilePreview={false} placementHighlight={false} />);
    expect(props().availableSlots).toEqual([]);
    expect(props().hover).toBeNull();
  });
});

describe("the viewer's skins opt-out", () => {
  const VIEWER = "0xdef";
  const skinned = () => {
    const fakes = fakeSources({ signer: signer(VIEWER) });
    fakes.views.skinPlayer(GAME_PLAYING.playerId).active = active({ 7: 1 });
    fakes.views.skinPlayer(VIEWER).active = active({ 9: 1 });
    return fakes;
  };

  it("draws the players' skins until the viewer opts out", async () => {
    const fakes = skinned();
    render(<App router={createTestRouter(`/game/${GAME_PLAYING.id}`)} sources={fakes.sources} />);
    await waitFor(() => expect(lastBoard()?.skins).toEqual({ [key(7)]: 1 } satisfies TileSkins), { timeout: slow(5000) });
  });

  it("opted out, a Challenge board of a skinned player asks for no variant: no skin is read, the renderer gets no skins", async () => {
    localStorage.setItem(THEME_KEY, "default");
    const fakes = skinned();
    render(<App router={createTestRouter(`/game/${GAME_PLAYING.id}`)} sources={fakes.sources} />);
    await waitFor(() => expect(lastBoard()).toBeDefined(), { timeout: slow(5000) });
    // Let any read settle: there is none.
    await new Promise((r) => setTimeout(r, 100));
    expect(fakes.views.calls.filter((c) => c.startsWith("active_skins"))).toEqual([]);
    for (const board of drawn.board) expect(board.skins).toBe(NO_SKINS);
  });

  it("opted out, Training still draws the connected player's own skins (the switch hides the other players'; Story draws its campaign's theme, #721)", async () => {
    localStorage.setItem(THEME_KEY, "default");
    for (const path of ["/training"]) {
      drawn.board.length = 0;
      queryClient.clear();
      const fakes = skinned();
      const { unmount } = render(<App router={createTestRouter(path)} sources={fakes.sources} />);
      await waitFor(() => expect(lastBoard()?.skins).toEqual({ [key(9)]: 1 } satisfies TileSkins), { timeout: slow(5000) });
      expect(fakes.views.calls.filter((c) => c.startsWith("active_skins"))).toEqual([`active_skins ${BigInt(VIEWER)}`]);
      unmount();
    }
  });
});
