import { routeOf } from "./route-helpers";
import { slow } from "../test-slow";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import { LazyMotion, domMax } from "motion/react";
import { beforeEach, describe, expect, it } from "vitest";
import { App } from "../src/App";
import { BalancesProvider } from "../src/components/containers/balances-context";
import { TopBar } from "../src/components/containers/top-bar";
import { HOME_BALANCES, HomeVillageScene } from "../src/components/scenes/home-village-scene";
import { VillageScene } from "../src/components/scenes/village-scene";
import { VILLAGE } from "../src/mocks/village";
import { HOME_VILLAGE } from "../src/mocks/village-v2";
import { BALANCE_PAGES } from "../src/routes/balance-pages";
import { DESTINATION as HOST_DESTINATION } from "../src/routes/balances-host";
import { DESTINATION, HEADER_BALANCES, hereOf } from "../src/routes/header-balances";
import { PAGES } from "../src/routes/pages";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { fakeSources } from "./data-fakes";

// BALANCES-BY-PAGE (#855, the owner's decisions of 2026-10-28, revising #781): a page shows only the balances it uses, the same
// set on a phone and from `desktop`, in the header's row; nothing under the header; none in the game scenes and the pages that use none.
/** The issue's table, row by row: each route's balances, in their order on screen. */
const TABLE: Record<string, readonly string[]> = {
  "": ["cobbles", "paved", "vpaved-held"],
  "play/challenge": ["usdc"],
  // The Puzzle's view: the Cobbles its first place wins.
  "play/puzzle": ["cobbles"],
  // SHOP-PAGE: the packs are the Shop's Cobbles tab, paid in USDC; the scene shows the tab's own set.
  "village/shop": ["cobbles", "usdc"],
  missions: ["cobbles"],
  tiles: ["cobbles"],
  "settings/theme": ["cobbles"],
  avatar: ["cobbles"],
  "village/:player": ["cobbles"],
  "pvp/league": [],
  vault: ["paved", "vpaved"],
  chat: [],
  "chat/private/:player": [],
  "chat/mail/:mail": [],
  "chat/:tab": [],
  guild: [],
  friends: [],
  ranking: [],
  play: [],
  story: [],
  settings: [],
  referral: [],
  "settings/credits": [],
  // The game scenes: the boards, the ends of a game, the PvP attack's flow, its result and a replay (#647).
  "game/:gameId": [],
  training: [],
  "story/:campaign/:level": [],
  "game/:gameId/over": [],
  "training/over": [],
  pvp: [],
  "pvp/result/:id": [],
  "pvp/replay/:attacker/:id": [],
  "pvp/match/:id": [],
  "puzzle/:gameId": [],
  "puzzle/:gameId/over": [],
};

const concrete = (path: string) => "/" + path.replace(/\/?:\w+\?/, "").replace(/:theme/g, "forest").replace(/:player/g, "0x1").replace(/:(\w+)/g, "1");

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  resetWelcomedForTests();
  markWelcomed();
});

describe("the balances by page (#855)", () => {
  it("the rule names every route of the route map, in one table", () => {
    expect(Object.keys(HEADER_BALANCES).sort()).toEqual(PAGES.map((p) => p.path).sort());
  });

  it("each page's balances are its row of the table", () => {
    for (const [path, kinds] of Object.entries(HEADER_BALANCES)) expect([path, kinds]).toEqual([path, TABLE[path]]);
    expect(HOME_BALANCES).toEqual(TABLE[""]);
  });

  // The rule lives in the balances' chunk; the first screen keeps only what it needs, which must say the same.
  it("the shell's pages with balances are the rule's, and the plates lead where the shell sends them", () => {
    expect([...BALANCE_PAGES].sort()).toEqual(Object.keys(TABLE).filter((path) => TABLE[path]!.length > 0).sort());
    expect(HOST_DESTINATION).toEqual(DESTINATION);
    // The packs are a tab of the Shop (SHOP-PAGE): on the Shop, whatever its tab, the plate leads nowhere (its tabs are in view).
    expect(hereOf("/village/shop")).toEqual(["cobbles"]);
    // #871: PAVED leads to the Challenge's purchase (which shows USDC alone), vPAVED to the Vault.
    expect(DESTINATION).toEqual({ paved: "/play/challenge", vpaved: "/vault", cobbles: "/village/shop?tab=cobbles" });
    expect(hereOf("/vault")).toEqual(["vpaved"]);
    expect(hereOf("/play/challenge")).toEqual(["paved"]);
  });

  it("USDC only on the Cobbles' packs and the Challenge's purchase; the Vault's PAVED and vPAVED, never the Cobbles", () => {
    expect(Object.entries(HEADER_BALANCES).filter(([, kinds]) => kinds.includes("usdc")).map(([path]) => path).sort()).toEqual(["play/challenge", "village/shop"]);
    expect(HEADER_BALANCES.vault).not.toContain("cobbles");
  });

  // The shell's wiring, each route's page a stand-in top bar: the page's balances in the bar's row, the phone's plates (below
  // `desktop`) and the larger ones (from `desktop`), never a Connect; nothing on a page with none. jsdom
  // applies no media query: each part is told by the width its class keeps it to.
  it.each(PAGES.map((p) => [p.path || "/", p.path] as const))("%s", async (_, path) => {
    const router = createTestRouter(concrete(path), (routes) => {
      const route = routeOf(routes, path);
      // A page under its sheets (BACK-RULE #783), or a view of it (PLAY-PAGE: Play's stake), has no element of its own: their route
      // draws it, which holds it: the stand-in goes there.
      const drawn = route.element === undefined;
      route.element = <TopBar title="Stand-in" />;
      const holder = (rs: typeof routes): (typeof routes)[number] | undefined => {
        for (const r of rs) {
          if (route.path && !r.path && r.children?.includes(route)) return r;
          const found = r.children && holder(r.children);
          if (found) return found;
        }
        return undefined;
      };
      const sheets = drawn ? holder(routes) : undefined;
      if (sheets) sheets.element = route.element;
      route.loader = undefined;
      // The home's loader is its index's (#762).
      if (path === "") route.children![0]!.loader = undefined;
      return routes;
    });
    const { container } = render(<App router={router} sources={fakeSources().sources} />);
    const bar = (await screen.findByRole("heading", { level: 1, name: "Stand-in" }, { timeout: slow(5000) })).closest("header")!;
    expect(bar).toHaveClass("page-header");
    const kinds = TABLE[path]!;
    const none = kinds.length === 0;
    // Both the pill and the rail: a loaded run can read the header between their mounts. The bar's own: a drawer's page (Missions,
    // MISSIONS-PAGE) has the home and its balances under it.
    const regions = none
      ? within(bar).queryAllByRole("region", { name: "Balances" })
      : await waitFor(() => {
          const found = within(bar).getAllByRole("region", { name: "Balances" });
          expect(found).toHaveLength(2);
          return found;
        }, { timeout: slow(5000) });
    expect(regions.map((r) => r.className.match(/(hidden desktop:flex|desktop:hidden)/)?.[1])).toEqual(none ? [] : ["desktop:hidden", "hidden desktop:flex"]);
    for (const region of regions) expect(bar).toContainElement(region);
    // No Connect (NO-GUEST, the owner's ruling of 2026-11-07): the account is made at start, its plates read.
    for (const region of regions) expect(within(region).queryByRole("button", { name: "Connect" })).toBeNull();
    // `PageBalances` and its strip are gone (#781): nothing between the bar and the page's content.
    expect(container.querySelector('[data-slot="page-balances"]')).toBeNull();
  });
});

// SETTINGS-PAGE: Themes is a view of Settings' drawer; its header's end holds the Cobbles (its row's), Settings' own none.
it("Settings' Themes view shows the Cobbles at its drawer's header end, Settings none", async () => {
  const router = createTestRouter("/settings/theme");
  render(<App router={router} sources={fakeSources().sources} />);
  const drawer = await screen.findByRole("dialog", { name: "Themes" }, { timeout: slow(20_000) });
  const end = () => drawer.querySelector<HTMLElement>("[data-slot=hud-drawer-end]");
  await waitFor(() => expect(within(end()!).getAllByRole("region", { name: "Balances" }).length).toBeGreaterThan(0), { timeout: slow(5000) });
  await act(() => router.navigate("/settings"));
  await screen.findByRole("dialog", { name: "Settings" }, { timeout: slow(5000) });
  expect(end()).toBeNull();
}, slow(30_000));

// A test per row (#855): the page's header renders exactly its row's balances, a connected player's (vPAVED held), at 375 px (the
// phone's plates, `desktop:hidden`) and at 1440 px (the larger ones, `hidden desktop:flex`).
describe("each row's header, a holder's balances at 375 and 1440 px (#855)", () => {
  const HOLDER = { status: "ready", usdc: 48_500_000n, paved: 142_350_000_000_000_000_000n, vpaved: 1_250_400_000_000_000_000n, cobbles: 240 } as const;
  const PLATE: Record<string, RegExp> = { usdc: /USDC: Get test USDC/, paved: /^142\.35 PAVED: Play a Challenge$/, vpaved: /vPAVED: Vault/, cobbles: /Cobbles: Buy packs/ };
  const rows = Object.entries(TABLE).filter(([path]) => path !== "");
  it.each(rows)("%s", async (path, kinds) => {
    render(
      <LazyMotion features={domMax}>
        <BalancesProvider value={{ state: HOLDER, kinds: HEADER_BALANCES[path], faucet: true }}>
          <TopBar title="Stand-in" />
        </BalancesProvider>
      </LazyMotion>,
    );
    if (kinds.length === 0) return expect(screen.queryAllByRole("region", { name: "Balances" })).toHaveLength(0);
    const regions = await screen.findAllByRole("region", { name: "Balances" });
    expect(regions).toHaveLength(2);
    for (const region of regions) {
      const names = within(region).getAllByRole("button").map((b) => b.getAttribute("aria-label")!);
      expect(names).toHaveLength(kinds.length);
      kinds.forEach((kind, i) => expect(names[i]).toMatch(PLATE[kind.replace("-held", "")]!));
      // No "+" on any balance plate (#925), the phone's or the desktop's.
      expect(region.querySelector("[data-slot=resource-plus], [data-icon=plus]")).toBeNull();
    }
  });

  it("the home: the Cobbles, PAVED and vPAVED while held, no USDC, at both widths", async () => {
    const { unmount } = render(
      <LazyMotion features={domMax}>
        <BalancesProvider value={{ state: HOLDER, kinds: [] }}>
          <HomeVillageScene {...HOME_VILLAGE.view} />
        </BalancesProvider>
      </LazyMotion>,
    );
    // The provider's set is a panel page's (none, Settings): the home keeps its own under it.
    const regions = await screen.findAllByRole("region", { name: "Balances" });
    // Stacked at every width (HOME-UI-CAPSULES): the phone's plates below `desktop`, the larger ones from it.
    expect(regions.map((r) => r.dataset.direction)).toEqual(["column", "column"]);
    for (const region of regions) {
      expect(within(region).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(["240 Cobbles: Buy packs", "142.35 PAVED: Play a Challenge", "1.25 vPAVED: Vault"]);
      // The home's column too: no "+" (#925).
      expect(region.querySelector("[data-slot=resource-plus], [data-icon=plus]")).toBeNull();
    }
    unmount();
    // A player who holds none: no vPAVED plate.
    render(
      <LazyMotion features={domMax}>
        <BalancesProvider value={{ state: { ...HOLDER, vpaved: 0n }, kinds: [] }}>
          <HomeVillageScene {...HOME_VILLAGE.view} />
        </BalancesProvider>
      </LazyMotion>,
    );
    for (const region of await screen.findAllByRole("region", { name: "Balances" })) expect(within(region).queryByRole("button", { name: /vPAVED/ })).toBeNull();
  });

  it("the Vault shows vPAVED at zero: it is the page's own", async () => {
    render(
      <LazyMotion features={domMax}>
        <BalancesProvider value={{ state: { ...HOLDER, vpaved: 0n }, kinds: HEADER_BALANCES.vault }}>
          <TopBar title="Vault" />
        </BalancesProvider>
      </LazyMotion>,
    );
    for (const region of await screen.findAllByRole("region", { name: "Balances" })) {
      expect(within(region).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(["142.35 PAVED: Play a Challenge", "0.00 vPAVED: Vault"]);
    }
  });
});

describe("the Cobbles of the pages that spend them (#781, #855)", () => {
  const READY = { status: "ready", usdc: 48_500_000n, paved: 142_350_000_000_000_000_000n, cobbles: 240 } as const;
  const withBalances = (page: React.ReactNode) =>
    render(
      <LazyMotion features={domMax}>
        <BalancesProvider value={{ state: READY, kinds: ["cobbles"] }}>{page}</BalancesProvider>
      </LazyMotion>,
    );

  it.each([
    ["the own village", () => <VillageScene {...VILLAGE.growing} onBack={() => {}} />],
    ["a visit to another's village", () => <VillageScene {...VILLAGE.visitProfile} onBack={() => {}} />],
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
