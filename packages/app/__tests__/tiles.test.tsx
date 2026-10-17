import { render, screen } from "@testing-library/react";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BaseExplorer, BasePlanGrid, ExtendedExplorer, ExtendedIndex, ExtraTiles } from "../src/stories/tiles/tile-browser";
import { BASE_PLANS, EXTENDED_MODELS, EXTRA_TILES, planFile } from "../src/stories/tiles/tiles-data";

const SOURCES = join(__dirname, "../asset-sources");
const names = (dir: string, ext: string) => readdirSync(join(SOURCES, dir)).filter((f) => f.endsWith(ext)).map((f) => f.slice(0, -ext.length)).sort();

describe("Tiles/Base", () => {
  it("lists every base model of the folder: the 19 the game plays, each with its PNG", () => {
    expect(BASE_PLANS).toHaveLength(19);
    expect(BASE_PLANS.map(planFile).sort()).toEqual(names("models", ".glb"));
    expect(BASE_PLANS.map(planFile).sort()).toEqual(names("assets/tiles", ".png").filter((n) => n !== "00"));
  });

  it("shows one tile of the grid per plan, with its code", () => {
    render(<BasePlanGrid />);
    expect(screen.getAllByRole("button")).toHaveLength(19);
    for (const p of BASE_PLANS) expect(screen.getByText(p)).toBeTruthy();
  });

  it("mounts at most one renderer view (one WebGL context), whatever the plan", () => {
    const { container } = render(<BaseExplorer plan="ccccccccc" orientation={1} />);
    expect(container.querySelectorAll('[role="img"][aria-label^="Tile"]')).toHaveLength(1);
    expect(container.querySelectorAll("canvas").length).toBeLessThanOrEqual(1);
  });
});

describe("Tiles/Extended", () => {
  it("lists every extended file of the folder, 144 in all, none missing and none extra", () => {
    expect(EXTENDED_MODELS).toHaveLength(144);
    expect([...EXTENDED_MODELS].sort()).toEqual(names("models/extended", ".glb"));
  });

  it("names every file in the index, grouped by plan", () => {
    const { container } = render(<ExtendedIndex />);
    const text = container.textContent ?? "";
    for (const model of EXTENDED_MODELS) expect(text).toContain(`${model}.glb`);
    expect(container.querySelectorAll("li")).toHaveLength(19);
  });

  it("lists the 2D tiles the 19-model set lacks, as the folder holds them", () => {
    expect([...EXTRA_TILES].sort()).toEqual(names("models/extended/tiles", ".png"));
    expect(EXTRA_TILES.filter((t) => names("assets/tiles", ".png").includes(t))).toEqual([]);
    const { container } = render(<ExtraTiles tiles={EXTRA_TILES} />);
    expect(container.querySelectorAll("img")).toHaveLength(EXTRA_TILES.length);
  });

  it("names the model file of the variant and mounts one renderer view", () => {
    const { container } = render(<ExtendedExplorer plan="rfrfffffr" density="HF" n={9} orientation={1} />);
    expect(screen.getByText("models/extended/rfrfffffr_HF_9.glb")).toBeTruthy();
    expect(container.querySelectorAll('[role="img"][aria-label^="Tile"]')).toHaveLength(1);
  });
});
