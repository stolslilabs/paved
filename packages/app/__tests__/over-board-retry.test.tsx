import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, domMax } from "motion/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { OVER } from "../src/mocks/scenes";
import { slow } from "../test-slow";

// The final board's chunk fails twice (a dropped connection), then loads (#539): at the screen's open, under the scores
// (#720), and at the first "Board". On a Challenge's end, whose toggle shows which view is up; Training's shares the load.
const load = { failures: 2, module: null as unknown };

describe("OverScene: the final board after a failed load", () => {
  // The final board's real module and the renderer under it, transformed and evaluated ahead of the test (before the mock is
  // registered, so it holds no failure count), and the load that answers is that module, already in hand: the wait for the board holds no
  // module work (the cold transform a loaded CI stretched past the wait, 5.9 s on #1118's first run; then `actual()` inside the
  // wait, 3 to 356 ms on a loaded machine, while the test failed on main and in 3 pull requests: #1128).
  beforeAll(async () => {
    load.module = await vi.importActual("../src/components/containers/final-board");
  }, slow(30000));
  // Each attempt from the start: its two failures, and a scene whose module-level load is not the last attempt's. Under the slow
  // profile a failed test runs once more (`retry: 1`); that run had no failure left and the board cached, so it always failed.
  let OverScene: typeof import("../src/components/scenes/over-scene").OverScene;
  beforeEach(async () => {
    load.failures = 2;
    vi.resetModules();
    vi.doMock("../src/components/containers/final-board", async () => {
      if (load.failures-- > 0) throw new Error("Failed to fetch dynamically imported module");
      return load.module;
    });
    ({ OverScene } = await import("../src/components/scenes/over-scene"));
  }, slow(30000));

  it("under the scores a failure is silent; asked for, it falls back to the scores, and the next Board loads it again", async () => {
    render(
      <LazyMotion features={domMax}>
        <OverScene {...OVER.awaiting} />
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
