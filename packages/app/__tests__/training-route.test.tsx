import { slow } from "../test-slow";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OrientationType, TRAINING_KEY, loadGame, replayTraining, type KeyValueStore, type SavedMove } from "@paved/game-core";
import { App } from "../src/App";
import { TRAINING_BEST_KEY, trainingPreviousBest } from "../src/data/training-best";
import { GAME_OVER_HOLD_MS } from "../src/routes/game-over";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { fakeSources, memoryStore } from "./data-fakes";
import { holdToPlace, placeTile, preloadPages, validateButton, discardTile } from "./route-helpers";

const ORIENTATIONS = Object.values(OrientationType);
const SEED = 0x5eed1234abcdn;
const save = (moves: SavedMove[]) => JSON.stringify({ v: 2, seed: `0x${SEED.toString(16)}`, moves });

/** The first legal placement of the game after `moves`, as the save writes it. */
function firstMove(moves: SavedMove[]): SavedMove {
  const p = replayTraining(SEED, moves).legalPlacements()[0]!;
  return { k: "b", o: ORIENTATIONS.indexOf(p.orientation), x: p.x, y: p.y };
}

/** Opens `path` in the app on a Training save held in `store` (a fresh store function: a fresh tab or a reload). */
function open(path: string, store: KeyValueStore | null) {
  const router = createTestRouter(path);
  const view = render(<App router={router} sources={fakeSources({ store: () => store }).sources} />);
  return { router, ...view };
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
  it("renders the board scene on the saved game, and resumes it after a reload", async () => {
    const store = memoryStore({ [TRAINING_KEY]: save([firstMove([])]) });
    const first = open("/training", store);
    expect(await screen.findByRole("heading", { level: 1, name: "Training" }, { timeout: slow(5000) })).toBeInTheDocument();
    expect(await tilesOnBoard()).toBe(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText(/Storage is off|Last move not saved/)).not.toBeInTheDocument();
    first.unmount();

    // A reload: a new tab reads the same save (a new store function, so nothing is held from the first render).
    open("/training", store);
    expect(await tilesOnBoard()).toBe(2);
    await chooseSlot();
    await holdToPlace();
    expect(await tilesOnBoard()).toBe(3);
    expect(loadGame(() => store)!.moves).toHaveLength(2);
  });

  it("the hand panel shows the tile to place and the two coming tiles of the engine's queue (#645)", async () => {
    const store = memoryStore();
    open("/training", store);
    expect(await tilesOnBoard()).toBe(1);
    const engine = replayTraining(BigInt(loadGame(() => store)!.seed), []);
    const coming = within(hand()).getByRole("list", { name: "Coming tiles" });
    const codes = within(coming).getAllByRole("img").map((i) => i.getAttribute("aria-label")!.split(" ")[1]!.replace(",", ""));
    expect(codes).toEqual(engine.coming.map((t) => t.plan.toLowerCase()));
  });

  it("each hand action reaches the session: rotate, choose a slot, place by the bubble's hold with its preview points on the score, discard", async () => {
    const store = memoryStore();
    open("/training", store);
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
    expect(loadGame(() => store)!.moves.map((m) => m.k)).toEqual(["b"]);

    await discardTile();
    expect(loadGame(() => store)!.moves.map((m) => m.k)).toEqual(["b", "d"]);
    expect(await tilesOnBoard()).toBe(2);
  });

  it("plays a whole game through the hand, to the over scene", async () => {
    const store = memoryStore();
    const { router } = open("/training", store);
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
    expect(await screen.findByRole("heading", { level: 1, name: "Final score" }, { timeout: slow(5000) })).toBeInTheDocument();
    const saved = loadGame(() => store)!;
    expect(replayTraining(BigInt(saved.seed), saved.moves).over).toBe(true);
    expect(saved.moves.some((m) => m.k === "b")).toBe(true);
  // The whole game is real work (one click and a re-render of the board per tile): 10.7 to 18.1 s over 5 runs, 11.2 to 23.2 s over 10 more, 28.5 s once under
  // heavy load.
  }, slow(60_000));

  it("counts a discard as spent in the tiles left", async () => {
    open("/training", memoryStore());
    await tilesOnBoard();
    const left = tilesLeft();
    await discardTile();
    await waitFor(() => expect(tilesLeft()).toBe(left - 1));
    await discardTile();
    await waitFor(() => expect(tilesLeft()).toBe(left - 2));
  });

  it("says when storage is off, and still plays", async () => {
    open("/training", null);
    expect(await screen.findByText("Storage is off")).toBeInTheDocument();
    await discardTile();
    expect(screen.getByText("Storage is off")).toBeInTheDocument();
  });

  it("says when a save was dropped", async () => {
    const store = memoryStore();
    let full = false;
    const quota: KeyValueStore = {
      getItem: (k) => store.getItem(k),
      setItem: (k, v) => {
        if (full) throw new DOMException("quota", "QuotaExceededError");
        store.setItem(k, v);
      },
      removeItem: (k) => store.removeItem(k),
    };
    open("/training", quota);
    await tilesOnBoard();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText(/Storage is off|Last move not saved/)).not.toBeInTheDocument();
    full = true;
    await discardTile();
    expect(await screen.findByText("Last move not saved")).toBeInTheDocument();
  });

  it("a dropped save never rewinds the game: the last moves unsaved, the game still ends on its over scene", async () => {
    const store = memoryStore();
    let full = false;
    const quota: KeyValueStore = {
      getItem: (k) => store.getItem(k),
      setItem: (k, v) => {
        if (full) throw new DOMException("quota", "QuotaExceededError");
        store.setItem(k, v);
      },
      removeItem: (k) => store.removeItem(k),
    };
    const { router } = open("/training", quota);
    await tilesOnBoard();
    await discardTile();
    // Every save from here on is refused: the save stays one move in, behind the game.
    full = true;
    while (!handEmpty()) await discardTile();
    await waitFor(() => expect(router.state.location.pathname).toBe("/training/over"), { timeout: GAME_OVER_HOLD_MS + slow(5000) });
    expect(await screen.findByRole("heading", { level: 1, name: "Final score" }, { timeout: slow(5000) })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Game metrics" })).toHaveTextContent("Tiles placed0");
    expect(router.state.location.pathname).toBe("/training/over");
    expect(loadGame(() => store)!.moves).toEqual([{ k: "d" }]);
  });

  it("two tabs at the same length with different moves: the tab that hears the other's save follows it, its choice cleared", async () => {
    const store = memoryStore({ [TRAINING_KEY]: save([]) });
    open("/training", store);
    expect(await tilesOnBoard()).toBe(1);
    // This tab discards; it then chooses a slot for its next tile, unsent.
    await discardTile();
    expect(loadGame(() => store)!.moves).toEqual([{ k: "d" }]);
    await chooseSlot();
    expect(await screen.findByRole("button", { name: "Hold to place the tile" })).toBeEnabled();

    // The other tab, one move in too, placed a tile instead: its save is written last, so it wins.
    const other = [firstMove([])];
    act(() => {
      store.setItem(TRAINING_KEY, save(other));
      window.dispatchEvent(new StorageEvent("storage", { key: TRAINING_KEY, newValue: save(other) }));
    });
    expect(await tilesOnBoard()).toBe(2);
    expect(validateButton()).toBeNull();
    expect(within(handTop()).getByRole("img", { name: /^Tile / })).toHaveAccessibleName(/north$/);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText(/Storage is off|Last move not saved/)).not.toBeInTheDocument();

    await discardTile();
    expect(loadGame(() => store)!.moves).toEqual([...other, { k: "d" }]);
  });

  it("two tabs on one save: a tab follows the other's moves, and its next move extends them", async () => {
    const store = memoryStore({ [TRAINING_KEY]: save([]) });
    open("/training", store);
    expect(await tilesOnBoard()).toBe(1);

    // The other tab places a tile and a discard: its save lands, then the browser tells this tab.
    const other = [firstMove([]), { k: "d" } as SavedMove];
    act(() => {
      store.setItem(TRAINING_KEY, save(other));
      window.dispatchEvent(new StorageEvent("storage", { key: TRAINING_KEY, newValue: save(other) }));
    });
    expect(await tilesOnBoard()).toBe(2);

    // This tab plays on the other's game: its save keeps the other tab's moves.
    await discardTile();
    expect(loadGame(() => store)!.moves).toEqual([...other, { k: "d" }]);
  });

  it("Restart, from the settings, asks first, then plays the same game again from its start (#606); no Surrender", async () => {
    const store = memoryStore({ [TRAINING_KEY]: save([firstMove([])]) });
    open("/training", store);
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
    expect(loadGame(() => store)!.moves).toHaveLength(1);

    await userEvent.click(within(await restart()).getByRole("button", { name: "Restart" }));
    expect(await tilesOnBoard()).toBe(1);
    const saved = loadGame(() => store)!;
    expect(saved.moves).toEqual([]);
    expect(saved.seed).toBe(`0x${SEED.toString(16)}`);
  });
});

describe("/training/over (P3)", () => {
  it("shows the finished game's counters and closings; Play again starts a new game", async () => {
    // Every first legal move until the deck runs out: a game that ends by its last tile.
    const moves: SavedMove[] = [];
    const game = replayTraining(SEED, []);
    while (!game.over) {
      const p = game.legalPlacements()[0];
      if (p) game.build(p);
      else game.discard();
      moves.push(p ? { k: "b", o: ORIENTATIONS.indexOf(p.orientation), x: p.x, y: p.y } : { k: "d" });
    }
    const store = memoryStore({ [TRAINING_KEY]: save(moves) });
    const { router } = open("/training/over", store);
    expect(await screen.findByRole("heading", { level: 1, name: "Final score" }, { timeout: slow(5000) })).toBeInTheDocument();
    const metrics = screen.getByRole("region", { name: "Game metrics" });
    expect(metrics).toHaveTextContent(`Tiles placed${game.built}`);

    await userEvent.click(screen.getByRole("button", { name: "Play again" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/training"));
    expect(await tilesOnBoard()).toBe(1);
    expect(loadGame(() => store)!.moves).toEqual([]);
  });

  it("shows the final board and the scores in turn (#539), and New best against this device's best", async () => {
    const moves: SavedMove[] = [];
    const game = replayTraining(SEED, []);
    while (!game.over) {
      const p = game.legalPlacements()[0];
      if (p) game.build(p);
      else game.discard();
      moves.push(p ? { k: "b", o: ORIENTATIONS.indexOf(p.orientation), x: p.x, y: p.y } : { k: "d" });
    }
    expect(game.score).toBeGreaterThan(1);
    const store = memoryStore({ [TRAINING_KEY]: save(moves), [TRAINING_BEST_KEY]: JSON.stringify({ score: 1, seed: "0x1", previous: null }) });
    const { router, unmount } = open("/training/over", store);
    expect(await screen.findByRole("heading", { level: 1, name: "Final score" }, { timeout: slow(5000) })).toBeInTheDocument();
    expect(screen.getByText("New best")).toBeInTheDocument();
    expect(JSON.parse(store.getItem(TRAINING_BEST_KEY)!)).toEqual({ score: game.score, seed: `0x${SEED.toString(16)}`, previous: 1 });

    const toggle = screen.getByRole("radiogroup", { name: "Show" });
    await userEvent.click(within(toggle).getByRole("radio", { name: "Board" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Final board" })).toBeInTheDocument();
    expect(await within(screen.getByTestId("final-board")).findByRole("img", { name: `Board of ${game.built + 1} tiles` })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/training/over");
    await userEvent.click(within(toggle).getByRole("radio", { name: "Scores" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Final score" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/training/over");
    unmount();

    // A reload of the same game's end still reads New best: the record keeps the best before it.
    open("/training/over", store);
    expect(await screen.findByText("New best", {}, { timeout: slow(5000) })).toBeInTheDocument();
  });

  it("sends a game still in play back to its board, and a finished game's board to its end", async () => {
    const playing = open("/training/over", memoryStore({ [TRAINING_KEY]: save([]) }));
    await waitFor(() => expect(playing.router.state.location.pathname).toBe("/training"));
    playing.unmount();
    const over = open("/training", memoryStore({ [TRAINING_KEY]: save([{ k: "s" }]) }));
    await waitFor(() => expect(over.router.state.location.pathname).toBe("/training/over"));
  });
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
