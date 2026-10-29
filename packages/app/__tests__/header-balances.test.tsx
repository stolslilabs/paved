import { routeOf } from "./route-helpers";
import { slow } from "../test-slow";
import { render, screen, waitFor, within } from "@testing-library/react";
import { LazyMotion, domMax } from "motion/react";
import { beforeEach, describe, expect, it } from "vitest";
import { App } from "../src/App";
import { BalancesProvider } from "../src/components/containers/balances-context";
import { TopBar } from "../src/components/containers/top-bar";
import { VillageScene } from "../src/components/scenes/village-scene";
import { VillageShopScene } from "../src/components/scenes/village-shop-scene";
import { VILLAGE } from "../src/mocks/village";
import { VILLAGE_SHOP } from "../src/mocks/village-v2";
import { HEADER_BALANCES } from "../src/routes/header-balances";
import { PAGES } from "../src/routes/pages";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { fakeSources } from "./data-fakes";

// HEADER-BALANCES (#720), revised by ONE-HEADER (#781): the home's balances on every page, in its format and in the header's
// row (the Cobbles' pill below `desktop`, every balance's rail from it), nothing under the header; none in the game scenes.
/** The game scenes: the boards, the ends of a game, the PvP attack's flow, its result and a replay (#647). */
const GAME_SCENES = ["game/:gameId", "training", "story/:campaign/:level", "game/:gameId/over", "training/over", "pvp", "pvp/result/:id", "pvp/replay/:attacker/:id", "pvp/match/:id"];

const concrete = (path: string) => "/" + path.replace(/\/?:\w+\?/, "").replace(/:theme/g, "forest").replace(/:player/g, "0x1").replace(/:(\w+)/g, "1");

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  resetWelcomedForTests();
  markWelcomed();
});

describe("the header's balances by page (#720, #781)", () => {
  it("the rule names every route of the route map, in one table", () => {
    expect(Object.keys(HEADER_BALANCES).sort()).toEqual(PAGES.map((p) => p.path).sort());
  });

  it("the home's balances on every page but the game scenes, which show none", () => {
    for (const [path, rule] of Object.entries(HEADER_BALANCES)) expect([path, rule]).toEqual([path, GAME_SCENES.includes(path) ? "none" : "home"]);
  });

  // The shell's wiring, each route's page a stand-in top bar: the home's pill (below `desktop`) and rail (from `desktop`) both
  // in the bar's row outside the game scenes, nothing under it. jsdom applies no media query: each part is told by the width its
  // class keeps it to.
  it.each(PAGES.map((p) => [p.path || "/", p.path] as const))("%s", async (_, path) => {
    const router = createTestRouter(concrete(path), (routes) => {
      const route = routeOf(routes, path);
      route.element = <TopBar title="Stand-in" />;
      // A page under its sheets (BACK-RULE #783) is drawn by their route, which holds it: the stand-in goes there.
      const holder = (rs: typeof routes): (typeof routes)[number] | undefined => {
        for (const r of rs) {
          if (route.path && !r.path && r.children?.[0] === route) return r;
          const found = r.children && holder(r.children);
          if (found) return found;
        }
        return undefined;
      };
      const sheets = holder(routes);
      if (sheets) sheets.element = route.element;
      route.loader = undefined;
      // The home's welcome loader is its index's (#762).
      if (path === "") route.children![0]!.loader = undefined;
      return routes;
    });
    const { container } = render(<App router={router} sources={fakeSources().sources} />);
    const bar = (await screen.findByRole("heading", { level: 1, name: "Stand-in" }, { timeout: slow(5000) })).closest("header")!;
    expect(bar).toHaveClass("page-header");
    const none = HEADER_BALANCES[path] === "none";
    // Both the pill and the rail: a loaded run can read the header between their mounts.
    const regions = none
      ? screen.queryAllByRole("region", { name: "Balances" })
      : await waitFor(() => {
          const found = screen.getAllByRole("region", { name: "Balances" });
          expect(found).toHaveLength(2);
          return found;
        }, { timeout: slow(5000) });
    expect(regions.map((r) => r.className.match(/(hidden desktop:flex|desktop:hidden)/)?.[1])).toEqual(none ? [] : ["desktop:hidden", "hidden desktop:flex"]);
    for (const region of regions) expect(bar).toContainElement(region);
    // `PageBalances` and its strip are gone (#781): nothing between the bar and the page's content.
    expect(container.querySelector('[data-slot="page-balances"]')).toBeNull();
  });
});

describe("the Cobbles, the home's on every page (#781)", () => {
  const READY = { status: "ready", usdc: 48_500_000n, paved: 142_350_000_000_000_000_000n, cobbles: 240 } as const;
  const withBalances = (page: React.ReactNode) =>
    render(
      <LazyMotion features={domMax}>
        <BalancesProvider value={{ state: READY }}>{page}</BalancesProvider>
      </LazyMotion>,
    );

  it.each([
    ["the own village", () => <VillageScene {...VILLAGE.growing} onBack={() => {}} />],
    ["a visit to another's village", () => <VillageScene {...VILLAGE.visitProfile} onBack={() => {}} />],
    ["the tile shop", () => <VillageShopScene {...VILLAGE_SHOP.today} onBack={() => {}} />],
  ])("%s: no plate of its own, the header's Cobbles and Buy packs, on a phone and from desktop", async (_, page) => {
    withBalances(page());
    const bar = screen.getAllByRole("heading", { level: 1 })[0]!.closest("header")!;
    expect(within(bar).queryByRole("img", { name: /Cobbles/ })).toBeNull();
    const regions = await within(bar).findAllByRole("region", { name: "Balances" });
    expect(regions).toHaveLength(2);
    expect(screen.getAllByRole("region", { name: "Balances" })).toHaveLength(2);
    for (const region of regions) expect(await within(region).findByRole("button", { name: "240 Cobbles: Buy packs" })).toBeInTheDocument();
  });
});
