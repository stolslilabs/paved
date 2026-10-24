import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, domMax } from "motion/react";
import { describe, expect, it, vi } from "vitest";
import { OverScene } from "../src/components/scenes/over-scene";
import { OVER } from "../src/mocks/scenes";

// The final board's chunk fails twice (a dropped connection), then loads (#539): at the screen's open, under the scores
// (#720), and at the first "Board".
const load = vi.hoisted(() => ({ failures: 2 }));
vi.mock("../src/components/containers/final-board", async (actual) => {
  if (load.failures-- > 0) throw new Error("Failed to fetch dynamically imported module");
  return actual();
});

describe("OverScene: the final board after a failed load", () => {
  it("under the scores a failure is silent; asked for, it falls back to the scores, and the next Board loads it again", async () => {
    render(
      <LazyMotion features={domMax}>
        <OverScene {...OVER.training} />
      </LazyMotion>,
    );
    // The load at the open fails: the scores stay over the board's colour, nothing said.
    await waitFor(() => expect(screen.queryByTestId("final-board")).toBeNull());
    expect(load.failures).toBe(1);
    const toggle = screen.getByRole("radiogroup", { name: "Show" });
    await userEvent.click(within(toggle).getByRole("radio", { name: "Board" }));
    // The failure asked for: back on the scores, the board not mounted.
    await waitFor(() => expect(within(toggle).getByRole("radio", { name: "Scores" })).toBeChecked());
    await waitFor(() => expect(screen.queryByTestId("final-board")).toBeNull());

    await userEvent.click(within(toggle).getByRole("radio", { name: "Board" }));
    expect(await within(await screen.findByTestId("final-board")).findByRole("img", { name: /Board of \d+ tiles/ })).toBeInTheDocument();
    expect(screen.queryByText("Loading the board…")).toBeNull();
    expect(load.failures).toBeLessThan(0);
  });
});
