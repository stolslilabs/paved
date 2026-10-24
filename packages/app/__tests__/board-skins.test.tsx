import { slow } from "../test-slow";
import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NO_SKINS, type TileSkins } from "@paved/renderer";
import { DARK_FOREST, EMPTY_PROGRESS, OPEN_COUNTRY, Plan, PlanType, STORY_KEY, TUTORIAL, getPlanKey, recordRun } from "@paved/game-core";
import { App } from "../src/App";
import type { GameSigner } from "../src/data";
import { useBoardSkins } from "../src/data/board-skins";
import { THEME_KEY } from "../src/data/skins";
import { GAME_PLAYING } from "../src/mocks/games";
import { PLAYER_ID } from "../src/mocks/players";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { fakeSources, renderData } from "./data-fakes";

// SKIN-RENDER: which player's skins the board draws. The renderer's own choice (the variant, the fallbacks) is
// `packages/renderer/__tests__/skins.test.ts`'s; here, the read and the page's player.

// The board's 3D canvas and the hand's tiles (the stack's 3D view, STACK-3D), recorded instead of drawn (jsdom has no WebGL).
const drawn = vi.hoisted(() => ({ board: [] as Array<{ skins?: unknown; gameId?: number }>, hand: [] as Array<{ skins?: unknown }> }));
vi.mock("../src/components/containers/board-viewport", async (actual) => ({
  ...(await actual<object>()),
  BoardViewport: (props: { skins?: unknown; gameId?: number }) => {
    drawn.board.push(props);
    return null;
  },
}));
vi.mock("../src/components/containers/tile-view", async (actual) => ({
  ...(await actual<object>()),
  hasWebGL: () => true,
}));
vi.mock("../src/components/containers/stack-view", async (actual) => ({
  ...(await actual<object>()),
  canDrawStack: () => true,
  StackView: (props: { skins?: unknown }) => {
    drawn.hand.push(props);
    return null;
  },
}));

const key = (plan: number) => getPlanKey(Plan.from(plan).value);
const VIEWER = "0xdef";
/** An active set with these plans (1 to 19) on these themes, the rest at 0. */
const active = (themes: Record<number, number>) => Array.from({ length: 19 }, (_, i) => themes[i + 1] ?? 0);
const signer = (address: string) => ({ address, build: vi.fn(), discard: vi.fn(), surrender: vi.fn() }) as unknown as GameSigner;

beforeEach(() => {
  drawn.board.length = 0;
  drawn.hand.length = 0;
  resetWelcomedForTests();
  markWelcomed();
});
afterEach(() => resetWelcomedForTests());

describe("useBoardSkins", () => {
  it("reads the player's active set as the renderer's map: each skinned plan's key to its theme, theme 0 left out", async () => {
    const fakes = fakeSources();
    fakes.views.skinPlayer(PLAYER_ID).active = active({ 7: 1, 9: 1 });
    const { result } = renderData(() => useBoardSkins(PLAYER_ID), fakes.sources);
    await waitFor(() => expect(result.current).toEqual({ [key(7)]: 1, [key(9)]: 1 }));
  });

  it("passes a theme the manifest does not list (coming soon) on to the renderer, which draws its base model", async () => {
    const fakes = fakeSources();
    fakes.views.skinPlayer(PLAYER_ID).active = active({ 3: 2 });
    const { result } = renderData(() => useBoardSkins(PLAYER_ID), fakes.sources);
    await waitFor(() => expect(result.current).toEqual({ [key(3)]: 2 }));
  });

  it("a viewer who hides other players' skins still sees their own, and no other player's is read", async () => {
    localStorage.setItem(THEME_KEY, "default");
    const fakes = fakeSources({ signer: signer(VIEWER) });
    fakes.views.skinPlayer(VIEWER).active = active({ 7: 1 });
    fakes.views.skinPlayer(PLAYER_ID).active = active({ 9: 1 });
    const own = renderData(() => useBoardSkins(VIEWER), fakes.sources);
    await waitFor(() => expect(own.result.current).toEqual({ [key(7)]: 1 }));
    const other = renderData(() => useBoardSkins(PLAYER_ID), fakes.sources);
    expect(other.result.current).toBe(NO_SKINS);
    expect(fakes.views.calls).not.toContain(`active_skins ${BigInt(PLAYER_ID)}`);
    localStorage.removeItem(THEME_KEY);
  });

  it("is no skin for a guest, with nothing read", () => {
    const fakes = fakeSources();
    const { result } = renderData(() => useBoardSkins(null), fakes.sources);
    expect(result.current).toBe(NO_SKINS);
    expect(fakes.views.calls.filter((c) => c.startsWith("active_skins"))).toEqual([]);
  });

  it("is no skin while the read is on its way and when it fails: the board never waits for it", async () => {
    const fakes = fakeSources();
    fakes.views.skinPlayer(PLAYER_ID).active = active({ 7: 1 });
    fakes.views.skinsFail = new Error("rpc down");
    const { result } = renderData(() => useBoardSkins(PLAYER_ID), fakes.sources);
    expect(result.current).toBe(NO_SKINS);
    await waitFor(() => expect(fakes.views.calls).toContain(`active_skins ${BigInt(PLAYER_ID)}`));
    await new Promise((done) => setTimeout(done, 20));
    expect(result.current).toBe(NO_SKINS);
  });

  it("keeps the same map between renders while the set does not change", async () => {
    const fakes = fakeSources();
    fakes.views.skinPlayer(PLAYER_ID).active = active({ 7: 1 });
    const { result, rerender } = renderData(() => useBoardSkins(PLAYER_ID), fakes.sources);
    await waitFor(() => expect(result.current).not.toBe(NO_SKINS));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});

/** The skins the last board and hand drawn were given. */
const lastBoard = () => drawn.board.at(-1);
const lastHand = () => drawn.hand.at(-1);

describe("the board page's player", () => {
  it("a Challenge board draws its game's player's skins, for a viewer of another address too", async () => {
    const fakes = fakeSources({ signer: signer(VIEWER) });
    fakes.views.skinPlayer(GAME_PLAYING.playerId).active = active({ 7: 1 });
    fakes.views.skinPlayer(VIEWER).active = active({ 9: 1 });
    render(<App router={createTestRouter(`/game/${GAME_PLAYING.id}`)} sources={fakes.sources} />);
    await waitFor(() => expect(lastBoard()?.skins).toEqual({ [key(7)]: 1 }), { timeout: slow(5000) });
    expect(lastBoard()?.gameId).toBe(GAME_PLAYING.id);
    expect(fakes.views.calls).not.toContain(`active_skins ${BigInt(VIEWER)}`);
  });

  it("Training draws the connected player's skins, on the board and the hand", async () => {
    const fakes = fakeSources({ signer: signer(VIEWER) });
    fakes.views.skinPlayer(VIEWER).active = active({ 9: 1 });
    render(<App router={createTestRouter("/training")} sources={fakes.sources} />);
    const skins: TileSkins = { [key(9)]: 1 };
    await waitFor(() => expect(lastBoard()?.skins).toEqual(skins), { timeout: slow(5000) });
    await waitFor(() => expect(lastHand()?.skins).toEqual(skins));
  });

  it("a guest's Training board draws the base models", async () => {
    const fakes = fakeSources({ signer: null });
    render(<App router={createTestRouter("/training")} sources={fakes.sources} />);
    await waitFor(() => expect(lastBoard()).toBeDefined(), { timeout: slow(5000) });
    expect(lastBoard()?.skins).toBe(NO_SKINS);
    expect(fakes.views.calls.filter((c) => c.startsWith("active_skins"))).toEqual([]);
  });

  it("a Tutorial level draws the base models, whatever skins the connected player set, with none read (#721)", async () => {
    const fakes = fakeSources({ signer: signer(VIEWER) });
    fakes.views.skinPlayer(VIEWER).active = active({ 4: 1 });
    render(<App router={createTestRouter("/story/1/1")} sources={fakes.sources} />);
    await waitFor(() => expect(lastBoard()).toBeDefined(), { timeout: slow(5000) });
    await waitFor(() => expect(lastHand()).toBeDefined());
    expect(lastBoard()?.skins).toBe(NO_SKINS);
    expect(lastHand()?.skins).toBe(NO_SKINS);
    expect(fakes.views.calls.filter((c) => c.startsWith("active_skins"))).toEqual([]);
  });

  it("a Dark Forest level draws every tile in Forest, the starter included, on the board and the hand; the player's skins are not read (#721)", async () => {
    const fakes = fakeSources({ signer: signer(VIEWER) });
    fakes.views.skinPlayer(VIEWER).active = active({ 4: 2, 9: 0 });
    // Tutorial and Open Country at 2 stars a level: Dark Forest is open.
    let progress = EMPTY_PROGRESS;
    for (const campaign of [TUTORIAL, OPEN_COUNTRY]) {
      for (const level of campaign.levels) progress = recordRun(progress, level, { campaignId: campaign.id, levelIndex: level.id, moves: [] }, Math.ceil(level.target * 0.7));
    }
    fakes.store.setItem(STORY_KEY, JSON.stringify(progress));
    render(<App router={createTestRouter(`/story/${DARK_FOREST.id}/1`)} sources={fakes.sources} />);
    const forest = Object.fromEntries(Array.from({ length: 19 }, (_, i) => [key(i + 1), DARK_FOREST.theme]));
    expect(DARK_FOREST.theme).toBe(1);
    expect(forest[getPlanKey(PlanType.RFFFRFCFR)]).toBe(1);
    await waitFor(() => expect(lastBoard()?.skins).toEqual(forest), { timeout: slow(5000) });
    await waitFor(() => expect(lastHand()?.skins).toEqual(forest));
    expect(fakes.views.calls.filter((c) => c.startsWith("active_skins"))).toEqual([]);
  });
});
