import { describe, expect, it } from "vitest";
import preview from "../.storybook/preview";
import * as breakpointStories from "../src/styles/breakpoints.stories";

type Option = { name: string; styles: { width: string; height: string } };
const options = preview.parameters?.viewport?.options as Record<string, Option>;

describe("Storybook's viewport toolbar", () => {
  it("offers the theme's four breakpoints, by key, name and width", () => {
    expect(Object.fromEntries(Object.entries(options).map(([k, v]) => [k, [v.name, v.styles.width]]))).toEqual({
      mobile: ["mobile 360", "360px"],
      tablet: ["tablet 640", "640px"],
      desktop: ["desktop 1024", "1024px"],
      wide: ["wide 1440", "1440px"],
    });
  });

  it("has no default: a story takes the full width unless a viewport is picked", () => {
    expect(preview.initialGlobals).not.toHaveProperty("viewport");
    expect(preview.parameters?.viewport).not.toHaveProperty("defaultViewport");
  });

  it("is the only width control: no viewport arg, no radio, no frame decorator", () => {
    expect(preview.args).toBeUndefined();
    expect(preview.argTypes).toBeUndefined();
    expect(preview.decorators).toHaveLength(1);
  });

  it("resolves every width pinned by Foundations/Breakpoints", () => {
    const widths = { Mobile: "360px", Tablet: "640px", Desktop: "1024px", Wide: "1440px" };
    for (const [name, width] of Object.entries(widths)) {
      const pinned = (breakpointStories as unknown as Record<string, { globals: { viewport: { value: string } } }>)[name].globals.viewport.value;
      expect(options[pinned].styles.width).toBe(width);
    }
  });
});
