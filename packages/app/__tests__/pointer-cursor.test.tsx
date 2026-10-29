import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import type { ReactNode } from "react";
import { compile } from "tailwindcss";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { ChestSlots } from "../src/components/containers/chest-slots";
import { OverlayButton } from "../src/components/containers/home-overlays";
import { LeagueControl } from "../src/components/containers/league-control";
import { MatchCard } from "../src/components/containers/match-list";
import { VillageScore } from "../src/components/containers/village-score";
import { CarouselDots } from "../src/components/ui/carousel-dots";
import { Slider } from "../src/components/ui/slider";
import { MOCK_NOW } from "../src/mocks/clock";
import { MATCH_CARDS } from "../src/mocks/pvp";
import { HOME_VILLAGE, TOMORROW } from "../src/mocks/village-v2";

// V4-POINTER-CURSOR (#880): on desktop every clickable control shows the pointer, a disabled one the default cursor. The theme's
// base rule does it (Tailwind 4 leaves a button with the arrow), so the raw buttons need no class. Read from the compiled
// stylesheet, with the classes the parts carry, so a class that would undo the rule is caught too.

const theme = readFileSync(resolve(import.meta.dirname, "../src/styles/theme.css"), "utf8");
let compiled: Awaited<ReturnType<typeof compile>>;
let style: HTMLStyleElement | undefined;

beforeAll(async () => {
  compiled = await compile(theme, {
    base: resolve(import.meta.dirname, ".."),
    async loadStylesheet(id, base) {
      const path = resolve(import.meta.dirname, "../node_modules", id === "tailwindcss" ? "tailwindcss/index.css" : "tw-animate-css/dist/tw-animate.css");
      return { path, base, content: readFileSync(path, "utf8") };
    },
  });
});
afterEach(() => {
  style?.remove();
  style = undefined;
  cleanup();
});
afterAll(() => style?.remove());

/** Load the stylesheet built for every class in the document, as the Vite plugin would. */
function styled() {
  const classes = new Set<string>();
  for (const el of document.body.querySelectorAll("[class]")) for (const c of el.getAttribute("class")!.split(/\s+/)) if (c) classes.add(c);
  style = document.createElement("style");
  // jsdom's cascade does not read `@layer` blocks: their rules apply in the same order without them.
  style.textContent = compiled.build([...classes]).replace(/@layer [\w-]+(, [\w-]+)*;/g, "").replace(/@layer [\w-]+ \{/g, "@media all {");
  document.head.append(style);
}

const cursor = (el: Element) => getComputedStyle(el).cursor;
const wrap = (ui: ReactNode) => (
  <LazyMotion features={domMax}>
    <MotionConfig reducedMotion="always">{ui}</MotionConfig>
  </LazyMotion>
);

describe("the pointer cursor (#880)", () => {
  it("every overlay button, the League control, the score's accordion, a battle log card, a carousel dot and a chest slot", () => {
    render(
      wrap(
        <>
          <OverlayButton icon="scroll" label="Missions" badge={2} onClick={() => {}} />
          <OverlayButton icon="piggy-bank" label="Vault" onClick={() => {}} />
          <LeagueControl crowns={1_240} onLeague={() => {}} />
          <VillageScore score={HOME_VILLAGE.view.village.score} tiles={HOME_VILLAGE.view.village.tiles} open={false} onOpenChange={() => {}} />
          <MatchCard match={MATCH_CARDS.attackWon} now={MOCK_NOW} onOpen={() => {}} />
          <CarouselDots count={3} current={0} onSelect={() => {}} />
          <ChestSlots won={1} ranks={["epic"]} resetsAt={TOMORROW} now={MOCK_NOW} onOpenSlot={() => {}} />
        </>,
      ),
    );
    styled();
    const parts = [
      screen.getByRole("button", { name: /^Missions/ }),
      screen.getByRole("button", { name: /^Vault/ }),
      screen.getByRole("button", { name: /^League:/ }),
      screen.getByRole("button", { name: /^Village score/ }),
      document.querySelector<HTMLElement>("button[data-side=attack]")!,
      ...screen.getAllByRole("button", { name: /^Go to / }),
      screen.getByRole("button", { name: /^Open the / }),
    ];
    expect(parts.every(Boolean)).toBe(true);
    for (const part of parts) expect([part.getAttribute("aria-label"), cursor(part)]).toEqual([part.getAttribute("aria-label"), "pointer"]);
    // Inherited: the icon or the text inside a control shows the pointer too.
    expect(cursor(screen.getByRole("button", { name: /^Missions/ }).querySelector("*")!)).toBe("pointer");
  });

  it("a slider: its root, track, range and thumb (a click on the track sets the value); a disabled one keeps the default", () => {
    render(
      <>
        <Slider aria-label="Music volume" defaultValue={[40]} />
        <Slider aria-label="Off volume" defaultValue={[40]} disabled />
      </>,
    );
    styled();
    const [on, off] = [...document.querySelectorAll("[data-slot=slider]")];
    for (const slot of ["slider", "slider-track", "slider-range", "slider-thumb"]) {
      const part = slot === "slider" ? on! : on!.querySelector(`[data-slot=${slot}]`)!;
      expect([slot, cursor(part)]).toEqual([slot, "pointer"]);
    }
    expect(cursor(screen.getByRole("slider", { name: "Music volume" }))).toBe("pointer");
    for (const part of [off!, off!.querySelector("[data-slot=slider-track]")!, screen.getByRole("slider", { name: "Off volume" })]) expect(cursor(part)).not.toBe("pointer");
  });

  it("a link, a tab and a menu item too; a disabled control keeps the default cursor", () => {
    render(
      <>
        <a href="/vault">Vault</a>
        <div role="tab">Tab</div>
        <div role="menuitem">Item</div>
        <button type="button" disabled>
          Off
        </button>
        <div role="button" aria-disabled="true">
          Off role
        </div>
        <div role="menuitem" data-disabled="">
          Off item
        </div>
        <p>Text</p>
      </>,
    );
    styled();
    expect(cursor(screen.getByRole("link", { name: "Vault" }))).toBe("pointer");
    expect(cursor(screen.getByRole("tab"))).toBe("pointer");
    expect(cursor(screen.getByRole("menuitem", { name: "Item" }))).toBe("pointer");
    expect(cursor(screen.getByRole("button", { name: "Off" }))).not.toBe("pointer");
    expect(cursor(screen.getByRole("button", { name: "Off role" }))).not.toBe("pointer");
    expect(cursor(screen.getByRole("menuitem", { name: "Off item" }))).not.toBe("pointer");
    expect(cursor(screen.getByText("Text"))).not.toBe("pointer");
  });
});
