import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { formatInteger } from "@paved/game-core";
import { HomeVillageScene } from "../src/components/scenes/home-village-scene";
import { VillageLayoutScene } from "../src/components/scenes/village-layout-scene";
import { HOME_VILLAGE, VILLAGE_LAYOUT } from "../src/mocks/village-v2";

// V2-SAVE-SCORE (#802): no "Layout saved" notice after a save; back in view, the village score counts to the new one once,
// the balances' way (the change's colour, a "+N" or "−N", the icon's pop), and a polite message says it.

const wrap = (ui: ReactNode, reducedMotion: "never" | "always" = "never") => (
  <LazyMotion features={domMax}>
    <MotionConfig reducedMotion={reducedMotion}>{ui}</MotionConfig>
  </LazyMotion>
);
afterEach(cleanup);

const { score, previous } = HOME_VILLAGE.saved.saved;
const gain = formatInteger(score - previous);
const chip = (n: number) => screen.getByRole("button", { name: `Village score ${formatInteger(n)}` });
const floating = (root: HTMLElement) => root.querySelectorAll("[data-slot=score-count] [data-slot=resource-change]");
/** The count, its own chunk, in. */
const counted = (root: HTMLElement) => waitFor(() => expect(root.querySelector("[data-slot=score-count]")).not.toBeNull());

describe("the home's score chip after a save (#802)", () => {
  it("shows no notice; the chip counts up to the new score with its +N, and the message says it", async () => {
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.saved} />));
    expect(screen.queryByText("Layout saved")).toBeNull();
    expect(screen.queryByText(/attackers play against it/)).toBeNull();
    const button = chip(score);
    await counted(button);
    expect(floating(button)).toHaveLength(1);
    expect(floating(button)[0]).toHaveTextContent(`+${gain}`);
    expect(button.querySelector("[data-slot=score-count] > .text-success")).not.toBeNull();
    expect(screen.getByText(`Village saved: score ${formatInteger(score)}`)).toHaveAttribute("role", "status");
  });

  it("a lower score counts down with its −N", async () => {
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.savedLower} />));
    const button = chip(HOME_VILLAGE.savedLower.saved.score);
    await counted(button);
    expect(floating(button)[0]).toHaveTextContent(`−${gain}`);
    expect(button.querySelector("[data-slot=score-count] > .text-warning")).not.toBeNull();
  });

  it("an unchanged score plays nothing", async () => {
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.savedSame} />));
    const button = chip(HOME_VILLAGE.savedSame.saved.score);
    await counted(button);
    expect(floating(button)).toHaveLength(0);
    expect(button.querySelector(".text-success, .text-warning")).toBeNull();
  });

  it("under reduced motion only the colour changes", async () => {
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.saved} />, "always"));
    const button = chip(score);
    await counted(button);
    expect(floating(button)).toHaveLength(0);
    expect(button.querySelector("[data-slot=score-count] > .text-success")).not.toBeNull();
  });

  it("plays once, as edit mode closes; a later return to the home replays nothing", async () => {
    const before = { ...HOME_VILLAGE.view, village: { ...HOME_VILLAGE.view.village, score: previous } };
    const { rerender, unmount } = render(wrap(<HomeVillageScene {...before} editing />));
    // In edit mode: no chip, no message.
    expect(screen.queryByRole("button", { name: /^Village score/ })).toBeNull();
    expect(screen.queryByText(/^Village saved/)).toBeNull();
    // The save lands: edit mode closes on it, the village's read comes later.
    rerender(wrap(<HomeVillageScene {...before} saved={{ score, previous }} />));
    await counted(chip(score));
    expect(floating(chip(score))).toHaveLength(1);
    expect(screen.getByText(`Village saved: score ${formatInteger(score)}`)).toBeInTheDocument();
    // The read has the new score: nothing plays again.
    rerender(wrap(<HomeVillageScene {...HOME_VILLAGE.saved} />));
    expect(floating(chip(score))).toHaveLength(1);
    unmount();
    // Back on the home later (the page's save forgotten): the score, still.
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.saved} saved={null} />));
    expect(floating(chip(score))).toHaveLength(0);
    expect(screen.queryByText(/^Village saved/)).toBeNull();
  });
});

describe("the village page's score after a save (#802, open point 1)", () => {
  it("shows no notice; its score counts up with its +N, and the message says it", async () => {
    const { container } = render(wrap(<VillageLayoutScene {...VILLAGE_LAYOUT.saved} />));
    expect(screen.queryByText("Layout saved")).toBeNull();
    await counted(container);
    expect(screen.getByTestId("score-value")).toHaveTextContent(formatInteger(VILLAGE_LAYOUT.saved.saved.score));
    expect(floating(container)[0]).toHaveTextContent(`+${gain}`);
    expect(screen.getByText(`Village saved: score ${formatInteger(VILLAGE_LAYOUT.saved.saved.score)}`)).toHaveAttribute("role", "status");
  });

  it("an unchanged score plays nothing", async () => {
    const { container } = render(wrap(<VillageLayoutScene {...VILLAGE_LAYOUT.savedSame} />));
    await counted(container);
    expect(floating(container)).toHaveLength(0);
  });
});
