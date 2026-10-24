import { slow } from "../test-slow";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TRAINING_KEY, replayTraining, type KeyValueStore } from "@paved/game-core";
import { App } from "../src/App";
import { TrainingGame } from "../src/data/training";
import { TRAINING_BEST_KEY, trainingPreviousBest } from "../src/data/training-best";
import { GAME_OVER_HOLD_MS } from "../src/routes/game-over";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { fakeSources, memoryStore } from "./data-fakes";
import { holdToPlace, placeTile, preloadPages, validateButton, discardTile } from "./route-helpers";

/** The Training games the app started, in order: the last is the one on screen (nothing is saved to read it from, #718). */
const started = vi.spyOn(TrainingGame, "start");
const lastGame = (): TrainingGame => started.mock.results.at(-1)!.value as TrainingGame;

/** Opens `path` in the app on `store` (a fresh store function: a fresh tab or a reload, nothing held from before). */
function open(path: string, store: KeyValueStore | null = memoryStore()) {
  const router = createTestRouter(path);
  const view = render(<App router={router} sources={fakeSources({ store: () => store }).sources} />);
  return { router, ...view };
}

/** Plays `game` to its end, a first legal placement at each tile or a discard, outside the hand (the page follows it). */
async function playToEnd(game: TrainingGame): Promise<void> {
  await act(async () => {
    while (!game.snapshot.state.game!.over) {
      const orientation = [1, 2, 3, 4].find((o) => game.slots(o).length > 0);
      if (orientation) await game.place({ orientation, ...game.slots(orientation)[0]! });
      else await game.discard();
    }
  });
}

// A group when slots are lit, an image when none is (the hand fits nowhere at this orientation): found by its label.
const tilesOnBoard = async () => Number((await screen.findByLabelText(/^Board of \d+ tiles$/, {}, { timeout: slow(5000) })).getAttribute("aria-label")!.match(/\d+/)![0]);
const tilesLeft = () => Number(screen.getByTestId("tiles-left").textContent);
const hand = () => screen.getByRole("region", { name: "Your tile" });
/** The game is over on the board: no tile in hand (the scores open after `GAME_OVER_HOLD_MS`). */
const handEmpty = () => hand().dataset.state === "empty";
/** The tile to place, on top of the stack (the coming tiles beside it are tiles too, #645). */
const handTop = () => hand().querySelector<HTMLElement>("[data-stack-top]")!;

/** Chooses the first lit slot: the tile turns to a rotation that fits there. */
async function chooseSlot() {
  await userEvent.click(screen.getAllByRole("button", { name: /^Slot / })[0]!);
}

preloadPages("board", "over");

beforeEach(() => {
  started.mockClear();
  localStorage.clear();
  resetWelcomedForTests();
  markWelcomed();
});
afterEach(() => {
  localStorage.clear();
  resetWelcomedForTests();
});

// Each test drives the real game through userEvent on a lazy route: more than vitest's 5 s default under a full run.
describe("/training (P3)", () => {
  it("renders the board scene on a new game, and a reload starts another one, never the game left (#718)", async () => {
    const store = memoryStore();
    const first = open("/training", store);
    expect(await screen.findByRole("heading", { level: 1, name: "Training" }, { timeout: slow(5000) })).toBeInTheDocument();
    expect(await tilesOnBoard()).toBe(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText(/Storage is off|Last move not saved/)).not.toBeInTheDocument();
    await chooseSlot();
    await holdToPlace();
    expect(await tilesOnBoard()).toBe(2);
    const seed = lastGame().seed;
    first.unmount();

    // A reload: a new tab on the same device (a new store function, so nothing is held from the first render).
    open("/training", store);
    expect(await tilesOnBoard()).toBe(1);
    expect(lastGame().seed).not.toBe(seed);
    // Nothing of either game is written to the device.
    expect(store.data.size).toBe(0);
  });

  it("clears the old save of the device (paved:training:v1), and starts a new game all the same", async () => {
    const store = memoryStore({ [TRAINING_KEY]: JSON.stringify({ v: 2, seed: "0x5eed1234abcd", moves: [{ k: "d" }] }) });
    open("/training", store);
    expect(await tilesOnBoard()).toBe(1);
    expect(tilesLeft()).toBe(lastGame().snapshot.state.game!.deckSize - 1);
    expect(store.data.has(TRAINING_KEY)).toBe(false);
  });

  it("the hand panel shows the tile to place and the two coming tiles of the engine's queue (#645)", async () => {
    open("/training");
    expect(await tilesOnBoard()).toBe(1);
    const engine = replayTraining(lastGame().seed, []);
    const coming = within(hand()).getByRole("list", { name: "Coming tiles" });
    const codes = within(coming).getAllByRole("img").map((i) => i.getAttribute("aria-label")!.split(" ")[1]!.replace(",", ""));
    expect(codes).toEqual(engine.coming.map((t) => t.plan.toLowerCase()));
  });

  it("each hand action reaches the session: rotate, choose a slot, place by the bubble's hold with its preview points on the score, discard", async () => {
    open("/training");
    expect(await tilesOnBoard()).toBe(1);
    const left = tilesLeft();

    const chip = within(handTop()).getByRole("img", { name: /^Tile / });
    expect(chip).toHaveAccessibleName(/north$/);
    expect(within(hand()).queryByRole("button", { name: /Rotate/ })).not.toBeInTheDocument();

    // No Place tile (#568): the bubble's Validate, held, is the only way to place.
    expect(screen.queryByRole("button", { name: /Place tile/ })).not.toBeInTheDocument();
    expect(validateButton()).toBeNull();
    await chooseSlot();
    // The bubble: Cancel always; Rotate only with several valid rotations, and only through those.
    await userEvent.click(await screen.findByRole("button", { name: "Cancel placement" }));
    expect(validateButton()).toBeNull();
    expect(screen.queryByTestId("score-preview")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel placement" })).not.toBeInTheDocument();
    await chooseSlot();
    expect(await screen.findByRole("button", { name: "Hold to place the tile" })).toBeEnabled();
    expect(screen.getByTestId("score-preview")).toHaveTextContent(/^\(\+\d+\)/);
    // A tap is not a hold: nothing is placed.
    await userEvent.click(validateButton()!);
    expect(await tilesOnBoard()).toBe(1);
    await holdToPlace();
    expect(await tilesOnBoard()).toBe(2);
    expect(tilesLeft()).toBe(left - 1);
    expect(lastGame().snapshot.state.game).toMatchObject({ placedCount: 2, discardedCount: 0 });

    await discardTile();
    await waitFor(() => expect(lastGame().snapshot.state.game).toMatchObject({ placedCount: 2, discardedCount: 1 }));
    expect(await tilesOnBoard()).toBe(2);
  });

  it("plays a whole game through the hand, to the over scene", async () => {
    const { router } = open("/training");
    await tilesOnBoard();
    // Place where a slot is lit, discard otherwise, until the deck runs out.
    let lastMoveAt = 0;
    while (!handEmpty()) {
      lastMoveAt = Date.now();
      const slots = screen.queryAllByRole("button", { name: /^Slot / });
      if (slots.length) {
        await userEvent.click(slots[0]!);
        await placeTile();
      } else {
        await discardTile();
      }
    }
    // The finished game stays on its board for the hold, its last points on the score, then the scores open.
    expect(router.state.location.pathname).toBe("/training");
    expect(screen.getByRole("heading", { level: 1, name: "Training" })).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.pathname).toBe("/training/over"), { timeout: GAME_OVER_HOLD_MS + slow(5000) });
    expect(Date.now() - lastMoveAt).toBeGreaterThanOrEqual(GAME_OVER_HOLD_MS);
    expect(await screen.findByTestId("final-score", {}, { timeout: slow(5000) })).toBeInTheDocument();
    // The over page reads the game the board played, held in memory: one game started, none read back.
    expect(started).toHaveBeenCalledTimes(1);
    const game = lastGame().snapshot.state.game!;
    expect(game.over).toBe(true);
    expect(screen.getByRole("region", { name: "Game metrics" })).toHaveTextContent(`Tiles placed${game.placedCount - 1}`);
  // The whole game is real work (one click and a re-render of the board per tile): 10.7 to 18.1 s over 5 runs, 11.2 to 23.2 s over 10 more, 28.5 s once under
  // heavy load.
  }, slow(60_000));

  it("counts a discard as spent in the tiles left", async () => {
    open("/training");
    await tilesOnBoard();
    const left = tilesLeft();
    await discardTile();
    await waitFor(() => expect(tilesLeft()).toBe(left - 1));
    await discardTile();
    await waitFor(() => expect(tilesLeft()).toBe(left - 2));
  });

  it("plays with storage off, and shows no storage notice: Training saves nothing (#718)", async () => {
    open("/training", null);
    expect(await tilesOnBoard()).toBe(1);
    const left = tilesLeft();
    await discardTile();
    await waitFor(() => expect(tilesLeft()).toBe(left - 1));
    expect(screen.queryByText(/Storage is off|Last move not saved/)).not.toBeInTheDocument();
  });

  it("Restart, from the settings, asks first, then plays the same game again from its start (#606); no Surrender", async () => {
    open("/training");
    expect(await tilesOnBoard()).toBe(1);
    const seed = lastGame().seed;
    await chooseSlot();
    await holdToPlace();
    expect(await tilesOnBoard()).toBe(2);
    const restart = async () => {
      await userEvent.click(screen.getByRole("button", { name: "Settings" }));
      const sheet = await screen.findByRole("dialog", { name: "Settings" }, { timeout: slow(5000) });
      expect(within(sheet).queryByRole("button", { name: /Surrender/ })).toBeNull();
      await userEvent.click(within(sheet).getByRole("button", { name: /^Restart/ }));
      return screen.findByRole("dialog", { name: "Restart this game?" });
    };
    await restart();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await tilesOnBoard()).toBe(2);

    await userEvent.click(within(await restart()).getByRole("button", { name: "Restart" }));
    expect(await tilesOnBoard()).toBe(1);
    expect(started).toHaveBeenCalledTimes(2);
    expect(lastGame().seed).toBe(seed);
  });
});

describe("/training/over (P3)", () => {
  it("shows the finished game's counters; Play again starts a new game with a new seed", async () => {
    const { router } = open("/training");
    await tilesOnBoard();
    const played = lastGame();
    await playToEnd(played);
    await waitFor(() => expect(router.state.location.pathname).toBe("/training/over"), { timeout: GAME_OVER_HOLD_MS + slow(5000) });
    expect(await screen.findByTestId("final-score", {}, { timeout: slow(5000) })).toBeInTheDocument();
    const metrics = screen.getByRole("region", { name: "Game metrics" });
    expect(metrics).toHaveTextContent(`Tiles placed${played.snapshot.state.game!.placedCount - 1}`);

    await userEvent.click(screen.getByRole("button", { name: "Play again" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/training"));
    expect(await tilesOnBoard()).toBe(1);
    expect(lastGame()).not.toBe(played);
    expect(lastGame().seed).not.toBe(played.seed);
  }, slow(30_000));

  it("shows the final board and the scores in turn (#539), and New best against this device's best; a reload has no game", async () => {
    const store = memoryStore({ [TRAINING_BEST_KEY]: JSON.stringify({ score: 1, seed: "0x1", previous: null }) });
    const { router, unmount } = open("/training", store);
    await tilesOnBoard();
    const played = lastGame();
    await playToEnd(played);
    const score = played.snapshot.state.game!.score;
    expect(score).toBeGreaterThan(1);
    await waitFor(() => expect(router.state.location.pathname).toBe("/training/over"), { timeout: GAME_OVER_HOLD_MS + slow(5000) });
    expect(await screen.findByTestId("final-score", {}, { timeout: slow(5000) })).toBeInTheDocument();
    expect(screen.getByText("New best")).toBeInTheDocument();
    expect(JSON.parse(store.getItem(TRAINING_BEST_KEY)!)).toEqual({ score, seed: `0x${played.seed.toString(16)}`, previous: 1 });

    const toggle = screen.getByRole("radiogroup", { name: "Show" });
    await userEvent.click(within(toggle).getByRole("radio", { name: "Board" }));
    // The board under the scores from the start (#720), freed by Board.
    await waitFor(() => expect(screen.getByTestId("final-board")).not.toHaveAttribute("aria-hidden", "true"));
    const built = played.snapshot.state.game!.placedCount;
    expect(await within(screen.getByTestId("final-board")).findByRole("img", { name: `Board of ${built} tiles` })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/training/over");
    await userEvent.click(within(toggle).getByRole("radio", { name: "Scores" }));
    await waitFor(() => expect(screen.getByTestId("final-board")).toHaveAttribute("aria-hidden", "true"));
    expect(screen.getByTestId("scores-overlay").closest('[aria-hidden="true"]')).toBeNull();
    expect(router.state.location.pathname).toBe("/training/over");
    unmount();

    // A reload of the end: nothing is saved, so no game to show; Training starts a new one. The best stays.
    const reload = open("/training/over", store);
    await waitFor(() => expect(reload.router.state.location.pathname).toBe("/training"), { timeout: slow(5000) });
    expect(await tilesOnBoard()).toBe(1);
    expect(JSON.parse(store.getItem(TRAINING_BEST_KEY)!)).toMatchObject({ score });
  }, slow(30_000));

  it("sends a game still in play back to its board, and a finished game's board to its end", async () => {
    const playing = open("/training");
    await tilesOnBoard();
    await act(() => playing.router.navigate("/training/over"));
    await waitFor(() => expect(playing.router.state.location.pathname).toBe("/training"));
    playing.unmount();
    const over = open("/training");
    await tilesOnBoard();
    await act(() => lastGame().surrender());
    await waitFor(() => expect(over.router.state.location.pathname).toBe("/training/over"), { timeout: GAME_OVER_HOLD_MS + slow(5000) });
  }, slow(30_000));
});

describe("the Training best of this device (#539)", () => {
  it("is null on the first game, records a better game once, and keeps the best before it for that game", () => {
    const store = memoryStore();
    expect(trainingPreviousBest(() => store, "0xa", 300)).toBeNull();
    expect(trainingPreviousBest(() => store, "0xa", 300)).toBeNull();
    expect(trainingPreviousBest(() => store, "0xb", 200)).toBe(300);
    expect(trainingPreviousBest(() => store, "0xc", 500)).toBe(300);
    expect(trainingPreviousBest(() => store, "0xc", 500)).toBe(300);
    expect(trainingPreviousBest(() => store, "0xd", 100)).toBe(500);
  });

  it("answers null without storage, and survives a refused write or a broken record", () => {
    expect(trainingPreviousBest(() => null, "0xa", 300)).toBeNull();
    expect(trainingPreviousBest(() => { throw new Error("blocked"); }, "0xa", 300)).toBeNull();
    const broken = memoryStore({ [TRAINING_BEST_KEY]: "{not json" });
    expect(trainingPreviousBest(() => broken, "0xa", 300)).toBeNull();
    const full: KeyValueStore = { getItem: () => null, setItem: () => { throw new DOMException("quota", "QuotaExceededError"); }, removeItem: () => {} };
    expect(trainingPreviousBest(() => full, "0xa", 300)).toBeNull();
  });
});
