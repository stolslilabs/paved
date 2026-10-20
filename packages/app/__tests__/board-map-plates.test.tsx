import { render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_PLACEMENT_SETTINGS } from "@paved/renderer";
import { BoardMap } from "../src/components/containers/board-map";

const tiles = [{ id: 1, plan: 1, orientation: 1, x: 0, y: 0 }];
const theme = readFileSync(join(__dirname, "../src/styles/theme.css"), "utf8");
/** The hex a theme token is pinned to (the comment beside its oklch value). */
const hexOf = (token: string) => new RegExp(`--color-${token}: [^;]+; /\\* (#[0-9A-F]{6}) \\*/`).exec(theme)?.[1]?.toLowerCase();

describe("the plates' colours (PLATES)", () => {
  it("are the palette's token, the renderer's colour the same value: one grey for both states (#588)", () => {
    const { colors, tints } = DEFAULT_PLACEMENT_SETTINGS;
    expect(hexOf("plate")).toBe(colors.plate);
    expect(colors.plate).toBe("#929292");
    // One token: the states differ by opacity alone.
    expect(theme).not.toContain("plate-off");
    expect(hexOf("gold-300")).toBe(tints.pendingColor);
    expect(hexOf("meadow-400")).toBe(tints.confirmColor);
    // No aura token any more.
    expect(theme).not.toContain("plate-aura");
  });
});

describe("the plan view's plates", () => {
  const plates = (container: HTMLElement) => Object.fromEntries([...container.querySelectorAll("[data-plate]")].map((p) => [p.closest("[style]")!.getAttribute("style")!, p.getAttribute("data-plate")]));

  it("keeps the invalid plates for a tile in hand that fits nowhere (an empty list), and draws none with no tile (no list)", () => {
    const nowhere = render(<BoardMap tiles={tiles} slots={[]} />);
    expect([...nowhere.container.querySelectorAll("[data-plate]")].map((p) => p.getAttribute("data-plate"))).toEqual(["invalid", "invalid", "invalid", "invalid"]);
    nowhere.unmount();
    const none = render(<BoardMap tiles={tiles} />);
    expect(none.container.querySelectorAll("[data-plate]")).toHaveLength(0);
  });

  it("draws the two states in one grey: playable (transparent) and every other free neighbour invalid (more transparent)", () => {
    const { container } = render(<BoardMap tiles={tiles} slots={[{ x: 1, y: 0, fits: true }, { x: 0, y: 1, fits: false }]} />);
    const states = [...container.querySelectorAll("[data-plate]")].map((p) => p.getAttribute("data-plate"));
    expect(states.sort()).toEqual(["invalid", "invalid", "playable", "playable"]);
    const cls = (state: string) => container.querySelector(`[data-plate="${state}"]`)!.className;
    // The board's opacities (`DEFAULT_PLACEMENT_SETTINGS.plates`), in percent.
    const opacity = DEFAULT_PLACEMENT_SETTINGS.plates;
    expect(cls("playable")).toContain(`bg-plate/${Math.round(opacity.opacity * 100)}`);
    expect(cls("invalid")).toContain(`bg-plate/${Math.round(opacity.invalidOpacity * 100)}`);
    expect(cls("playable")).not.toMatch(/shadow|aura/);
    // Inset in the cell (a gap between neighbours), rounded, each change eased over 150 ms.
    for (const state of ["playable", "invalid"]) {
      expect(cls(state)).toContain("inset-[5%]");
      expect(cls(state)).toContain("duration-150");
      expect(cls(state)).toContain("motion-reduce:transition-none");
    }
    // Only the legal ones are buttons.
    expect(container.querySelectorAll("button")).toHaveLength(2);
    expect(Object.keys(plates(container))).toHaveLength(4);
  });

  it("tints the placed tile yellow and flashes a green tint on confirm: no rim", () => {
    const slot = { x: 1, y: 0 };
    const ghost = { ...slot, plan: 1, orientation: 1, placed: true };
    const tint = () => {
      const { container, unmount } = render(<BoardMap tiles={tiles} slots={[slot]} ghost={ghost} />);
      const span = container.querySelector("[data-tint]")!;
      const out = { tone: span.getAttribute("data-tint"), className: span.className, rim: container.querySelectorAll("[data-rim]").length };
      unmount();
      return out;
    };
    const out = tint();
    expect(out.tone).toBe("pending");
    expect(out.className).toContain("bg-gold-300");
    expect(out.rim).toBe(0);
    const { container } = render(<BoardMap tiles={tiles} confirmed={{ ...ghost, key: 1 }} />);
    expect(container.querySelector("[data-confirm]")!.className).toContain("bg-meadow-400");
    expect(container.querySelector("[data-confirm]")!.className).not.toContain("ring");
  });

  it("draws no plate with the highlight off, nor any ring, veil or dashed stroke", () => {
    const { container } = render(<BoardMap tiles={tiles} slots={[{ x: 1, y: 0 }]} highlight={false} />);
    expect(container.querySelectorAll("[data-plate]")).toHaveLength(0);
    expect(container.querySelectorAll("button")).toHaveLength(1);
    const { container: lit } = render(<BoardMap tiles={tiles} slots={[{ x: 1, y: 0 }]} ghost={{ x: 1, y: 0, plan: 1, orientation: 1, placed: true }} />);
    expect(lit.innerHTML).not.toMatch(/border-dashed|border-primary|data-veil|data-rim/);
    // The ring grid is off by default.
    expect(lit.querySelectorAll("[data-ring]")).toHaveLength(0);
    const { container: grid } = render(<BoardMap tiles={tiles} grid />);
    expect(grid.querySelectorAll("[data-ring]").length).toBeGreaterThan(0);
  });
});
