import { render, screen, within } from "@testing-library/react";
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
  // The real module is transformed and evaluated here, ahead of the gate, so that opening the gate costs a cache hit, not a cold
  // transform that a loaded machine stretches past the wait ceiling.
  beforeAll(async () => {
    await vi.importActual("../src/components/containers/surrender-dialog");
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
    expect(screen.getByRole("button", { name: /Surrender/ })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: /Surrender/ })).toBeDisabled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    gate.open();
    const dialog = await screen.findByRole("dialog", { name: "Surrender this game?" }, { timeout: slow(5000) });
    expect(within(dialog).getByRole("button", { name: "Surrender" })).toBeInTheDocument();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });
});
