import { slow } from "../test-slow";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { App } from "../src/App";
import { TopBar } from "../src/components/containers/top-bar";
import { HEADER_BALANCES } from "../src/routes/header-balances";
import { PAGES } from "../src/routes/pages";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { fakeSources } from "./data-fakes";

// HEADER-BALANCES (#720): the owner's table, by route and width. Below `desktop` the Cobbles only where they move; from
// `desktop` every balance outside the game scenes; none in the game scenes; the Cobbles never twice.
const PHONE_COBBLES = ["", "cobbles", "missions/lifetime", "missions/:day?", "avatar", "settings/theme", "settings/theme/:theme"];
/** The game scenes: the boards and the ends of a game. */
const GAME_SCENES = ["game/:gameId", "training", "story/:campaign/:level", "game/:gameId/over", "training/over"];
/** The scenes that draw their own Cobbles plate at every width: the header adds none. */
const OWN_COBBLES = ["village", "village/:player"];

const concrete = (path: string) => "/" + path.replace(/\/?:\w+\?/, "").replace(/:theme/g, "forest").replace(/:player/g, "0x1").replace(/:(\w+)/g, "1");

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  resetWelcomedForTests();
  markWelcomed();
});

describe("the header's balances by page (#720)", () => {
  it("the rule names every route of the route map, in one table", () => {
    expect(Object.keys(HEADER_BALANCES).sort()).toEqual(PAGES.map((p) => p.path).sort());
  });

  it("on a phone, the Cobbles only on Home and where Cobbles are bought, earned or spent", () => {
    const phone = Object.entries(HEADER_BALANCES).filter(([, rule]) => rule.phone).map(([path]) => path);
    expect(phone.sort()).toEqual([...PHONE_COBBLES].sort());
  });

  it("from desktop, every balance outside the game scenes, none in them; never the Cobbles twice", () => {
    for (const [path, rule] of Object.entries(HEADER_BALANCES)) {
      const expected = GAME_SCENES.includes(path) ? "none" : OWN_COBBLES.includes(path) ? "no-cobbles" : "all";
      expect([path, rule.desktop]).toEqual([path, expected]);
    }
  });

  // The shell's wiring, each route's page a stand-in top bar: the Cobbles' strip (below `desktop`) where the rule shows it,
  // else a one-row bar; the rail (from `desktop`) outside the game scenes. jsdom applies no media query: each part is told by
  // the width its class keeps it to.
  it.each(PAGES.map((p) => [p.path || "/", p.path] as const))("%s", async (_, path) => {
    const router = createTestRouter(concrete(path), (routes) => {
      const route = routes[0]!.children!.find((r) => (path === "" ? r.index : r.path === path))!;
      route.element = <TopBar title="Stand-in" />;
      route.loader = undefined;
      return routes;
    });
    render(<App router={router} sources={fakeSources().sources} />);
    const bar = (await screen.findByRole("heading", { level: 1, name: "Stand-in" }, { timeout: slow(5000) })).closest("header")!;
    const rule = HEADER_BALANCES[path]!;
    const regions = rule.phone || rule.desktop !== "none" ? await screen.findAllByRole("region", { name: "Balances" }) : screen.queryAllByRole("region", { name: "Balances" });
    const phone = regions.filter((r) => r.parentElement!.className.includes("desktop:hidden"));
    const desktop = regions.filter((r) => r.className.includes("hidden desktop:flex"));
    expect(phone).toHaveLength(rule.phone ? 1 : 0);
    expect(desktop).toHaveLength(rule.desktop === "none" ? 0 : 1);
    expect(bar).toHaveClass("page-header");
    if (rule.phone) expect(bar).not.toHaveClass("page-header-single");
    else expect(bar).toHaveClass("page-header-single");
  });
});
