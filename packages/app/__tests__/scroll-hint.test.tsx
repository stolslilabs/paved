import { readFileSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TabFrame } from "../src/components/containers/tab-frame";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "../src/components/ui/dropdown-menu";
import { ScrollArea } from "../src/components/ui/scroll-area";
import { ScrollRegion } from "../src/components/ui/scroll-region";
import { scrollEdges } from "../src/lib/scroll-hint";

// NO-SCROLLBARS (#609, #835): no scrollbar at any width, the edge fade says a region scrolls. vitest runs with the package as its
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

  it("no plain scrolling box in the app: every scroller is a ScrollRegion or a ScrollArea", () => {
    const root = resolve("src");
    const files = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(resolve(dir, e.name)) : /\.tsx?$/.test(e.name) ? [resolve(dir, e.name)] : []));
    // The tab page's region is the page's document (#611): the page's hint, not the mask (`TabFrame`); so is the side panel's body
    // from `desktop` (#762), where the page is drawn (`PagePanel`), and the body of a sheet over a page (BACK-RULE #783, `PageSheet`).
    // The home's left column (#856) is `ScrollRegion`'s box with its hint attached once the stage's chunk is in (kept off the first
    // load): checked by scenes.test.
    const allowed = new Set([
      "components/ui/scroll-region.tsx",
      "components/containers/tab-frame.tsx",
      "components/containers/page-panel.tsx",
      "components/containers/page-sheet.tsx",
      "components/scenes/home-village-scene.tsx",
    ]);
    const offenders = files(root)
      .map((f) => relative(root, f))
      // Storybook's own tools (renderer benches, lighting) are not the app's screens.
      .filter((f) => !allowed.has(f) && !f.startsWith("stories/") && !f.endsWith(".stories.tsx"))
      .filter((f) => /\boverflow(-[xy])?-(auto|scroll)\b/.test(readFileSync(resolve(root, f), "utf8")));
    expect(offenders).toEqual([]);
  });
});

describe("the page's hint", () => {
  it("comes with TabFrame, which every tab page renders (not only TabPage), from its scrolling region", () => {
    for (const f of ["src/components/containers/tab-page.tsx"]) {
      expect(readFileSync(f, "utf8"), f).toContain("<TabFrame");
    }
    const root = document.documentElement;
    const height = vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(400);
    const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => (cb(0), 1));
    try {
      const { container, unmount } = render(<TabFrame tab="home"><p>Body</p></TabFrame>);
      expect(root).toHaveAttribute("data-scroll-end");
      // One fade, above the bar: from `desktop` there is no bar, the page is in the home's side panel (#762).
      expect(container.querySelectorAll("[data-slot=page-scroll-hint]")).toHaveLength(1);
      expect(container.querySelector("nav > [data-slot=page-scroll-hint]")).not.toBeNull();
      unmount();
      expect(root).not.toHaveAttribute("data-scroll-end");
    } finally {
      height.mockRestore();
      raf.mockRestore();
    }
  });
});

describe("the dropdown menu", () => {
  it("portals its submenu out of the menu's scroll region, whose mask would clip it", () => {
    render(
      <DropdownMenu open>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Play</DropdownMenuItem>
          <DropdownMenuSub open>
            <DropdownMenuSubTrigger>More</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem>Rules</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    const rules = screen.getByText("Rules");
    expect(rules.closest("[data-slot=dropdown-menu-sub-content]")).not.toBeNull();
    expect(rules.closest("[data-slot=dropdown-menu-content]")).toBeNull();
  });
});

describe("theme.css", () => {
  it("hides every scrollbar at every width, the document included (#835)", () => {
    expect(theme).toMatch(/\n {2}\* \{ scrollbar-width: none; \}\n {2}\*::-webkit-scrollbar \{ display: none; \}\n/);
    // No media query holds them back any more: below `desktop` too (#835).
    const base = theme.match(/@layer base \{[\s\S]*?\n\}/)![0];
    expect(base).toContain("* { scrollbar-width: none; }");
    expect(base).not.toMatch(/@media[^{]*\{\s*\* \{ scrollbar-width/);
  });

  it("the hint fades the sides marked by data-scroll-start / data-scroll-end", () => {
    const hint = theme.match(/@utility scroll-hint \{[\s\S]*?\n\}/)![0];
    expect(hint).toContain("--scroll-hint-mask: linear-gradient");
    expect(hint).toContain("mask-image: var(--scroll-hint-mask)");
    expect(hint).toMatch(/&\[data-scroll-start\] \{\s*--scroll-hint-start: var\(--scroll-hint-size\)/);
    expect(hint).toMatch(/&\[data-scroll-end\] \{\s*--scroll-hint-end: var\(--scroll-hint-size\)/);
    expect(hint).toMatch(/&:focus-visible \{\s*mask-image: none/);
  });
});
