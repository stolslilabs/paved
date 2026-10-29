import { act, render, screen } from "@testing-library/react";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildChestShapes, CHEST_SHAPE_NAMES, CHEST_SHAPES_PATH } from "../scripts/chest-art";
import { ChestArt, type ChestArtState } from "../src/components/elements/chest-art";
import { CHEST_DIRECTIONS, CHEST_RANKS, chestParts } from "../src/components/elements/chest-designs";
import { ChestIcon } from "../src/components/elements/chest-icon";

const read = (path: string) => readFileSync(resolve(import.meta.dirname, "..", path), "utf8");
const DIRECTIONS = CHEST_DIRECTIONS.map((d) => d.id);
const wrap = (node: React.ReactNode, reduced = false) => (
  <LazyMotion features={domMax}>
    <MotionConfig reducedMotion={reduced ? "always" : "never"}>{node}</MotionConfig>
  </LazyMotion>
);

describe("the chests (#874, the study)", () => {
  it("are what the owner's Font Awesome file gives (a stale shapes file fails here and in the build)", () => {
    expect(readFileSync(CHEST_SHAPES_PATH, "utf8") === buildChestShapes(), "Run `bun run chest-art` in packages/app and commit the file.").toBe(true);
  });

  it("draw three directions, each rank its own drawing in both versions, not one shape recoloured", () => {
    expect(DIRECTIONS).toEqual(["wood", "coffer", "voxel"]);
    for (const version of ["icon", "art"] as const) {
      const shapes = DIRECTIONS.flatMap((d) => CHEST_RANKS.map((r) => chestParts(d, r, version).map((p) => `${p.t ?? ""}${p.d}`).join("|")));
      expect(new Set(shapes).size, version).toBe(9);
    }
  });

  it("grow their ornaments with the rank: each rank has more parts than the one below, epic has gems", () => {
    for (const d of DIRECTIONS) {
      for (const version of ["icon", "art"] as const) {
        const [basic, rare, epic] = CHEST_RANKS.map((r) => chestParts(d, r, version).length);
        expect(rare, `${d} ${version}`).toBeGreaterThan(basic!);
        expect(epic, `${d} ${version}`).toBeGreaterThan(rare!);
      }
      expect(chestParts(d, "epic", "art").some((p) => ["ruby", "sapphire", "emerald"].includes(p.tone)), d).toBe(true);
      expect(chestParts(d, "basic", "art").some((p) => ["ruby", "sapphire", "emerald"].includes(p.tone)), d).toBe(false);
    }
  });

  it("put the detailed art's lid apart from its body, so it swings, and stay small", () => {
    for (const d of DIRECTIONS) {
      for (const r of CHEST_RANKS) {
        const parts = chestParts(d, r, "art");
        expect(parts.some((p) => p.layer === "lid") && parts.some((p) => p.layer === "body"), `${d} ${r}`).toBe(true);
        // The body first, the lid over it.
        expect(parts.findIndex((p) => p.layer === "lid")).toBeGreaterThan(parts.findLastIndex((p) => p.layer === "body"));
        const bytes = new Set(parts.map((p) => p.d)).values().reduce((n, path) => n + path.length, 0);
        expect(bytes, `${d} ${r}`).toBeLessThan(6144);
      }
    }
  });

  it("draw the icon at the first paint, named by its rank, its ids apart from another's, in tokens only", () => {
    expect(window.FontAwesome).toBeUndefined();
    const { container } = render(
      <>
        <ChestIcon direction="coffer" rank="epic" />
        <ChestIcon direction="coffer" rank="epic" label={null} />
      </>,
    );
    const svg = screen.getByRole("img", { name: "Epic chest" });
    expect(svg).toHaveAttribute("data-direction", "coffer");
    expect(container.querySelectorAll("svg")[1]).toHaveAttribute("aria-hidden", "true");
    const ids = [...container.querySelectorAll("linearGradient, mask")].map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(svg.innerHTML).toContain("var(--medal-1)");
    expect(svg.innerHTML).not.toMatch(/#[0-9a-f]{3,6}\b|oklch\(/i);
  });

  it("open the detailed art: the light and the inside show only once open, the opened chest is grey and dark", async () => {
    const at = async (state: ChestArtState, reduced = false) => {
      const { container, unmount } = render(wrap(<ChestArt direction="voxel" rank="rare" state={state} />, reduced));
      await act(async () => {});
      const svg = container.querySelector("svg")!;
      const out = {
        burst: !!svg.querySelector('[data-part="burst"]'),
        inside: !!svg.querySelector('[data-part="inside"]'),
        sparks: svg.querySelectorAll('[data-part="sparks"] rect').length,
        shine: !!svg.querySelector('[data-part="shine"]'),
        grey: svg.style.filter === "grayscale(1)",
      };
      unmount();
      return out;
    };
    expect(await at("rest")).toEqual({ burst: false, inside: false, sparks: 0, shine: true, grey: false });
    expect(await at("opening")).toMatchObject({ burst: true, inside: true, shine: false, grey: false });
    // Voxels of light for the voxel chests.
    expect((await at("open")).sparks).toBeGreaterThan(0);
    expect(await at("spent")).toMatchObject({ burst: false, inside: true, grey: true });
    // Reduced motion: no idle shine.
    expect((await at("rest", true)).shine).toBe(false);
    // Reduced motion: the opening's light fades in, it does not show at once.
    {
      const { container, unmount } = render(wrap(<ChestArt direction="wood" rank="epic" state="opening" />, true));
      const svg = container.querySelector("svg")!;
      const lights = [...svg.querySelectorAll<SVGElement>('[data-part="burst"] > *, [data-part="sparks"]')];
      expect(lights.length).toBe(3);
      for (const el of lights) expect(Number(el.style.opacity)).toBeLessThan(0.5);
      unmount();
    }
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("are recorded in the notices as derived from Font Awesome Pro", () => {
    const notices = read("public/THIRD_PARTY_NOTICES.txt");
    const block = notices.slice(notices.indexOf("Chests (src/components/elements/chest-art-shapes.ts"));
    for (const name of [...CHEST_SHAPE_NAMES, "crown"]) expect(block.slice(0, 700), name).toContain(`\`${name}\``);
  });
});
