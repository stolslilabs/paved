import { slow } from "../test-slow";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FIXTURE_ADA, FIXTURE_HEAD } from "@paved/chain/testing";
import { App } from "../src/App";
import { useCompletionStore } from "../src/data";
import { MOCK_STARTING_PAVED } from "../src/data/mock/ledger";
import { queryClient } from "../src/lib/query-client";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { mockImplementation } from "./mock-fakes";
import { preloadPages } from "./route-helpers";
import { fakeWallet } from "./wallet-fakes";

// The pages end to end on the mock (MOCK-FIRST), as the Sepolia client serves them: the missions' claims, the Vault's
// deposit. The ledger's overlays sit over a chain whose Setup, Vault and indexer predate cobbles v1; each flow completes,
// the balances move, and no page shows a "not available" notice or an RPC error.

const TODAY = Math.floor(FIXTURE_HEAD.timestamp / 86_400);

function open(path: string) {
  const s = mockImplementation();
  // Ada did Daily Run today: the indexer's progress, which the mock's claims trust.
  s.chain.fixture.progress.set(FIXTURE_ADA, { quests: new Map([[1, { count: 1, completed_at: FIXTURE_HEAD.timestamp - 60 }]]), achievements: new Map() });
  render(<App router={createTestRouter(path)} sources={s.sources} connector={fakeWallet({ address: FIXTURE_ADA }).load} />);
  return s;
}

const noRawErrors = () => {
  expect(screen.queryByText(/not available on this network/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/RPC|entrypoint|starknet_call/i)).not.toBeInTheDocument();
};

// The Cobbles' sheet and the home's panel host too: the balances' Cobbles open them, cold in the packs' wait otherwise.
preloadPages("missions", "vault", "cobbles-sheet", "home-panel");

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

describe("the mocked pages (Sepolia's default)", { timeout: slow(20_000) }, () => {
  it("/missions: the quests carry the mock's Cobbles; a claim moves the balance; no notice, no RPC text", async () => {
    const s = open("/missions");
    expect(await screen.findByRole("heading", { level: 1, name: "Missions" }, { timeout: slow(5000) })).toBeInTheDocument();
    // Daily Run's icon selects it (#832): its card holds the Claim.
    await userEvent.click(await screen.findByRole("button", { name: /^Daily Run: / }, { timeout: slow(5000) }));
    const claim = await screen.findByRole("button", { name: "Claim 5 Cobbles: Daily Run" }, { timeout: slow(5000) });
    expect(screen.queryByText("Rewards unavailable")).not.toBeInTheDocument();
    noRawErrors();
    await userEvent.click(claim);
    expect((await screen.findAllByRole("button", { name: "5 Cobbles: Buy packs" }, { timeout: slow(5000) })).length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Claim 5 Cobbles: Daily Run" })).not.toBeInTheDocument());
    expect((await s.ledger.dayProgress(FIXTURE_ADA, TODAY)).claimed).toBe(1n << 1n);
    noRawErrors();
  });

  it("/vault: the mock's position and wallet; a deposit goes through and moves both", async () => {
    const s = open("/vault");
    expect(await screen.findByRole("region", { name: "Your position" }, { timeout: slow(5000) })).toHaveTextContent("No vPAVED yet");
    noRawErrors();
    await userEvent.type(screen.getByRole("textbox", { name: /Amount to deposit/ }), "100");
    expect(await screen.findByText(/You get about/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Deposit" }));
    expect(await screen.findByText("Deposited", undefined, { timeout: slow(5000) })).toBeInTheDocument();
    expect((await s.ledger.vault(FIXTURE_ADA)).shares).toBeGreaterThan(0n);
    expect(await s.ledger.pavedBalance(FIXTURE_ADA)).toBe(MOCK_STARTING_PAVED - 100n * 10n ** 18n);
    await waitFor(() => expect(screen.getByRole("region", { name: "Your position" })).not.toHaveTextContent("No vPAVED yet"));
    noRawErrors();
  });

  it("the balances' Cobbles lead to the packs' own page (#621), its packs from the mock", async () => {
    // A page whose rule shows the Cobbles (Missions earn them, #720): the Vault shows none since the desktop's header went (#762).
    open("/missions");
    const [cobbles] = await screen.findAllByRole("button", { name: /Cobbles: Buy packs$/ }, { timeout: slow(10_000) });
    await userEvent.click(cobbles!);
    // The packs first: the page's loading screen has the same heading, replaced as the packs arrive. They took 42 s and more
    // than 60 s under a check's load, preloaded.
    expect(await screen.findByRole("radiogroup", { name: "Cobble packs" }, { timeout: slow(20_000) })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Cobbles" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Stake" })).not.toBeInTheDocument();
    noRawErrors();
  }, slow(45_000));
});
