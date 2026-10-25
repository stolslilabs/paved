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
    // The banner's action comes in through its own animated container: on a loaded machine a tap can land on a node that is about
    // to be replaced, and be lost. So the tap waits until the button has been the same node, not busy, for a full quarter second.
    // That is only a wait before the action: the tap is made once, and the button must be busy as soon as it has resolved.
    let button = screen.getByRole("button", { name: /Surrender/ });
    await waitFor(
      async () => {
        const current = screen.getByRole("button", { name: /Surrender/ });
        const stable = current === button;
        button = current;
        if (!stable) throw new Error("the Surrender button was replaced");
        await new Promise((r) => setTimeout(r, 250));
        if (screen.getByRole("button", { name: /Surrender/ }) !== button) throw new Error("the Surrender button was replaced");
      },
      { timeout: slow(10_000) },
    );
    expect(button).not.toHaveAttribute("aria-busy");
    await userEvent.click(button);
    expect(screen.getByRole("button", { name: /Surrender/ })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: /Surrender/ })).toBeDisabled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    gate.open();
    const dialog = await screen.findByRole("dialog", { name: "Surrender this game?" }, { timeout: slow(5000) });
    expect(within(dialog).getByRole("button", { name: "Surrender" })).toBeInTheDocument();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  }, slow(60_000));
});
