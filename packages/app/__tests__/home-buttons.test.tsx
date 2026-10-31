import { slow } from "../test-slow";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, domMax } from "motion/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { HomeVillageScene } from "../src/components/scenes/home-village-scene";
import { HOME_VILLAGE } from "../src/mocks/village-v2";

const wrap = (ui: ReactNode) => <LazyMotion features={domMax}>{ui}</LazyMotion>;

/**
 * The overlays' box lets taps through to the village (`pointer-events-none`, for #916's gestures) and each control's place takes
 * them back. jsdom applies no stylesheet, so the rule is read where it is written: the nearest `pointer-events-*` class at or above
 * a control, as the browser inherits it (a child of a `[&>*]:pointer-events-auto` parent counts as `auto`).
 */
function pointerEvents(el: Element): "auto" | "none" {
  for (let at: Element | null = el; at; at = at.parentElement) {
    const classes = at.classList;
    if (classes.contains("pointer-events-auto")) return "auto";
    if (classes.contains("pointer-events-none")) return "none";
    if (at.parentElement?.classList.contains("[&>*]:pointer-events-auto")) return "auto";
  }
  return "auto";
}

const DIAL = { seasonWheel: { state: "summer" as const, onNext: vi.fn(), read: null } };

describe("the home's buttons take taps (HOME-BUTTONS, #856)", () => {
  it("clicks Play, Settings and Edit at the bottom right, and the phone bar's items", async () => {
    const user = userEvent.setup();
    const onPlay = vi.fn();
    const onSettings = vi.fn();
    const onEditingChange = vi.fn();
    const onNavigate = vi.fn();
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.view} {...DIAL} onPlay={onPlay} onSettings={onSettings} onEditingChange={onEditingChange} onNavigate={onNavigate} />));
    const box = document.querySelector("[data-slot=home-overlays]") as HTMLElement;
    const edit = await within(box).findByRole("button", { name: "Edit village" });
    const row = edit.parentElement!;

    for (const name of ["Play", "Settings"]) expect(pointerEvents(within(row).getByRole("button", { name }))).toBe("auto");
    expect(pointerEvents(edit)).toBe("auto");
    await user.click(within(row).getByRole("button", { name: "Play" }));
    await user.click(within(row).getByRole("button", { name: "Settings" }));
    await user.click(edit);
    expect(onPlay).toHaveBeenCalledOnce();
    expect(onSettings).toHaveBeenCalledOnce();
    expect(onEditingChange).toHaveBeenCalledWith(true);

    // The phone's bar (below `desktop`, #763): its own Play and Settings.
    const bar = await screen.findByRole("navigation", { name: "Main" }, { timeout: slow(5000) });
    for (const item of within(bar).getAllByRole("button")) expect(pointerEvents(item)).toBe("auto");
    await user.click(within(bar).getByRole("button", { name: "Play" }));
    await user.click(within(bar).getByRole("button", { name: "Settings" }));
    expect(onNavigate.mock.calls.map(([tab]) => tab)).toEqual(["play", "settings"]);
  });

  it("leaves no control of the overlays under the box's pass-through, the dial included; the bottom row's gaps stay the village's", async () => {
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.shielded} {...DIAL} chests={2} />));
    const box = document.querySelector("[data-slot=home-overlays]") as HTMLElement;
    await screen.findByRole("navigation", { name: "Main" }, { timeout: slow(5000) });
    await within(box).findByRole("button", { name: /^Season/ }, { timeout: slow(5000) });
    await within(box).findByRole("button", { name: /^League: / }, { timeout: slow(5000) });
    const controls = within(box).getAllByRole("button");
    // The profile, the balances, the columns, the dial, Edit, Settings, Play and the bar's five.
    expect(controls.length).toBeGreaterThanOrEqual(14);
    const blocked = controls.filter((el) => pointerEvents(el) === "none").map((el) => el.getAttribute("aria-label") ?? el.textContent);
    expect(blocked).toEqual([]);
    // The row itself spans from the dial to the right edge: it passes taps through, so the camera's gestures still reach the canvas.
    const row = within(box).getByRole("button", { name: "Edit village" }).parentElement!;
    expect(row).not.toHaveClass("pointer-events-auto");
    expect(row.closest(".pointer-events-none")).toBe(box);
  });
});
