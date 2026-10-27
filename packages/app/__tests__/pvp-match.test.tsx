import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import { useState, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatInteger } from "@paved/game-core";
import { PvpMatchScene, type MatchView } from "../src/components/scenes/pvp-match-scene";
import { MATCH_ATTACK, MATCH_DEFENCE, matchAt } from "../src/mocks/pvp-match";

// The match page's scene (#786): one board, two views switched by the two-segment control (each view's score) or by a flick
// across the board; the replay's step-through on the build's view; the board fades back in on a switch, a cut under reduced motion.

const wrap = (ui: ReactNode, reducedMotion: "never" | "always" = "never") => (
  <LazyMotion features={domMax}>
    <MotionConfig reducedMotion={reducedMotion}>{ui}</MotionConfig>
  </LazyMotion>
);

/** The scene with its view held, as the page holds it. */
function Held({ match = MATCH_ATTACK, onView }: { match?: typeof MATCH_ATTACK; onView?: (v: MatchView) => void }) {
  const [view, setView] = useState<MatchView>("village");
  return (
    <PvpMatchScene
      {...matchAt(match, view)}
      onView={(v) => {
        onView?.(v);
        setView(v);
      }}
      onBack={() => {}}
    />
  );
}

const views = () => screen.getByRole("radiogroup", { name: "Match view" });
const board = () => document.querySelector<HTMLElement>("[data-view]")!;
/** A flick across the board: down, then up `dx` px away at once. */
function flick(dx: number, dy = 0) {
  const target = board().firstElementChild!;
  fireEvent.pointerDown(target, { clientX: 200, clientY: 300 });
  fireEvent.pointerUp(target, { clientX: 200 + dx, clientY: 300 + dy });
}

afterEach(cleanup);

describe("the match scene (#786)", () => {
  it("opens on the village with both scores in the switch; a tap shows the build, its meter and its replay", async () => {
    render(wrap(<Held />));
    const village = matchAt(MATCH_ATTACK, "village");
    expect(screen.getByRole("heading", { name: `Attack on ${MATCH_ATTACK.rival.name}` })).toBeInTheDocument();
    const [onVillage, onBuild] = within(views()).getAllByRole("radio");
    expect(onVillage).toHaveAccessibleName(`Village, ${formatInteger(village.target)} points`);
    expect(onVillage).toHaveAttribute("data-state", "on");
    expect(onBuild).toHaveAccessibleName(`Your attack, ${formatInteger(village.final.score)} points, ${village.final.stars} of 3 stars`);
    expect(board()).toHaveAttribute("data-view", "village");
    expect(screen.getByText("As it was when the attack began")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Replay" })).toBeNull();
    expect(screen.queryByRole("meter")).toBeNull();

    await userEvent.click(onBuild!);
    expect(board()).toHaveAttribute("data-view", "build");
    expect(screen.getByRole("group", { name: "Replay" })).toBeInTheDocument();
    expect(screen.getByRole("meter")).toBeInTheDocument();
    await userEvent.click(within(views()).getAllByRole("radio")[0]!);
    expect(board()).toHaveAttribute("data-view", "village");
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

  it("a defence: the player's village and the rival's attack", () => {
    render(wrap(<Held match={MATCH_DEFENCE} />));
    expect(screen.getByRole("heading", { name: `Defence: ${MATCH_DEFENCE.rival.name}` })).toBeInTheDocument();
    expect(within(views()).getByText("Your village")).toBeInTheDocument();
    expect(within(views()).getByText("Their attack")).toBeInTheDocument();
  });

  for (const reduced of ["never", "always"] as const) {
    it(`a switch ${reduced === "never" ? "fades the board back in" : "cuts, under reduced motion"}`, async () => {
      render(wrap(<Held />, reduced));
      expect(board().style.opacity).toBe("");
      await userEvent.click(within(views()).getAllByRole("radio")[1]!);
      if (reduced === "always") {
        expect(board().style.opacity).toBe("");
      } else {
        await waitFor(() => expect(board().style.opacity).not.toBe(""));
      }
    });
  }
});
