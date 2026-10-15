import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EngineGame, NOT_A_DISCARD, TUTORIAL_STORAGE_KEY, scriptedMoves, tutorialSteps, type TutorialMove } from "@paved/game-core";
import { App } from "../src/App";
import { useTutorialClaim, useTutorialRun } from "../src/data";
import { queryClient } from "../src/lib/query-client";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { fakeSources, memoryStore, renderData } from "./data-fakes";
import { fakeWallet } from "./wallet-fakes";

const PLAYER = "0x5f1";
/** First Stone credited: the receipt of a first claim. */
const CREDITED = [{ name: "AchievementProgressed", fields: { taskId: 10n } }] as never;

beforeEach(() => {
  localStorage.clear();
  resetWelcomedForTests();
  markWelcomed();
  // The steps are walked once per module: count only the run's own engines below.
  tutorialSteps();
});
afterEach(() => {
  vi.restoreAllMocks();
  queryClient.clear();
  localStorage.clear();
  resetWelcomedForTests();
});

const stepLabel = () => screen.queryByText(/^Step \d+ of \d+$/)?.textContent ?? null;
const hand = () => screen.getByRole("region", { name: "Your tile" });

/** Plays `move` through the board scene: Discard, or the lit slot, turned until the placement is accepted. */
async function play(move: TutorialMove) {
  const before = stepLabel();
  if (move.kind === "discard") {
    await userEvent.click(screen.getByRole("button", { name: /Discard/ }));
    return;
  }
  await userEvent.click(screen.getByRole("button", { name: /^Slot / }));
  for (let turn = 0; turn < 4 && stepLabel() === before; turn++) {
    const place = screen.getByRole("button", { name: /Place tile/ });
    if (!place.hasAttribute("disabled")) await userEvent.click(place);
    if (stepLabel() !== before) return;
    await userEvent.click(screen.getByRole("button", { name: "Rotate tile" }));
  }
}

describe("/tutorial (P6): the scripted game on the board scene", { timeout: 30_000 }, () => {
  it("runs to its end, its engine kept between steps, then claims First Stone once connected", async () => {
    const store = memoryStore();
    const wallet = fakeWallet({ address: PLAYER, claimEvents: CREDITED });
    const f = fakeSources({ store: () => store });
    const start = vi.spyOn(EngineGame, "start");
    render(<App router={createTestRouter("/tutorial")} sources={f.sources} connector={wallet.load} />);
    expect(await screen.findByRole("heading", { level: 1, name: "Tutorial" }, { timeout: 5000 })).toBeInTheDocument();
    const moves = scriptedMoves();
    expect(stepLabel()).toBe(`Step 1 of ${moves.length}`);
    // The tutorial has nothing to give up.
    expect(screen.queryByRole("button", { name: /Surrender/ })).toBeNull();

    for (const [i, move] of moves.entries()) {
      await play(move);
      if (i < moves.length - 1) await waitFor(() => expect(stepLabel()).toBe(`Step ${i + 2} of ${moves.length}`));
    }
    expect(await screen.findByRole("heading", { name: "Tutorial complete" })).toBeInTheDocument();
    // One engine for the whole run (its `TutorialRun`): no step replayed the moves before it.
    expect(start.mock.calls.length).toBeLessThanOrEqual(1);
    expect(JSON.parse(store.getItem(TUTORIAL_STORAGE_KEY)!).moves).toHaveLength(moves.length);

    // The claim needs a signer: Connect first, then one `claim_tutorial`.
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));
    await userEvent.click(await screen.findByRole("button", { name: "Claim First Stone" }));
    expect(await screen.findByText("Claimed: First Stone is yours.")).toBeInTheDocument();
    expect(wallet.calls.filter((c) => c === "claimTutorial")).toHaveLength(1);
  });

  it("refuses a move that is not the step's, with its reason in the hand", async () => {
    render(<App router={createTestRouter("/tutorial")} sources={fakeSources({ store: () => memoryStore() }).sources} connector={fakeWallet().load} />);
    await screen.findByRole("heading", { level: 1, name: "Tutorial" }, { timeout: 5000 });
    await userEvent.click(screen.getByRole("button", { name: /Discard/ }));
    expect(hand()).toHaveTextContent(NOT_A_DISCARD);
    expect(stepLabel()).toBe(`Step 1 of ${scriptedMoves().length}`);
  });

  it("an account that claimed before is told so without a transaction", async () => {
    const store = memoryStore({ [TUTORIAL_STORAGE_KEY]: JSON.stringify({ version: 1, moves: scriptedMoves() }) });
    const wallet = fakeWallet({ address: PLAYER, restored: true });
    const f = fakeSources({ store: () => store });
    f.views.tutorialClaims.add(BigInt(PLAYER));
    render(<App router={createTestRouter("/tutorial")} sources={f.sources} connector={wallet.load} />);
    expect(await screen.findByText("Already claimed: this account had First Stone before.", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(wallet.calls).not.toContain("claimTutorial");
  });
});

describe("useTutorialRun", () => {
  it("keeps its engine between steps, and replays from the start only on Back", async () => {
    const store = memoryStore();
    const { result } = renderData(() => useTutorialRun(), fakeSources({ store: () => store }).sources);
    const moves = scriptedMoves();
    for (const move of moves) {
      let refused: string | null = "not played";
      act(() => void (refused = result.current.play(move)));
      expect(refused).toBeNull();
    }
    await waitFor(() => expect(result.current.view.over).toBe(true));
    expect(result.current.run.replays).toBe(0);
    act(() => result.current.back());
    await waitFor(() => expect(result.current.view.over).toBe(false));
    expect(result.current.run.replays).toBe(1);

    // A reload resumes the save: its moves played once on the new run's engine, which then keeps it.
    const again = renderData(() => useTutorialRun(), fakeSources({ store: () => store }).sources);
    expect(again.result.current.index).toBe(moves.length - 1);
    act(() => void again.result.current.play(moves[moves.length - 1]!));
    expect(again.result.current.view.over).toBe(true);
    expect(again.result.current.run.replays).toBe(0);
  });
});

describe("useTutorialClaim", () => {
  it("needs a signer: without one nothing is sent and it is refused", async () => {
    const { result } = renderData(() => useTutorialClaim(), fakeSources({ signer: null }).sources);
    result.current.mutate();
    await waitFor(() => expect(result.current.error?.message).toBe("Connect a wallet to claim First Stone."));
  });

  it("with a signer: one claim; a receipt without the credit is a claim made before", async () => {
    const wallet = fakeWallet();
    const signer = wallet.connector.signer({ address: PLAYER, execute: async () => ({ transaction_hash: "0x1" }) });
    const { result } = renderData(() => useTutorialClaim(), fakeSources({ signer }).sources);
    result.current.mutate();
    await waitFor(() => expect(result.current.data?.outcome).toBe("already-claimed"));
    expect(wallet.calls).toEqual(["claimTutorial"]);
  });
});
