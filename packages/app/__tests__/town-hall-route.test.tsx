import { slow } from "../test-slow";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FIXTURE_ADA } from "@paved/chain/testing";
import { townHallSlots, xpFloor } from "@paved/game-core";
import { App } from "../src/App";
import { useCompletionStore } from "../src/data";
import { MOCK_KEY } from "../src/data/mock/ledger";
import { queryClient } from "../src/lib/query-client";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { mockImplementation } from "./mock-fakes";
import { preloadPages } from "./route-helpers";
import { fakeWallet } from "./wallet-fakes";

// `/town-hall` (TOWN-HALL-PAGE) end to end on the mock: the HUD's drawer over the home, the level read with the village, the upgrade
// sent at the price shown, the page and the Cobbles following; a level short of the next one's holds it.

preloadPages("town-hall", "home");

/** The page on the mock: Ada's village founded, with `cobbles` and the XP of player level `level`. */
async function open(cobbles: number, level: number) {
  const s = mockImplementation();
  await s.ledger.foundFreeVillage(FIXTURE_ADA);
  const state = JSON.parse(s.store.data.get(MOCK_KEY)!);
  const player = Object.values(state.players as Record<string, { cobbles: number; v2: { xp: number } }>)[0]!;
  player.cobbles = cobbles;
  player.v2.xp = xpFloor(level);
  s.store.data.set(MOCK_KEY, JSON.stringify(state));
  render(<App router={createTestRouter("/town-hall")} sources={s.sources} connector={fakeWallet({ address: FIXTURE_ADA }).load} />);
  const page = await screen.findByRole("dialog", { name: "Town Hall" }, { timeout: slow(5000) });
  return { ...s, page };
}

beforeEach(() => {
  queryClient.clear();
  useCompletionStore.setState({ announced: {}, last: {} });
  resetWelcomedForTests();
  markWelcomed();
});
afterEach(() => {
  vi.restoreAllMocks();
  resetWelcomedForTests();
});

describe("/town-hall on the mock", { timeout: slow(20_000) }, () => {
  it("shows the village's Town Hall and upgrades it at the price shown: the level, the tiles and the Cobbles follow", async () => {
    const { ledger, page } = await open(500, 2);
    const yours = await within(page).findByRole("region", { name: "Your Town Hall" }, { timeout: slow(5000) });
    expect(yours).toHaveTextContent("Level 1");
    expect(yours).toHaveTextContent("Your village holds 8 tiles round it");
    await userEvent.click(within(page).getByRole("button", { name: "Upgrade to level 2 for 40 Cobbles" }));
    await waitFor(() => expect(within(page).getByRole("region", { name: "Your Town Hall" })).toHaveTextContent("Level 2"), { timeout: slow(5000) });
    expect(within(page).getByRole("region", { name: "Your Town Hall" })).toHaveTextContent("Your village holds 10 tiles round it");
    expect(await ledger.freeVillage(FIXTURE_ADA)).toMatchObject({ townHall: 2, slots: townHallSlots(2) });
    expect((await ledger.account(FIXTURE_ADA)).cobbles).toBe(460);
    // Level 3 asks for player level 4: held, the reason in words.
    expect(within(page).getByRole("button", { name: "Upgrade to level 3 for 80 Cobbles" })).toBeDisabled();
    expect(page).toHaveTextContent("It opens at player level 4 (you are level 2).");
  });

  it("holds the upgrade while the Cobbles are short", async () => {
    const { page } = await open(39, 2);
    expect(await within(page).findByRole("button", { name: "Upgrade to level 2 for 40 Cobbles" }, { timeout: slow(5000) })).toBeDisabled();
    expect(page).toHaveTextContent("Not enough Cobbles yet.");
  });
});
