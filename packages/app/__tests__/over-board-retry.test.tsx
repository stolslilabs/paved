import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, domMax } from "motion/react";
import { describe, expect, it, vi } from "vitest";
import { OverScene } from "../src/components/scenes/over-scene";
import { OVER } from "../src/mocks/scenes";

// The final board's chunk fails once (a dropped connection), then loads (#539).
const load = vi.hoisted(() => ({ failures: 1 }));
vi.mock("../src/components/containers/final-board", async (actual) => {
  if (load.failures-- > 0) throw new Error("Failed to fetch dynamically imported module");
  return actual();
});

describe("OverScene: the final board after a failed load", () => {
  it("falls back to the scores, and the next Board loads it again", async () => {
    render(
      <LazyMotion features={domMax}>
        <OverScene {...OVER.training} />
      </LazyMotion>,
    );
    const toggle = screen.getByRole("radiogroup", { name: "Show" });
    await userEvent.click(within(toggle).getByRole("radio", { name: "Board" }));
    // The failure: back on the scores, the board not mounted.
    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: "Final score" })).toBeInTheDocument());
    await waitFor(() => expect(screen.queryByTestId("final-board")).toBeNull());

    await userEvent.click(within(toggle).getByRole("radio", { name: "Board" }));
    expect(await within(await screen.findByTestId("final-board")).findByRole("img", { name: /Board of \d+ tiles/ })).toBeInTheDocument();
    expect(screen.queryByText("Loading the board…")).toBeNull();
    expect(load.failures).toBeLessThan(0);
  });
});
