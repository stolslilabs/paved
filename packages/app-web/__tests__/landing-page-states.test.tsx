// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { FakeGameViews, FaucetCapError } from "@paved/chain";
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

describe("The faucet button", () => {
  it("is offered with a MockUSDC and calls mint; without one it is not offered", async () => {
    const mint = vi.fn(async () => result);
    renderPage({ page: <LandingPage supportsMint />, path: "/", deployment: { ...(configured as object), mockUsdc: "0x77" } as unknown as Deployment, writer: { mint } });
    fireEvent.click(await screen.findByText("Mint"));
    await waitFor(() => expect(mint).toHaveBeenCalledTimes(1));
    cleanup();
    renderPage({ page: <LandingPage supportsMint />, path: "/", deployment: { ...(configured as object), mockUsdc: "" } as unknown as Deployment, writer: { mint } });
    await screen.findByText(/balance /);
    expect(screen.queryByText("Mint")).toBeNull();
  });
});

describe("The faucet's caps (MockUSDC, Sepolia)", () => {
  const dep = { ...(configured as object), mockUsdc: "0x77" } as unknown as Deployment;

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
    expect(shown.textContent).not.toMatch(/MockUSDC|0x/);
  });
});

describe("D-20: the prize leaves the landing", () => {
  it("no prize, sponsor, claim or reclaim is offered, and the day is read from current_day, not a tournament view", async () => {
    const views = new FakeGameViews();
    views.today = 20_000;
    land({ views, deployment: { ...configured, mockUsdc: undefined } as Deployment, wrap: noEconomy(configured) });
    await screen.findByText("connected:Zed");
    await waitFor(() => expect(views.calls).toContain("current_day"));
    expect(views.calls.some((c) => c.startsWith("tournament"))).toBe(false);
    expect(document.body.textContent).not.toMatch(/prize|sponsor|claim/i);
    expect(screen.queryByLabelText("Sponsor amount")).toBeNull();
  });
});
