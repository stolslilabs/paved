import { render, screen } from "@testing-library/react";
import { LazyMotion, domMax } from "motion/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HomeVillageScene } from "../src/components/scenes/home-village-scene";
import { HOME_VILLAGE } from "../src/mocks/village-v2";
import { slow } from "../test-slow";

const wrap = (ui: ReactNode) => <LazyMotion features={domMax}>{ui}</LazyMotion>;
const DIAL = { seasonWheel: { state: "summer" as const, onNext: vi.fn(), read: null } };

/**
 * A layout for jsdom, which has none: each measured element's offsets in the overlays' box (a 375 x 800 phone), its offset parent the
 * box. The profile 16 px in, 64 px tall; the balances at 280, 120 px tall; the corner row 80 px above the box's foot; the dial 200 px.
 */
const LAYOUT: Record<string, { top: number; left: number; height: number }> = {
  profile: { top: 16, left: 16, height: 64 },
  balances: { top: 16, left: 280, height: 120 },
  corner: { top: 656, left: 120, height: 64 },
  dial: { top: 520, left: 0, height: 200 },
};

function role(el: HTMLElement): string | undefined {
  const box = el.closest("[data-slot=home-overlays]");
  if (!box || el === box) return undefined;
  if (el.hasAttribute("data-dial-place")) return "dial";
  if (el.hasAttribute("data-corner")) return "corner";
  if (el.getAttribute("data-out") === "u2") return el.classList.contains("absolute") ? "balances" : "profile";
  return undefined;
}

/** A turn of the season wheel: a running CSS transition, which the measure skipped before #1068. */
class FakeCSSTransition {}

beforeEach(() => {
  vi.stubGlobal("CSSTransition", FakeCSSTransition);
  const at = (key: "top" | "left" | "height") =>
    function (this: HTMLElement) {
      if (this.getAttribute("data-slot") === "home-overlays") return key === "height" ? 800 : 0;
      const r = role(this);
      return r ? LAYOUT[r]![key] : 0;
    };
  vi.spyOn(HTMLElement.prototype, "offsetTop", "get").mockImplementation(at("top"));
  vi.spyOn(HTMLElement.prototype, "offsetLeft", "get").mockImplementation(at("left"));
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(at("height"));
  vi.spyOn(HTMLElement.prototype, "offsetParent", "get").mockImplementation(function (this: HTMLElement) {
    return role(this) ? this.closest("[data-slot=home-overlays]") : null;
  });
  // The wheel always turning: its discs, and so the box's subtree, hold a running transition at every read.
  Element.prototype.getAnimations = function (this: Element, options?: GetAnimationsOptions) {
    const inWheel = this.closest("[data-dial-place]") != null && !this.hasAttribute("data-dial-place");
    const box = this.getAttribute("data-slot") === "home-overlays";
    return inWheel || (box && options?.subtree) ? [new FakeCSSTransition() as unknown as Animation] : [];
  };
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (Element.prototype as Partial<Element>).getAnimations;
});

const EXPECTED = {
  // Under the balances (16 + 120), a gap off.
  "--right-top": "148px",
  // Above the corner row (800 - 656), a gap off.
  "--right-bottom": "156px",
  // The profile's foot (16 + 64) and the 24 px under it (#929).
  "--left-top": "104px",
  // Above the dial (800 - 520), a gap off.
  "--left-bottom": "292px",
  // From the profile's left to a gap short of the balances.
  "--profile-room": "252px",
};

function expectEdges() {
  const box = document.querySelector<HTMLElement>("[data-slot=home-overlays]")!;
  for (const [name, value] of Object.entries(EXPECTED)) expect(box.style.getPropertyValue(name), name).toBe(value);
}

describe("HOME-COLUMNS-AFTER-EDIT (#1068): the columns' edges, the season wheel turning", () => {
  it("sets the five edges when the overlays mount with a transition running in the wheel", async () => {
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.view} {...DIAL} />));
    await screen.findByRole("button", { name: /^Edit village, score/ }, { timeout: slow(5000) });
    expect(document.querySelector("[data-slot=home-overlays]")!.getAnimations({ subtree: true })).toHaveLength(1);
    expectEdges();
  });

  it("sets them again when edit mode is left (the overlays mount anew), the wheel still turning", async () => {
    const { rerender } = render(wrap(<HomeVillageScene {...HOME_VILLAGE.view} {...DIAL} editing />));
    expect(document.querySelector("[data-slot=home-overlays]")).toBeNull();
    rerender(wrap(<HomeVillageScene {...HOME_VILLAGE.view} {...DIAL} />));
    await screen.findByRole("button", { name: /^Edit village, score/ }, { timeout: slow(5000) });
    expectEdges();
    // Twice more, as the owner did.
    for (let i = 0; i < 2; i++) {
      rerender(wrap(<HomeVillageScene {...HOME_VILLAGE.view} {...DIAL} editing />));
      rerender(wrap(<HomeVillageScene {...HOME_VILLAGE.view} {...DIAL} />));
      await screen.findByRole("button", { name: /^Edit village, score/ });
      expectEdges();
    }
  });

});
