import { slow } from "../test-slow";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import type { GameSigner } from "../src/data";
import { MOCK_KEY } from "../src/data/mock/ledger";
import { pvpKeys } from "../src/data/pvp-keys";
import { SETTINGS_KEY } from "../src/data/settings";
import { leagueOf } from "../src/lib/pvp-rules";
import { queryClient } from "../src/lib/query-client";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { mockImplementation } from "./mock-fakes";
import { fakeWallet } from "./wallet-fakes";

// The home (#753) on the mock ledger: the crowns and the league once PvP is played, and the scene's view by the graphics
// quality. jsdom has no WebGL: here it reports some, and the 3D canvas is a stand-in that says it is up.

vi.mock("../src/lib/webgl", () => ({ hasWebGL: () => true }));
vi.mock("../src/routes/home-canvas", () => ({ default: () => <div data-testid="home-canvas" /> }));

const WAIT = { timeout: slow(8000) };

/** The mock's sources, the wallet restored, the village founded; `crowns` (and a season attack) when PvP was played. */
async function open(options: { crowns?: number; shieldUntil?: number } = {}) {
  const s = mockImplementation();
  const me = s.sources.signer!.address;
  await s.ledger.writesFor(me).foundFreeVillage();
  if (options.crowns !== undefined) {
    // The player's stored PvP, edited in place: crowns won this season (a test's stand-in for attacks played elsewhere).
    await s.ledger.pvpLeague(me);
    const state = JSON.parse(s.store.getItem(MOCK_KEY)!);
    const season = (await s.ledger.pvpLeague(me)).season;
    for (const player of Object.values(state.players as Record<string, { pvp?: Record<string, unknown> }>)) {
      player.pvp = { crowns: options.crowns, draws: 0, match: null, attacks: [], shieldUntil: options.shieldUntil ?? 0, season, seasonAttacks: 1, peak: 0 };
    }
    s.store.setItem(MOCK_KEY, JSON.stringify(state));
  }
  const wallet = fakeWallet({ address: me, restored: true });
  wallet.connector.signer = () => s.sources.signer as GameSigner;
  const router = createTestRouter("/");
  render(<App router={router} sources={s.sources} connector={wallet.load} />);
  return { ...s, me, router };
}

beforeAll(async () => {
  await Promise.all([import("../src/routes/pages/home"), import("../src/routes/home-stage")]);
}, slow(60_000));
beforeEach(() => {
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

describe("/: the PvP standing by the avatar (#755)", () => {
  it("shows the crowns and their league; the column has no League and no Defence", async () => {
    await open({ crowns: 1_240 });
    const name = leagueOf(1_240).name;
    expect(await screen.findByRole("button", { name: `League: ${name}, 1,240 crowns` }, WAIT)).toBeInTheDocument();
    const column = screen.getByRole("navigation", { name: "Village" });
    // The League control is the way in (#856): no League in the column.
    expect(within(column).queryByRole("button", { name: /^League/ })).toBeNull();
    expect(within(column).queryByRole("button", { name: /^Defence/ })).toBeNull();
  }, slow(30_000));

  it("shows Wood with 0 crowns before any PvP, a tap to the league", async () => {
    const { router } = await open();
    await screen.findByRole("button", { name: "Edit village" }, WAIT);
    fireEvent.click(await screen.findByRole("button", { name: `League: ${leagueOf(0).name}, 0 crowns` }, WAIT));
    await waitFor(() => expect(router.state.location.pathname).toBe("/pvp/league"), WAIT);
  }, slow(30_000));
});

describe("/: the shield's plate (#806, #829)", () => {
  it("shows the shield and its HHhMMm under the League control while the village is shielded, from the League's read", async () => {
    const { me } = await open({ crowns: 1_240, shieldUntil: Math.floor(Date.now() / 1000) + 7 * 3600 + 41 * 60 + 30 });
    const chip = await screen.findByRole("button", { name: /^Shielded, 7 hours 4\d minutes left$/ }, WAIT);
    expect(chip).toHaveTextContent(/^07h4\dm$/);
    // The League page's own query (`pvpKeys.shield`): the two never disagree.
    expect(queryClient.getQueryData(pvpKeys.shield(me))).toMatchObject({ up: true });
  }, slow(30_000));

  it("shows no plate without a shield", async () => {
    await open({ crowns: 1_240 });
    await screen.findByRole("button", { name: /^League: / }, WAIT);
    expect(screen.queryByRole("button", { name: /^Shielded/ })).toBeNull();
  }, slow(30_000));
});

describe("/: the scene by the graphics quality", () => {
  it("draws the 3D scene with WebGL at the default quality", async () => {
    await open();
    expect(await screen.findByTestId("home-canvas", {}, WAIT)).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /^Village layout/ })).toBeNull();
  }, slow(30_000));

  it("falls back to the plan view under the low quality, with no canvas", async () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ quality: "low" }));
    await open();
    expect(await screen.findByRole("img", { name: /^Village layout/ }, WAIT)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId("home-canvas")).toBeNull());
  }, slow(30_000));
});
