import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import { useState, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatInteger } from "@paved/game-core";
import type { PvpReplay } from "../src/components/scenes/pvp-attack-scene";
import { PvpMatchScene, type MatchView } from "../src/components/scenes/pvp-match-scene";
import { MATCH_ATTACK, MATCH_DEFENCE, matchAt } from "../src/mocks/pvp-match";

// The match page's scene (#786; MATCH-PAGE, the Paved UX Book's "Battle log"): a page titled "Battle log" with Back; one board
// in a framed panel, its two views switched by two tabs or a flick across the board; the stars over the board's foot and the
// caption under it; the replay's panel, its gold Play or Pause and its timeline. The board fades back in on a switch, a cut under
// reduced motion.

const wrap = (ui: ReactNode, reducedMotion: "never" | "always" = "never") => (
  <LazyMotion features={domMax}>
    <MotionConfig reducedMotion={reducedMotion}>{ui}</MotionConfig>
  </LazyMotion>
);

/** The scene with its view held, as the page holds it; the replay's callbacks spied. */
function Held({ match = MATCH_ATTACK, onView, replay, move, playing }: { match?: typeof MATCH_ATTACK; onView?: (v: MatchView) => void; replay?: Partial<PvpReplay>; move?: number; playing?: boolean }) {
  const [view, setView] = useState<MatchView>("village");
  const args = matchAt(match, view, move, playing);
  return (
    <PvpMatchScene
      {...args}
      replay={{ ...args.replay, ...replay }}
      onView={(v) => {
        onView?.(v);
        setView(v);
      }}
      onBack={() => {}}
    />
  );
}

const views = () => screen.getByRole("tablist", { name: "Match view" });
const board = () => document.querySelector<HTMLElement>("[data-view]")!;
const replayPanel = () => screen.getByRole("region", { name: "Replay" });
/** A flick across the board: down, then up `dx` px away at once. */
function flick(dx: number, dy = 0) {
  const target = board().firstElementChild!;
  fireEvent.pointerDown(target, { clientX: 200, clientY: 300 });
  fireEvent.pointerUp(target, { clientX: 200 + dx, clientY: 300 + dy });
}

afterEach(cleanup);

describe("the match scene (#786, MATCH-PAGE)", () => {
  it("is titled Battle log; opens on the rival's village; a tab shows the attack's build", async () => {
    render(wrap(<Held />));
    const village = matchAt(MATCH_ATTACK, "village");
    expect(screen.getByRole("heading", { name: "Battle log" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
    const [onVillage, onBuild] = within(views()).getAllByRole("tab");
    expect(onVillage).toHaveTextContent("Rival");
    expect(onVillage).toHaveAccessibleName(`Rival, ${formatInteger(village.target)} points`);
    expect(onVillage).toHaveAttribute("aria-selected", "true");
    expect(onBuild).toHaveTextContent("Your attack");
    expect(onBuild).toHaveAccessibleName(`Your attack, ${formatInteger(village.final.score)} points, ${village.final.stars} of 3 stars`);
    expect(board()).toHaveAttribute("data-view", "village");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("The rival's village as it was when the attack began.");

    await userEvent.click(onBuild!);
    expect(board()).toHaveAttribute("data-view", "build");
    expect(within(views()).getAllByRole("tab")[1]).toHaveAttribute("aria-selected", "true");
    // The tabs take the arrow keys (Radix): back to the village.
    await userEvent.keyboard("{ArrowLeft}");
    expect(board()).toHaveAttribute("data-view", "village");
  });

  it("shows the match's stars over the board and its caption: the side, the rival, the score, the crowns", () => {
    render(wrap(<Held />));
    const { final } = matchAt(MATCH_ATTACK, "village");
    expect(screen.getByRole("img", { name: `${final.stars} of 3 stars` })).toHaveAttribute("data-stars", String(final.stars));
    const caption = document.querySelector<HTMLElement>("[data-slot=match-caption]")!;
    expect(caption).toHaveTextContent(`Attack·${MATCH_ATTACK.rival.name}·${formatInteger(final.score)}·`);
    expect(within(caption).getByRole("img", { name: "+30 crowns" })).toHaveTextContent("+30");
  });

  it("a flick across the board switches: left to the build, right to the village; a slow or vertical drag stays the board's", () => {
    const onView = vi.fn();
    render(wrap(<Held onView={onView} />));
    flick(-120, 10);
    expect(board()).toHaveAttribute("data-view", "build");
    flick(-120);
    expect(onView).toHaveBeenCalledTimes(1);
    flick(30);
    flick(80, 120);
    expect(board()).toHaveAttribute("data-view", "build");
    flick(120);
    expect(board()).toHaveAttribute("data-view", "village");
    expect(onView.mock.calls.map((c) => c[0])).toEqual(["build", "village"]);
  });

  it("the replay: Play from the village shows the build and plays; the timeline goes to a move; Pause while it plays", async () => {
    const onPlay = vi.fn();
    const onSeek = vi.fn();
    render(wrap(<Held replay={{ onPlay, onSeek }} />));
    const total = MATCH_ATTACK.steps.length - 1;
    expect(replayPanel()).toHaveTextContent(`Move ${total} / ${total}`);
    await userEvent.click(within(replayPanel()).getByRole("button", { name: "Play from the start" }));
    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(board()).toHaveAttribute("data-view", "build");

    const slider = within(replayPanel()).getByRole("slider", { name: "Move" });
    expect(slider).toHaveAttribute("aria-valuenow", String(total));
    expect(slider).toHaveAttribute("aria-valuetext", `Move ${total} of ${total}`);
    slider.focus();
    await userEvent.keyboard("{Home}");
    expect(onSeek).toHaveBeenLastCalledWith(0);
  });

  it("while it plays: Pause, the move shown at the bar's end, its dots gold up to it; the village's tab pauses it", async () => {
    const onPause = vi.fn();
    render(wrap(<Held move={14} playing replay={{ onPause }} />));
    const total = MATCH_ATTACK.steps.length - 1;
    expect(replayPanel()).toHaveTextContent(`Move 14 / ${total}`);
    expect(replayPanel().querySelector("[data-slot=match-move]")).toHaveTextContent(`Move 14 / ${total}`);
    const dots = [...replayPanel().querySelectorAll<HTMLElement>("[data-slot=match-dot]")];
    expect(dots.length).toBeGreaterThan(8);
    const done = dots.filter((d) => d.dataset.done !== undefined).length;
    expect(done).toBeGreaterThan(0);
    expect(done).toBeLessThan(dots.length);
    await userEvent.click(within(views()).getAllByRole("tab")[1]!);
    await userEvent.click(within(views()).getAllByRole("tab")[0]!);
    expect(onPause).toHaveBeenCalledTimes(1);
    await userEvent.click(within(replayPanel()).getByRole("button", { name: "Pause" }));
    expect(onPause).toHaveBeenCalledTimes(2);
  });

  it("a defence: the owner's labels, You and Rival; its caption and the crowns lost", () => {
    render(wrap(<Held match={MATCH_DEFENCE} />));
    const [onVillage, onBuild] = within(views()).getAllByRole("tab");
    expect(onVillage).toHaveTextContent("You");
    expect(onBuild).toHaveTextContent("Rival");
    const caption = document.querySelector<HTMLElement>("[data-slot=match-caption]")!;
    expect(caption).toHaveTextContent(`Defence·${MATCH_DEFENCE.rival.name}·`);
    expect(within(caption).getByRole("img", { name: "-12 crowns" })).toHaveTextContent("−12");
  });

  for (const reduced of ["never", "always"] as const) {
    it(`a switch ${reduced === "never" ? "fades the board back in" : "cuts, under reduced motion"}`, async () => {
      render(wrap(<Held />, reduced));
      expect(board().style.opacity).toBe("");
      await userEvent.click(within(views()).getAllByRole("tab")[1]!);
      if (reduced === "always") {
        expect(board().style.opacity).toBe("");
      } else {
        await waitFor(() => expect(board().style.opacity).not.toBe(""));
      }
    });
  }
});
