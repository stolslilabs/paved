import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { LeagueControl } from "../src/components/containers/league-control";
import { LEAGUES, leagueOf } from "../src/lib/pvp-rules";

const wrap = (ui: ReactNode, reduced: "never" | "always" = "never") => (
  <LazyMotion features={domMax}>
    <MotionConfig reducedMotion={reduced}>{ui}</MotionConfig>
  </LazyMotion>
);
const control = (crowns: number, onLeague = vi.fn(), reduced: "never" | "always" = "never") => wrap(<LeagueControl crowns={crowns} onLeague={onLeague} />, reduced);
const crest = (c: HTMLElement) => c.querySelector<HTMLElement>("[data-icon=shield-halved]")!;

describe("LeagueControl (#829)", () => {
  it("one button named by the league and the crowns; the crowns shown, no league name", () => {
    render(control(1_240));
    const button = screen.getByRole("button", { name: `League: ${leagueOf(1_240).name}, 1,240 crowns` });
    expect(button).toHaveTextContent(/^1,240$/);
    expect(button).not.toHaveTextContent(leagueOf(1_240).name);
    expect(button.querySelector("[data-icon=trophy]")).not.toBeNull();
    expect(button.querySelector("[data-icon=crown]")).not.toBeNull();
  });

  it("the trophy over the plate's left end, the crest closing its right end", () => {
    const { container } = render(control(1_240));
    const plate = container.querySelector<HTMLElement>("[data-side=right]")!;
    expect(plate.firstElementChild).toHaveAttribute("data-slot", "plate-lead");
    expect(plate.firstElementChild!.querySelector("[data-icon=trophy]")).not.toBeNull();
    expect(plate.lastElementChild!.querySelector("[data-icon=shield-halved]")).not.toBeNull();
  });

  it("the crest in its group's colour: Wood grey, a group's, Grand Master; one crown named singular", () => {
    const { container, rerender } = render(control(0));
    expect(crest(container)).toHaveClass("text-league-wood");
    rerender(control(1_240));
    expect(crest(container)).toHaveClass(`text-league-${leagueOf(1_240).id}`);
    rerender(control(5_320));
    expect(crest(container)).toHaveClass("text-league-grandmaster");
    rerender(control(1));
    expect(screen.getByRole("button", { name: `League: ${leagueOf(1).name}, 1 crown` })).toBeInTheDocument();
  });

  it("the League page's (#859): the chain's league over the count's, no trophy, its own name", () => {
    render(wrap(<LeagueControl crowns={380} league={LEAGUES[1]!} variant="page" label="Your league: Iron III, 380 crowns. Show it" />));
    const button = screen.getByRole("button", { name: "Your league: Iron III, 380 crowns. Show it" });
    expect(button).toHaveAttribute("data-league", "iron");
    // The crowns and the crest alone: no trophy, the page needs no way to itself.
    expect(button.querySelector("[data-icon=trophy]")).toBeNull();
    expect(button.querySelector("[data-slot=plate-lead]")).toBeNull();
    expect(crest(button)).toHaveClass("text-league-iron");
  });

  it("a tap anywhere opens the League page", async () => {
    const onLeague = vi.fn();
    const { container } = render(control(1_240, onLeague));
    await userEvent.click(crest(container));
    await userEvent.click(screen.getByText("1,240"));
    expect(onLeague).toHaveBeenCalledTimes(2);
  });

  it("a promotion pulses a ring round the crest; none under reduced motion, nor on a drop", async () => {
    const { container, rerender } = render(control(1_240));
    expect(container.querySelector("[data-slot=league-promotion]")).toBeNull();
    rerender(control(1_000));
    await act(async () => {});
    expect(container.querySelector("[data-slot=league-promotion]")).toBeNull();
    rerender(control(1_400));
    await waitFor(() => expect(container.querySelector("[data-slot=league-promotion]")).not.toBeNull());

    const reduced = render(control(1_240, vi.fn(), "always"));
    reduced.rerender(control(1_400, vi.fn(), "always"));
    await act(async () => {});
    expect(reduced.container.querySelector("[data-slot=league-promotion]")).toBeNull();
  });
});
