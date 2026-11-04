import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MissionCard, type Mission } from "../src/components/containers/mission-card";

// MISSIONS-PAGE (the owner's ask of 2026-11-04, no more text than that): the card holds its medallion, its kind's chip, its title, its
// task and a counter, one line each (#975: one height whatever the mission), and always a button: the Claim when the mission has
// Cobbles of its own, enabled only when the mission is done and its Cobbles not claimed; Go when it has none (a daily, a weekly).

const MISSION: Mission = {
  key: "achievement:5",
  kind: "lifetime",
  title: "Grand Builder",
  description: "Score a large road or city.",
  icon: "chess-rook",
  state: "progress",
  progress: [{ unit: "large structures scored", count: 4, total: 8 }],
  reward: { cobbles: 10, claimed: false },
};
const DONE: Mission = { ...MISSION, state: "claimable", progress: [{ unit: "large structures scored", count: 9, total: 8 }] };
const DAILY: Mission = {
  ...MISSION,
  key: "quest:6",
  kind: "daily",
  title: "Public Works",
  description: "Score roads and cities in a day: the middle of three rotating targets.",
  icon: "castle",
  reward: undefined,
};
const claim = () => screen.getByRole("button", { name: /^Claim/ });
const count = (container: HTMLElement) => container.querySelector("[data-slot=mission-count]")!;

describe("MissionCard (MISSIONS-PAGE)", () => {
  it("shows the chip, the title, the task and the counter, one line each, and no more text", () => {
    const { container } = render(<MissionCard mission={DAILY} />);
    expect(screen.getByText("Daily")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Public Works" })).toHaveClass("truncate");
    expect(screen.getByRole("heading", { name: "Public Works" })).toHaveAttribute("title", "Public Works");
    const task = container.querySelector("[data-slot=mission-task]")!;
    expect(task).toHaveTextContent(/^Score roads and cities in a day$/);
    expect(task).toHaveClass("truncate");
    expect(task).toHaveAttribute("title", "Score roads and cities in a day");
    expect(count(container)).toHaveTextContent(/^4 \/ 8$/);
    // The counter is the tasks' bar for assistive technology.
    expect(screen.getByRole("progressbar", { name: "large structures scored: 4 of 8" })).toHaveAttribute("aria-valuenow", "4");
    // Nothing of the description past its task, no state line, no footer.
    expect(container).not.toHaveTextContent("rotating targets");
    expect(container).not.toHaveTextContent("In progress");
    expect(container).not.toHaveTextContent("resets");
  });

  it("names an achievement's chip Achievement", () => {
    render(<MissionCard mission={MISSION} />);
    expect(screen.getByText("Achievement")).toBeInTheDocument();
  });

  it("sums the tasks' counts, each capped at its total, and formats them", () => {
    const { container, rerender } = render(<MissionCard mission={{ ...MISSION, progress: [{ unit: "a", count: 5, total: 3 }, { unit: "b", count: 1, total: 4 }] }} />);
    expect(count(container)).toHaveTextContent(/^4 \/ 7$/);
    expect(screen.getByRole("progressbar", { name: "a, b: 4 of 7" })).toBeInTheDocument();
    rerender(<MissionCard mission={{ ...MISSION, progress: [{ unit: "points", count: 2_710, total: 3_000 }] }} />);
    expect(count(container)).toHaveTextContent(/^2,710 \/ 3,000$/);
  });

  it("keeps the task's line with no description, hidden from assistive technology", () => {
    const { container } = render(<MissionCard mission={{ ...MISSION, description: "" }} />);
    const task = container.querySelector("[data-slot=mission-task]")!;
    expect(task).toHaveClass("min-h-lh");
    expect(task).toHaveAttribute("aria-hidden", "true");
  });

  it("claims from its medallion's badge: no button at its right, the text the card's whole width", () => {
    const { container } = render(<MissionCard mission={DONE} />);
    expect(container.querySelector("[data-slot=mission-reward]")).toBeNull();
    const medallion = container.querySelector("[data-slot=mission-medallion]")!;
    expect(medallion).toContainElement(claim());
    // The medallion's own badges give way to the claim's: its one gift is the claim's.
    expect([...medallion.querySelectorAll('[data-icon="invite"]')].every((gift) => claim().contains(gift))).toBe(true);
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("shows the gift silvered before the mission is done, its claim not open, its name what it holds", () => {
    render(<MissionCard mission={MISSION} />);
    const gift = screen.getByRole("button", { name: "10 Cobbles once done: Grand Builder" });
    expect(gift).toHaveAttribute("aria-disabled", "true");
    expect(gift).toHaveAttribute("data-state", "locked");
  });

  it("lights the gift once done, and a tap on it claims", async () => {
    const onClaim = vi.fn();
    render(<MissionCard mission={DONE} onClaim={onClaim} />);
    expect(claim()).toHaveAccessibleName("Claim 10 Cobbles: Grand Builder");
    expect(claim()).not.toHaveAttribute("aria-disabled");
    expect(claim()).toHaveAttribute("data-state", "ready");
    await userEvent.click(claim());
    expect(onClaim).toHaveBeenCalledOnce();
  });

  it("shakes it while the claim is on its way, then shows the check once claimed", () => {
    const { rerender } = render(<MissionCard mission={{ ...DONE, reward: { cobbles: 10, claimed: false, claiming: true } }} />);
    expect(claim()).toHaveAttribute("aria-busy", "true");
    expect(claim()).toHaveAttribute("data-state", "shaking");
    rerender(<MissionCard mission={{ ...DONE, state: "done", reward: { cobbles: 10, claimed: true } }} />);
    const claimed = screen.getByRole("button", { name: "Claimed: Grand Builder" });
    expect(claimed).toHaveAttribute("aria-disabled", "true");
    // Seen landing: the gift opens first, then the check.
    expect(claimed).toHaveAttribute("data-state", "opening");
  });

  it("keeps the gift lit and still while another claim is on its way, and without a signer, a tap claiming nothing", async () => {
    const onClaim = vi.fn();
    const { rerender } = render(<MissionCard mission={{ ...DONE, reward: { cobbles: 10, claimed: false, disabled: true } }} onClaim={onClaim} />);
    expect(claim()).toHaveAttribute("aria-disabled", "true");
    expect(claim()).toHaveAttribute("data-state", "lit");
    rerender(<MissionCard mission={DONE} canClaim={false} onClaim={onClaim} />);
    expect(claim()).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(claim());
    expect(onClaim).not.toHaveBeenCalled();
  });

  it("has no claim on a mission with no Cobbles of its own (a daily, a weekly), the medallion's own badge kept", () => {
    const { container, rerender } = render(<MissionCard mission={DAILY} />);
    expect(screen.queryByRole("button")).toBeNull();
    rerender(<MissionCard mission={{ ...DAILY, state: "done" }} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(container.querySelector("[data-slot=mission-medallion] [data-slot=check-badge]")).not.toBeNull();
  });

  it("shows a locked Tutorial step's lock, its claim not open", () => {
    render(<MissionCard mission={{ ...MISSION, kind: "tutorial", state: "locked", tutorial: { step: 5 } }} />);
    const lock = screen.getByRole("button", { name: "10 Cobbles once done: Grand Builder" });
    expect(lock).toHaveAttribute("aria-disabled", "true");
    expect(lock.querySelector('[data-icon="lock"]')).not.toBeNull();
  });
});
