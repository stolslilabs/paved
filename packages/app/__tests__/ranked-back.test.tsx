import { slow } from "../test-slow";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { App } from "../src/App";
import type { GameSigner } from "../src/data";
import { queryClient } from "../src/lib/query-client";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { mockImplementation } from "./mock-fakes";
import { preloadPages } from "./route-helpers";
import { fakeWallet } from "./wallet-fakes";

// RANKED-BACK (#1066, the owner's decision of 2026-11-07): Ranked is chosen on the Play page, so the Back of its flow (the
// search, the scout, the attack, an attack's end) goes up to the Play page, never the League, by the one rule of `useUpTo`
// (BACK-RULE #783): back through the history when Play is in it, else in place of the entry. A match and a replay, opened from
// the League's history, keep the League (`pvp-match-route.test.tsx`, `pvp-route.test.tsx`).

const WAIT = { timeout: slow(8000) };

type Mock = ReturnType<typeof mockImplementation>;

async function open(path: string, prepare?: (s: Mock, me: string) => Promise<void>) {
  const s = mockImplementation();
  const me = s.sources.signer!.address;
  await prepare?.(s, me);
  const wallet = fakeWallet({ address: me, restored: true });
  wallet.connector.signer = () => s.sources.signer as GameSigner;
  const router = createTestRouter(path);
  render(<App router={router} sources={s.sources} connector={wallet.load} />);
  return { ...s, me, router };
}

/** A rival drawn on v2: the page opens on the scout. */
async function drawn(s: Mock, me: string) {
  const writes = s.ledger.writesFor(me);
  await writes.foundFreeVillage();
  await writes.drawOpponentV2("search");
}

/** An attack under way on v2: the page opens on the attack. */
async function attacking(s: Mock, me: string) {
  await drawn(s, me);
  await s.ledger.writesFor(me).startAttackV2();
}

/** An attack surrendered on v2: `/pvp/result/1` is its end. */
async function surrendered(s: Mock, me: string) {
  await attacking(s, me);
  await s.ledger.writesFor(me).surrenderAttackV2();
}

/** From the village to the Play page, then its Attack: the Ranked flow at `/pvp`, both pushed over the village. */
async function fromPlay(router: ReturnType<typeof createTestRouter>) {
  await router.navigate("/play");
  await userEvent.click(await screen.findByText("Raid a rival village", {}, WAIT));
  await waitFor(() => expect(router.state.location.pathname).toBe("/pvp"), WAIT);
}

/** Back on the Play page (its drawer's), tried again while the page may still swap its node after the pop: the village. */
async function playToVillage(router: ReturnType<typeof createTestRouter>) {
  await screen.findByRole("dialog", { name: "Play" }, WAIT);
  await waitFor(async () => {
    if (router.state.location.pathname === "/play") await userEvent.click(within(screen.getByRole("dialog", { name: "Play" })).getAllByRole("button", { name: "Back" })[0]!);
    expect(router.state.location.pathname).toBe("/");
  }, WAIT);
}

preloadPages("home", "play");
beforeAll(async () => {
  await Promise.all([import("../src/routes/pages/pvp"), import("../src/routes/pvp-v2"), import("../src/routes/pages/pvp-result"), import("../src/routes/pvp-v2-end")]);
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

describe("Back from Ranked returns to the Play page (RANKED-BACK #1066)", { timeout: slow(45_000) }, () => {
  it("the village, Play, Attack, the search: Back shows the Play page, back through the history; Back again the village", async () => {
    const { router } = await open("/");
    await fromPlay(router);
    // A fresh device has no v2 village: the search's window, its Cancel the flow's Back.
    await screen.findByText(/Your village is not founded yet/, {}, WAIT);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/play"), WAIT);
    expect(router.state.historyAction).toBe("POP");
    await playToVillage(router);
  });

  it("the same from the scout", async () => {
    const { router } = await open("/", drawn);
    await fromPlay(router);
    const scout = await screen.findByRole("heading", { name: "Scout" }, WAIT);
    await userEvent.click(within(scout.closest("header")!).getByRole("button", { name: "Back" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/play"), WAIT);
    expect(router.state.historyAction).toBe("POP");
    await playToVillage(router);
  });

  it("the same from the attack", async () => {
    const { router } = await open("/", attacking);
    await fromPlay(router);
    await screen.findByRole("heading", { name: /^Attack: / }, WAIT);
    await userEvent.click(screen.getAllByRole("button", { name: "Back" })[0]!);
    await waitFor(() => expect(router.state.location.pathname).toBe("/play"), WAIT);
    expect(router.state.historyAction).toBe("POP");
    await playToVillage(router);
  });

  it("an attack's end, then Again: the flow's Back shows the Play page, the end skipped", async () => {
    const { router } = await open("/", surrendered);
    await router.navigate("/play");
    await screen.findByRole("dialog", { name: "Play" }, WAIT);
    await router.navigate("/pvp/result/1");
    await screen.findByRole("heading", { level: 1, name: "Attack over" }, WAIT);
    await userEvent.click(screen.getByRole("button", { name: "Again" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/pvp"), WAIT);
    // The new search draws a rival at once (the mock's), then the scout: its Back.
    const scout = await screen.findByRole("heading", { name: "Scout" }, WAIT);
    await userEvent.click(within(scout.closest("header")!).getByRole("button", { name: "Back" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/play"), WAIT);
    expect(router.state.historyAction).toBe("POP");
    await playToVillage(router);
  });

  it("an attack's end still under way: its Back shows the Play page", async () => {
    const { router } = await open("/", attacking);
    await router.navigate("/play");
    await screen.findByRole("dialog", { name: "Play" }, WAIT);
    await router.navigate("/pvp/result/1");
    await screen.findByText("This attack is still under way.", {}, WAIT);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/play"), WAIT);
    expect(router.state.historyAction).toBe("POP");
  });

  it("a link straight to /pvp: Back shows the Play page in place of the entry, then the village", async () => {
    const { router } = await open("/pvp");
    await screen.findByText(/Your village is not founded yet/, {}, WAIT);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/play"), WAIT);
    expect(router.state.historyAction).toBe("REPLACE");
    await playToVillage(router);
  });
});
