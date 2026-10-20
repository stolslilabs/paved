import { readFileSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ScrollArea } from "../src/components/ui/scroll-area";
import { ScrollRegion } from "../src/components/ui/scroll-region";
import { scrollEdges } from "../src/lib/scroll-hint";

// NO-SCROLLBARS (#609): no scrollbar on desktop, the edge fade says a region scrolls. vitest runs with the package as its
// working directory.
const theme = readFileSync("src/styles/theme.css", "utf8");

const box = (over: Partial<Record<"scrollTop" | "scrollLeft" | "scrollHeight" | "scrollWidth" | "clientHeight" | "clientWidth", number>>) => ({
  scrollTop: 0,
  scrollLeft: 0,
  scrollHeight: 100,
  scrollWidth: 100,
  clientHeight: 100,
  clientWidth: 100,
  ...over,
});

describe("scrollEdges, which sides have more", () => {
  it("none when the content fits (a sub-pixel overflow counts as none)", () => {
    expect(scrollEdges(box({}))).toEqual({ axis: null, start: false, end: false });
    expect(scrollEdges(box({ scrollHeight: 100.5 }))).toEqual({ axis: null, start: false, end: false });
  });

  it("vertical: the end at the top, both in the middle, the start at the bottom", () => {
    expect(scrollEdges(box({ scrollHeight: 300 }))).toEqual({ axis: "y", start: false, end: true });
    expect(scrollEdges(box({ scrollHeight: 300, scrollTop: 100 }))).toEqual({ axis: "y", start: true, end: true });
    expect(scrollEdges(box({ scrollHeight: 300, scrollTop: 199.5 }))).toEqual({ axis: "y", start: true, end: false });
  });

  it("horizontal when only the width overflows", () => {
    expect(scrollEdges(box({ scrollWidth: 250 }))).toEqual({ axis: "x", start: false, end: true });
    expect(scrollEdges(box({ scrollWidth: 250, scrollLeft: 150 }))).toEqual({ axis: "x", start: true, end: false });
  });
});

describe("the scrollable regions", () => {
  it("ScrollRegion and ScrollArea's viewport carry the hint, and keep their keyboard focus", () => {
    render(
      <>
        <ScrollRegion data-testid="region" tabIndex={0} aria-label="List" />
        <ScrollArea data-testid="area" />
      </>,
    );
    const region = screen.getByTestId("region");
    expect(region.className).toContain("scroll-hint");
    expect(region.className).toContain("overflow-y-auto");
    expect(region.tabIndex).toBe(0);
    const viewport = screen.getByTestId("area").querySelector("[data-slot=scroll-area-viewport]")!;
    expect(viewport.className).toContain("scroll-hint");
    expect(viewport.className).toContain("focus-visible:ring-2");
  });

  it("no plain overflow-auto or overflow-scroll in the app: every scroller is a ScrollRegion or a ScrollArea", () => {
    const root = resolve("src");
    const files = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(resolve(dir, e.name)) : /\.tsx?$/.test(e.name) ? [resolve(dir, e.name)] : []));
    const allowed = new Set(["components/ui/scroll-region.tsx"]);
    const offenders = files(root)
      .map((f) => relative(root, f))
      // Storybook's own tools (renderer benches, lighting) are not the app's screens.
      .filter((f) => !allowed.has(f) && !f.startsWith("stories/") && !f.endsWith(".stories.tsx"))
      .filter((f) => /\boverflow(-[xy])?-(auto|scroll)\b/.test(readFileSync(resolve(root, f), "utf8")));
    expect(offenders).toEqual([]);
  });
});

describe("theme.css", () => {
  it("hides every scrollbar from desktop, the document included", () => {
    expect(theme).toMatch(/@variant desktop \{\s*\* \{ scrollbar-width: none; \}\s*\*::-webkit-scrollbar \{ display: none; \}/);
  });

  it("the hint fades the sides marked by data-scroll-start / data-scroll-end", () => {
    const hint = theme.match(/@utility scroll-hint \{[\s\S]*?\n\}/)![0];
    expect(hint).toContain("mask-image: linear-gradient");
    expect(hint).toMatch(/&\[data-scroll-start\] \{\s*--scroll-hint-start: var\(--scroll-hint-size\)/);
    expect(hint).toMatch(/&\[data-scroll-end\] \{\s*--scroll-hint-end: var\(--scroll-hint-size\)/);
    expect(hint).toMatch(/&:focus-visible \{\s*mask-image: none/);
  });
});
