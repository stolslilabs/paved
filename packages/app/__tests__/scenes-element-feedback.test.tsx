import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Background } from "../src/components/elements/background";
import { Countdown } from "../src/components/elements/countdown";
import { Score } from "../src/components/elements/score";
import { StatRow } from "../src/components/elements/stat-row";
import { AppNav } from "../src/components/containers/app-nav";
import { TabPage } from "../src/components/containers/tab-page";
import { MOCK_NOW } from "../src/mocks/clock";
import { wrap } from "./scenes-helpers";

describe("Element feedback (EL)", () => {
  it("puts the icon on the value's row, under the title", () => {
    const { container } = render(<Score value={1270} label="Score" icon="star" />);
    const value = screen.getByTestId("score-value");
    const icon = container.querySelector("[data-icon='star']")!;
    expect(value.parentElement).toBe(icon.parentElement!.parentElement);
    expect(screen.getByText("Score").parentElement).not.toBe(value.parentElement);
  });

  it("keeps a stat row's hint under its label, the icon and the value on the first row", () => {
    const { container } = render(<StatRow icon="castle" label="Cities closed" hint="450 pts" value={4} />);
    const row = container.firstElementChild!;
    expect(row.className).toContain("grid");
    expect(screen.getByText("450 pts").className).toContain("col-start-2");
  });

  it("hides the countdown's label and keeps its accessible name", () => {
    render(<Countdown expiresAt={MOCK_NOW + 9 * 3600} now={MOCK_NOW} label="Closes in" hideLabel />);
    expect(screen.queryByText("Closes in")).not.toBeInTheDocument();
    expect(screen.getByRole("timer", { name: "Closes in 9:00:00" })).toBeInTheDocument();
  });

  it("draws Ranking with the HUD's trophy (END-CHEST: in the Chests' place), and no Vault (the home's overlay's, #763; no header from desktop, #762)", () => {
    render(wrap(<AppNav />));
    expect(screen.getByRole("button", { name: "Ranking" }).querySelector("img[data-slot='ui-icon'][data-icon='trophy']")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Vault" })).toBeNull();
  });

  it("draws the dock's Play as the medallion, the swords and PLAY on it (#807, HOME-DOCK)", () => {
    render(wrap(<AppNav />));
    const play = screen.getByRole("button", { name: "Play" });
    expect(play.querySelector("img[src*='play-medallion']")).not.toBeNull();
    expect(play.querySelector("[data-icon='swords']")).not.toBeNull();
    expect(play).toHaveTextContent("Play");
    expect(play.querySelector("[data-icon='hammer']")).toBeNull();
  });

  it("draws the dock's icons as the mockup's (HOME-DOCK), its own colours", () => {
    render(wrap(<AppNav />));
    for (const [tab, icon] of [["Shop", "shop"], ["Ranking", "trophy"], ["Play", "swords"], ["Allegiance", "guild"], ["Settings", "settings"]]) {
      expect(screen.getByRole("button", { name: new RegExp(`^${tab}`) }).querySelector(`[data-slot=ui-icon][data-icon=${icon}]`), tab).not.toBeNull();
    }
  });

  it("draws a tab page in its own scrolling region, one viewport tall, with no dock (#611, DOCK-UNDER-PAGES)", () => {
    render(wrap(<TabPage title="Settings"><p>Body</p></TabPage>));
    expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull();
    const region = screen.getByText("Body").closest("[data-slot=page-scroll]")!;
    expect(region.className).toMatch(/overflow-y-auto/);
    expect(region.className).toMatch(/overscroll-contain/);
    expect(region.parentElement!.className).toMatch(/\bh-dvh\b/);
    // The region runs to the screen's foot, the safe area under the page's last line.
    expect(region.className).toContain("pb-[env(safe-area-inset-bottom)]");
    expect(region.className).not.toContain("--app-nav-h");
  });

  it("serves the background as AVIF, WebP and a JPEG fallback from this host", () => {
    const { container } = render(<Background base="/" />);
    const sources = [...container.querySelectorAll("source")].map((e) => [e.type, e.srcset] as const);
    expect(sources.map(([t]) => t)).toEqual(["image/avif", "image/webp"]);
    expect(sources[0]![1]).toContain("/backgrounds/placeholder-720.avif 720w");
    expect(container.querySelector("img")).toHaveAttribute("src", "/backgrounds/placeholder-1440.jpg");
    expect(container.innerHTML).not.toMatch(/https?:/);
  });
});
