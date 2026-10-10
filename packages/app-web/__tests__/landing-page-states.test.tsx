// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { FakeGameViews, NoPrizeDayError, NothingToReclaimError, ReclaimAmountChangedError, RewardChangedError, emptyTournament } from "@paved/chain";
import { resolveEconomyDeployment, type Deployment } from "@paved/chain";
import { EconomyProvider } from "../src/utils/economy-context";
import { LandingPage } from "../src/pages/Landing";
import { configured, notConfigured, renderPage, PLAYER } from "./helpers/page-fixtures";

vi.mock("@paved/ui", () => ({
  LandingScreen: ({ connected, playerName, onSpawn, gameModes }: any) => (
    <div>
      <span>{connected ? `connected:${playerName ?? "new"}` : "not connected"}</span>
      {connected && !playerName && (
        <button type="button" onClick={onSpawn}>
          Create Account
        </button>
      )}
      {gameModes.map((m: any) => (
        <button key={m.mode} type="button" onClick={m.onPress}>
          {`mode ${m.mode}: ${m.entryFee}`}
        </button>
      ))}
    </div>
  ),
  ModeDetailDialog: ({ children }: any) => <div role="dialog">{children}</div>,
  ModeDetailDialogStat: ({ children }: any) => <div>{children}</div>,
  TokenPanel: ({ error, balanceLabel }: any) => (
    <div>
      <span>{`balance ${balanceLabel}`}</span>
      {error && <div role="alert">{error}</div>}
    </div>
  ),
}));

afterEach(cleanup);

const land = (opts: Partial<Parameters<typeof renderPage>[0]> = {}) => renderPage({ page: <LandingPage />, path: "/", ...opts });
/**
 * An economy that is not deployed (the build's own reads the real devnet.json, which has the economy since E3), but whose USDC
 * address is known: the entry token is compared with it, not with the old Token (`addresses.Token`, "0x4" here too).
 */
const noEconomy = (deployment: Deployment) => (routes: React.ReactElement) => (
  <EconomyProvider value={{ deployment: resolveEconomyDeployment({ base: deployment, env: { usdc: "0x4" } }) }}>{routes}</EconomyProvider>
);
/** Neither an economy nor a USDC address. */
const unknownUsdc = (deployment: Deployment) => (routes: React.ReactElement) => (
  <EconomyProvider value={{ deployment: resolveEconomyDeployment({ base: deployment }) }}>{routes}</EconomyProvider>
);
const result = { transactionHash: "0x1", events: [] };

describe("Landing states", () => {
  it("not connected: no write is offered", async () => {
    land({ deployment: notConfigured, account: null });
    expect(screen.getByText("not connected")).toBeTruthy();
    expect(screen.queryByText("Create Account")).toBeNull();
    expect(screen.queryByLabelText("Sponsor amount")).toBeNull();
  });

  it("read-only (no account): the Daily confirm says Not connected and sends nothing", async () => {
    land({ account: null });
    fireEvent.click(await screen.findByText(/mode daily/));
    const confirm = screen.getByText("Not connected") as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
  });

  it("without the economy a new Daily game cannot be started from the dialog: nothing navigates", async () => {
    land({ wrap: noEconomy(configured) });
    await waitFor(() => expect(screen.getByText(/mode daily: 1 USDC/)).toBeTruthy());
    fireEvent.click(screen.getByText(/mode daily/));
    const confirm = (await screen.findByText("Buy it in USDC: not deployed here")) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.click(confirm);
    expect(screen.getByTestId("where").textContent).not.toContain("mode=daily");
  });

  it("with the economy of devnet.json (E3) the Daily is bought in USDC by stake", async () => {
    land({});
    await waitFor(() => expect(screen.getByText("mode daily: USDC, by stake")).toBeTruthy());
    expect(screen.getByText("mode tutorial: Free")).toBeTruthy();
    expect(screen.queryByText(/not deployed here/)).toBeNull();
  });

  it("the entry token is compared with the USDC address, not the old Token's", async () => {
    // The fixture's entry token is 0x4. With USDC elsewhere and the old Token at 0x4, the entry is an unknown token.
    const deployment = { ...(configured as object), addresses: { ...configured.addresses, Token: "0x4" } } as unknown as Deployment;
    land({ deployment, wrap: (routes) => <EconomyProvider value={{ deployment: resolveEconomyDeployment({ base: deployment, env: { usdc: "0x99" } }) }}>{routes}</EconomyProvider> });
    await waitFor(() => expect(screen.getByText(/mode daily: Unknown token/)).toBeTruthy());
    cleanup();
    land({ deployment, wrap: noEconomy(deployment) });
    await waitFor(() => expect(screen.getByText(/mode daily: 1 USDC/)).toBeTruthy());
    cleanup();
    land({ deployment, wrap: unknownUsdc(deployment) });
    await waitFor(() => expect(screen.getByText(/mode daily: Unknown token/)).toBeTruthy());
  });

  it("missing token decimals: the entry price is unavailable and cannot be confirmed", async () => {
    const deployment = { ...(configured as object), tokenDecimals: null } as unknown as Deployment;
    land({ deployment, wrap: noEconomy(deployment) });
    await waitFor(() => expect(screen.getByText(/mode daily: Unavailable/)).toBeTruthy());
    fireEvent.click(screen.getByText(/mode daily/));
    const confirm = (await screen.findByText("Entry price unavailable")) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect(screen.getByText("balance —")).toBeTruthy();
  });
});

describe("Player name at account creation", () => {
  const setup = () => {
    const createPlayer = vi.fn(async () => result);
    land({ player: null, writer: { createPlayer } });
    return createPlayer;
  };
  const create = async () => fireEvent.click(await screen.findByText("Create Account"));

  it("an empty or too long name is refused before sending", async () => {
    const createPlayer = setup();
    await create();
    expect((await screen.findByText("A name is 1 to 31 ASCII characters")).getAttribute("role")).toBe("alert");
    fireEvent.change(screen.getByLabelText("Player name"), { target: { value: "é" } });
    await create();
    expect(createPlayer).not.toHaveBeenCalled();
  });

  it("a name of 32 characters is refused before sending, and one of 31 is sent", async () => {
    const createPlayer = setup();
    fireEvent.change(await screen.findByLabelText("Player name"), { target: { value: "a".repeat(32) } });
    await create();
    expect((await screen.findByText("A name is 1 to 31 ASCII characters")).getAttribute("role")).toBe("alert");
    expect(createPlayer).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Player name"), { target: { value: "a".repeat(31) } });
    await create();
    await waitFor(() => expect(createPlayer).toHaveBeenCalledWith("a".repeat(31), { mintTestToken: false }));
  });

  it("a valid name is sent as typed", async () => {
    const createPlayer = setup();
    fireEvent.change(await screen.findByLabelText("Player name"), { target: { value: "Zed Zed" } });
    await create();
    await waitFor(() => expect(createPlayer).toHaveBeenCalledWith("Zed Zed", { mintTestToken: false }));
  });
});

describe("The faucet at account creation", () => {
  const create = async () => fireEvent.click(await screen.findByText("Create Account"));
  const landMint = (deployment: Deployment, createPlayer: ReturnType<typeof vi.fn>) =>
    renderPage({ page: <LandingPage supportsMint />, path: "/", player: null, deployment, writer: { createPlayer } });

  it("asks for the faucet only when the deployment has a MockUSDC", async () => {
    const createPlayer = vi.fn(async () => result);
    landMint({ ...(configured as object), mockUsdc: "0x77" } as unknown as Deployment, createPlayer);
    fireEvent.change(await screen.findByLabelText("Player name"), { target: { value: "Zed" } });
    await create();
    await waitFor(() => expect(createPlayer).toHaveBeenCalledWith("Zed", { mintTestToken: true }));
  });

  it("a missing MockUSDC never blocks account creation: the account is created without a mint", async () => {
    const createPlayer = vi.fn(async () => result);
    landMint({ ...(configured as object), mockUsdc: "" } as unknown as Deployment, createPlayer);
    fireEvent.change(await screen.findByLabelText("Player name"), { target: { value: "Zed" } });
    await create();
    await waitFor(() => expect(createPlayer).toHaveBeenCalledWith("Zed", { mintTestToken: false }));
  });
});

describe("Claiming a prize", () => {
  const finished = { mode: "daily", gameId: 1, startTime: 1, tournamentId: 5, over: true, score: 9, countedTournamentId: 5 };
  const setup = (tournament = {}, claim = vi.fn(async () => result)) => {
    const views = new FakeGameViews();
    views.tournaments.set(5, { ...emptyTournament(5), over: true, prize: 600n, top1PlayerId: PLAYER, top1Score: 9, top2PlayerId: "0x0", top3PlayerId: "0x0", ...tournament });
    views.setGame({ mode: "daily", gameId: 1 }, {
      game: { id: 1, playerId: PLAYER, mode: 1, seed: "0x1", score: 9, over: true, tileCount: 3, placedCount: 3, discardedCount: 0, tileId: 0, plan: 0, remainingCount: 0, deckSize: 38, startTime: 1, endTime: 2, tournamentId: 5 },
      tiles: [], builder: { gameId: 1, playerId: PLAYER, tileId: 0, plan: 0, placedCount: 0, availableCount: 7 }, characters: [],
    });
    land({ views, games: [finished], writer: { claim } });
    return { claim, views };
  };

  it("lists the claimable rank with its reward; one click only asks, Confirm sends the confirmed reward", async () => {
    const { claim } = setup();
    await screen.findByText(/Tournament 5, rank 1: /);
    const claimButton = await screen.findByText("Claim");
    fireEvent.click(claimButton);
    expect(claim).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Confirm" })).toBeTruthy();
    fireEvent.click(screen.getByText("Confirm claim"));
    await waitFor(() => expect(claim).toHaveBeenCalledTimes(1));
    expect(claim).toHaveBeenCalledWith(5, 1, { confirmedReward: 600n });
  });

  it("a refused claim re-reads the prizes: a rank claimed meanwhile leaves no stale row", async () => {
    const refused = vi.fn(async () => {
      views.tournaments.set(5, { ...views.tournaments.get(5)!, top1Claimed: true }); // claimed elsewhere
      throw new RewardChangedError(600n, 700n);
    });
    const { views } = setup({}, refused);
    fireEvent.click(await screen.findByText("Claim"));
    fireEvent.click(screen.getByText("Confirm claim"));
    await waitFor(() => expect(refused).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText(/Tournament 5, rank 1: /)).toBeNull());
  });

  it("nothing to claim when the rank is already claimed", async () => {
    setup({ top1Claimed: true });
    await screen.findByText("balance 5 USDC");
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByText("Claim")).toBeNull();
  });
});

describe("Reclaiming a prize nobody ranked for (P-37)", () => {
  const unranked = { ...emptyTournament(5), over: true, prize: 3_000_000_000_000_000_000n };
  const setup = (options: { tournament?: object; part?: bigint; returned?: bigint; reclaim?: ReturnType<typeof vi.fn> } = {}) => {
    const reclaim = options.reclaim ?? vi.fn(async () => result);
    const views = new FakeGameViews();
    views.tournaments.set(5, { ...unranked, ...options.tournament });
    const part = options.part ?? 2n * 10n ** 18n;
    land({ views, writer: { reclaim }, sponsorship: { days: [5], reclaimable: () => part, returned: () => options.returned ?? 0n } });
    return { reclaim, views };
  };

  it("lists the sponsor's part; one click only asks with the amount, Confirm sends the confirmed amount", async () => {
    const { reclaim } = setup();
    await screen.findByText("Tournament 5: your part, 2 USDC");
    fireEvent.click(screen.getByText("Reclaim"));
    expect(reclaim).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Confirm" }).textContent).toContain("Take back 2 USDC, your part of tournament 5's prize? Nobody ranked in that day.");
    fireEvent.click(screen.getByText("Confirm reclaim"));
    await waitFor(() => expect(reclaim).toHaveBeenCalledTimes(1));
    expect(reclaim).toHaveBeenCalledWith(5, { confirmedAmount: 2n * 10n ** 18n });
  });

  it("what already went back comes from the Reclaimed events, beside the part left", async () => {
    setup({ returned: 10n ** 18n });
    await screen.findByText(/Tournament 5: your part, 2 USDC \(1 USDC already went back to sponsors\)/);
  });

  it("a ranked day offers no reclaim: its prize is the ranks'", async () => {
    setup({ tournament: { top1PlayerId: "0xa1", top1Score: 9 } });
    await screen.findByText("balance 5 USDC");
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByText("Reclaim")).toBeNull();
  });

  it("a day not over, or a part already taken back, offers no reclaim", async () => {
    setup({ tournament: { over: false } });
    await screen.findByText("balance 5 USDC");
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByText("Reclaim")).toBeNull();
    cleanup();
    setup({ part: 0n });
    await screen.findByText("balance 5 USDC");
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByText("Reclaim")).toBeNull();
  });

  it("a refused reclaim shows its reason and re-reads: a part taken back meanwhile leaves no stale row", async () => {
    let part = 2n * 10n ** 18n;
    const refused = vi.fn(async () => {
      part = 0n;
      throw new ReclaimAmountChangedError(2n * 10n ** 18n, 0n);
    });
    const views = new FakeGameViews();
    views.tournaments.set(5, unranked);
    land({ views, writer: { reclaim: refused }, sponsorship: { days: [5], reclaimable: () => part } });
    fireEvent.click(await screen.findByText("Reclaim"));
    fireEvent.click(screen.getByText("Confirm reclaim"));
    expect((await screen.findByText("The amount to reclaim changed: confirm again")).getAttribute("role")).toBe("alert");
    await waitFor(() => expect(screen.queryByText(/Tournament 5: your part/)).toBeNull());
  });
});

describe("Claim reverts are clear states", () => {
  it("a top-3 claim on a day with no sponsor says there is no prize, not a raw revert", async () => {
    const claim = vi.fn(async () => {
      throw new NoPrizeDayError("0x1");
    });
    const views = new FakeGameViews();
    views.tournaments.set(5, { ...emptyTournament(5), over: true, prize: 600n, top1PlayerId: PLAYER, top1Score: 9, top2PlayerId: "0x0", top3PlayerId: "0x0" });
    views.setGame({ mode: "daily", gameId: 1 }, {
      game: { id: 1, playerId: PLAYER, mode: 1, seed: "0x1", score: 9, over: true, tileCount: 3, placedCount: 3, discardedCount: 0, tileId: 0, plan: 0, remainingCount: 0, deckSize: 38, startTime: 1, endTime: 2, tournamentId: 5 },
      tiles: [], builder: { gameId: 1, playerId: PLAYER, tileId: 0, plan: 0, placedCount: 0, availableCount: 7 }, characters: [],
    });
    land({ views, games: [{ mode: "daily", gameId: 1, startTime: 1, tournamentId: 5, over: true, score: 9, countedTournamentId: 5 }], writer: { claim } });
    fireEvent.click(await screen.findByText("Claim"));
    fireEvent.click(screen.getByText("Confirm claim"));
    expect((await screen.findByText("This day has no prize: nobody sponsored it, so there is nothing to claim.")).getAttribute("role")).toBe("alert");
  });

  it("a reclaim on a ranked day says there is nothing to reclaim", async () => {
    const reclaim = vi.fn(async () => {
      throw new NothingToReclaimError("This day was ranked: its prize goes to the ranks, so there is nothing to reclaim.");
    });
    const views = new FakeGameViews();
    views.tournaments.set(5, { ...emptyTournament(5), over: true, prize: 600n });
    land({ views, writer: { reclaim }, sponsorship: { days: [5], reclaimable: () => 600n } });
    fireEvent.click(await screen.findByText("Reclaim"));
    fireEvent.click(screen.getByText("Confirm reclaim"));
    expect((await screen.findByText(/This day was ranked.*nothing to reclaim/)).getAttribute("role")).toBe("alert");
  });
});

describe("Sponsoring", () => {
  const setup = () => {
    const sponsor = vi.fn(async () => result);
    land({ writer: { sponsor } });
    return sponsor;
  };

  it("an invalid amount cannot be submitted", async () => {
    const sponsor = setup();
    const input = await screen.findByLabelText("Sponsor amount");
    for (const bad of ["", "0", "-1", "1.0000000000000000001", "abc"]) {
      fireEvent.change(input, { target: { value: bad } });
      expect((screen.getByText("Sponsor") as HTMLButtonElement).disabled).toBe(true);
    }
    expect(sponsor).not.toHaveBeenCalled();
  });

  it("the amount is shown, nothing is sent before Confirm, and the amount is the one confirmed", async () => {
    const sponsor = setup();
    fireEvent.change(await screen.findByLabelText("Sponsor amount"), { target: { value: "1.5" } });
    fireEvent.click(screen.getByText("Sponsor"));
    expect(sponsor).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Confirm" }).textContent).toContain("Pay 1.5 USDC into today's prize?");
    fireEvent.click(screen.getByText("Confirm sponsor"));
    await waitFor(() => expect(sponsor).toHaveBeenCalledTimes(1));
    expect(sponsor).toHaveBeenCalledWith(15n * 10n ** 17n, { confirmedAmount: 15n * 10n ** 17n });
  });

  it("an edit after the ask is passed as a different amount for the writer to refuse; Cancel sends nothing", async () => {
    const sponsor = setup();
    const input = await screen.findByLabelText("Sponsor amount");
    fireEvent.change(input, { target: { value: "1" } });
    fireEvent.click(screen.getByText("Sponsor"));
    fireEvent.change(input, { target: { value: "2" } });
    fireEvent.click(screen.getByText("Confirm sponsor"));
    await waitFor(() => expect(sponsor).toHaveBeenCalledWith(2n * 10n ** 18n, { confirmedAmount: 10n ** 18n }));
    fireEvent.click(screen.getByText("Sponsor"));
    fireEvent.click(screen.getByText("Cancel"));
    expect(sponsor).toHaveBeenCalledTimes(1);
  });
});
