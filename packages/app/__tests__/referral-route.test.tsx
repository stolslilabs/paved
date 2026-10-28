import { slow } from "../test-slow";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IndexerClient } from "@paved/chain";
import { FIXTURE_ADA } from "@paved/chain/testing";
import { App } from "../src/App";
import type { DataSources, GameSigner } from "../src/data";
import { earningsOf, referralLink } from "../src/data/referral";
import { queryClient } from "../src/lib/query-client";
import { createTestRouter } from "../src/routes/router";
import { withRef } from "../src/routes/ref";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { fakeSources } from "./data-fakes";
import { preloadPages } from "./route-helpers";
import { fakeWallet } from "./wallet-fakes";

// `/referral` (P10) on the fixture indexer (`/v1/players/:id/referrals`, IX-COBBLES2) and `FakeEconomy`'s split. The player
// id is the signer's address: Ada of the fixture has 3 games (1.20 USDC) and 1 pack (0.45 USDC) through her link.

const PLAYER = FIXTURE_ADA;
const SHORT = `0x${BigInt(PLAYER).toString(16)}`;

function setup(options: { viewer?: string | "guest" } = {}) {
  const f = fakeSources();
  const viewer = options.viewer ?? PLAYER;
  const signer = viewer === "guest" ? null : ({ address: viewer } as unknown as GameSigner);
  const sources: DataSources = { ...f.sources, signer };
  return { ...f, sources };
}

function open(s: ReturnType<typeof setup>, path = "/referral", wallet = fakeWallet({ address: PLAYER })) {
  const router = createTestRouter(path);
  render(<App router={router} sources={s.sources} connector={wallet.load} />);
  return { router, wallet };
}

const earned = () => screen.findByRole("region", { name: "Earned" }, { timeout: slow(5000) });

// The page's module loaded before the route asks for it: on a loaded machine its first transform outlasted the wait.
// The referral is a sheet over Settings (BACK-RULE #783): Settings' module and the shell's sheets load with it.
preloadPages("referral", "settings");

beforeEach(() => {
  queryClient.clear();
  localStorage.clear();
  resetWelcomedForTests();
  markWelcomed();
});
afterEach(() => {
  queryClient.clear();
  resetWelcomedForTests();
  vi.restoreAllMocks();
});

describe("/referral (P10)", { timeout: slow(20_000) }, () => {
  it("shows the player's link with ?ref= and their address, and what it earned: games and packs", async () => {
    const s = setup();
    open(s);
    const region = await earned();
    expect(screen.getByLabelText("Your referral link")).toHaveTextContent(`${window.location.origin}/?ref=${SHORT}`);
    await waitFor(() => expect(region).toHaveTextContent("1.65USDC"));
    expect(region).toHaveTextContent("4 purchases");
    const [games, packs] = within(region).getAllByRole("listitem");
    expect(games).toHaveTextContent(/Challenge games\s*1.20USDC\s*3 games/);
    expect(packs).toHaveTextContent(/Cobbles packs\s*0.45USDC\s*1 pack/);
    // The share from the chain's split (FakeEconomy: 500 bps).
    expect(screen.getByRole("region", { name: "Your link" })).toHaveTextContent("You get 5% of the price");
    expect(s.fixture.requests).toContain(`/v1/players/${PLAYER}/referrals`);
  });

  it("the link keeps ?ref= as every link of the app does, and reads back as the referrer", () => {
    const link = referralLink("https://paved.example/", "0x0000005f1");
    expect(link).toBe("https://paved.example/?ref=0x5f1");
    const url = new URL(link);
    expect(url.searchParams.get("ref")).toBe("0x5f1");
    expect(withRef("/play/challenge", url.search)).toBe("/play/challenge?ref=0x5f1");
  });

  it("Copy writes the link to the clipboard and says so", async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    open(setup());
    await earned();
    await userEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/?ref=${SHORT}`);
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
  });

  it("Share opens the browser's share sheet when it has one, and is absent otherwise", async () => {
    const share = vi.fn(async () => {});
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    open(setup());
    await earned();
    await userEvent.click(screen.getByRole("button", { name: "Share" }));
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: `${window.location.origin}/?ref=${SHORT}` }));
    Reflect.deleteProperty(navigator, "share");
  });

  it("no Share without a share sheet", async () => {
    open(setup());
    await earned();
    expect(screen.queryByRole("button", { name: "Share" })).toBeNull();
  });

  it("none yet: a player that referred nobody", async () => {
    const s = setup();
    s.fixture.referrals.clear();
    open(s);
    expect(await screen.findByText(/No purchase through your link yet/, {}, { timeout: slow(5000) })).toBeInTheDocument();
  });

  it("loading: the earnings' shape while the indexer answers, the link already there", async () => {
    const s = setup();
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const gated = (async (input: RequestInfo | URL) => (await gate, s.fixture.fetch(input))) as typeof fetch;
    s.sources.indexer = new IndexerClient({ url: "http://indexer.test/", fetch: gated });
    open(s);
    expect(await screen.findByRole("status", { name: "Loading the earnings" }, { timeout: slow(5000) })).toBeInTheDocument();
    expect(screen.getByLabelText("Your referral link")).toBeInTheDocument();
    release();
    await waitFor(() => expect(screen.queryByRole("status", { name: "Loading the earnings" })).toBeNull());
  });

  it("a failed indexer read never blocks the link; Retry reads again", async () => {
    const s = setup();
    s.fixture.state.down = true;
    open(s);
    const region = await earned();
    const alert = await within(region).findByRole("alert", {}, { timeout: slow(8000) });
    expect(alert).toHaveTextContent("The earnings cannot be read");
    expect(screen.getByLabelText("Your referral link")).toHaveTextContent(`/?ref=${SHORT}`);
    s.fixture.state.down = false;
    await userEvent.click(within(region).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(region).toHaveTextContent("1.65USDC"));
  });

  it("a guest gets no link and is asked to connect; nothing is read for them", async () => {
    const s = setup({ viewer: "guest" });
    const { wallet } = open(s);
    await waitFor(() => expect(wallet.calls).toContain("probe"));
    const notice = (await screen.findByText("Connect to get your link", {}, { timeout: slow(5000) })).closest("[role=status]") as HTMLElement;
    expect(screen.queryByLabelText("Your referral link")).toBeNull();
    expect(s.fixture.requests.filter((r) => r.endsWith("/referrals"))).toEqual([]);
    await userEvent.click(within(notice).getByRole("button", { name: "Connect" }));
    await waitFor(() => expect(wallet.calls).toContain("connect"));
  });

  it("the indexer's answer reads as exact bigints of USDC", () => {
    const big = "123456789012345678901234567890";
    expect(earningsOf({ playerId: PLAYER, total: big, games: { count: 1, total: big }, packs: { count: 0, total: "0" } })).toEqual({
      total: BigInt(big),
      games: { count: 1, total: BigInt(big) },
      packs: { count: 0, total: 0n },
    });
  });
});
