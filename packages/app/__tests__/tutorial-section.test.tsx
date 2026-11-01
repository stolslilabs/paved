import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, domMax } from "motion/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { TUTORIAL_XP } from "../src/components/containers/quest-text";
import { MissionsScene } from "../src/components/scenes/missions-scene";
import { MISSIONS } from "../src/mocks/scenes";

// The Tutorial's section on the Missions page (#977, PR 2 of 2): above Limited while a step waits, eight steps in order, the open
// one selected on arrival with its Go, a locked one saying which step opens it, each claimed from its card, gone once all are.

const wrap = (ui: ReactNode) => <LazyMotion features={domMax}>{ui}</LazyMotion>;
const card = () => within(screen.getByRole("region", { name: "Selected mission" }));
const section = () => within(screen.getByRole("region", { name: /^Tutorial/ }));
const names = () => section().getAllByRole("button").map((b) => b.getAttribute("aria-label"));

describe("the Tutorial's section (#977)", () => {
  it("a new player: above Limited, step 1 open and selected with Go, steps 2 to 8 locked and numbered", async () => {
    const onGo = vi.fn();
    render(wrap(<MissionsScene {...MISSIONS.tutorialNew} onGo={onGo} />));
    const main = screen.getByRole("main");
    const order = [...main.querySelectorAll("section[aria-label], section[aria-labelledby]")].filter((el) => el.parentElement === main).map((el) => el.getAttribute("aria-label") ?? el.getAttribute("aria-labelledby"));
    expect(order).toEqual(["Selected mission", "missions-tutorial", "missions-limited", "missions-lifetime"]);
    expect(section().getByRole("heading", { level: 2 })).toHaveTextContent("Tutorial0/8");
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
    // A locked step keeps its own icon, dimmed, with a lock by its number (not the lock in its place).
    const raider = section().getByRole("button", { name: /^Step 3, Raider/ });
    expect(raider.querySelector('[data-icon="swords"]')).toHaveClass("opacity-40");
    expect(raider.querySelector('[data-icon="lock"]')).not.toBeNull();
    expect(raider).toHaveTextContent("3");
    // No tile shows Cobbles (#988): the card does.
    for (const t of section().getAllByRole("button")) expect(within(t).queryByRole("img", { name: /Cobbles/ })).toBeNull();

    const article = card().getByRole("article");
    expect(article).toHaveAccessibleName("Builder");
    expect(article).toHaveTextContent("Tutorial");
    expect(article).toHaveTextContent("Step 1 of the Tutorial");
    expect(card().getByRole("img", { name: "+10 Cobbles" })).toBeInTheDocument();
    expect(card().getByRole("progressbar", { name: "layouts saved: 0 of 1" })).toBeInTheDocument();
    expect(card().queryByRole("button", { name: /Claim/ })).toBeNull();
    await userEvent.click(card().getByRole("button", { name: "Go: Builder" }));
    expect(onGo).toHaveBeenCalledExactlyOnceWith("village-edit");
  });

  it("three steps done: 3/8, Victor selected, its Go to the PvP", async () => {
    const onGo = vi.fn();
    render(wrap(<MissionsScene {...MISSIONS.tutorialThree} onGo={onGo} />));
    expect(section().getByRole("heading", { level: 2 })).toHaveTextContent("Tutorial3/8");
    expect(names().slice(0, 5)).toEqual(["Step 1, Builder: Done", "Step 2, Challenger: Done", "Step 3, Raider: Done", "Step 4, Victor: To do", "Step 5, Treasure: Locked"]);
    expect(card().getByRole("article")).toHaveAccessibleName("Victor");
    expect(section().getByRole("button", { name: /^Step 4, Victor/ })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(card().getByRole("button", { name: "Go: Victor" }));
    expect(onGo).toHaveBeenCalledExactlyOnceWith("pvp");
  });

  it("each open step's Go names its place: the chests, the shop", async () => {
    const onGo = vi.fn();
    const { unmount } = render(wrap(<MissionsScene {...MISSIONS.tutorialThree} tutorial={{ ...MISSIONS.tutorialThree.tutorial, counts: { ...MISSIONS.tutorialThree.tutorial.counts, "attack-won": 1 } }} onGo={onGo} />));
    await userEvent.click(card().getByRole("button", { name: "Go: Treasure" }));
    unmount();
    const counts = { ...MISSIONS.tutorialThree.tutorial.counts, "attack-won": 1, "chest-opened": 1 };
    const shop = render(wrap(<MissionsScene {...MISSIONS.tutorialThree} tutorial={{ counts, claimed: 0 }} onGo={onGo} />));
    await userEvent.click(card().getByRole("button", { name: "Go: Trader" }));
    shop.unmount();
    render(wrap(<MissionsScene {...MISSIONS.tutorialToClaim} initialSelected={undefined} onGo={onGo} />));
    await userEvent.click(card().getByRole("button", { name: "Go: Raider" }));
    expect(onGo.mock.calls).toEqual([["chests"], ["tile-shop"], ["pvp"]]);
  });

  it("a step done and not claimed: its tile glows, its Cobbles claimed from its card, once", async () => {
    const onClaimTutorial = vi.fn();
    const { unmount } = render(wrap(<MissionsScene {...MISSIONS.tutorialToClaim} onClaimTutorial={onClaimTutorial} />));
    expect(section().getByRole("button", { name: "Step 2, Challenger: Cobbles to claim" })).toHaveAttribute("data-state", "claimable");
    expect(section().getByRole("heading", { level: 2 })).toHaveTextContent("Tutorial2/8");
    // A done step has no Go.
    expect(card().queryByRole("button", { name: /^Go/ })).toBeNull();
    await userEvent.click(card().getByRole("button", { name: "Claim 10 Cobbles: Challenger" }));
    expect(onClaimTutorial).toHaveBeenCalledExactlyOnceWith(2);
    unmount();
    // On its way, and the other claims wait.
    render(wrap(<MissionsScene {...MISSIONS.tutorialClaiming} />));
    expect(card().getByRole("button", { name: "Claim 10 Cobbles: Challenger" })).toBeDisabled();
  });

  it("a claimed step says so; a locked one says which step opens it, with neither Go nor Claim", async () => {
    const { unmount } = render(wrap(<MissionsScene {...MISSIONS.tutorialToClaim} initialSelected="tutorial:1" />));
    expect(card().getByText("Cobbles claimed")).toBeInTheDocument();
    unmount();
    render(wrap(<MissionsScene {...MISSIONS.tutorialLocked} />));
    const article = card().getByRole("article");
    expect(article).toHaveAccessibleName("Treasure");
    expect(article).toHaveTextContent("Unlocks after Victor");
    expect(card().queryByRole("button", { name: /^(Go|Claim)/ })).toBeNull();
    // The chest opened early counts already (open point 4): Treasure completes as Victor does.
    expect(card().getByRole("progressbar", { name: "chests opened: 1 of 1" })).toBeInTheDocument();
    // A tap on another tile updates the card.
    await userEvent.click(section().getByRole("button", { name: /^Step 4, Victor/ }));
    expect(card().getByRole("article")).toHaveAccessibleName("Victor");
  });

  it("Regular's Go brings the Daily row out on this page and focuses it, without leaving", async () => {
    const onGo = vi.fn();
    render(wrap(<MissionsScene {...MISSIONS.tutorialRegular} onGo={onGo} />));
    expect(card().getByRole("article")).toHaveAccessibleName("Regular");
    await userEvent.click(card().getByRole("button", { name: "Go: Regular" }));
    expect(onGo).not.toHaveBeenCalled();
    expect(screen.getByRole("region", { name: /^Daily/ })).toHaveFocus();
  });

  it("Rising has no Go: its card says how XP comes, the level counted toward 3", () => {
    render(wrap(<MissionsScene {...MISSIONS.tutorialRising} />));
    expect(card().getByRole("article")).toHaveAccessibleName("Rising");
    expect(card().getByText(TUTORIAL_XP)).toBeInTheDocument();
    expect(card().getByRole("progressbar", { name: "level: 2 of 3" })).toBeInTheDocument();
    expect(card().queryByRole("button", { name: /^Go/ })).toBeNull();
    expect(section().getByRole("button", { name: "Step 8, Rising: In progress" })).toBeInTheDocument();
  });

  it("stays while a step waits to be claimed; once every step is claimed, the section is gone and the Daily leads", () => {
    const { unmount } = render(wrap(<MissionsScene {...MISSIONS.tutorialLastToClaim} />));
    expect(section().getByRole("heading", { level: 2 })).toHaveTextContent("Tutorial8/8");
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
