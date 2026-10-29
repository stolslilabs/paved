import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { DailyMilestonesBar } from "../src/components/containers/daily-milestones-bar";

// The day's progress bar of the Missions page (#869): five steps, the milestones' markers at 3 (+10) and 5 (+15), their claims
// and the Cobbles' burst (none under reduced motion).

const wrap = (ui: ReactNode, reduced = false) => (
  <LazyMotion features={domMax}>
    <MotionConfig reducedMotion={reduced ? "always" : "never"}>{ui}</MotionConfig>
  </LazyMotion>
);
const bar = () => screen.getByRole("progressbar", { name: "Dailies done today" });
const lit = () => bar().querySelectorAll("[data-done]").length;
const burst = () => document.querySelector('[data-burst="cobbles"]');

describe("DailyMilestonesBar (#869)", () => {
  it("lights a step per daily done, and shows both milestones' Cobbles ahead", () => {
    const { rerender } = render(wrap(<DailyMilestonesBar done={0} claimed={0} />));
    expect(bar()).toHaveAttribute("aria-valuenow", "0");
    expect(bar()).toHaveAttribute("aria-valuemax", "5");
    expect(lit()).toBe(0);
    expect(screen.getByRole("img", { name: "10 Cobbles at 3 dailies done" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "15 Cobbles at 5 dailies done" })).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    rerender(wrap(<DailyMilestonesBar done={2} claimed={0} />));
    expect(lit()).toBe(2);
    expect(bar()).toHaveAttribute("aria-valuetext", "2 of 5 dailies done");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("a milestone reached is claimed with a tap, once; then it shows its check", async () => {
    const onClaim = vi.fn();
    const { rerender } = render(wrap(<DailyMilestonesBar done={3} claimed={0} onClaim={onClaim} />));
    await userEvent.click(screen.getByRole("button", { name: "Claim 10 Cobbles: 3 dailies done" }));
    expect(onClaim).toHaveBeenCalledExactlyOnceWith(0);
    expect(screen.getByRole("img", { name: "15 Cobbles at 5 dailies done" })).toBeInTheDocument();
    rerender(wrap(<DailyMilestonesBar done={3} claimed={0} claiming={0} onClaim={onClaim} />));
    expect(screen.getByRole("button", { name: "Claim 10 Cobbles: 3 dailies done" })).toBeDisabled();
    rerender(wrap(<DailyMilestonesBar done={5} claimed={0b01} onClaim={onClaim} />));
    expect(screen.getByRole("img", { name: "10 Cobbles claimed: 3 dailies done" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Claim 15 Cobbles: 5 dailies done" }));
    expect(onClaim).toHaveBeenLastCalledWith(1);
    rerender(wrap(<DailyMilestonesBar done={5} claimed={0b11} onClaim={onClaim} />));
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(within(screen.getByRole("list")).getAllByRole("img", { name: /claimed/ })).toHaveLength(2);
  });

  it("offers no claim without a wallet to sign, nor where the milestones are not served", () => {
    const { rerender } = render(wrap(<DailyMilestonesBar done={5} claimed={0} canClaim={false} />));
    for (const b of screen.getAllByRole("button")) expect(b).toBeDisabled();
    rerender(wrap(<DailyMilestonesBar done={5} claimed={null} />));
    for (const b of screen.getAllByRole("button")) expect(b).toBeDisabled();
  });

  it("bursts Cobbles when a claim lands, not for a day read already claimed, and not under reduced motion", () => {
    const { rerender, unmount } = render(wrap(<DailyMilestonesBar done={5} claimed={0b01} />));
    expect(burst()).toBeNull();
    rerender(wrap(<DailyMilestonesBar done={5} claimed={0b11} />));
    expect(burst()).not.toBeNull();
    unmount();
    const reduced = render(wrap(<DailyMilestonesBar done={5} claimed={0} />, true));
    reduced.rerender(wrap(<DailyMilestonesBar done={5} claimed={0b01} />, true));
    expect(burst()).toBeNull();
    expect(screen.getByRole("img", { name: "10 Cobbles claimed: 3 dailies done" })).toBeInTheDocument();
  });
});
