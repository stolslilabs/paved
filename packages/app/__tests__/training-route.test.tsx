import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OrientationType, TRAINING_KEY, loadGame, replayTraining, type KeyValueStore, type SavedMove } from "@paved/game-core";
import { App } from "../src/App";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { fakeSources, memoryStore } from "./data-fakes";
import { preloadPages } from "./route-helpers";

const ORIENTATIONS = Object.values(OrientationType);
const SEED = 0x5eed1234abcdn;
const save = (moves: SavedMove[]) => JSON.stringify({ v: 1, seed: `0x${SEED.toString(16)}`, moves });

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
const tilesOnBoard = async () => Number((await screen.findByLabelText(/^Board of \d+ tiles$/, {}, { timeout: 5000 })).getAttribute("aria-label")!.match(/\d+/)![0]);
const tilesLeft = () => Number(screen.getByTestId("tiles-left").textContent);
const hand = () => screen.getByRole("region", { name: "Your tile" });

/** Turns the tile until a slot is lit, then chooses the first one. */
async function chooseSlot() {
  for (let i = 0; i < 4 && screen.queryAllByRole("button", { name: /^Slot / }).length === 0; i++) {
    await userEvent.click(screen.getByRole("button", { name: "Rotate tile" }));
  }
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
    expect(await screen.findByRole("heading", { level: 1, name: "Training" }, { timeout: 5000 })).toBeInTheDocument();
    expect(await tilesOnBoard()).toBe(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    first.unmount();

    // A reload: a new tab reads the same save (a new store function, so nothing is held from the first render).
    open("/training", store);
    expect(await tilesOnBoard()).toBe(2);
    await chooseSlot();
    await userEvent.click(within(hand()).getByRole("button", { name: /Place tile/ }));
    expect(await tilesOnBoard()).toBe(3);
    expect(loadGame(() => store)!.moves).toHaveLength(2);
  });

  it("each hand action reaches the session: rotate, choose a slot, place with its preview points, discard", async () => {
    const store = memoryStore();
    open("/training", store);
    expect(await tilesOnBoard()).toBe(1);
    const left = tilesLeft();

    const chip = within(hand()).getByRole("img", { name: /^Tile / });
    expect(chip).toHaveAccessibleName(/north$/);
    await userEvent.click(screen.getByRole("button", { name: "Rotate tile" }));
    expect(within(hand()).getByRole("img", { name: /^Tile / })).toHaveAccessibleName(/east$/);

    expect(within(hand()).getByRole("button", { name: /Place tile/ })).toBeDisabled();
    await chooseSlot();
    const place = within(hand()).getByRole("button", { name: /Place tile/ });
    expect(place).toBeEnabled();
    expect(place).toHaveTextContent(/\+\d+/);
    await userEvent.click(place);
    expect(await tilesOnBoard()).toBe(2);
    expect(tilesLeft()).toBe(left - 1);
    expect(loadGame(() => store)!.moves.map((m) => m.k)).toEqual(["b"]);

    await userEvent.click(within(hand()).getByRole("button", { name: /Discard/ }));
    expect(loadGame(() => store)!.moves.map((m) => m.k)).toEqual(["b", "d"]);
    expect(await tilesOnBoard()).toBe(2);
  });

  it("plays a whole game through the hand, to the over scene", async () => {
    const store = memoryStore();
    const { router } = open("/training", store);
    await tilesOnBoard();
    // Place where a slot is lit, discard otherwise, until the deck runs out.
    while (router.state.location.pathname === "/training") {
      const slots = screen.queryAllByRole("button", { name: /^Slot / });
      if (slots.length) {
        await userEvent.click(slots[0]!);
        await userEvent.click(within(hand()).getByRole("button", { name: /Place tile/ }));
      } else {
        await userEvent.click(within(hand()).getByRole("button", { name: /Discard/ }));
      }
    }
    expect(router.state.location.pathname).toBe("/training/over");
    expect(await screen.findByRole("heading", { level: 1, name: "Final score" }, { timeout: 5000 })).toBeInTheDocument();
    const saved = loadGame(() => store)!;
    expect(replayTraining(BigInt(saved.seed), saved.moves).over).toBe(true);
    expect(saved.moves.some((m) => m.k === "b")).toBe(true);
  // The whole game is real work (one click and a re-render of the board per tile): 10.7 to 18.1 s over 5 runs, 11.2 to 23.2 s over 10 more, 28.5 s once under a
  // load average of 24 to 29 (13.4 s on a quiet one).
  }, 60_000);

  it("counts a discard as spent in the tiles left", async () => {
    open("/training", memoryStore());
    await tilesOnBoard();
    const left = tilesLeft();
    await userEvent.click(within(hand()).getByRole("button", { name: /Discard/ }));
    await waitFor(() => expect(tilesLeft()).toBe(left - 1));
    await userEvent.click(within(hand()).getByRole("button", { name: /Discard/ }));
    await waitFor(() => expect(tilesLeft()).toBe(left - 2));
  });

  it("says when storage is off, and still plays", async () => {
    open("/training", null);
    expect(await screen.findByRole("alert")).toHaveTextContent("Storage is off");
    await userEvent.click(within(hand()).getByRole("button", { name: /Discard/ }));
    expect(screen.getByRole("alert")).toHaveTextContent("Storage is off");
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
    full = true;
    await userEvent.click(within(hand()).getByRole("button", { name: /Discard/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Last move not saved");
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
    await userEvent.click(within(hand()).getByRole("button", { name: /Discard/ }));
    // Every save from here on is refused: the save stays one move in, behind the game.
    full = true;
    while (router.state.location.pathname === "/training") await userEvent.click(within(hand()).getByRole("button", { name: /Discard/ }));
    expect(router.state.location.pathname).toBe("/training/over");
    expect(await screen.findByRole("heading", { level: 1, name: "Final score" }, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Game metrics" })).toHaveTextContent("Tiles placed1");
    expect(router.state.location.pathname).toBe("/training/over");
    expect(loadGame(() => store)!.moves).toEqual([{ k: "d" }]);
  });

  it("two tabs at the same length with different moves: the tab that hears the other's save follows it, its choice cleared", async () => {
    const store = memoryStore({ [TRAINING_KEY]: save([]) });
    open("/training", store);
    expect(await tilesOnBoard()).toBe(1);
    // This tab discards; it then chooses a slot for its next tile, unsent.
    await userEvent.click(within(hand()).getByRole("button", { name: /Discard/ }));
    expect(loadGame(() => store)!.moves).toEqual([{ k: "d" }]);
    await chooseSlot();
    expect(within(hand()).getByRole("button", { name: /Place tile/ })).toBeEnabled();

    // The other tab, one move in too, placed a tile instead: its save is written last, so it wins.
    const other = [firstMove([])];
    act(() => {
      store.setItem(TRAINING_KEY, save(other));
      window.dispatchEvent(new StorageEvent("storage", { key: TRAINING_KEY, newValue: save(other) }));
    });
    expect(await tilesOnBoard()).toBe(2);
    expect(within(hand()).getByRole("button", { name: /Place tile/ })).toBeDisabled();
    expect(within(hand()).getByRole("img", { name: /^Tile / })).toHaveAccessibleName(/north$/);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    await userEvent.click(within(hand()).getByRole("button", { name: /Discard/ }));
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
    await userEvent.click(within(hand()).getByRole("button", { name: /Discard/ }));
    expect(loadGame(() => store)!.moves).toEqual([...other, { k: "d" }]);
  });

  it("Esc closes the Surrender dialog; a confirmed surrender ends on the over scene", async () => {
    const store = memoryStore();
    const { router } = open("/training", store);
    await tilesOnBoard();
    await userEvent.click(within(hand()).getByRole("button", { name: /Surrender/ }));
    expect(screen.getByRole("dialog", { name: "Surrender this game?" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(loadGame(() => store)!.moves).toEqual([]);

    await userEvent.click(within(hand()).getByRole("button", { name: /Surrender/ }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Surrender" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/training/over"));
    expect(await screen.findByRole("heading", { level: 1, name: "Final score" }, { timeout: 5000 })).toBeInTheDocument();
    expect(loadGame(() => store)!.moves).toEqual([{ k: "s" }]);
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
    expect(await screen.findByRole("heading", { level: 1, name: "Final score" }, { timeout: 5000 })).toBeInTheDocument();
    const metrics = screen.getByRole("region", { name: "Game metrics" });
    expect(metrics).toHaveTextContent(`Tiles placed${game.built + 1}`);

    await userEvent.click(screen.getByRole("button", { name: "Play again" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/training"));
    expect(await tilesOnBoard()).toBe(1);
    expect(loadGame(() => store)!.moves).toEqual([]);
  });

  it("sends a game still in play back to its board, and a finished game's board to its end", async () => {
    const playing = open("/training/over", memoryStore({ [TRAINING_KEY]: save([]) }));
    await waitFor(() => expect(playing.router.state.location.pathname).toBe("/training"));
    playing.unmount();
    const over = open("/training", memoryStore({ [TRAINING_KEY]: save([{ k: "s" }]) }));
    await waitFor(() => expect(over.router.state.location.pathname).toBe("/training/over"));
  });
});
