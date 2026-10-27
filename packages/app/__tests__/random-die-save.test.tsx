/** The die's draft saved with its own score (#803, review round 5): never the score of the panel's draft, a render behind. */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LazyMotion, domMax } from "motion/react";
import { afterEach, expect, it, vi } from "vitest";
import { randomLayout } from "@paved/game-core";
import { stockOf } from "../src/components/containers/layout-rules";
import VillageStage from "../src/components/containers/village-stage";
import { STILL } from "../src/mocks/random-layout";
import { INVENTORY, LAYOUT_GROWING } from "../src/mocks/village-v2";

// The panel's view of the draft (`useDeferredValue`) held at its first value for good: the moment the review caught, between
// the board's commit and the panel's, made to last.
vi.mock("react", async (original) => {
  const react = await original<typeof import("react")>();
  return { ...react, useDeferredValue: <T,>(value: T) => react.useRef(value).current };
});

afterEach(cleanup);

it("saves the die's draft with that draft's own score while the panel still shows the one before", async () => {
  const tiles = randomLayout(stockOf(INVENTORY, LAYOUT_GROWING.tiles), 28, 1, STILL).tiles;
  const points = { lines: [], other: 0, score: 12_345 };
  const randomizer = { run: async () => ({ tiles, points }), cancel: () => {}, dispose: () => {} };
  const onSave = vi.fn();
  render(
    <LazyMotion features={domMax}>
      <VillageStage village={LAYOUT_GROWING} inventory={INVENTORY} editable editing randomizer={randomizer} onSave={onSave} />
    </LazyMotion>,
  );
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Random village from your tiles" })));
  expect(screen.getAllByLabelText("28 of 28 slots used").length).toBeGreaterThan(0);
  // The panel a render behind: the bar still shows the saved village's score.
  expect(screen.queryByText("12,345")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /^Save/ }));
  expect(onSave).toHaveBeenCalledTimes(1);
  expect(onSave.mock.calls[0]![0]).toHaveLength(28);
  expect(onSave.mock.calls[0]![1]).toBe(12_345);
});
