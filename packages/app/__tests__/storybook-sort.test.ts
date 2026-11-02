import { describe, expect, it, vi } from "vitest";
import { sanitize } from "storybook/internal/csf";
import preview from "../.storybook/preview";

const TIERS = ["Scenes", "Containers", "Elements", "UI"];

/** The first part of each story file's title ("Scenes/Home" gives "Scenes"). */
const sources = import.meta.glob<string>("../src/**/*.stories.tsx", { query: "?raw", import: "default", eager: true });
const sections = new Set(Object.values(sources).flatMap((s) => [...s.matchAll(/\btitle: "([^"/]+)\//g)].map((m) => m[1])));

/** What `.storybook/manager.ts` hands Storybook's manager, caught in place of the real call. */
const managerConfig = vi.hoisted(() => ({ value: undefined as { sidebar?: { collapsedRoots?: string[] } } | undefined }));
vi.mock("storybook/manager-api", () => ({ addons: { setConfig: (config: typeof managerConfig.value) => (managerConfig.value = config) } }));

describe("Storybook's sidebar order", () => {
  it("puts the tiers top down first, then the other sections in the order the stories load in", () => {
    expect(preview.parameters?.options?.storySort).toEqual({ order: TIERS });
  });

  it("names sections that exist: a renamed one would drop out of the order silently", () => {
    for (const tier of TIERS) expect(sections).toContain(tier);
  });
});

describe("Storybook's sidebar folding (#1002)", () => {
  const sectionIds = () => [...sections].map((name) => sanitize(name));

  it("folds every section on load: a new section is in `collapsedRoots`", async () => {
    await import("../.storybook/manager");
    const collapsed = managerConfig.value?.sidebar?.collapsedRoots ?? [];
    for (const id of sectionIds()) expect(collapsed, `section "${id}" is missing from collapsedRoots`).toContain(id);
  });

  it("lists sections that exist: a renamed one does not linger in `collapsedRoots`", async () => {
    await import("../.storybook/manager");
    const ids = sectionIds();
    for (const id of managerConfig.value?.sidebar?.collapsedRoots ?? []) expect(ids, `"${id}" is not a section`).toContain(id);
  });
});
