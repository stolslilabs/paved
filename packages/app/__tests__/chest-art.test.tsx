import { act, render, screen, waitFor } from "@testing-library/react";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildChestShapes, CHEST_SHAPE_NAMES, CHEST_SHAPES_PATH } from "../scripts/chest-art";
import { ChestArt, LID_OPEN_DEG, type ChestArtState } from "../src/components/elements/chest-art";
import { ChestBadge } from "../src/components/elements/chest-badge";
import { CHEST_RANKS, chestParts } from "../src/components/elements/chest-designs";
import { ChestIcon } from "../src/components/elements/chest-icon";
import { LazyChestArt } from "../src/components/elements/lazy-chest-art";

const read = (path: string) => readFileSync(resolve(import.meta.dirname, "..", path), "utf8");
const wrap = (node: React.ReactNode, reduced = false) => (
  <LazyMotion features={domMax}>
    <MotionConfig reducedMotion={reduced ? "always" : "never"}>{node}</MotionConfig>
  </LazyMotion>
);

describe("the chests (#874, direction A wired in)", () => {
  it("are what the owner's Font Awesome file gives (a stale shapes file fails here and in the build)", () => {
    expect(readFileSync(CHEST_SHAPES_PATH, "utf8") === buildChestShapes(), "Run `bun run chest-art` in packages/app and commit the file.").toBe(true);
  });

  it("draw each rank its own chest in both versions, not one shape recoloured", () => {
    for (const version of ["icon", "art"] as const) {
      const shapes = CHEST_RANKS.map((r) => chestParts(r, version).map((p) => `${p.t ?? ""}${p.d}`).join("|"));
      expect(new Set(shapes).size, version).toBe(3);
    }
  });

  it("grow their ornaments with the rank: each rank has more parts than the one below, epic has gems", () => {
    for (const version of ["icon", "art"] as const) {
      const [basic, rare, epic] = CHEST_RANKS.map((r) => chestParts(r, version).length);
      expect(rare, version).toBeGreaterThan(basic!);
      expect(epic, version).toBeGreaterThan(rare!);
    }
    expect(chestParts("epic", "art").some((p) => ["ruby", "sapphire", "emerald"].includes(p.tone))).toBe(true);
    expect(chestParts("basic", "art").some((p) => ["ruby", "sapphire", "emerald"].includes(p.tone))).toBe(false);
  });

  it("put the detailed art's lid apart from its body, so it swings, and stay small", () => {
    for (const r of CHEST_RANKS) {
      const parts = chestParts(r, "art");
      expect(parts.some((p) => p.layer === "lid") && parts.some((p) => p.layer === "body"), r).toBe(true);
      // The body first, the lid over it.
      expect(parts.findIndex((p) => p.layer === "lid")).toBeGreaterThan(parts.findLastIndex((p) => p.layer === "body"));
      const bytes = new Set(parts.map((p) => p.d)).values().reduce((n, path) => n + path.length, 0);
      expect(bytes, r).toBeLessThan(6144);
    }
  });

  it("draw the icon at the first paint, named by its rank, its ids apart from another's, in tokens only", () => {
    expect(window.FontAwesome).toBeUndefined();
    const { container } = render(
      <>
        <ChestIcon rank="epic" />
        <ChestIcon rank="epic" label={null} />
      </>,
    );
    const svg = screen.getByRole("img", { name: "Epic chest" });
    expect(svg).toHaveAttribute("data-rank", "epic");
    expect(container.querySelectorAll("svg")[1]).toHaveAttribute("aria-hidden", "true");
    const ids = [...container.querySelectorAll("linearGradient, mask")].map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(svg.innerHTML).toContain("var(--medal-1)");
    expect(svg.innerHTML).not.toMatch(/#[0-9a-f]{3,6}\b|oklch\(/i);
  });

  it("open the detailed art: the light and the inside show only once open, the opened chest is grey and dark", async () => {
    const at = async (state: ChestArtState, reduced = false) => {
      const { container, unmount } = render(wrap(<ChestArt rank="rare" state={state} />, reduced));
      await act(async () => {});
      const svg = container.querySelector("svg")!;
      const out = {
        burst: !!svg.querySelector('[data-part="burst"]'),
        inside: !!svg.querySelector('[data-part="inside"]'),
        sparks: svg.querySelectorAll('[data-part="sparks"] circle').length,
        shine: !!svg.querySelector('[data-part="shine"]'),
        grey: svg.style.filter === "grayscale(1)",
      };
      unmount();
      return out;
    };
    expect(await at("rest")).toEqual({ burst: false, inside: false, sparks: 0, shine: true, grey: false });
    expect(await at("opening")).toMatchObject({ burst: true, inside: true, shine: false, grey: false });
    expect((await at("open")).sparks).toBeGreaterThan(0);
    expect(await at("spent")).toMatchObject({ burst: false, inside: true, grey: true });
    // Reduced motion: no idle shine.
    expect((await at("rest", true)).shine).toBe(false);
    // Reduced motion: the opening's light fades in, it does not show at once.
    {
      const { container, unmount } = render(wrap(<ChestArt rank="epic" state="opening" />, true));
      const svg = container.querySelector("svg")!;
      const lights = [...svg.querySelectorAll<SVGElement>('[data-part="burst"] > *, [data-part="sparks"], [data-part="beam"]')];
      expect(lights.length).toBe(4);
      for (const el of lights) expect(Number(el.style.opacity)).toBeLessThan(0.5);
      unmount();
    }
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("swing the lid up and back on hinges at the chest's back: its front tips away and rises, its lining comes into view", async () => {
    const lidOf = async (node: React.ReactNode, reduced = false) => {
      const { container, unmount } = render(wrap(node, reduced));
      await act(async () => {});
      const svg = container.querySelector("svg")!;
      const transform = svg.querySelector('[data-part="lid"]')!.getAttribute("transform");
      const lining = svg.querySelector('[data-part="lining"]')!.getAttribute("visibility");
      unmount();
      // matrix(scaleX 0 0 scaleY x y): the lid's front narrowed and squashed (it tips away); its bottom edge, on the seam (272) shut, rises.
      const [sx, , , sy, , ty] = transform ? transform.slice(7, -1).split(" ").map(Number) : [1, 0, 0, 1, 0, 0];
      return { sx: sx!, sy: sy!, bottom: Math.round(sy! * 272 + ty!), lining };
    };
    expect(await lidOf(<ChestArt rank="epic" state="rest" />)).toEqual({ sx: 1, sy: 1, bottom: 272, lining: "hidden" });
    const open = await lidOf(<ChestArt rank="epic" state="open" />);
    expect(open.lining).toBe("visible");
    expect(open.sy).toBeGreaterThan(0);
    expect(open.sy).toBeLessThan(0.3);
    expect(open.sx).toBeLessThan(1);
    // Upright at the back and past it, its front edge is drawn high above the chest, the lining below it.
    expect(open.bottom).toBeLessThan(0);
    // Halfway, the front is still seen, less squashed, lower.
    const half = await lidOf(<ChestArt rank="epic" state="rest" lidAngle={LID_OPEN_DEG / 2} />);
    expect(half.sy).toBeGreaterThan(open.sy);
    expect(half.bottom).toBeGreaterThan(open.bottom);
    expect(half.bottom).toBeLessThan(272);
    expect(half.lining).toBe("visible");
    // The opening starts with the lid shut; under reduced motion it is open at once.
    expect((await lidOf(<ChestArt rank="epic" state="opening" />)).sy).toBe(1);
    expect((await lidOf(<ChestArt rank="epic" state="opening" />, true)).sy).toBeCloseTo(open.sy);
  });

  it("load the detailed art in its own chunk, the simple chest standing in its box under its name until it comes", async () => {
    const { container } = render(wrap(<LazyChestArt rank="rare" state="spent" size="sm" />));
    const fallback = container.querySelector('[data-slot="chest-art-fallback"]');
    if (fallback) {
      expect(fallback).toHaveAttribute("aria-label", "Rare chest");
      expect(fallback.querySelector('[data-slot="chest-icon"]')).not.toBeNull();
    }
    await waitFor(() => expect(screen.getByRole("img", { name: "Rare chest" })).toHaveAttribute("data-slot", "chest-art"));
    expect(container.querySelector('[data-slot="chest-art"]')).toHaveAttribute("data-state", "spent");
  });

  it("draw the simple chest in ChestBadge, named by its rank", () => {
    render(<ChestBadge rank="epic" size="lg" />);
    const badge = screen.getByRole("img", { name: "Epic chest" });
    expect(badge.querySelector('[data-slot="chest-icon"]')).toHaveAttribute("aria-hidden", "true");
    expect(badge.querySelector(".fa-treasure-chest, [data-icon]")).toBeNull();
  });

  it("are recorded in the notices as derived from Font Awesome Pro", () => {
    const notices = read("public/THIRD_PARTY_NOTICES.txt");
    const block = notices.slice(notices.indexOf("Chests (src/components/elements/chest-art-shapes.ts"));
    for (const name of CHEST_SHAPE_NAMES) expect(block.slice(0, 700), name).toContain(`\`${name}\``);
  });
});
