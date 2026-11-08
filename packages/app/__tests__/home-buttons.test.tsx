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


describe("the home's buttons take taps (HOME-BUTTONS, #856)", () => {
  it("clicks the village's capsule into edit mode, the edges' buttons (HOME-EDGES) and the dock's items (HOME-DOCK)", async () => {
    const user = userEvent.setup();
    const onEditingChange = vi.fn();
    const onNavigate = vi.fn();
    const onMissions = vi.fn();
    const onTiles = vi.fn();
    const onChat = vi.fn();
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.view} onEditingChange={onEditingChange} onNavigate={onNavigate} onMissions={onMissions} onTiles={onTiles} onChat={onChat} />));
    const box = document.querySelector("[data-slot=home-overlays]") as HTMLElement;
    // The hammer left with HOME-EDGES (the book's): the village score's capsule opens edit mode.
    const edit = await within(box).findByRole("button", { name: /^Edit village, score/ });
    expect(pointerEvents(edit)).toBe("auto");
    await user.click(edit);
    expect(onEditingChange).toHaveBeenCalledWith(true);

    // The edges (HOME-EDGES): the right column's tiles, the Chat tab, the mission in progress (a tap to Missions).
    const tiles = await within(box).findByRole("navigation", { name: "Village" }, { timeout: slow(5000) });
    expect(within(tiles).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(["Missions, 3 waiting", "Vault", "Friends, 2 waiting", "Tiles"]);
    await user.click(within(tiles).getByRole("button", { name: "Tiles" }));
    await user.click(within(box).getByRole("button", { name: "Chat, 3 waiting" }));
    await user.click(within(box).getByRole("button", { name: "Public Works, 4 of 8" }));
    expect(onTiles).toHaveBeenCalledOnce();
    expect(onChat).toHaveBeenCalledOnce();
    expect(onMissions).toHaveBeenCalledOnce();

    // The dock (#763, HOME-DOCK): Play and Settings; its band across the screen passes taps through, the dock takes them.
    const bar = await screen.findByRole("navigation", { name: "Main" }, { timeout: slow(5000) });
    for (const item of within(bar).getAllByRole("button")) expect(pointerEvents(item)).toBe("auto");
    await user.click(within(bar).getByRole("button", { name: "Play" }));
    await user.click(within(bar).getByRole("button", { name: "Settings" }));
    expect(onNavigate.mock.calls.map(([tab]) => tab)).toEqual(["play", "settings"]);
  });

  it("leaves no control of the overlays under the box's pass-through, and no Season dial (SEASONS-SETTINGS); the bottom row's gaps stay the village's", async () => {
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.shielded} chests={2} />));
    const box = document.querySelector("[data-slot=home-overlays]") as HTMLElement;
    await screen.findByRole("navigation", { name: "Main" }, { timeout: slow(5000) });
    await within(box).findByRole("button", { name: /^League: / }, { timeout: slow(5000) });
    await within(box).findByRole("navigation", { name: "Village" }, { timeout: slow(5000) });
    const controls = within(box).getAllByRole("button");
    const named = (el: HTMLElement) => el.getAttribute("aria-label") ?? el.textContent ?? "";
    // The capsules, the right column's four tiles, the Chat tab, the mission and the dock's five, among the rest.
    const expected = [/^League: /, /^Edit village, score/, /^Missions/, /^Vault/, /^Friends/, /^Tiles/, /^Chat/, /^Public Works/, /^Shop/, /^Ranking/, /^Play/, /^Allegiance/, /^Settings/];
    expect(controls.map(named)).toEqual(expect.arrayContaining(expected.map((re) => expect.stringMatching(re))));
    expect(controls.map(named).filter((n) => /^Season/.test(n))).toEqual([]);
    const blocked = controls.filter((el) => pointerEvents(el) === "none").map(named);
    expect(blocked).toEqual([]);
    // The bottom left's stack (the Chat tab, the mission) passes taps through between its items: the village takes them.
    const stack = within(box).getByRole("button", { name: /^Chat/ }).parentElement!;
    expect(stack).toHaveClass("pointer-events-none");
    expect(stack).not.toHaveClass("pointer-events-auto");
  });
});
