import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, domMax } from "motion/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { MissionsScene } from "../src/components/scenes/missions-scene";
import { MISSIONS } from "../src/mocks/scenes";

// The Tutorial's section on the Missions page (#977, PR 2 of 2): above the Daily while a step waits, eight steps in order, the open
// one selected on arrival, a locked one saying which step opens it, each claimed from its card's gift badge, gone once all are.

const wrap = (ui: ReactNode) => <LazyMotion features={domMax}>{ui}</LazyMotion>;
const card = () => within(screen.getByRole("region", { name: "Selected mission" }));
const section = () => within(screen.getByRole("region", { name: /^Tutorial/ }));
const names = () => section().getAllByRole("button").map((b) => b.getAttribute("aria-label"));
/** The steps done, read on the medallions (claimed: Done; done, not claimed: Cobbles to claim): the title holds no count (TILE-COUNTS). */
const stepsDone = () => names().filter((n) => /: (?:Done|Cobbles to claim)$/.test(n ?? "")).length;
/** The section's title: the fixed word alone. */
const title = () => expect(section().getByRole("heading", { level: 3 })).toHaveTextContent(/^Tutorial$/);

describe("the Tutorial's section (#977)", () => {
  it("a new player: above the Daily, step 1 open and selected, steps 2 to 8 locked, in order", () => {
    render(wrap(<MissionsScene {...MISSIONS.tutorialNew} />));
    // MISSIONS-PAGE: the page is the HUD's drawer, its body the sections' parent.
    const body = document.querySelector<HTMLElement>("[data-hud-drawer-body]")!;
    const order = [...body.querySelectorAll("section[aria-label], section[aria-labelledby]")].filter((el) => el.parentElement === body).map((el) => el.getAttribute("aria-label") ?? el.getAttribute("aria-labelledby"));
    expect(order).toEqual(["Selected mission", "missions-tutorial", "missions-daily", "missions-weekly", "missions-achievements"]);
    title();
    expect(stepsDone()).toBe(0);
    expect(names()).toEqual([
      "Step 1, Builder: To do",
      "Step 2, Challenger: Locked",
      "Step 3, Raider: Locked",
      "Step 4, Victor: Locked",
      "Step 5, Treasure: Locked",
      "Step 6, Trader: Locked",
      "Step 7, Regular: Locked",
      "Step 8, Rising: Locked",
    ]);
    // A locked step keeps its own painting, greyed, with a lock at its foot (not the lock in its place); its number is in its name.
    const raider = section().getByRole("button", { name: /^Step 3, Raider/ });
    expect(raider.querySelector<HTMLElement>('[data-medallion="swords"]')!.style.filter).toContain("grayscale(1)");
    expect(raider.querySelector('[data-icon="lock"]')).not.toBeNull();
    // No tile shows Cobbles (#988): the card does.
    for (const t of section().getAllByRole("button")) expect(within(t).queryByRole("img", { name: /Cobbles/ })).toBeNull();

    const article = card().getByRole("article");
    expect(article).toHaveAccessibleName("Builder");
    expect(article).toHaveTextContent("Tutorial");
    expect(card().getByRole("progressbar", { name: "layouts saved: 0 of 1" })).toBeInTheDocument();
    // MISSIONS-PAGE: the step's Cobbles on its medallion's gift badge, its claim not open until the step is done; no Go.
    const gift = card().getByRole("button", { name: "10 Cobbles once done: Builder" });
    expect(gift).toHaveAttribute("aria-disabled", "true");
    expect(gift).toHaveAttribute("data-state", "locked");
    expect(card().getAllByRole("button")).toEqual([gift]);
  });

  it("three steps done, Victor selected", () => {
    render(wrap(<MissionsScene {...MISSIONS.tutorialThree} />));
    title();
    expect(stepsDone()).toBe(3);
    expect(names().slice(0, 5)).toEqual(["Step 1, Builder: Done", "Step 2, Challenger: Done", "Step 3, Raider: Done", "Step 4, Victor: To do", "Step 5, Treasure: Locked"]);
    expect(card().getByRole("article")).toHaveAccessibleName("Victor");
    expect(section().getByRole("button", { name: /^Step 4, Victor/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("a step done and not claimed: its tile glows, its Cobbles claimed from its card, once", async () => {
    const onClaimTutorial = vi.fn();
    const { unmount } = render(wrap(<MissionsScene {...MISSIONS.tutorialToClaim} onClaimTutorial={onClaimTutorial} />));
    expect(section().getByRole("button", { name: "Step 2, Challenger: Cobbles to claim" })).toHaveAttribute("data-state", "claimable");
    title();
    expect(stepsDone()).toBe(2);
    await userEvent.click(card().getByRole("button", { name: "Claim 10 Cobbles: Challenger" }));
    expect(onClaimTutorial).toHaveBeenCalledExactlyOnceWith(2);
    unmount();
    // On its way, and the other claims wait.
    render(wrap(<MissionsScene {...MISSIONS.tutorialClaiming} />));
    const claiming = card().getByRole("button", { name: "Claim 10 Cobbles: Challenger" });
    expect(claiming).toHaveAttribute("aria-disabled", "true");
    expect(claiming).toHaveAttribute("aria-busy", "true");
  });

  it("a claimed step says so; a locked one shows its lock, its claim not open", async () => {
    const { unmount } = render(wrap(<MissionsScene {...MISSIONS.tutorialToClaim} initialSelected="tutorial:1" />));
    expect(card().getByRole("button", { name: "Claimed: Builder" })).toHaveAttribute("aria-disabled", "true");
    unmount();
    render(wrap(<MissionsScene {...MISSIONS.tutorialLocked} />));
    const article = card().getByRole("article");
    expect(article).toHaveAccessibleName("Treasure");
    const gift = card().getByRole("button", { name: "20 Cobbles once done: Treasure" });
    expect(gift).toHaveAttribute("aria-disabled", "true");
    expect(gift.querySelector('[data-icon="lock"]')).not.toBeNull();
    // The chest opened early counts already (open point 4): Treasure completes as Victor does.
    expect(card().getByRole("progressbar", { name: "chests opened: 1 of 1" })).toBeInTheDocument();
    // A tap on another tile updates the card.
    await userEvent.click(section().getByRole("button", { name: /^Step 4, Victor/ }));
    expect(card().getByRole("article")).toHaveAccessibleName("Victor");
  });

  it("Rising: the level counted toward 3", () => {
    render(wrap(<MissionsScene {...MISSIONS.tutorialRising} />));
    expect(card().getByRole("article")).toHaveAccessibleName("Rising");
    expect(card().getByRole("progressbar", { name: "level: 2 of 3" })).toBeInTheDocument();
    expect(section().getByRole("button", { name: "Step 8, Rising: In progress" })).toBeInTheDocument();
  });

  it("stays while a step waits to be claimed; once every step is claimed, the section is gone and the Daily leads", () => {
    const { unmount } = render(wrap(<MissionsScene {...MISSIONS.tutorialLastToClaim} />));
    title();
    expect(stepsDone()).toBe(8);
    expect(card().getByRole("button", { name: "Claim 50 Cobbles: Rising" })).toBeInTheDocument();
    unmount();
    render(wrap(<MissionsScene {...MISSIONS.tutorialAllClaimed} />));
    expect(screen.queryByRole("region", { name: /^Tutorial/ })).toBeNull();
    expect(card().getByRole("article")).toHaveAccessibleName("Public Works");
  });

  it("every step done but one claimed: the card leads with the Daily, as before the Tutorial", () => {
    render(wrap(<MissionsScene {...MISSIONS.tutorialLastToClaim} initialSelected={undefined} />));
    expect(card().getByRole("article")).toHaveAccessibleName("Public Works");
  });

  it("not served (the chain before #738): no section, the page as before", () => {
    render(wrap(<MissionsScene {...MISSIONS.daily} />));
    expect(screen.queryByRole("region", { name: /^Tutorial/ })).toBeNull();
  });
});
