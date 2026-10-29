import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { DailyMilestonesBar, GIFT_REVEAL_S } from "../src/components/containers/daily-milestones-bar";

// The day's milestones graph of the Missions page (#869, reworked 2026-10-29): five edges, one per daily, between six nodes; the
// gift nodes at 3 (+10) and 5 (+15) carry the rewards, the four others are plain; their claims, the gifts' opening and the Cobbles'
// burst (none under reduced motion).

const wrap = (ui: ReactNode, reduced = false) => (
  <LazyMotion features={domMax}>
    <MotionConfig reducedMotion={reduced ? "always" : "never"}>{ui}</MotionConfig>
  </LazyMotion>
);
const bar = () => screen.getByRole("progressbar", { name: "Dailies done today" });
const lit = () => bar().querySelectorAll("[data-done]").length;
const burst = () => document.querySelector('[data-burst="cobbles"]');

const plain = () => document.querySelectorAll("[data-node]");
const full = () => document.querySelectorAll("[data-milestone]");
/** Each reward node's gift, by its state. */
const gifts = () => [...document.querySelectorAll('[data-milestone] [data-slot="gift-art"]')].map((g) => g.getAttribute("data-state"));
const reveal = () => document.querySelector("[data-reveal]");

describe("DailyMilestonesBar (#869)", () => {
  it("draws each reward as a gift, no figure on it: greyed ahead, shaking once reached, fast while claimed, still without a claim", () => {
    const { rerender, unmount } = render(wrap(<DailyMilestonesBar done={2} claimed={0} />));
    expect(gifts()).toEqual(["locked", "locked"]);
    // The figure is in the node's name, not on it.
    expect(screen.queryByText("+10")).not.toBeInTheDocument();
    rerender(wrap(<DailyMilestonesBar done={3} claimed={0} />));
    expect(gifts()).toEqual(["ready", "locked"]);
    rerender(wrap(<DailyMilestonesBar done={3} claimed={0} claiming={0} />));
    expect(gifts()).toEqual(["shaking", "locked"]);
    rerender(wrap(<DailyMilestonesBar done={5} claimed={0} canClaim={false} />));
    expect(gifts()).toEqual(["lit", "lit"]);
    // A day read already claimed (not a claim seen landing): its gift open at once.
    unmount();
    render(wrap(<DailyMilestonesBar done={5} claimed={0b01} />));
    expect(gifts()).toEqual(["open", "ready"]);
    expect(reveal()).toBeNull();
  });

  it("opens the gift when its claim lands, its Cobbles shown, then leaves it open; open at once under reduced motion", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const { rerender, unmount } = render(wrap(<DailyMilestonesBar done={5} claimed={0b01} />));
      // A day read already claimed: its gift open, no reveal.
      expect(gifts()).toEqual(["open", "ready"]);
      rerender(wrap(<DailyMilestonesBar done={5} claimed={0b11} />));
      expect(gifts()).toEqual(["open", "opening"]);
      expect(screen.getByRole("img", { name: "15 Cobbles claimed: 5 dailies done" })).toHaveAttribute("data-opening");
      expect(document.querySelector('[data-reveal="5"]')).toHaveTextContent("+15");
      act(() => vi.advanceTimersByTime(GIFT_REVEAL_S * 1000));
      expect(gifts()).toEqual(["open", "open"]);
      expect(reveal()).toBeNull();
      unmount();
      const reduced = render(wrap(<DailyMilestonesBar done={5} claimed={0} />, true));
      reduced.rerender(wrap(<DailyMilestonesBar done={5} claimed={0b01} />, true));
      expect(gifts()).toEqual(["open", "ready"]);
      expect(reveal()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("holds a gift open at its reveal for the stories", () => {
    render(wrap(<DailyMilestonesBar done={3} claimed={0b01} revealing={0} />));
    expect(gifts()).toEqual(["opening", "locked"]);
    expect(document.querySelector('[data-reveal="3"]')).toHaveTextContent("+10");
  });

  it("draws a graph: an edge per daily, a gift node per reward, a plain node elsewhere", () => {
    const { rerender } = render(wrap(<DailyMilestonesBar done={2} claimed={0} />));
    expect(bar().querySelectorAll("[data-step]")).toHaveLength(5);
    expect([...full()].map((n) => n.getAttribute("data-milestone"))).toEqual(["3", "5"]);
    expect([...plain()].map((n) => n.getAttribute("data-node"))).toEqual(["0", "1", "2", "4"]);
    // The start and the two dailies done are reached.
    expect([...plain()].filter((n) => n.hasAttribute("data-reached")).map((n) => n.getAttribute("data-node"))).toEqual(["0", "1", "2"]);
    // The Cobbles not read: the plain nodes alone.
    rerender(wrap(<DailyMilestonesBar done={2} claimed={0} rewards={false} />));
    expect(full()).toHaveLength(0);
    expect(plain()).toHaveLength(6);
    expect(screen.queryByRole("img", { name: /Cobbles/ })).not.toBeInTheDocument();
  });

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

  it("a milestone reached is claimed with a tap, once; then it shows its gift open", async () => {
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
