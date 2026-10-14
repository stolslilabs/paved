// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { FakeGameViews, FaucetCapError, IndexerClient } from "@paved/chain";
import { FIXTURE_ADA, FIXTURE_TOURNAMENT, FixtureIndexer } from "@paved/chain/testing";
import { shortId } from "../src/utils/indexer-view";
import { resolveEconomyDeployment, type Deployment } from "@paved/chain";
import { EconomyProvider } from "../src/utils/economy-context";
import { LandingPage } from "../src/pages/Landing";
import { configured, notConfigured, renderPage, PLAYER } from "./helpers/page-fixtures";

vi.mock("@paved/ui", () => ({
  LandingScreen: ({ connected, playerName, gameModes }: any) => (
    <div>
      <span>{connected ? `connected:${playerName ?? "new"}` : "not connected"}</span>
      {gameModes.map((m: any) => (
        <div key={m.mode} data-testid={`card-${m.mode}`}>
          <button type="button" onClick={m.onPress}>
            {`mode ${m.mode}: ${m.entryFee}`}
          </button>
          {m.mode === "training" && (
            <button type="button" data-mode={m.mode} data-free={m.free ? "true" : "false"} onClick={m.onPress}>
              {`${m.title}: ${m.description}: ${m.actionLabel ?? (m.hasActiveGame ? "Resume" : "Play")}`}
            </button>
          )}
          {m.extra}
        </div>
      ))}
    </div>
  ),
  ModeDetailDialog: ({ children }: any) => <div role="dialog">{children}</div>,
  ModeDetailDialogStat: ({ children }: any) => <div>{children}</div>,
  TokenPanel: ({ error, balanceLabel, supportsMint, onMint }: any) => (
    <div>
      <span>{`balance ${balanceLabel}`}</span>
      {supportsMint && (
        <button type="button" onClick={onMint}>
          Mint
        </button>
      )}
      {error && <div role="alert">{error}</div>}
    </div>
  ),
}));

afterEach(cleanup);

const land = (opts: Partial<Parameters<typeof renderPage>[0]> = {}) => renderPage({ page: <LandingPage />, path: "/", ...opts });
/**
 * An economy that is not deployed (the build's own reads the real devnet.json, which has the economy since E3), but whose Faucet (the USDC)
 * address is known: the entry token is compared with it, not with the old Token (gone from the deployment).
 */
const noEconomy = (deployment: Deployment) => (routes: React.ReactElement) => (
  <EconomyProvider value={{ deployment: resolveEconomyDeployment({ base: { ...deployment, faucet: "0x4" } }) }}>{routes}</EconomyProvider>
);
/** Neither an economy nor a USDC address. */
const unknownUsdc = (deployment: Deployment) => (routes: React.ReactElement) => (
  <EconomyProvider value={{ deployment: resolveEconomyDeployment({ base: deployment }) }}>{routes}</EconomyProvider>
);
const result = { transactionHash: "0x1", events: [] };

describe("Training card", () => {
  it("opens with no wallet, no account and an unconfigured chain, and goes to the Training route", async () => {
    localStorage.clear();
    land({ deployment: notConfigured, account: null });
    fireEvent.click(await screen.findByText("Training: Free, no wallet, no rewards: Play"));
    expect(screen.getByTestId("where").textContent).toBe("/game?mode=training|null");
  });

  it("says Resume while a Training game is saved here", async () => {
    localStorage.setItem("paved:training:v1", JSON.stringify({ v: 1, seed: "0x5", moves: [] }));
    try {
      land({ deployment: notConfigured, account: null });
      expect(await screen.findByText("Training: Free, no wallet, no rewards: Resume")).toBeTruthy();
    } finally {
      localStorage.clear();
    }
  });
});

describe("Tutorial card", () => {
  it("opens the off-chain /tutorial page, with no dialog", async () => {
    land({ deployment: notConfigured, account: null });
    fireEvent.click(await screen.findByText(/mode tutorial/));
    expect(screen.getByTestId("where").textContent).toBe("/tutorial|null");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("Training card, finished game", () => {
  it("says View result, not Resume, when the saved game replays to over", async () => {
    localStorage.setItem("paved:training:v1", JSON.stringify({ v: 1, seed: "0x5", moves: [{ k: "s" }] }));
    try {
      land({ deployment: notConfigured, account: null });
      expect(await screen.findByText("Training: Free, no wallet, no rewards: View result")).toBeTruthy();
    } finally {
      localStorage.clear();
    }
  });

  it("says Play for a save that does not replay", async () => {
    localStorage.setItem("paved:training:v1", JSON.stringify({ v: 1, seed: "0x5", moves: [{ k: "b", o: 1, x: 40, y: 40 }] }));
    try {
      land({ deployment: notConfigured, account: null });
      expect(await screen.findByText("Training: Free, no wallet, no rewards: Play")).toBeTruthy();
    } finally {
      localStorage.clear();
    }
  });
});

describe("Training card, unreadable save", () => {
  it("says Play for a save that is not even JSON", async () => {
    localStorage.setItem("paved:training:v1", "{");
    try {
      land({ deployment: notConfigured, account: null });
      expect(await screen.findByText("Training: Free, no wallet, no rewards: Play")).toBeTruthy();
    } finally {
      localStorage.clear();
    }
  });

  it("reads the saved game once, not on every render", async () => {
    localStorage.setItem("paved:training:v1", JSON.stringify({ v: 1, seed: "0x5", moves: [] }));
    const reads = vi.spyOn(Storage.prototype, "getItem");
    try {
      land({ deployment: notConfigured, account: null });
      await screen.findByText("Training: Free, no wallet, no rewards: Resume");
      const first = reads.mock.calls.filter(([key]) => key === "paved:training:v1").length;
      expect(first).toBeGreaterThan(0);
      // opening the Challenge dialog re-renders the page (and so does every read that lands)
      fireEvent.click(screen.getByText(/mode challenge/));
      fireEvent.click(screen.getByText("Cancel"));
      expect(reads.mock.calls.filter(([key]) => key === "paved:training:v1").length).toBe(first);
    } finally {
      reads.mockRestore();
      localStorage.clear();
    }
  });
});

describe("Mode cards with no wallet", () => {
  it("Training and the Tutorial sit among the mode cards with no wallet, no account and an unconfigured chain", async () => {
    land({ deployment: notConfigured, account: null });
    expect(await screen.findByTestId("card-challenge")).toBeTruthy();
    expect(screen.getByTestId("card-training")).toBeTruthy();
    expect(screen.getByTestId("card-tutorial")).toBeTruthy();
    expect(screen.queryByTestId("training-card")).toBeNull(); // no longer a section above the screen
  });

  it("the Challenge start keeps its gate on the action: with no account the confirm says Not connected", async () => {
    land({ deployment: notConfigured, account: null });
    fireEvent.click(await screen.findByText(/mode challenge/));
    expect((screen.getByText("Not connected") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("Challenge card, top 3", () => {
  let fixture: FixtureIndexer;
  let indexer: IndexerClient;
  beforeEach(() => {
    fixture = new FixtureIndexer();
    indexer = new IndexerClient({ url: "http://indexer.test", fetch: fixture.fetch as typeof fetch });
  });
  const challenge = (opts: Partial<Parameters<typeof renderPage>[0]> = {}) => {
    const views = new FakeGameViews();
    views.today = FIXTURE_TOURNAMENT;
    return land({ views, indexer, ...opts });
  };
  const top = () => within(screen.getByTestId("card-challenge"));

  it("shows the first three rows with rank, short address and score, each linking to the player, and the leaderboard link", async () => {
    challenge();
    const list = await screen.findByTestId("challenge-top");
    expect(fixture.requests).toContain(`/v1/tournaments/${FIXTURE_TOURNAMENT}/leaderboard?limit=3`);
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    const ada = within(rows[0]);
    // D-25 (E): no name from the indexer; the short address (the connected player would see their username).
    expect(rows[0].textContent).toBe(`1. ${shortId(FIXTURE_ADA)} - 187`);
    expect(ada.getByRole("link", { name: shortId(FIXTURE_ADA) }).getAttribute("href")).toBe(`/player/${FIXTURE_ADA}`);
    expect(rows[1].textContent).toMatch(/^2\. .+ - \d+$/);
    expect(rows[2].textContent).toMatch(/^3\. .+ - \d+$/);
    const see = top().getByRole("link", { name: "See the leaderboard" });
    expect(see.getAttribute("href")).toBe("/leaderboard");
    fireEvent.click(see);
    expect(screen.getByTestId("where").textContent).toBe("/leaderboard|null");
  });

  it("N1: a row shows the indexer's name when it has one, still linking to the address", async () => {
    fixture.names = { [FIXTURE_ADA]: "ada" };
    challenge();
    const list = await screen.findByTestId("challenge-top");
    const rows = within(list).getAllByRole("listitem");
    expect(rows[0].textContent).toBe("1. ada - 187");
    expect(within(rows[0]).getByRole("link", { name: "ada" }).getAttribute("href")).toBe(`/player/${FIXTURE_ADA}`);
    expect(rows[1].textContent).toMatch(/^2\. 0x/);
  });

  it("fewer than three rows: shows those rows only", async () => {
    fixture.entries.set(FIXTURE_TOURNAMENT, fixture.entries.get(FIXTURE_TOURNAMENT)!.slice(0, 2));
    challenge();
    const list = await screen.findByTestId("challenge-top");
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
  });

  it("no games today: one short line, and the leaderboard link stays", async () => {
    fixture.entries.set(FIXTURE_TOURNAMENT, []);
    challenge();
    const list = await screen.findByTestId("challenge-top");
    expect(within(list).queryAllByRole("listitem")).toHaveLength(0);
    expect(within(list).getByText("No games finished today yet.")).toBeTruthy();
    expect(within(list).getByRole("link", { name: "See the leaderboard" })).toBeTruthy();
  });

  it("the indexer failing: no top 3 and no error, the card's other content stays", async () => {
    fixture.state.down = true;
    challenge();
    await waitFor(() => expect(fixture.requests.length).toBeGreaterThan(0));
    await screen.findByText(/mode challenge/);
    expect(screen.queryByTestId("challenge-top")).toBeNull();
    expect(screen.queryByText(/leaderboard/i)).toBeNull();
    expect(screen.queryByText(/Cannot read from/)).toBeNull();
    expect(top().getByText(/mode challenge/)).toBeTruthy();
  });

  it("no indexer configured: no top 3, no request and no error", async () => {
    challenge({ indexer: null });
    await screen.findByText(/mode challenge/);
    expect(screen.queryByTestId("challenge-top")).toBeNull();
    expect(fixture.requests).toEqual([]);
    expect(screen.queryByText(/Cannot read from/)).toBeNull();
  });
});

describe("Landing states", () => {
  it("the right panel is capped at the dynamic viewport height, with the vh fallback first", async () => {
    const { container } = land({ deployment: notConfigured, account: null });
    const panel = container.querySelector(".landing-right-panel") as HTMLElement;
    expect(panel.style.overflowY).toBe("auto");
    const css = container.querySelector("style")?.textContent ?? "";
    expect(css.indexOf("100vh")).toBeGreaterThan(-1);
    expect(css.indexOf("100dvh")).toBeGreaterThan(css.indexOf("100vh"));
  });

  it("not connected: no write is offered", async () => {
    land({ deployment: notConfigured, account: null });
    expect(screen.getByText("not connected")).toBeTruthy();
    expect(screen.queryByText("Create Account")).toBeNull();
    expect(screen.queryByLabelText("Sponsor amount")).toBeNull();
  });

  it("read-only (no account): the Challenge confirm says Not connected and sends nothing", async () => {
    land({ account: null });
    fireEvent.click(await screen.findByText(/mode challenge/));
    const confirm = screen.getByText("Not connected") as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
  });

  it("without the economy a new Challenge game cannot be started from the dialog: nothing navigates", async () => {
    land({ wrap: noEconomy(configured) });
    await waitFor(() => expect(screen.getByText(/mode challenge: 1 USDC/)).toBeTruthy());
    fireEvent.click(screen.getByText(/mode challenge/));
    const confirm = (await screen.findByText("Buy it in USDC: not deployed here")) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.click(confirm);
    expect(screen.getByTestId("where").textContent).not.toContain("mode=challenge");
  });

  it("with the economy of devnet.json (E3) the Challenge is bought in USDC by stake", async () => {
    land({});
    await waitFor(() => expect(screen.getByText("mode challenge: USDC, by stake")).toBeTruthy());
    expect(screen.getByText("mode tutorial: Free")).toBeTruthy();
    expect(screen.queryByText(/not deployed here/)).toBeNull();
  });

  it("the entry token is compared with the USDC address, not the old Token's", async () => {
    // The fixture's entry token is 0x4. With USDC elsewhere and the old Token at 0x4, the entry is an unknown token.
    const deployment = { ...(configured as object), addresses: { ...configured.addresses, Token: "0x4" } } as unknown as Deployment;
    land({ deployment, wrap: (routes) => <EconomyProvider value={{ deployment: resolveEconomyDeployment({ base: { ...deployment, faucet: "0x99" } }) }}>{routes}</EconomyProvider> });
    await waitFor(() => expect(screen.getByText(/mode challenge: Unknown token/)).toBeTruthy());
    cleanup();
    land({ deployment, wrap: noEconomy(deployment) });
    await waitFor(() => expect(screen.getByText(/mode challenge: 1 USDC/)).toBeTruthy());
    cleanup();
    land({ deployment, wrap: unknownUsdc(deployment) });
    await waitFor(() => expect(screen.getByText(/mode challenge: Unknown token/)).toBeTruthy());
  });

  it("missing token decimals: the entry price is unavailable and cannot be confirmed", async () => {
    const deployment = { ...(configured as object), tokenDecimals: null } as unknown as Deployment;
    land({ deployment, wrap: noEconomy(deployment) });
    await waitFor(() => expect(screen.getByText(/mode challenge: Unavailable/)).toBeTruthy());
    fireEvent.click(screen.getByText(/mode challenge/));
    const confirm = (await screen.findByText("Entry price unavailable")) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect(screen.getByText("balance —")).toBeTruthy();
  });
});

describe("D-25 (E): the player is the connected wallet, with no registration", () => {
  it("a connected wallet is a player at once: named by its short address (no Controller here), no create, no name input", async () => {
    const { client } = land({});
    await screen.findByText(`connected:${PLAYER}`);
    expect(screen.queryByText("Create Account")).toBeNull();
    expect(screen.queryByLabelText("Player name")).toBeNull();
    // Nothing reads a registration: the client has no `player` read any more.
    expect((client as unknown as Record<string, unknown>).player).toBeUndefined();
  });

  it("a long address is shortened", async () => {
    const address = "0x05f3a2b4c6d8e0f1a3b5c7d9e1f3a5b7c9d1e3f5a7b9c1d3e5f7a9b1c3d59a1c";
    land({ account: { address, execute: async () => ({ transaction_hash: "0x0" }) } });
    await screen.findByText("connected:0x5f3a…9a1c");
  });
});

describe("The faucet button", () => {
  it("is offered with a Faucet and calls mint; without one it is not offered", async () => {
    const mint = vi.fn(async () => result);
    renderPage({ page: <LandingPage supportsMint />, path: "/", deployment: { ...(configured as object), faucet: "0x77" } as unknown as Deployment, writer: { mint } });
    fireEvent.click(await screen.findByText("Mint"));
    await waitFor(() => expect(mint).toHaveBeenCalledTimes(1));
    cleanup();
    renderPage({ page: <LandingPage supportsMint />, path: "/", deployment: { ...(configured as object), faucet: "" } as unknown as Deployment, writer: { mint } });
    await screen.findByText(/balance /);
    expect(screen.queryByText("Mint")).toBeNull();
  });
});

describe("The faucet's caps (Faucet, Sepolia)", () => {
  const dep = { ...(configured as object), faucet: "0x77" } as unknown as Deployment;

  it.each([
    ["address", /received everything the faucet gives/],
    ["call", /over what one request may mint/],
  ] as const)("a cap error on the %s is shown in words, not as a raw revert", async (cap, words) => {
    const mint = vi.fn(async () => {
      throw new FaucetCapError(cap, "0x1");
    });
    renderPage({ page: <LandingPage supportsMint />, path: "/", deployment: dep, writer: { mint } });
    fireEvent.click(await screen.findByText("Mint"));
    const shown = await screen.findByText(words);
    expect(shown.textContent).not.toMatch(/Faucet|0x/);
  });
});

describe("D-20: the prize leaves the landing", () => {
  it("no prize, sponsor, claim or reclaim is offered, and the day is read from current_day, not a tournament view", async () => {
    const views = new FakeGameViews();
    views.today = 20_000;
    land({ views, deployment: { ...configured, faucet: undefined } as Deployment, wrap: noEconomy(configured) });
    await screen.findByText(`connected:${PLAYER}`);
    await waitFor(() => expect(views.calls).toContain("current_day"));
    expect(views.calls.some((c) => c.startsWith("tournament"))).toBe(false);
    expect(document.body.textContent).not.toMatch(/prize|sponsor|claim/i);
    expect(screen.queryByLabelText("Sponsor amount")).toBeNull();
  });
});
