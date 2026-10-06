// @vitest-environment jsdom
import React, { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { PavedProvider } from "@paved/chain";
import type { Deployment, PavedClient } from "@paved/chain";
import { GamePage } from "../src/pages/Game";

// The page's start path needs neither the scene nor the overlays.
vi.mock("@paved/renderer/react", () => ({ GameCanvas: () => null }));
vi.mock("@paved/ui", () => ({
  IngameStatus: () => null,
  GameCompleteDialog: () => null,
  ActionBar: () => null,
  SpotSelector: () => null,
  useGameStore: () => null,
}));

const deployment = { configured: true } as unknown as Deployment;
const account = { address: "0x1", execute: async () => ({ transaction_hash: "0x0" }) };

function Where() {
  const l = useLocation();
  return <output data-testid="where">{`${l.pathname}${l.search}|${JSON.stringify(l.state)}`}</output>;
}

function GoHome() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate("/")}>
      browser back
    </button>
  );
}

function setup(opts: { state?: unknown; url?: string; spawn?: () => Promise<{ gameId: number }>; account?: typeof account | null; strict?: boolean }) {
  const spawn = vi.fn(opts.spawn ?? (async () => ({ gameId: 9 })));
  const playerGames = vi.fn(async () => []);
  const client = {
    views: {},
    events: { playerGames },
    writer: () => ({ spawn }),
  } as unknown as PavedClient;
  const tree = (acc: typeof account | null) => {
    const inner = (
      <PavedProvider deployment={deployment} account={acc} client={client}>
        <MemoryRouter initialEntries={[{ pathname: "/game", search: opts.url ?? "?mode=daily", state: opts.state }]}>
          <Where />
          <GoHome />
          <Routes>
            <Route path="/game" element={<GamePage />} />
            <Route path="/" element={<span>landing</span>} />
          </Routes>
        </MemoryRouter>
      </PavedProvider>
    );
    return opts.strict ? <StrictMode>{inner}</StrictMode> : inner;
  };
  const utils = render(tree(opts.account === undefined ? account : opts.account));
  return { spawn, playerGames, rerenderWith: (acc: typeof account | null) => utils.rerender(tree(acc)) };
}

const consent = { start: true, confirmedAmount: "10" };
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("GamePage start", () => {
  it("says 'Spawning game...' with Back disabled while a paid start is in flight, never 'No game selected'", async () => {
    let finish!: (v: { gameId: number }) => void;
    const { spawn } = setup({ state: consent, spawn: () => new Promise((r) => (finish = r)) });
    await waitFor(() => expect(spawn).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Spawning game...")).toBeTruthy();
    expect(screen.queryByText("No game selected")).toBeNull();
    expect((screen.getByText("Back") as HTMLButtonElement).disabled).toBe(true);
    // The consent was cleared before the spawn was sent.
    expect(screen.getByTestId("where").textContent).toMatch(/\|null$/);
    finish({ gameId: 9 });
  });

  it("clears the consent at mount even when no writer is ready, and sends nothing", async () => {
    const { spawn } = setup({ state: consent, account: null });
    await waitFor(() => expect(screen.getByTestId("where").textContent).toMatch(/\|null$/));
    expect(screen.getByText("Not connected: no playing account")).toBeTruthy();
    expect(spawn).not.toHaveBeenCalled();
  });

  it("spawns once and opens the game", async () => {
    const { spawn } = setup({ state: consent });
    await waitFor(() => expect(screen.getByTestId("where").textContent).toMatch(/id=9/));
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it("a failed start shows its error, Back enabled, and does not retry", async () => {
    const { spawn } = setup({ state: consent, spawn: async () => Promise.reject(new Error("boom")) });
    await waitFor(() => expect(screen.getByText("Cannot start a game: boom")).toBeTruthy());
    expect((screen.getByText("Back") as HTMLButtonElement).disabled).toBe(false);
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it("no consent: 'No game selected' and nothing sent", async () => {
    const { spawn } = setup({ state: null });
    expect(screen.getByText("No game selected")).toBeTruthy();
    expect(spawn).not.toHaveBeenCalled();
  });

  it("a writer that becomes ready later spawns exactly once, then opens the game", async () => {
    const { spawn, rerenderWith } = setup({ state: consent, account: null });
    await waitFor(() => expect(screen.getByTestId("where").textContent).toMatch(/\|null$/));
    expect(spawn).not.toHaveBeenCalled();
    rerenderWith(account);
    await waitFor(() => expect(screen.getByTestId("where").textContent).toMatch(/id=9/));
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it("under StrictMode with a ready writer, spawn is called once", async () => {
    const { spawn } = setup({ state: consent, strict: true });
    await waitFor(() => expect(screen.getByTestId("where").textContent).toMatch(/id=9/));
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it("a consent that finds no ready writer within 30 s is dropped: the player confirms again", async () => {
    vi.useFakeTimers();
    const { spawn, rerenderWith } = setup({ state: consent, account: null });
    expect(screen.getByText("Not connected: no playing account")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(29_000);
    });
    expect(screen.getByText("Not connected: no playing account")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(1_500);
    });
    expect(screen.getByText("Not connected: confirm again on the landing page")).toBeTruthy();
    // A writer arriving afterwards finds no intent.
    rerenderWith(account);
    expect(spawn).not.toHaveBeenCalled();
  });

  it("a start that finishes after the page was left does not navigate", async () => {
    let finish!: (v: { gameId: number }) => void;
    const { spawn } = setup({ state: consent, spawn: () => new Promise((r) => (finish = r)) });
    await waitFor(() => expect(spawn).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByText("browser back"));
    expect(screen.getByText("landing")).toBeTruthy();
    await act(async () => {
      finish({ gameId: 9 });
    });
    expect(screen.getByTestId("where").textContent).toMatch(/^\/\|/);
    expect(screen.getByText("landing")).toBeTruthy();
  });
});
