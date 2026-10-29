import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildShapes, GAME_ICON_NAMES, roundPath, SHAPE_SETS, splitPath, WORLD_ICON_NAMES } from "../scripts/game-icons";
import { GameIcon } from "../src/components/elements/game-icon";
import { GameIconLook } from "../src/components/elements/game-icon-looks";
import { GAME_ICON_SHAPES } from "../src/components/elements/game-icon-shapes";
import { WorldIcon } from "../src/components/elements/world-icon";
import { WORLD_ICON_SHAPES } from "../src/components/elements/world-icon-shapes";

const read = (path: string) => readFileSync(resolve(import.meta.dirname, "..", path), "utf8");

describe("the game icons (#844)", () => {
  it("are what the owner's Font Awesome file gives (a stale shapes file fails here and in the build)", () => {
    for (const set of SHAPE_SETS) {
      expect(readFileSync(set.path, "utf8") === buildShapes(undefined, set), `${set.path}: run \`bun run game-icons\` in packages/app and commit the file.`).toBe(true);
    }
  });

  it("start every part from an absolute M, a relative m after a z rewritten from the closed subpath's first point", () => {
    expect(splitPath("M10 10h5v5zm20 0h5v5z")).toEqual(["M10 10h5v5z", "M30 10h5v5z"]);
    expect(splitPath("M0 0h1zm2 2 3 3z")).toEqual(["M0 0h1z", "M2 2l3 3z"]);
    for (const shape of [...Object.values(GAME_ICON_SHAPES), ...Object.values(WORLD_ICON_SHAPES)]) for (const part of shape.parts) expect(part).toMatch(/^M/);
  });

  it("round each point to the grid where it lands, so the error never adds up, in the shorter of the absolute and relative forms", () => {
    // 0.4 then 0.4: the second point is at 0.8, so 1, not 0 + 0.
    expect(roundPath("M0 0l.4 0 .4 0 0 10z")).toBe("M0 0H1V10z");
    expect(roundPath("M100 100L100.2 300.4C120 300 130 310 140.3 320")).toBe("M100 100V300c20 0 30 10 40 20");
    expect(roundPath("M10 10a5.4 5.4 0 1 0 0-10.6z")).toBe("M10 10a5 5 0 1 0 0-11z");
  });

  it("draw at the first paint, with no Font Awesome script: one SVG of their own paths", () => {
    expect(window.FontAwesome).toBeUndefined();
    const { container } = render(<GameIcon name="swords" />);
    const svg = container.querySelector("svg[data-icon=swords]")!;
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg.querySelectorAll("path").length).toBeGreaterThan(GAME_ICON_SHAPES.swords.parts.length);
    // Steel blades and gold hilts: each tone its own gradient, its own outline.
    const fills = [...svg.querySelectorAll("linearGradient")].map((g) => g.id.replace(/^.*?(gold|steel)$/, "$1"));
    expect(fills.sort()).toEqual(["gold", "steel"]);
  });

  it("names itself when given a label, and keeps ids apart between icons on one page", () => {
    const { container } = render(
      <>
        <GameIcon name="trophy" label="League" />
        <GameIcon name="trophy" />
      </>,
    );
    expect(screen.getByRole("img", { name: "League" })).toHaveAttribute("data-icon", "trophy");
    const ids = [...container.querySelectorAll("linearGradient")].map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("paints every part in one tone when asked (a crest in its league's colour), and each look its own way", () => {
    const { container } = render(<GameIcon name="swords" tone="current" />);
    expect(container.querySelectorAll("linearGradient")).toHaveLength(1);
    const relief = render(<GameIcon name="gift" />).container;
    expect(relief.querySelectorAll("mask").length).toBeGreaterThan(0);
    // The other looks of the owner's pick, Storybook's only.
    const toon = render(<GameIconLook name="gift" look="toon" />).container;
    expect(toon.querySelector("linearGradient")).not.toBeNull();
    expect(toon.querySelector("mask")).toBeNull();
    expect(toon.querySelector("svg")).toHaveAttribute("data-look", "toon");
  });

  it("are each recorded in the notices as derived from Font Awesome Pro", () => {
    const notices = read("public/THIRD_PARTY_NOTICES.txt");
    const block = notices.slice(notices.indexOf("Game icons (src/components/elements/game-icon-shapes.ts"));
    for (const name of [...GAME_ICON_NAMES, ...WORLD_ICON_NAMES]) expect(block.slice(0, 900), name).toContain(`\`${name}\``);
  });
});

describe("the world's icons (#870)", () => {
  it("are drawn in the game icons' relief and box, from their own shapes file, each in its tones", () => {
    const { container } = render(<WorldIcon name="snowflake" label="Winter" />);
    const svg = screen.getByRole("img", { name: "Winter" });
    expect(svg).toHaveAttribute("data-slot", "game-icon");
    expect(svg).toHaveAttribute("viewBox", `${(WORLD_ICON_SHAPES.snowflake.width - 640) / 2} 0 640 512`);
    expect(container.querySelectorAll("mask").length).toBeGreaterThan(0);
    expect([...container.querySelectorAll("linearGradient")].map((g) => g.id.match(/[a-z]+$/)![0])).toEqual(["ice"]);
  });

  it("keep the village's house-tree among the HUD's, in wood with its tree green", () => {
    const { container } = render(<GameIcon name="house-tree" />);
    expect([...container.querySelectorAll("linearGradient")].map((g) => g.id.match(/[a-z]+$/)![0])).toEqual(["green", "wood"]);
    expect(Object.keys(WORLD_ICON_SHAPES)).not.toContain("house-tree");
  });
});

describe("the currencies in relief (#844, the owner's pick: Relief)", () => {
  const token = (kind: string) => read(`src/assets/tokens/${kind}.svg`);

  // The Cobbles' icon is its own pick (issue 849, `cobbles.svg`).
  it("give PAVED and vPAVED a thick dark outline, a lit gradient, a white light and a shadow under them", () => {
    for (const kind of ["paved", "vpaved"]) {
      const svg = token(kind);
      expect(svg, kind).toContain("<linearGradient");
      expect(svg, kind).toMatch(/fill="#fff" fill-opacity="\.[56]/);
      expect(svg, kind).toMatch(/opacity="\.45"/);
      expect(svg, kind).toMatch(/stroke="#(?:0A141C|121212|2E2A24)"/);
    }
  });

  it("keep USDC's mark unaltered, in its own colours, with the outline, the light and the shadow around it", () => {
    const svg = token("usdc");
    expect(svg).toContain('<path fill="#2775CA" d="M996 0h9');
    expect(svg).toContain('<path fill="#FEFEFE"');
    expect(svg).not.toContain("<linearGradient");
    // The ring and the shadow come before the mark: nothing is painted over it.
    expect(svg.indexOf('fill-opacity=".45"')).toBeLessThan(svg.indexOf("#2775CA"));
    expect(svg.indexOf('fill="#0B2545"')).toBeLessThan(svg.indexOf("#2775CA"));
  });
});
