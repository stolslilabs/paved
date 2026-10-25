import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, domMax } from "motion/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { BoardScene } from "../src/components/scenes/board-scene";
import { BOARD } from "../src/mocks/scenes";
import { slow } from "../test-slow";

// The Surrender dialog's module arrives when the test lets it (BOARD-CHUNK).
const gate = vi.hoisted(() => {
  let open!: () => void;
  const opened = new Promise<void>((r) => (open = r));
  return { opened, open };
});
vi.mock("../src/components/containers/surrender-dialog", async (importOriginal) => {
  await gate.opened;
  return importOriginal();
});

describe("BoardScene, the Surrender dialog still loading", () => {
  // The dialog's real module and the board's other lazy chunks are transformed and evaluated here, ahead of the test, so that the
  // test's own waits cost cache hits, not cold transforms that a loaded machine stretches past its ceilings.
  beforeAll(async () => {
    await Promise.all([
      vi.importActual("../src/components/containers/surrender-dialog"),
      import("../src/components/containers/board-season-wheel"),
      import("../src/components/containers/deck-sheet"),
      import("../src/components/containers/device-settings-sheet"),
    ]);
  }, slow(30000));

  it("the expired banner's tap shows the button busy at once, opens the dialog once when the module arrives, and opens it only once", async () => {
    render(
      <LazyMotion features={domMax}>
        <BoardScene {...BOARD.expired} />
      </LazyMotion>,
    );
    const button = screen.getByRole("button", { name: /Surrender/ });
    expect(button).not.toHaveAttribute("aria-busy");
    await userEvent.click(button);
    // Busy while the gate is still shut: the banner's action follows the tap through its own animated container, which a loaded
    // machine can hold back a few frames.
    await waitFor(() => expect(screen.getByRole("button", { name: /Surrender/ })).toHaveAttribute("aria-busy", "true"), { timeout: slow(5000) });
    expect(screen.getByRole("button", { name: /Surrender/ })).toBeDisabled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    gate.open();
    const dialog = await screen.findByRole("dialog", { name: "Surrender this game?" }, { timeout: slow(5000) });
    expect(within(dialog).getByRole("button", { name: "Surrender" })).toBeInTheDocument();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  }, slow(60_000));
});
