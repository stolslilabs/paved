import { describe, expect, it } from "vitest";
import preview from "../.storybook/preview";

const TIERS = ["Scenes", "Containers", "Elements", "UI"];

/** The first part of each story file's title ("Scenes/Home" gives "Scenes"). */
const sources = import.meta.glob<string>("../src/**/*.stories.tsx", { query: "?raw", import: "default", eager: true });
const sections = new Set(Object.values(sources).flatMap((s) => [...s.matchAll(/\btitle: "([^"/]+)\//g)].map((m) => m[1])));

describe("Storybook's sidebar order", () => {
  it("puts the tiers top down first, then the other sections in the order the stories load in", () => {
    expect(preview.parameters?.options?.storySort).toEqual({ order: TIERS });
  });

  it("names sections that exist: a renamed one would drop out of the order silently", () => {
    for (const tier of TIERS) expect(sections).toContain(tier);
  });
});
