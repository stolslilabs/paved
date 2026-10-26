/** The editor's die (#803): the worker's runner, and the die's states in the editor (the draft it fills, busy, slow, failed). */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LazyMotion, domMax } from "motion/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { layoutRefusal, randomLayout } from "@paved/game-core";
import { ROLL_FAILED } from "../src/components/containers/layout-editor";
import { STARTER, checkLayout, draftOf, slotsFor, stockOf, trayOf } from "../src/components/containers/layout-rules";
import VillageStage from "../src/components/containers/village-stage";
import { VillageLayoutScene } from "../src/components/scenes/village-layout-scene";
import { answerRandomLayout, type RandomLayoutRequest } from "../src/lib/random-layout-protocol";
import { browserRandomLayoutRunner, workerRunner, type WorkerLike } from "../src/lib/random-layout-runner";
import { FAILING_RANDOMIZER, PENDING_RANDOMIZER, STILL, mainThreadRandomizer, seedsOf } from "../src/mocks/random-layout";
import { DIE_VILLAGES, INVENTORY, LAYOUT_GROWING, LAYOUT_START, VILLAGE_LAYOUT } from "../src/mocks/village-v2";

const wrap = (ui: ReactNode) => <LazyMotion features={domMax}>{ui}</LazyMotion>;
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** A worker that answers only when told, and records what it was sent. */
class FakeWorker implements WorkerLike {
  sent: RandomLayoutRequest[] = [];
  terminated = false;
  onmessage: WorkerLike["onmessage"] = null;
  onerror: WorkerLike["onerror"] = null;
  postMessage(message: RandomLayoutRequest) {
    this.sent.push(message);
  }
  terminate() {
    this.terminated = true;
  }
  /** The worker's answer to its last request, as the real one gives it. */
  answer() {
    const data = answerRandomLayout(this.sent.at(-1)!, build);
    this.onmessage?.call(this as unknown as Worker, { data } as MessageEvent);
  }
  fail(message: string) {
    this.onerror?.call(this as unknown as Worker, { message, preventDefault: () => {} } as ErrorEvent);
  }
}

const STOCK = stockOf(INVENTORY, LAYOUT_GROWING.tiles);
const build = (stock: readonly number[], slots: number, seed: number) => randomLayout(stock, slots, seed, STILL);

describe("the die's runner", () => {
  it("is missing where Web Workers are (the die is hidden)", () => {
    expect(typeof Worker).toBe("undefined");
    expect(browserRandomLayoutRunner()).toBeNull();
    expect(workerRunner(null)).toBeNull();
  });

  it("sends the stock, the slots and the seed, and resolves with the worker's layout", async () => {
    const worker = new FakeWorker();
    const runner = workerRunner(() => worker)!;
    const built = runner.run(STOCK, 28, 5);
    expect(worker.sent).toEqual([{ id: 1, stock: STOCK, slots: 28, seed: 5 }]);
    worker.answer();
    const tiles = await built;
    expect(tiles).toEqual(build(STOCK, 28, 5).tiles);
    expect(layoutRefusal(tiles, { slots: 28, inventory: STOCK })).toBeNull();
  });

  it("cancels the build at work on a second press: the first worker ends, a fresh one builds", async () => {
    const workers: FakeWorker[] = [];
    const runner = workerRunner(() => {
      workers.push(new FakeWorker());
      return workers.at(-1)!;
    })!;
    const first = vi.fn();
    void runner.run(STOCK, 28, 1).then(first);
    const second = runner.run(STOCK, 28, 2);
    expect(workers[0]!.terminated).toBe(true);
    workers[1]!.answer();
    await expect(second).resolves.toEqual(build(STOCK, 28, 2).tiles);
    expect(first).not.toHaveBeenCalled();
    // An idle worker is kept for the next press.
    void runner.run(STOCK, 28, 3);
    expect(workers).toHaveLength(2);
    runner.cancel();
    expect(workers[1]!.terminated).toBe(true);
  });

  it("rejects when the worker fails or answers an error, and never builds on the main thread", async () => {
    const workers: FakeWorker[] = [];
    const runner = workerRunner(() => {
      workers.push(new FakeWorker());
      return workers.at(-1)!;
    })!;
    const failed = runner.run(STOCK, 28, 1);
    workers[0]!.fail("script error");
    await expect(failed).rejects.toThrow("script error");
    expect(workers[0]!.terminated).toBe(true);
    const next = runner.run(STOCK, 28, 1);
    expect(workers).toHaveLength(2);
    workers[1]!.onmessage?.call(workers[1] as unknown as Worker, { data: { id: 2, error: "Layout: boom" } } as MessageEvent);
    await expect(next).rejects.toThrow("Layout: boom");
    await expect(workerRunner(() => { throw new Error("no worker"); })!.run(STOCK, 28, 1)).rejects.toThrow("no worker");
  });

  it("builds within the generator's 150 ms in the worker: a machine too slow for the steps gets the best found in time", () => {
    // The worker's own call (the default budget, the real clock), on a clock that reads 100 ms more at each look.
    let clock = 0;
    const now = vi.spyOn(Date, "now").mockImplementation(() => (clock += 100));
    const answer = answerRandomLayout({ id: 4, stock: STOCK, slots: 28, seed: 11 }, randomLayout);
    now.mockRestore();
    expect(answer).toMatchObject({ id: 4, timedOut: true, tries: 2 });
    expect("tiles" in answer && layoutRefusal(answer.tiles, { slots: 28, inventory: STOCK })).toBeNull();
  });

  it("answers a failed build with its error", () => {
    expect(answerRandomLayout({ id: 3, stock: [], slots: 9, seed: 1 }, () => { throw new Error("bad"); })).toEqual({ id: 3, error: "bad" });
  });
});

describe("the die's rules", () => {
  it("builds from the whole stock: the inventory and the saved layout's tiles, the starter aside", () => {
    const stock = stockOf(INVENTORY, LAYOUT_GROWING.tiles);
    expect(stock).toHaveLength(19);
    expect(stock.reduce((s, n) => s + n, 0)).toBe(Object.values(INVENTORY).reduce((s, n) => s + n, 0) + LAYOUT_GROWING.tiles.length - 1);
    // Every tile of the stock in the draft leaves the tray at 0.
    expect(Object.values(trayOf(INVENTORY, LAYOUT_GROWING.tiles, draftOf(build(stock, 99, 1).tiles))).every((n) => n === 0)).toBe(true);
  });

  it("gives drafts the editor takes: the starter first, valid, within the slots", () => {
    for (const draft of DIE_VILLAGES) {
      expect(draft[0]).toEqual(STARTER);
      expect(new Set(draft.map((t) => t.id)).size).toBe(draft.length);
      expect(checkLayout(draft, slotsFor(LAYOUT_GROWING.level)).valid).toBe(true);
      expect(draft).toHaveLength(28);
    }
    expect(new Set(DIE_VILLAGES.map((d) => JSON.stringify(d))).size).toBe(3);
  });
});

describe("the die in the editor", () => {
  it("is hidden without Web Workers, and out of the view", () => {
    render(wrap(<VillageLayoutScene {...VILLAGE_LAYOUT.editing} />));
    expect(screen.queryByRole("button", { name: /random village/i })).toBeNull();
    cleanup();
    render(wrap(<VillageLayoutScene {...VILLAGE_LAYOUT.growing} randomizer={mainThreadRandomizer()} />));
    expect(screen.queryByRole("button", { name: /random village/i })).toBeNull();
  });

  it("fills the draft with a valid village of every tile that fits, never saved; each press another; Back asks first", async () => {
    const onSave = vi.fn();
    const onBack = vi.fn();
    render(wrap(<VillageLayoutScene village={LAYOUT_START} inventory={INVENTORY} mode="own" initialEditing randomizer={mainThreadRandomizer()} randomSeed={seedsOf(1, 2)} onSave={onSave} onBack={onBack} />));
    const die = screen.getByRole("button", { name: "Random village from your tiles" });
    fireEvent.click(die);
    // The saved village is 9 / 9 already: the die's village is another layout of the same 8 tiles, which Save takes.
    await waitFor(() => expect(screen.getByRole("button", { name: /^Save/ })).toBeEnabled());
    expect(screen.getByLabelText("9 of 9 slots used")).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
    const tilesShown = () => screen.getAllByRole("button", { name: /: lift it$/ }).map((el) => el.getAttribute("aria-label")).join();
    const before = tilesShown();
    fireEvent.click(screen.getByRole("button", { name: "Random village from your tiles" }));
    await waitFor(() => expect(tilesShown()).not.toBe(before));
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByText("Leave without saving?")).toBeTruthy();
    expect(onBack).not.toHaveBeenCalled();
  });

  it("is busy while it builds, says so past a second with a cancel that keeps the draft", async () => {
    vi.useFakeTimers();
    render(wrap(<VillageLayoutScene {...VILLAGE_LAYOUT.editing} randomizer={PENDING_RANDOMIZER} />));
    fireEvent.click(screen.getByRole("button", { name: "Random village from your tiles" }));
    const busy = screen.getByRole("button", { name: /Building a random village/ });
    expect(busy.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByText("Building a village from your tiles…")).toBeTruthy();
    expect(screen.queryByText("Still building…")).toBeNull();
    act(() => void vi.advanceTimersByTime(1_000));
    expect(screen.getByText("Still building…")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Still building…")).toBeNull();
    expect(screen.getByRole("button", { name: "Random village from your tiles" }).getAttribute("aria-busy")).toBeNull();
    expect(screen.getByRole("button", { name: /^Save/ })).toBeDisabled();
  });

  it("never lets a late answer undo an edit made while it builds: Reset all, a tile placed", async () => {
    // A build whose answer comes when the test says, and whose cancel does not stop it (the review's delayed worker).
    const late: ((tiles: ReturnType<typeof build>["tiles"]) => void)[] = [];
    const randomizer = { run: () => new Promise<ReturnType<typeof build>["tiles"]>((resolve) => void late.push(resolve)), cancel: vi.fn() };
    render(wrap(<VillageLayoutScene {...VILLAGE_LAYOUT.editing} randomizer={randomizer} />));
    fireEvent.click(screen.getByRole("button", { name: "Random village from your tiles" }));
    fireEvent.click(screen.getByRole("button", { name: /^Hold to reset all/ }));
    expect(screen.getAllByLabelText("1 of 28 slots used").length).toBeGreaterThan(0);
    // The edit stopped the build: the die is idle, the worker told to stop.
    expect(randomizer.cancel).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Random village from your tiles" }).getAttribute("aria-busy")).toBeNull();
    await act(async () => late[0]!(build(STOCK, 28, 1).tiles));
    expect(screen.getAllByLabelText("1 of 28 slots used").length).toBeGreaterThan(0);

    // The same with a tile chosen and placed while it builds.
    fireEvent.click(screen.getByRole("button", { name: "Random village from your tiles" }));
    fireEvent.click(screen.getAllByRole("button", { name: /, \d+ left$/ })[0]!);
    fireEvent.click(screen.getAllByRole("button", { name: /^Place it at/ })[0]!);
    expect(screen.getAllByLabelText("2 of 28 slots used").length).toBeGreaterThan(0);
    await act(async () => late[1]!(build(STOCK, 28, 2).tiles));
    expect(screen.getAllByLabelText("2 of 28 slots used").length).toBeGreaterThan(0);
  });

  it("shows a message when the worker fails, the draft kept", async () => {
    render(wrap(<VillageLayoutScene {...VILLAGE_LAYOUT.editing} randomizer={FAILING_RANDOMIZER} initialRolling />));
    expect(await screen.findByText(ROLL_FAILED)).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Save/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText(ROLL_FAILED)).toBeNull();
  });

  it("stands in the home's edit bar beside Reset all", async () => {
    render(wrap(<VillageStage village={LAYOUT_GROWING} inventory={INVENTORY} editable editing randomizer={mainThreadRandomizer()} randomSeed={seedsOf(4)} />));
    const die = screen.getByRole("button", { name: "Random village from your tiles" });
    expect(die.closest("header")?.contains(screen.getByRole("button", { name: /^Hold to reset all/ }))).toBe(true);
    fireEvent.click(die);
    await waitFor(() => expect(screen.getByLabelText("28 of 28 slots used")).toBeTruthy());
  });
});
