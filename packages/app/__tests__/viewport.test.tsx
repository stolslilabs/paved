import { composeStories, composeStory } from "@storybook/react-vite";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import preview from "../.storybook/preview";
import * as homeStories from "../src/components/scenes/home-scene.stories";
import * as breakpointStories from "../src/styles/breakpoints.stories";
import { DEFAULT_VIEWPORT, TOOLBAR_KEY, TOOLBAR_VIEWPORTS, VIEWPORT_NAMES, frameOf, isFramed, syncViewportGlobal } from "../src/components/scenes/viewports";

/** A probe that shows the props it got: the scene's own props must never include `viewport`. */
function Probe(props: Record<string, unknown>) {
  return <output data-props={Object.keys(props).join(",")}>probe</output>;
}
const probeMeta = { title: "Scenes/Probe", component: Probe };
const probe = (title = probeMeta.title) => composeStory({ args: { label: "x" } }, { ...probeMeta, title }, preview);

const frameIn = (container: HTMLElement) => container.querySelector<HTMLElement>("[data-viewport-frame]");

describe("the viewport frame", () => {
  it("has the four widths, from the small mobile to the desktop, and mobile by default", () => {
    expect(VIEWPORT_NAMES).toEqual(["small-mobile", "mobile", "tablet", "desktop"]);
    expect(VIEWPORT_NAMES.map((v) => frameOf(v).width)).toEqual([360, 640, 1024, 1440]);
    expect(DEFAULT_VIEWPORT).toBe("mobile");
  });

  it("declares the arg once, globally: a radio with a label per width, defaulting to mobile", () => {
    expect(preview.args).toEqual({ viewport: "mobile" });
    const argType = preview.argTypes?.viewport;
    expect(argType?.control).toMatchObject({ type: "radio", labels: { "small-mobile": "small mobile 360", mobile: "mobile 640", tablet: "tablet 1024", desktop: "desktop 1440" } });
    expect(argType?.options).toEqual(VIEWPORT_NAMES);
  });

  it.each(VIEWPORT_NAMES)("frames a scene story at the width of %s, with its height", async (name) => {
    const Story = probe();
    const { container } = render(<Story viewport={name} />);
    const frame = frameIn(container);
    expect(frame).not.toBeNull();
    expect(frame!.style.width).toBe(`${frameOf(name).width}px`);
    expect(frame!.style.height).toBe(`${frameOf(name).height}px`);
    expect(frame!.dataset.viewportFrame).toBe(name);
  });

  it("frames a scene story with no viewport arg at 640", () => {
    const Story = probe();
    const { container } = render(<Story />);
    expect(frameIn(container)!.style.width).toBe("640px");
  });

  it("frames a real scene story the same way, and still draws it", () => {
    const { Connected } = composeStories(homeStories, preview);
    const { container } = render(<Connected viewport="desktop" />);
    expect(frameIn(container)!.style.width).toBe("1440px");
    expect(container.textContent).not.toBe("");
  });

  it("keeps the viewport arg out of the component's props, framed or not", () => {
    for (const title of ["Scenes/Probe", "UI/Probe"]) {
      const Story = probe(title);
      const { container, unmount } = render(<Story viewport="tablet" />);
      const props = container.querySelector("output")!.dataset.props!.split(",");
      expect(props).toContain("label");
      expect(props).not.toContain("viewport");
      unmount();
    }
  });

  it("frames scenes and containers by default, the other stories only on request", () => {
    expect(isFramed("Scenes/Home", undefined)).toBe(true);
    expect(isFramed("Containers/AppNav", undefined)).toBe(true);
    expect(isFramed("UI/Button", undefined)).toBe(false);
    expect(isFramed("Foundations/Colors", undefined)).toBe(false);
    expect(isFramed("Scenes/Home", false)).toBe(false);
    expect(isFramed("UI/Button", true)).toBe(true);
    const Story = probe("UI/Probe");
    const { container } = render(<Story viewport="tablet" />);
    expect(frameIn(container)).toBeNull();
  });

  it("keeps the toolbar's keys and widths: the theme's names, which Foundations/Breakpoints pins", () => {
    const options = preview.parameters?.viewport?.options as Record<string, { name: string; styles: { width: string } }>;
    expect(Object.fromEntries(Object.entries(options).map(([k, v]) => [k, [v.name, v.styles.width]]))).toEqual({
      mobile: ["mobile 360", "360px"],
      tablet: ["tablet 640", "640px"],
      desktop: ["desktop 1024", "1024px"],
      wide: ["wide 1440", "1440px"],
    });
    const widths = { Mobile: "360px", Tablet: "640px", Desktop: "1024px", Wide: "1440px" };
    for (const [name, width] of Object.entries(widths)) {
      const pinned = (breakpointStories as unknown as Record<string, { globals: { viewport: { value: string } } }>)[name].globals.viewport.value;
      expect(options[pinned].styles.width).toBe(width);
    }
  });

  it("maps the arg's names onto the toolbar's, one step down", () => {
    expect(TOOLBAR_KEY).toEqual({ "small-mobile": "mobile", mobile: "tablet", tablet: "desktop", desktop: "wide" });
    for (const v of VIEWPORT_NAMES) expect(Object.keys(TOOLBAR_VIEWPORTS)).toContain(TOOLBAR_KEY[v]);
  });
});

describe("the toolbar's global", () => {
  const base = { viewport: "mobile" as const, initial: undefined, owned: false };
  it("follows the arg on a framed story, and snaps a toolbar pick back to it", () => {
    expect(syncViewportGlobal({ ...base, framed: true, current: undefined })).toEqual({ set: { value: "tablet", isRotated: false }, owned: true });
    expect(syncViewportGlobal({ ...base, framed: true, current: { value: "tablet", isRotated: false }, owned: true })).toEqual({ owned: true });
    expect(syncViewportGlobal({ ...base, framed: true, current: { value: "wide", isRotated: false }, owned: true })).toEqual({ set: { value: "tablet", isRotated: false }, owned: true });
  });

  it("gives the global back on an unframed story, only if the decorator set it", () => {
    const leaked = { value: "tablet", isRotated: false };
    expect(syncViewportGlobal({ ...base, framed: false, current: leaked, owned: true })).toEqual({ set: { value: undefined, isRotated: false }, owned: false });
    // The story's own pinned width is restored, not cleared.
    const pinned = { value: "mobile", isRotated: false };
    expect(syncViewportGlobal({ ...base, framed: false, current: leaked, initial: pinned, owned: true })).toEqual({ set: pinned, owned: false });
    // A reader's own pick on an unframed story is kept.
    expect(syncViewportGlobal({ ...base, framed: false, current: { value: "wide", isRotated: false }, owned: false })).toEqual({ owned: false });
  });
});
