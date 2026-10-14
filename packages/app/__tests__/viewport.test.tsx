import { composeStories, composeStory } from "@storybook/react-vite";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import preview from "../.storybook/preview";
import * as homeStories from "../src/components/scenes/home-scene.stories";
import { DEFAULT_VIEWPORT, VIEWPORT_FRAMES, VIEWPORT_NAMES, isFramed } from "../src/components/scenes/viewports";

/** A probe that shows the props it got: the scene's own props must never include `viewport`. */
function Probe(props: Record<string, unknown>) {
  return <output data-props={Object.keys(props).join(",")}>probe</output>;
}
const probeMeta = { title: "Scenes/Probe", component: Probe };
const probe = (title = probeMeta.title) => composeStory({ args: { label: "x" } }, { ...probeMeta, title }, preview);

const frameOf = (container: HTMLElement) => container.querySelector<HTMLElement>("[data-viewport-frame]");

describe("the viewport frame", () => {
  it("has the four widths, from the small mobile to the desktop, and mobile by default", () => {
    expect(VIEWPORT_NAMES).toEqual(["small-mobile", "mobile", "tablet", "desktop"]);
    expect(VIEWPORT_NAMES.map((v) => VIEWPORT_FRAMES[v].width)).toEqual([360, 640, 1024, 1440]);
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
    const frame = frameOf(container);
    expect(frame).not.toBeNull();
    expect(frame!.style.width).toBe(`${VIEWPORT_FRAMES[name].width}px`);
    expect(frame!.style.height).toBe(`${VIEWPORT_FRAMES[name].height}px`);
    expect(frame!.dataset.viewportFrame).toBe(name);
  });

  it("frames a scene story with no viewport arg at 640", () => {
    const Story = probe();
    const { container } = render(<Story />);
    expect(frameOf(container)!.style.width).toBe("640px");
  });

  it("frames a real scene story the same way, and still draws it", () => {
    const { Connected } = composeStories(homeStories, preview);
    const { container } = render(<Connected viewport="desktop" />);
    expect(frameOf(container)!.style.width).toBe("1440px");
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
    expect(frameOf(container)).toBeNull();
  });
});
