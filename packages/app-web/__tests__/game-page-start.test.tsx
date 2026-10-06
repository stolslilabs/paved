// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
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

function setup(opts: { state?: unknown; url?: string; spawn?: () => Promise<{ gameId: number }>; account?: typeof account | null }) {
  const spawn = vi.fn(opts.spawn ?? (async () => ({ gameId: 9 })));
  const playerGames = vi.fn(async () => []);
  const client = {
    views: {},
    events: { playerGames },
    writer: () => ({ spawn }),
  } as unknown as PavedClient;
  render(
    <PavedProvider deployment={deployment} account={opts.account === undefined ? account : opts.account} client={client}>
      <MemoryRouter initialEntries={[{ pathname: "/game", search: opts.url ?? "?mode=daily", state: opts.state }]}>
        <Where />
        <Routes>
          <Route path="/game" element={<GamePage />} />
        </Routes>
      </MemoryRouter>
    </PavedProvider>,
  );
  return { spawn, playerGames };
}

const consent = { start: true, confirmedAmount: "10" };
afterEach(cleanup);

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
});
