import { slow } from "../test-slow";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FIXTURE_ADA } from "@paved/chain/testing";
import { App } from "../src/App";
import { queryClient } from "../src/lib/query-client";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { MOCK_STARTING_BALANCES } from "../src/data/mock/ledger";
import { mockImplementation } from "./mock-fakes";
import { preloadPages } from "./route-helpers";
import { fakeWallet } from "./wallet-fakes";

// PAVED-PLUS (#871, the owner's decisions of 2026-10-28): PAVED's plate leads to the Challenge's purchase, where PAVED is won;
// vPAVED's still to the Vault, where PAVED becomes vPAVED. On the mock, through the real shell: the home's stack (a holder's,
// so vPAVED shows) and the Vault's header, where PAVED now leads away and vPAVED, on its own page, leads nowhere.

preloadPages("home", "vault", "purchase", "home-panel");

const WAIT = { timeout: slow(10_000) };

/** Ada on the mock, holding vPAVED: 100 of the 142.35 PAVED she won (a new account holds none, #927) deposited before the app opens. */
async function open(path: string) {
  const s = mockImplementation(undefined, { ...MOCK_STARTING_BALANCES, paved: 142_350_000_000_000_000_000n });
  await s.ledger.deposit(FIXTURE_ADA, 100n * 10n ** 18n, { confirmedAmount: 100n * 10n ** 18n });
  const router = createTestRouter(path);
  render(<App router={router} sources={s.sources} connector={fakeWallet({ address: FIXTURE_ADA }).load} />);
  return router;
}

/** A plate's buttons by its accessible name (the phone's and the larger ones, both mounted: jsdom applies no media query). */
const plates = (name: RegExp) => screen.findAllByRole("button", { name }, WAIT);

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  queryClient.clear();
  resetWelcomedForTests();
  markWelcomed();
});
afterEach(() => {
  queryClient.clear();
  resetWelcomedForTests();
});

describe("PAVED's plate leads to the Challenge, vPAVED's to the Vault (#871)", { timeout: slow(30_000) }, () => {
  it("the home: PAVED's plate opens the Challenge's purchase, vPAVED's the Vault", async () => {
    const router = await open("/");
    const [paved] = await plates(/^\S+ PAVED: Play a Challenge$/);
    expect((await plates(/^\S+ vPAVED: Vault$/)).length).toBeGreaterThan(0);
    await userEvent.click(paved!);
    await waitFor(() => expect(router.state.location.pathname).toBe("/play/challenge"), WAIT);
    await act(() => router.navigate("/"));
    const [vpaved] = await plates(/^\S+ vPAVED: Vault$/);
    await userEvent.click(vpaved!);
    await waitFor(() => expect(router.state.location.pathname).toBe("/vault"), WAIT);
  });

  it("the Vault: PAVED's plate leads to the Challenge; vPAVED's, on its own page, leads nowhere", async () => {
    const router = await open("/vault");
    await screen.findByRole("heading", { level: 1, name: "Vault" }, WAIT);
    for (const vpaved of await plates(/^\S+ vPAVED$/)) expect(vpaved).toBeDisabled();
    const [paved] = await plates(/^\S+ PAVED: Play a Challenge$/);
    await userEvent.click(paved!);
    await waitFor(() => expect(router.state.location.pathname).toBe("/play/challenge"), WAIT);
  });
});
