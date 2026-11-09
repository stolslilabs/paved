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
    expect(colors.plate).toBe("#c8c8c8");
    // One token: the states differ by opacity alone.
    expect(theme).not.toContain("plate-off");
    expect(hexOf("gold-300")).toBe(tints.pendingColor);
    expect(hexOf("meadow-400")).toBe(tints.confirmColor);
    // No aura token any more.
    expect(theme).not.toContain("plate-aura");
  });
});

describe("the plan view's pending pulse (#681)", () => {
  /** The `pending-pulse` utility's block of the theme. */
  const block = (name: string) => new RegExp(`${name} \\{([\\s\\S]*?)\n\\}`).exec(theme)?.[1] ?? "";

  it("runs the board's range and period on a sine, and holds the board's fixed opacity under reduced motion", () => {
    const { tints } = DEFAULT_PLACEMENT_SETTINGS;
    const keyframes = block("@keyframes pending-pulse");
    expect(keyframes).toContain(`from { opacity: ${tints.pendingPulseMin}; }`);
    expect(keyframes).toContain(`to { opacity: ${tints.pendingPulseMax}; }`);
    const utility = block("@utility pending-pulse");
    // Half a cycle each way, alternating: one full cycle every `pendingPulseMs`, on easeInOutSine.
    expect(utility).toContain(`animation: pending-pulse ${tints.pendingPulseMs / 2}ms cubic-bezier(0.37, 0, 0.63, 1) infinite alternate;`);
    expect(utility).toMatch(/prefers-reduced-motion: reduce\) \{\s*animation: none;\s*opacity: ([\d.]+);/);
    expect(Number(/prefers-reduced-motion: reduce\) \{\s*animation: none;\s*opacity: ([\d.]+);/.exec(utility)![1])).toBe(tints.pendingReducedOpacity);
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

  it("draws the placed tile plain with the board's opacity pulse (#681) and flashes a green tint on confirm: no rim", () => {
    const slot = { x: 1, y: 0 };
    const ghost = { ...slot, plan: 1, orientation: 1, placed: true };
    const placed = render(<BoardMap tiles={tiles} slots={[slot]} ghost={ghost} />);
    const chip = placed.container.querySelector("button[aria-pressed='true']")!;
    const tile = chip.querySelector("[role=img]")!;
    expect(tile.getAttribute("class")).toContain("pending-pulse");
    expect(tile.getAttribute("class")).not.toContain("opacity-90");
    // No tint over it any more, no rim.
    expect(placed.container.querySelectorAll("[data-tint]")).toHaveLength(0);
    expect(placed.container.querySelectorAll("[data-rim]")).toHaveLength(0);
    placed.unmount();
    // A preview (not placed) keeps its fixed opacity, no pulse.
    const preview = render(<BoardMap tiles={tiles} slots={[slot]} ghost={{ ...ghost, placed: false }} />);
    expect(preview.container.querySelector("[role=img][class*='opacity-90']")).not.toBeNull();
    expect(preview.container.querySelector(".pending-pulse")).toBeNull();
    preview.unmount();
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
