import { slow } from "../test-slow";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { WriteAccount } from "@paved/chain";
import { FIXTURE_ADA, FIXTURE_HEAD, FakeClaimer } from "@paved/chain/testing";
import { App } from "../src/App";
import type { GameSigner } from "../src/data";
import { useCompletionStore } from "../src/data/completion-memory";
import { queryClient } from "../src/lib/query-client";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import type { WalletConnector } from "../src/wallet/wallet";
import { fakeSources } from "./data-fakes";
import { preloadPages } from "./route-helpers";

// P9's claims through the wallet (P6): the signer `WalletProvider` builds for the connected account carries the Cobbles'
// claims (`GameSigner`), so /quests offers Claim to a connected wallet instead of "Connect to claim".

const TODAY = Math.floor(FIXTURE_HEAD.timestamp / 86_400);

/** Ada has done today's Daily Run (quest 1, 5 Cobbles); the wallet restores her session, its signer `FakeClaimer`'s. */
function setup() {
  const fakes = fakeSources();
  const { views, fixture } = fakes;
  fixture.progress.set(FIXTURE_ADA, { quests: new Map([[1, { count: 1, completed_at: FIXTURE_HEAD.timestamp - 60 }]]), achievements: new Map() });
  views.questRates.set(1, { questId: 1, cobbles: 5, kind: "daily", task: 1, total: 1, start: 0, interval: 86_400 });
  const ada = views.cobblePlayer(FIXTURE_ADA);
  ada.account = { ...ada.account, cobbles: 240 };
  ada.days.set(TODAY, { games: 1, structures: 0, forests: 0, points: 0, claimed: 0n, credit: false });
  const claimer = new FakeClaimer(views, FIXTURE_ADA);
  const account: WriteAccount = { address: FIXTURE_ADA, execute: async () => ({ transaction_hash: "0x1" }) };
  const connector: WalletConnector = {
    probe: async () => account,
    connect: async () => account,
    disconnect: async () => {},
    reset: async () => account,
    username: async () => null,
    signer: () => claimer as unknown as GameSigner,
  };
  return { sources: fakes.sources, claimer, load: async () => connector };
}

preloadPages("home", "missions");

beforeEach(() => {
  queryClient.clear();
  useCompletionStore.setState({ announced: {}, last: {} });
  resetWelcomedForTests();
  markWelcomed();
});
afterEach(() => {
  queryClient.clear();
  resetWelcomedForTests();
});

describe("the Cobbles' claims through the wallet", () => {
  it("a connected wallet enables Claim on /missions, and the claim goes through its signer", async () => {
    const s = setup();
    render(<App router={createTestRouter("/")} sources={s.sources} connector={s.load} />);
    // Home restores the session; the Quests tab then reads the connected player.
    // The missions tracker (#978): any line opens the page.
    const tracker = await screen.findByRole("navigation", { name: /^Missions/ }, { timeout: slow(5000) });
    await userEvent.click((await within(tracker).findAllByRole("button", {}, { timeout: slow(5000) }))[0]!);
    await userEvent.click(await screen.findByRole("button", { name: /^Daily Run: / }, { timeout: slow(5000) }));
    const claim = await screen.findByRole("button", { name: "Claim 5 Cobbles: Daily Run" }, { timeout: slow(5000) });
    expect(claim).toBeEnabled();
    expect(screen.queryByText(/Connect to claim/)).toBeNull();
    await userEvent.click(claim);
    await waitFor(() => expect(s.claimer.sent).toEqual([[{ kind: "quest", questId: 1, period: TODAY }]]));
  });
});
