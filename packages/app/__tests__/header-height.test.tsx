import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppNav } from "../src/components/containers/app-nav";
import { TabPage } from "../src/components/containers/tab-page";
import { TopBar } from "../src/components/containers/top-bar";
import { WelcomeScene } from "../src/components/scenes/welcome-scene";
import { WELCOME } from "../src/mocks/scenes";
import { PAGES } from "../src/routes/pages";
import { PAGE_HEADER_STORIES } from "../src/stories/page-headers";

// HEADER-HEIGHT (#676): every page's header takes its height from the token, never its own. The heights themselves are
// measured in a browser at 375 and 1440 px by `scripts/header-sweep.ts` (jsdom lays nothing out).
const OWN_HEIGHT = /(^|\s|:)(min-|max-)?h-/;
/**
 * The game scenes: the boards (`Shell.tsx`) and the ends of a game (#720), whose bar is the board's HUD, no page header. So do
 * the PvP attack's (#647: the search's sky, the scout's and the attack's board) and its replay's, and the home, the village's
 * scene with its overlays (#753).
 */
const BOARD = ["", "game/:gameId", "training", "story/:campaign/:level", "game/:gameId/over", "training/over", "pvp", "pvp/replay/:attacker/:id"];

function header(container: HTMLElement): HTMLElement {
  const found = container.querySelectorAll<HTMLElement>('[data-slot="page-header"]');
  expect(found).toHaveLength(1);
  return found[0]!;
}

describe("the page headers", () => {
  it("the token holds one value below desktop and one from it, and the utility takes it", () => {
    const css = readFileSync(join(process.cwd(), "src/styles/theme.css"), "utf8");
    expect(css).toMatch(/:root \{\s*--header-h: 6rem;[\s\S]*?@media \(width >= 64rem\) \{\s*--header-h: 4rem;/);
    expect(css).toMatch(/@utility page-header \{[^}]*height: calc\(var\(--header-h\) \+ env\(safe-area-inset-top\)\);/);
    // A page with no balance on a phone (#720): its title row alone below `desktop`.
    expect(css).toMatch(/@utility page-header-single \{\s*@media \(width < 64rem\) \{\s*--header-h: 3\.5rem;\s*--header-rows: 1fr;/);
  });

  it.each([
    ["a flow's top bar", () => <TopBar title="Choose a mode" onBack={() => {}} />],
    ["a flow's top bar without balances", () => <TopBar title="Something broke" balances={false} />],
    ["a tab page's title row", () => <TabPage tab="vault" title="Vault" subtitle="Deposit PAVED for vPAVED" end={<span>Wallet</span>}>{null}</TabPage>],
    ["a page reached from another", () => <TabPage tab="settings" title="Credits" onBack={() => {}}>{null}</TabPage>],
    ["Welcome's space above the content", () => <WelcomeScene {...WELCOME.firstVisit} />],
  ])("%s is a page header on the token", (_, page) => {
    const { container } = render(page());
    const el = header(container);
    expect(el).toHaveClass("page-header");
    expect(el.className).not.toMatch(OWN_HEIGHT);
  });

  it("the page shells of Pages/Headers cover every route but the game scenes'", () => {
    const covered = Object.values(PAGE_HEADER_STORIES).flat();
    expect([...covered].sort()).toEqual(PAGES.map((p) => p.path).filter((p) => !BOARD.includes(p)).sort());
  });

  it("the navigation is a page header from desktop only (below it, the bottom bar)", () => {
    render(<AppNav active="home" />);
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(nav).toHaveClass("desktop:page-header");
    expect(nav).not.toHaveClass("page-header");
    expect(nav.className).not.toMatch(/desktop:(min-|max-)?h-|desktop:py-/);
  });
});
