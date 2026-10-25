import { slow } from "../test-slow";
import { render, screen, within } from "@testing-library/react";
import { LazyMotion, domMax } from "motion/react";
import { beforeEach, describe, expect, it } from "vitest";
import { App } from "../src/App";
import { BalancesProvider } from "../src/components/containers/balances-context";
import { TopBar } from "../src/components/containers/top-bar";
import { VillageScene } from "../src/components/scenes/village-scene";
import { VILLAGE } from "../src/mocks/village";
import { HEADER_BALANCES } from "../src/routes/header-balances";
import { PAGES } from "../src/routes/pages";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { fakeSources } from "./data-fakes";

// HEADER-BALANCES (#720): the owner's table, by route and width. Below `desktop` the Cobbles only where they move; from
// `desktop` every balance outside the game scenes; none in the game scenes; the Cobbles never twice.
const PHONE_COBBLES = ["", "cobbles", "missions/lifetime", "missions/:day?", "avatar", "settings/theme", "settings/theme/:theme", "village/:player", "village/chests", "village/shop"];
/** The game scenes: the boards and the ends of a game. */
// The PvP attack's flow, its result and a replay (#647) show none either, as the owner's table says (`header-balances.ts`).
const GAME_SCENES = ["game/:gameId", "training", "story/:campaign/:level", "game/:gameId/over", "training/over", "pvp", "pvp/result/:id", "pvp/replay/:attacker/:id"];

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
      const expected = GAME_SCENES.includes(path) ? "none" : "all";
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

describe("the village's Cobbles, never twice (#720)", () => {
  const READY = { status: "ready", usdc: 48_500_000n, paved: 142_350_000_000_000_000_000n, cobbles: 240 } as const;
  const village = (props: Parameters<typeof VillageScene>[0]) =>
    render(
      <LazyMotion features={domMax}>
        <BalancesProvider value={{ state: READY, show: HEADER_BALANCES["village/:player"] }}>
          <VillageScene {...props} onBack={() => {}} />
        </BalancesProvider>
      </LazyMotion>,
    );

  it("the own village draws its plate, and its bar leaves the Cobbles out at every width", async () => {
    village(VILLAGE.growing);
    const bar = screen.getByRole("heading", { level: 1, name: "My village" }).closest("header")!;
    expect(within(bar).getByRole("img", { name: "640 Cobbles" })).toBeInTheDocument();
    const regions = await within(bar).findAllByRole("region", { name: "Balances" });
    // The rail alone (from `desktop`), with every balance but the Cobbles; no strip below it.
    expect(regions).toHaveLength(1);
    expect(regions[0]).toHaveClass("desktop:flex");
    expect(within(regions[0]!).getByRole("button", { name: "142.35 PAVED: Vault" })).toBeInTheDocument();
    expect(within(regions[0]!).queryByRole("button", { name: /Cobbles/ })).toBeNull();
    expect(bar).toHaveClass("page-header-single");
  });

  it("a visit to another's village keeps the header's Cobbles and Buy packs, on a phone and from desktop", async () => {
    village(VILLAGE.visitProfile);
    const bar = screen.getAllByRole("heading", { level: 1 })[0]!.closest("header")!;
    expect(within(bar).queryByRole("img", { name: /Cobbles/ })).toBeNull();
    const regions = await within(bar).findAllByRole("region", { name: "Balances" });
    expect(regions).toHaveLength(2);
    for (const region of regions) expect(await within(region).findByRole("button", { name: "240 Cobbles: Buy packs" })).toBeInTheDocument();
    expect(bar).not.toHaveClass("page-header-single");
  });
});
