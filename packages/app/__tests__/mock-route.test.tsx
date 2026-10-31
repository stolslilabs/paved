import { slow } from "../test-slow";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FIXTURE_ADA, FIXTURE_HEAD } from "@paved/chain/testing";
import { App } from "../src/App";
import { useCompletionStore } from "../src/data";
import { MOCK_STARTING_BALANCES, type TokenBalances } from "../src/data/mock/ledger";
import { queryClient } from "../src/lib/query-client";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { mockImplementation, playDailies } from "./mock-fakes";
import { preloadPages } from "./route-helpers";
import { fakeWallet } from "./wallet-fakes";

// The pages end to end on the mock (MOCK-FIRST), as the Sepolia client serves them: the missions' claims, the Vault's
// deposit. The ledger's overlays sit over a chain whose Setup, Vault and indexer predate cobbles v1; each flow completes,
// the balances move, and no page shows a "not available" notice or an RPC error.

const TODAY = Math.floor(FIXTURE_HEAD.timestamp / 86_400);

/** Ada after she won 142.35 PAVED (a new account holds none, #927): the Vault's deposit takes from it. */
const WON_PAVED = 142_350_000_000_000_000_000n;
const WINNER: TokenBalances = { ...MOCK_STARTING_BALANCES, paved: WON_PAVED };

function open(path: string, dailies?: readonly number[], starting?: TokenBalances) {
  const s = mockImplementation(undefined, starting);
  // Ada did Daily Run today and finished her first game (Settler I): the indexer's progress, which the mock's claims trust.
  s.chain.fixture.progress.set(FIXTURE_ADA, {
    quests: new Map([[1, { count: 1, completed_at: FIXTURE_HEAD.timestamp - 60 }]]),
    achievements: new Map([[2, { count: 1, completed_at: FIXTURE_HEAD.timestamp - 60 }]]),
  });
  // Or those dailies done today (#869).
  if (dailies) playDailies(s.chain, dailies);
  render(<App router={createTestRouter(path)} sources={s.sources} connector={fakeWallet({ address: FIXTURE_ADA }).load} />);
  return s;
}

const noRawErrors = () => {
  expect(screen.queryByText(/not available on this network/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/RPC|entrypoint|starknet_call/i)).not.toBeInTheDocument();
};

// The Cobbles' sheet and the home's panel host too: the balances' Cobbles open them, cold in the packs' wait otherwise.
preloadPages("missions", "vault", "cobbles", "cobbles-sheet", "home-panel");

beforeEach(() => {
  queryClient.clear();
  useCompletionStore.setState({ announced: {}, last: {} });
  resetWelcomedForTests();
  markWelcomed();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  resetWelcomedForTests();
});

describe("the mocked pages (Sepolia's default)", { timeout: slow(20_000) }, () => {
  it("/missions: the missions carry the mock's Cobbles, none for a daily (#869); a claim moves the balance; no notice, no RPC text", async () => {
    const s = open("/missions");
    expect(await screen.findByRole("heading", { level: 1, name: "Missions" }, { timeout: slow(5000) })).toBeInTheDocument();
    // Daily Run is done but pays nothing on its own: its card has no Claim.
    await userEvent.click(await screen.findByRole("button", { name: /^Daily Run: / }, { timeout: slow(5000) }));
    expect(screen.getByRole("button", { name: "Daily Run: Done" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: /^Claim .*: Daily Run$/ })).not.toBeInTheDocument();
    // Settler I's icon selects it (#832): its card holds the Claim.
    await userEvent.click(await screen.findByRole("button", { name: /^Settler I: / }, { timeout: slow(5000) }));
    const claim = await screen.findByRole("button", { name: "Claim 10 Cobbles: Settler I" }, { timeout: slow(5000) });
    expect(screen.queryByText("Rewards unavailable")).not.toBeInTheDocument();
    noRawErrors();
    await userEvent.click(claim);
    expect((await screen.findAllByRole("button", { name: "10 Cobbles: Buy packs" }, { timeout: slow(5000) })).length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Claim 10 Cobbles: Settler I" })).not.toBeInTheDocument());
    expect((await s.ledger.account(FIXTURE_ADA)).achievementsClaimed).toBe(1n << 2n);
    expect((await s.ledger.dayProgress(FIXTURE_ADA, TODAY)).claimed).toBe(0n);
    noRawErrors();
  });

  it("/missions: the day's bar (#869): at 3 dailies done its first milestone pays 10 Cobbles once, from the bar", async () => {
    const s = open("/missions", [1, 2, 3]);
    const bar = await screen.findByRole("progressbar", { name: "Dailies done today" }, { timeout: slow(5000) });
    await waitFor(() => expect(bar).toHaveAttribute("aria-valuenow", "3"), { timeout: slow(5000) });
    expect(screen.getByRole("img", { name: "15 Cobbles at 5 dailies done" })).toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: "Claim 10 Cobbles: 3 dailies done" }, { timeout: slow(5000) }));
    expect(await screen.findByRole("img", { name: "10 Cobbles claimed: 3 dailies done" }, { timeout: slow(5000) })).toBeInTheDocument();
    expect((await screen.findAllByRole("button", { name: "10 Cobbles: Buy packs" }, { timeout: slow(5000) })).length).toBeGreaterThan(0);
    expect(await s.ledger.dailyMilestones(FIXTURE_ADA, TODAY)).toEqual({ day: TODAY, claimed: 0b01 });
    expect(screen.queryByRole("button", { name: /^Claim .*dailies done$/ })).not.toBeInTheDocument();
    noRawErrors();
  });

  it("/vault: the mock's position and wallet; a deposit goes through and moves both", async () => {
    const s = open("/vault", undefined, WINNER);
    expect(await screen.findByRole("region", { name: "Your position" }, { timeout: slow(5000) })).toHaveTextContent("No vPAVED yet");
    noRawErrors();
    await userEvent.type(screen.getByRole("textbox", { name: /Amount to deposit/ }), "100");
    expect(await screen.findByText(/You get about/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Deposit" }));
    expect(await screen.findByText("Deposited", undefined, { timeout: slow(5000) })).toBeInTheDocument();
    expect((await s.ledger.vault(FIXTURE_ADA)).shares).toBeGreaterThan(0n);
    expect(await s.ledger.pavedBalance(FIXTURE_ADA)).toBe(WON_PAVED - 100n * 10n ** 18n);
    await waitFor(() => expect(screen.getByRole("region", { name: "Your position" })).not.toHaveTextContent("No vPAVED yet"));
    noRawErrors();
  });

  it("the balances' Cobbles lead to the packs' own page (#621), its packs from the mock", async () => {
    // The clocks held: the indexer's and the missions' tick each second, and each tick restarted the sheet's first render, which
    // React runs at a lower priority. Under a check's load that render took about a second, so the packs took 42 s, then more
    // than 120 s. Only the intervals are fake: React, the queries and the lookups run on timeouts and the DOM's changes. The
    // file's last test: a module's interval begun while they are fake stays fake (`theme-route`'s next tests failed so).
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    // A page whose rule shows the Cobbles (Missions earn them, #720): the Vault shows none since the desktop's header went (#762).
    open("/missions");
    const [cobbles] = await screen.findAllByRole("button", { name: /Cobbles: Buy packs$/ }, { timeout: slow(10_000) });
    await userEvent.click(cobbles!);
    // The packs first: the page's loading screen has the same heading, replaced as the packs arrive.
    expect(await screen.findByRole("radiogroup", { name: "Cobble packs" }, { timeout: slow(20_000) })).toBeInTheDocument();
    const title = screen.getByRole("heading", { level: 1, name: "Cobbles" });
    expect(title).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Stake" })).not.toBeInTheDocument();
    // In the sheet over Missions, the packs' own balances (#855), not Missions' Cobbles alone: the Cobbles and USDC, at both widths,
    // the Cobbles' plate leading nowhere (its packs are in view).
    const header = title.closest<HTMLElement>('[data-slot="page-header"]')!;
    const regions = await within(header).findAllByRole("region", { name: "Balances" }, { timeout: slow(5000) });
    expect(regions).toHaveLength(2);
    for (const region of regions) {
      const plates = await within(region).findAllByRole("button", { name: /Cobbles|USDC/ }, { timeout: slow(5000) });
      expect(plates.map((b) => b.getAttribute("aria-label")!.replace(/^[\d.,]+ /, "").replace(/:.*$/, ""))).toEqual(["Cobbles", "USDC"]);
      expect(plates[0]).toBeDisabled();
    }
    noRawErrors();
  }, slow(45_000));
});
