import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildShapes, GAME_ICON_NAMES, SHAPES_PATH, splitPath } from "../scripts/game-icons";
import { GameIcon } from "../src/components/elements/game-icon";
import { GAME_ICON_SHAPES } from "../src/components/elements/game-icon-shapes";

const read = (path: string) => readFileSync(resolve(import.meta.dirname, "..", path), "utf8");

describe("the game icons (#844)", () => {
  it("are what the owner's Font Awesome file gives (a stale shapes file fails here and in the build)", () => {
    expect(readFileSync(SHAPES_PATH, "utf8") === buildShapes(), "Run `bun run game-icons` in packages/app and commit the file.").toBe(true);
  });

  it("start every part from an absolute M, a relative m after a z rewritten from the closed subpath's first point", () => {
    expect(splitPath("M10 10h5v5zm20 0h5v5z")).toEqual(["M10 10h5v5z", "M30 10h5v5z"]);
    expect(splitPath("M0 0h1zm2 2 3 3z")).toEqual(["M0 0h1z", "M2 2l3 3z"]);
    for (const shape of Object.values(GAME_ICON_SHAPES)) for (const part of shape.parts) expect(part).toMatch(/^M/);
  });

  it("draw at the first paint, with no Font Awesome script: one SVG of their own paths", () => {
    expect(window.FontAwesome).toBeUndefined();
    const { container } = render(<GameIcon name="swords" />);
    const svg = container.querySelector("svg[data-icon=swords]")!;
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg.querySelectorAll("path").length).toBeGreaterThan(GAME_ICON_SHAPES.swords.parts.length);
    // Steel blades and gold hilts: each tone its own gradient, its own outline.
    const fills = [...svg.querySelectorAll("linearGradient")].map((g) => g.id.split("-").pop());
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
    const toon = render(<GameIcon name="gift" look="toon" />).container;
    expect(toon.querySelector("linearGradient")).toBeNull();
    const relief = render(<GameIcon name="gift" look="relief" />).container;
    expect(relief.querySelectorAll("mask").length).toBeGreaterThan(0);
  });

  it("are each recorded in the notices as derived from Font Awesome Pro", () => {
    const notices = read("public/THIRD_PARTY_NOTICES.txt");
    const block = notices.slice(notices.indexOf("Game icons (src/components/elements/game-icon-shapes.ts"));
    for (const name of GAME_ICON_NAMES) expect(block.slice(0, 900), name).toContain(`\`${name}\``);
  });
});

describe("the currencies in relief (#844)", () => {
  const token = (kind: string) => read(`src/assets/tokens/${kind}.svg`);

  it("give PAVED, vPAVED and the Cobbles a thick dark outline, a lit gradient, a white light and a shadow under them", () => {
    for (const kind of ["paved", "vpaved", "cobbles"]) {
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
