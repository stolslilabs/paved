// @vitest-environment jsdom
import React from "react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AppTree, isOffChainRoute } from "../src/AppTree";
import type { ChainBoundary } from "../src/AppTree";
import { ChainProviders } from "../src/components/WalletProvider";

// W2a: the chain factories throw, and the off-chain routes must still work.
const { built, boom, chainRoute, probes } = vi.hoisted(() => {
  const built: string[] = [];
  // `probe()` of the controller connector: it runs when the wallet provider is mounted with a controller network.
  const probes = { count: 0 };
  // On a chain route the factories are the real ones; they are only watched.
  const chainRoute = { on: false };
  return {
    built,
    chainRoute,
    probes,
    boom: (name: string, real?: (...args: unknown[]) => unknown) => (...args: unknown[]) => {
      built.push(name);
      if (chainRoute.on && real) return real(...args);
      throw new Error(`${name} was called on an off-chain route`);
    },
  };
});
vi.mock("@paved/chain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@paved/chain")>();
  return {
    ...actual,
    createPavedClient: boom("createPavedClient", actual.createPavedClient as never),
    createControllerConnector: boom("createControllerConnector", (() => ({
      probe: async () => (probes.count++, undefined),
      connect: async () => {
        throw new Error("not used");
      },
      disconnect: async () => {},
    })) as never),
    createIndexerClient: boom("createIndexerClient", actual.createIndexerClient as never),
  };
});
vi.mock("@paved/renderer/react", () => ({ GameCanvas: () => <div data-testid="canvas" /> }));
vi.mock("@paved/ui", () => {
  const state = { orientation: 1, strategyMode: false, x: 0, y: 0, selectedTile: null, setOrientation: () => {}, setSelectedTile: () => {}, setX: () => {}, setY: () => {} };
  return {
    useUIStore: (select: (s: { loading: boolean }) => unknown) => select({ loading: false }),
    useGameStore: Object.assign((select: (s: typeof state) => unknown) => select(state), { getState: () => state }),
    IngameStatus: ({ score }: { score: number }) => <output data-testid="status">{score}</output>,
    GameCompleteDialog: () => null,
    ActionBar: () => <div data-testid="bar" />,
  };
});
vi.mock("../src/pages/Landing", () => ({ LandingPage: () => <main>landing</main> }));
vi.mock("../src/pages/Leaderboard", () => ({ LeaderboardPage: () => <main>leaderboard</main> }));
vi.mock("../src/pages/Player", () => ({ PlayerPage: () => <main>player</main> }));
vi.mock("../src/pages/Quests", () => ({ QuestsPage: () => <main>quests</main> }));
vi.mock("../src/pages/Economy", () => ({ EconomyPage: () => <main>economy</main> }));

beforeEach(() => {
  built.length = 0;
  probes.count = 0;
  chainRoute.on = false;
  localStorage.clear();
});
afterEach(cleanup);

/**
 * A chain side on a configured controller network (Sepolia with a complete deployment): on a chain route the wallet provider
 * builds the paved client and the controller connector and runs its `probe()`, and the indexer client is built too.
 */
const CONTRACTS = { Daily: { address: "0x2" }, Setup: { address: "0x3" }, Token: { address: "0x4" } };
const FILES = { "x/sepolia.json": { default: { rpc_url: "http://sepolia/rpc", chain_id: "0x534e5f5345504f4c4941", contracts: CONTRACTS } } };
const ENV = { VITE_NETWORK: "sepolia" };
const ALL = ["createPavedClient", "createControllerConnector", "createIndexerClient"];
const Chain: ChainBoundary = ({ children }) => (
  <ChainProviders env={ENV} files={FILES}>
    {children}
  </ChainProviders>
);
const at = (route: string) => ({ children }: { children?: React.ReactNode }) => <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>;

describe("off-chain routes build no chain client (W2a)", () => {
  it("recognises the Tutorial and Training, and nothing else", () => {
    expect(isOffChainRoute({ pathname: "/tutorial", search: "" })).toBe(true);
    expect(isOffChainRoute({ pathname: "/game", search: "?mode=training" })).toBe(true);
    expect(isOffChainRoute({ pathname: "/game", search: "?mode=daily&id=3" })).toBe(false);
    expect(isOffChainRoute({ pathname: "/game", search: "" })).toBe(false);
    expect(isOffChainRoute({ pathname: "/", search: "" })).toBe(false);
    expect(isOffChainRoute({ pathname: "/leaderboard", search: "" })).toBe(false);
    // The tutorial's claim (U2) writes to Setup: a chain route, unlike the tutorial itself.
    expect(isOffChainRoute({ pathname: "/tutorial/claim", search: "" })).toBe(false);
  });

  it("/tutorial/claim is a chain route: it mounts the providers, with the connection banner", () => {
    chainRoute.on = true;
    render(<AppTree Router={at("/tutorial/claim")} Chain={Chain} />);
    expect(screen.getByRole("heading", { name: "Claim your achievement" })).toBeTruthy();
    expect(screen.getByText(/Read only: connect to play/)).toBeTruthy();
    for (const name of ALL) expect(built).toContain(name);
  });

  it("/tutorial works with the chain factories throwing", () => {
    render(<AppTree Router={at("/tutorial")} Chain={Chain} />);
    expect(screen.getByRole("heading", { name: /Tutorial: step 1 of/ })).toBeTruthy();
    expect(built).toEqual([]);
    expect(probes.count).toBe(0);
    expect(screen.queryByText(/Read only/)).toBeNull(); // no connection banner off chain
  });

  it("/game?mode=training works with the chain factories throwing", () => {
    render(<AppTree Router={at("/game?mode=training")} Chain={Chain} />);
    expect(screen.getByTestId("status")).toBeTruthy();
    expect(built).toEqual([]);
    expect(probes.count).toBe(0);
  });

  it("the Cartridge notice stays on an off-chain route", () => {
    render(<AppTree Router={at("/tutorial")} Chain={Chain} />);
    expect(screen.getAllByRole("link", { name: "Third-party notices" })).toHaveLength(1);
  });

  it("a chain route mounts the providers as before, with the connection banner", () => {
    chainRoute.on = true;
    render(<AppTree Router={at("/")} Chain={Chain} />);
    expect(screen.getByText("landing")).toBeTruthy();
    expect(screen.getByText(/Read only: connect to play/)).toBeTruthy(); // the banner, with the controller's Connect
    // the positive control: the same setup builds all three clients and probes here
    for (const name of ALL) expect(built).toContain(name);
    expect(probes.count).toBeGreaterThan(0);
  });

  it("leaving the Tutorial for a chain route mounts the providers then, and the banner shows", () => {
    function Go() {
      const navigate = useNavigate();
      return <button type="button" onClick={() => navigate("/leaderboard")}>go</button>;
    }
    render(
      <AppTree
        Router={({ children }) => (
          <MemoryRouter initialEntries={["/tutorial"]}>
            <Go />
            {children}
          </MemoryRouter>
        )}
        Chain={Chain}
      />,
    );
    expect(screen.queryByText(/Read only/)).toBeNull();
    expect(built).toEqual([]);
    expect(probes.count).toBe(0);
    chainRoute.on = true;
    fireEvent.click(screen.getByText("go"));
    expect(screen.getByText("leaderboard")).toBeTruthy();
    expect(screen.getByText(/Read only: connect to play/)).toBeTruthy();
    for (const name of ALL) expect(built).toContain(name);
    expect(probes.count).toBeGreaterThan(0);
  });
});
