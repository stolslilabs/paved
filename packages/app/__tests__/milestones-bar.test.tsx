import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { GIFT_REVEAL_S, MilestonesBar } from "../src/components/containers/milestones-bar";

// The milestones graph of the Missions page, the day's (#869, reworked 2026-10-29) and the week's (#976): five edges, one per
// quest of the period, between six nodes; the gift nodes at 3 and 5 carry the rewards (the day's +10 and +15, the week's +50 and
// +100), the four others are plain; their claims, the gifts' opening and the Cobbles' burst (none under reduced motion).

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

describe("MilestonesBar, the day's (#869)", () => {
  it("draws each reward as a gift, no figure on it: greyed ahead, shaking once reached, fast while claimed, still without a claim", () => {
    const { rerender, unmount } = render(wrap(<MilestonesBar done={2} claimed={0} />));
    expect(gifts()).toEqual(["locked", "locked"]);
    // The figure is in the node's name, not on it.
    expect(screen.queryByText("+10")).not.toBeInTheDocument();
    rerender(wrap(<MilestonesBar done={3} claimed={0} />));
    expect(gifts()).toEqual(["ready", "locked"]);
    rerender(wrap(<MilestonesBar done={3} claimed={0} claiming={0} />));
    expect(gifts()).toEqual(["shaking", "locked"]);
    rerender(wrap(<MilestonesBar done={5} claimed={0} canClaim={false} />));
    expect(gifts()).toEqual(["lit", "lit"]);
    // A day read already claimed (not a claim seen landing): its gift open at once.
    unmount();
    render(wrap(<MilestonesBar done={5} claimed={0b01} />));
    expect(gifts()).toEqual(["open", "ready"]);
    expect(reveal()).toBeNull();
  });

  it("opens the gift when its claim lands, its Cobbles shown, then leaves it open; under reduced motion the gift open and its Cobbles shown at once, still", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const { rerender, unmount } = render(wrap(<MilestonesBar done={5} claimed={0b01} />));
      // A day read already claimed: its gift open, no reveal.
      expect(gifts()).toEqual(["open", "ready"]);
      rerender(wrap(<MilestonesBar done={5} claimed={0b11} />));
      expect(gifts()).toEqual(["open", "opening"]);
      expect(screen.getByRole("img", { name: "15 Cobbles claimed: 5 dailies done" })).toHaveAttribute("data-opening");
      expect(document.querySelector('[data-reveal="5"]')).toHaveTextContent("+15");
      act(() => vi.advanceTimersByTime(GIFT_REVEAL_S * 1000));
      expect(gifts()).toEqual(["open", "open"]);
      expect(reveal()).toBeNull();
      unmount();
      const reduced = render(wrap(<MilestonesBar done={5} claimed={0} />, true));
      reduced.rerender(wrap(<MilestonesBar done={5} claimed={0b01} />, true));
      // Under reduced motion the amount still shows, in place (its final frame, no rise), the gift open; then it goes as above.
      expect(gifts()).toEqual(["opening", "ready"]);
      expect(document.querySelector('[data-reveal="3"]')).toHaveTextContent("+10");
      expect((document.querySelector('[data-reveal="3"]') as HTMLElement).style.opacity).not.toBe("0");
      expect(document.querySelector('[data-part="lid"]')).not.toBeNull();
      act(() => vi.advanceTimersByTime(GIFT_REVEAL_S * 1000));
      expect(gifts()).toEqual(["open", "ready"]);
      expect(reveal()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("holds a gift open at its reveal for the stories", () => {
    render(wrap(<MilestonesBar done={3} claimed={0b01} revealing={0} />));
    expect(gifts()).toEqual(["opening", "locked"]);
    expect(document.querySelector('[data-reveal="3"]')).toHaveTextContent("+10");
  });

  it("draws a graph: an edge per daily, a gift node per reward, a plain node elsewhere", () => {
    const { rerender } = render(wrap(<MilestonesBar done={2} claimed={0} />));
    expect(bar().querySelectorAll("[data-step]")).toHaveLength(5);
    expect([...full()].map((n) => n.getAttribute("data-milestone"))).toEqual(["3", "5"]);
    expect([...plain()].map((n) => n.getAttribute("data-node"))).toEqual(["0", "1", "2", "4"]);
    // The start and the two dailies done are reached.
    expect([...plain()].filter((n) => n.hasAttribute("data-reached")).map((n) => n.getAttribute("data-node"))).toEqual(["0", "1", "2"]);
    // The Cobbles not read: the plain nodes alone.
    rerender(wrap(<MilestonesBar done={2} claimed={0} rewards={false} />));
    expect(full()).toHaveLength(0);
    expect(plain()).toHaveLength(6);
    expect(screen.queryByRole("img", { name: /Cobbles/ })).not.toBeInTheDocument();
  });

  it("lights a step per daily done, and shows both milestones' Cobbles ahead", () => {
    const { rerender } = render(wrap(<MilestonesBar done={0} claimed={0} />));
    expect(bar()).toHaveAttribute("aria-valuenow", "0");
    expect(bar()).toHaveAttribute("aria-valuemax", "5");
    expect(lit()).toBe(0);
    expect(screen.getByRole("img", { name: "10 Cobbles at 3 dailies done" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "15 Cobbles at 5 dailies done" })).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    rerender(wrap(<MilestonesBar done={2} claimed={0} />));
    expect(lit()).toBe(2);
    expect(bar()).toHaveAttribute("aria-valuetext", "2 of 5 dailies done");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("a milestone reached is claimed with a tap, once; then it shows its gift open", async () => {
    const onClaim = vi.fn();
    const { rerender } = render(wrap(<MilestonesBar done={3} claimed={0} onClaim={onClaim} />));
    await userEvent.click(screen.getByRole("button", { name: "Claim 10 Cobbles: 3 dailies done" }));
    expect(onClaim).toHaveBeenCalledExactlyOnceWith(0);
    expect(screen.getByRole("img", { name: "15 Cobbles at 5 dailies done" })).toBeInTheDocument();
    rerender(wrap(<MilestonesBar done={3} claimed={0} claiming={0} onClaim={onClaim} />));
    expect(screen.getByRole("button", { name: "Claim 10 Cobbles: 3 dailies done" })).toHaveAttribute("aria-disabled", "true");
    rerender(wrap(<MilestonesBar done={5} claimed={0b01} onClaim={onClaim} />));
    expect(screen.getByRole("img", { name: "10 Cobbles claimed: 3 dailies done" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Claim 15 Cobbles: 5 dailies done" }));
    expect(onClaim).toHaveBeenLastCalledWith(1);
    rerender(wrap(<MilestonesBar done={5} claimed={0b11} onClaim={onClaim} />));
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(within(screen.getByRole("list")).getAllByRole("img", { name: /claimed/ })).toHaveLength(2);
  });

  it("offers no claim without a wallet to sign, nor where the milestones are not served", async () => {
    const onClaim = vi.fn();
    const { rerender } = render(wrap(<MilestonesBar done={5} claimed={0} canClaim={false} onClaim={onClaim} />));
    await userEvent.click(screen.getByRole("button", { name: "Claim 10 Cobbles: 3 dailies done" }));
    expect(onClaim).not.toHaveBeenCalled();
    // Not claimable, still focusable (aria-disabled), so its tooltip opens (#989); a tap claims nothing.
    for (const b of screen.getAllByRole("button")) expect(b).toHaveAttribute("aria-disabled", "true");
    rerender(wrap(<MilestonesBar done={5} claimed={null} />));
    // Not claimable, still focusable (aria-disabled), so its tooltip opens (#989); a tap claims nothing.
    for (const b of screen.getAllByRole("button")) expect(b).toHaveAttribute("aria-disabled", "true");
  });

  it("bursts Cobbles when a claim lands, not for a day read already claimed, and not under reduced motion", () => {
    const { rerender, unmount } = render(wrap(<MilestonesBar done={5} claimed={0b01} />));
    expect(burst()).toBeNull();
    rerender(wrap(<MilestonesBar done={5} claimed={0b11} />));
    expect(burst()).not.toBeNull();
    unmount();
    const reduced = render(wrap(<MilestonesBar done={5} claimed={0} />, true));
    reduced.rerender(wrap(<MilestonesBar done={5} claimed={0b01} />, true));
    expect(burst()).toBeNull();
    expect(screen.getByRole("img", { name: "10 Cobbles claimed: 3 dailies done" })).toBeInTheDocument();
  });
});

describe("MilestonesBar, the week's (#976)", () => {
  const week = () => screen.getByRole("progressbar", { name: "Weeklies done this week" });

  it("draws the week: an edge per weekly, its two gifts at 3 (+50) and 5 (+100), larger than the day's", () => {
    render(wrap(<MilestonesBar period="weekly" done={2} claimed={0} />));
    expect(week()).toHaveAttribute("aria-valuemax", "5");
    expect(week()).toHaveAttribute("aria-valuetext", "2 of 5 weeklies done");
    expect(week().querySelectorAll("[data-step]")).toHaveLength(5);
    expect(screen.getByRole("list", { name: "Weekly milestones" })).toBeInTheDocument();
    expect(document.querySelector('[data-graph="weekly-milestones"]')).not.toBeNull();
    expect([...full()].map((n) => n.getAttribute("data-milestone"))).toEqual(["3", "5"]);
    expect(screen.getByRole("img", { name: "50 Cobbles at 3 weeklies done" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "100 Cobbles at 5 weeklies done" })).toBeInTheDocument();
    // The week's discs are 2.5rem (40 px), the day's 2rem (32 px).
    const disc = (name: string) => (screen.getByRole("img", { name }).firstElementChild as HTMLElement).style.width;
    expect(disc("50 Cobbles at 3 weeklies done")).toBe("2.5rem");
    cleanup();
    render(wrap(<MilestonesBar done={2} claimed={0} />));
    expect(disc("10 Cobbles at 3 dailies done")).toBe("2rem");
  });

  it("a reached gift of the week is claimed with a tap, once, and opens with its Cobbles; under reduced motion at once", async () => {
    const onClaim = vi.fn();
    const { rerender, unmount } = render(wrap(<MilestonesBar period="weekly" done={5} claimed={0} onClaim={onClaim} />));
    await userEvent.click(screen.getByRole("button", { name: "Claim 100 Cobbles: 5 weeklies done" }));
    expect(onClaim).toHaveBeenCalledExactlyOnceWith(1);
    rerender(wrap(<MilestonesBar period="weekly" done={5} claimed={0b10} onClaim={onClaim} />));
    expect(gifts()).toEqual(["ready", "opening"]);
    expect(document.querySelector('[data-reveal="5"]')).toHaveTextContent("+100");
    expect(burst()).not.toBeNull();
    unmount();
    const reduced = render(wrap(<MilestonesBar period="weekly" done={3} claimed={0} />, true));
    reduced.rerender(wrap(<MilestonesBar period="weekly" done={3} claimed={0b01} />, true));
    expect(gifts()).toEqual(["opening", "locked"]);
    expect(document.querySelector('[data-reveal="3"]')).toHaveTextContent("+50");
    expect(burst()).toBeNull();
  });
});

describe("MilestonesBar, the gifts' tooltip (#989)", () => {
  /** The tooltip's sentence: Radix's hidden copy (`role="tooltip"`), the description the gift is read with. */
  const tip = () => screen.queryByRole("tooltip");
  /** The tooltip's visible box. */
  const box = (at: number) => document.querySelector<HTMLElement>(`[data-gift-tip="${at}"]`);
  const touch = (target: Element) => userEvent.pointer({ keys: "[TouchA]", target });

  it("says what each gift holds, what reaches it and where it stands, in each state, on both bars", () => {
    const cases: [ReactNode, number, string][] = [
      [<MilestonesBar done={1} claimed={0} tip={0} />, 3, "+10 Cobbles, at 3 dailies done: 2 more to go."],
      [<MilestonesBar done={4} claimed={0} tip={1} />, 5, "+15 Cobbles, at 5 dailies done: 1 more to go."],
      [<MilestonesBar done={3} claimed={0} tip={0} />, 3, "+10 Cobbles, at 3 dailies done: Ready to claim."],
      [<MilestonesBar done={5} claimed={0b11} tip={1} />, 5, "+15 Cobbles, at 5 dailies done: Claimed."],
      [<MilestonesBar done={3} claimed={null} tip={0} />, 3, "+10 Cobbles, at 3 dailies done: Reached."],
      [<MilestonesBar period="weekly" done={0} claimed={0} tip={0} />, 3, "+50 Cobbles, at 3 weeklies done: 3 more to go."],
      [<MilestonesBar period="weekly" done={5} claimed={0} tip={1} />, 5, "+100 Cobbles, at 5 weeklies done: Ready to claim."],
      [<MilestonesBar period="weekly" done={5} claimed={0b01} tip={0} />, 3, "+50 Cobbles, at 3 weeklies done: Claimed."],
    ];
    for (const [ui, at, sentence] of cases) {
      render(wrap(ui));
      expect(tip()).toHaveTextContent(sentence);
      const shown = box(at)!;
      // One line per item (the Cobbles' icon and their figure), then what reaches it and where it stands.
      expect(within(shown).getAllByRole("listitem")).toHaveLength(1);
      expect(within(shown).getByRole("listitem")).toHaveTextContent(/^\+[\d,]+Cobbles$/);
      expect(within(shown).getByText(/^At \d (dailies|weeklies) done$/)).toBeInTheDocument();
      // The gift keeps its name; the tooltip describes it.
      expect(document.querySelector(`[data-milestone="${at}"]`)).toHaveAttribute("aria-describedby", tip()!.id);
      cleanup();
    }
  });

  it("with a mouse: hovering a gift opens its tooltip and leaving closes it; a click on a reached gift claims it, no tooltip", async () => {
    const onClaim = vi.fn();
    const user = userEvent.setup();
    render(wrap(<MilestonesBar done={3} claimed={0} onClaim={onClaim} />));
    const locked = screen.getByRole("img", { name: "15 Cobbles at 5 dailies done" });
    await user.hover(locked);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("2 more to go");
    // A click on a gift that does not claim leaves it open.
    await user.click(locked);
    expect(tip()).toHaveTextContent("2 more to go");
    // The pointer leaves it for the page (the Tooltip waits for it to leave the way to its box too).
    await user.unhover(locked);
    await user.pointer({ target: document.body, coords: { clientX: 500, clientY: 500 } });
    await vi.waitFor(() => expect(tip()).toBeNull());
    await user.click(screen.getByRole("button", { name: "Claim 10 Cobbles: 3 dailies done" }));
    expect(onClaim).toHaveBeenCalledExactlyOnceWith(0);
    expect(tip()).toBeNull();
  });

  it("on a touch screen: a tap on a locked or a claimed gift toggles its tooltip, a tap outside closes it, a tap on a reached gift claims", async () => {
    const onClaim = vi.fn();
    const first = render(wrap(<MilestonesBar done={3} claimed={0b01} onClaim={onClaim} />));
    const claimed = screen.getByRole("img", { name: "10 Cobbles claimed: 3 dailies done" });
    await touch(claimed);
    expect(tip()).toHaveTextContent("+10 Cobbles, at 3 dailies done: Claimed.");
    // The gift again closes it.
    await touch(claimed);
    expect(tip()).toBeNull();
    await touch(screen.getByRole("img", { name: "15 Cobbles at 5 dailies done" }));
    expect(tip()).toHaveTextContent("2 more to go");
    // A tap outside.
    await touch(document.body);
    await vi.waitFor(() => expect(tip()).toBeNull());
    first.unmount();
    const reached = render(wrap(<MilestonesBar done={3} claimed={0} onClaim={onClaim} />));
    await touch(screen.getByRole("button", { name: "Claim 10 Cobbles: 3 dailies done" }));
    expect(onClaim).toHaveBeenCalledExactlyOnceWith(0);
    expect(tip()).toBeNull();
    reached.unmount();
    // A reached gift with no claim open now (no wallet) claims nothing: the tap opens its tooltip.
    onClaim.mockClear();
    render(wrap(<MilestonesBar done={3} claimed={0} canClaim={false} onClaim={onClaim} />));
    await touch(screen.getByRole("button", { name: "Claim 10 Cobbles: 3 dailies done" }));
    expect(onClaim).not.toHaveBeenCalled();
    expect(tip()).toHaveTextContent("Ready to claim");
  });

  it("with the keyboard: every gift takes the focus, which opens its tooltip; Escape closes it; Enter on a reached gift claims", async () => {
    const onClaim = vi.fn();
    const user = userEvent.setup();
    render(wrap(<MilestonesBar done={3} claimed={0} onClaim={onClaim} />));
    await user.tab();
    const reached = screen.getByRole("button", { name: "Claim 10 Cobbles: 3 dailies done" });
    expect(reached).toHaveFocus();
    expect(tip()).toHaveTextContent("Ready to claim");
    expect(reached).toHaveAttribute("aria-describedby", tip()!.id);
    await user.keyboard("{Escape}");
    expect(tip()).toBeNull();
    await user.tab();
    expect(screen.getByRole("img", { name: "15 Cobbles at 5 dailies done" })).toHaveFocus();
    expect(tip()).toHaveTextContent("2 more to go");
    await user.tab({ shift: true });
    expect(tip()).toHaveTextContent("Ready to claim");
    await user.keyboard("{Enter}");
    expect(onClaim).toHaveBeenCalledExactlyOnceWith(0);
    expect(tip()).toBeNull();
  });

  it("one open at a time on both bars, and closed while its claim is on its way or lands", async () => {
    const day = (claiming: number | null, claimed = 0) => <MilestonesBar done={3} claimed={claimed} claiming={claiming} />;
    const { rerender } = render(
      wrap(
        <>
          {day(null)}
          <MilestonesBar period="weekly" done={1} claimed={0} />
        </>,
      ),
    );
    await touch(screen.getByRole("img", { name: "15 Cobbles at 5 dailies done" }));
    expect(screen.getAllByRole("tooltip")).toHaveLength(1);
    await touch(screen.getByRole("img", { name: "50 Cobbles at 3 weeklies done" }));
    expect(screen.getAllByRole("tooltip")).toHaveLength(1);
    expect(tip()).toHaveTextContent("+50 Cobbles, at 3 weeklies done: 2 more to go.");
    act(() => screen.getByRole("button", { name: "Claim 10 Cobbles: 3 dailies done" }).focus());
    expect(screen.getAllByRole("tooltip")).toHaveLength(1);
    expect(tip()).toHaveTextContent("+10 Cobbles, at 3 dailies done: Ready to claim.");
    // Its claim on its way, then landed: no tooltip over the gift as it opens.
    rerender(wrap(<>{day(0)}</>));
    expect(tip()).toBeNull();
    rerender(wrap(<>{day(null, 0b01)}</>));
    expect(tip()).toBeNull();
  });

  it("fades in as the app's tooltips do; under reduced motion it shows at once; with no rewards there is none", () => {
    const { unmount } = render(wrap(<MilestonesBar done={3} claimed={0} tip={0} />));
    expect(box(3)).toHaveClass("animate-in");
    expect(box(3)).not.toHaveClass("animate-none");
    unmount();
    const reduced = render(wrap(<MilestonesBar done={3} claimed={0} tip={0} />, true));
    expect(box(3)).toHaveClass("animate-none");
    reduced.unmount();
    render(wrap(<MilestonesBar done={3} claimed={0} tip={0} rewards={false} />));
    expect(tip()).toBeNull();
  });
});
