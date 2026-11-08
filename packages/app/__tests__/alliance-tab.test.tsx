import { slow } from "../test-slow";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Outlet, type RouteObject } from "react-router";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "../src/App";
import type { GameSigner } from "../src/data";
import { MOCK_ACCEPT_S, MOCK_SEED_REQUEST_S } from "../src/data/mock/alliances";
import { memoryStore } from "./data-fakes";
import { queryClient } from "../src/lib/query-client";
import { createTestRouter } from "../src/routes/router";
import { resetGuildTabForTests } from "../src/routes/guild-tab";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { mockImplementation } from "./mock-fakes";
import { preloadPages, shownView } from "./route-helpers";
import { fakeWallet } from "./wallet-fakes";

// ALLIANCES on the mock, through the pages: the guild page's Alliance (create, a community guild's request, Accept), the guild's alliance
// line, asking to join an alliance from Find, and the Leaderboard's Alliances tab opening an alliance in the guild page's drawer.

/** 2026-10-31 12:00 UTC. */
const T0 = 1_793_448_000;

/** The routes with a plain home: the panels' pages drawn as full pages (below `desktop`). */
const plainHome = (routes: RouteObject[]): RouteObject[] =>
  routes.map((r) => ({
    ...r,
    children: r.children?.map((c) =>
      c.id === "home"
        ? {
            ...c,
            element: (
              <main>
                <Outlet />
              </main>
            ),
          }
        : c,
    ),
  })) as RouteObject[];

const T = (ms: number) => ({ timeout: slow(ms) });

describe("alliances on the mock, through the pages (ALLIANCES)", { timeout: slow(40_000) }, () => {
  preloadPages("guild", "ranking");
  beforeEach(() => {
    queryClient.clear();
    resetWelcomedForTests();
    markWelcomed();
  });
  afterEach(() => {
    queryClient.clear();
    resetWelcomedForTests();
    resetGuildTabForTests();
    localStorage.clear();
  });

  function open(path = "/guild") {
    const clock = { now: T0 };
    const s = mockImplementation(memoryStore(), undefined, () => clock.now);
    const me = s.sources.signer!.address;
    const wallet = fakeWallet({ address: me, restored: true });
    wallet.connector.signer = () => s.sources.signer as GameSigner;
    const router = createTestRouter(path, plainHome);
    render(<App router={router} sources={s.sources} connector={wallet.load} />);
    /** Moves the ledger's clock, then reads the social reads again (nothing polls). */
    const later = async (seconds: number) => {
      clock.now += seconds;
      await act(() => queryClient.invalidateQueries({ queryKey: ["social"] }));
    };
    return { router, later, me };
  }

  /** The guild drawer's header: its title, and its Back. */
  const drawer = () => document.querySelector<HTMLElement>("[data-hud-drawer=guild]")!;
  const title = (name: string) => waitFor(() => expect(within(drawer()).getByRole("heading", { name })).toBeInTheDocument(), T(8_000));
  const back = () => userEvent.click(within(drawer()).getByRole("button", { name: "Back" }));

  async function createGuild(name: string) {
    await userEvent.click(await screen.findByRole("button", { name: "Create a guild" }, T(10_000)));
    const sheet = await screen.findByRole("dialog", { name: "Create a guild" }, T(5_000));
    await userEvent.type(within(sheet).getByRole("textbox", { name: "Name" }), name);
    await userEvent.click(within(sheet).getByRole("button", { name: "Create the guild" }));
    await screen.findByRole("heading", { level: 2, name }, T(8_000));
  }

  it("creates an alliance from the guild's Alliance, takes a community guild's request, and shows it under the guild's tag", async () => {
    const { router, later } = open();
    await createGuild("Stone Road");
    // Read once the guild is there: "No alliance" under its tag, the Alliance tile beside Chat.
    expect(await within(drawer()).findByText("No alliance", undefined, T(8_000))).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Alliance" }));
    await title("Alliance");
    expect(router.state.location.search).toBe("?view=alliance");
    expect(await screen.findByRole("region", { name: "No alliance" }, T(5_000))).toHaveTextContent("Stone Road is in no alliance.");
    await userEvent.click(screen.getByRole("button", { name: "Create an alliance" }));
    await title("Create an alliance");
    await userEvent.type(screen.getByRole("textbox", { name: "Name" }), "Road Pact");
    await userEvent.click(screen.getByRole("button", { name: "Create the alliance" }));
    await screen.findByRole("heading", { level: 2, name: "Road Pact" }, T(8_000));
    expect(screen.getByRole("heading", { level: 2, name: "Road Pact" }).closest("header")).toHaveTextContent("Head guild");
    await later(MOCK_SEED_REQUEST_S);
    const requests = await screen.findByRole("region", { name: "Requests" }, T(8_000));
    await waitFor(() => expect(requests).toHaveTextContent("Hollow Oak"), T(8_000));
    await userEvent.click(within(requests).getByRole("button", { name: "Accept Hollow Oak" }));
    await waitFor(() => expect(within(screen.getByRole("list", { name: "Guilds" })).getAllByRole("button")).toHaveLength(2), T(8_000));
    await back();
    await screen.findByRole("heading", { level: 2, name: "Stone Road" }, T(8_000));
    expect(await screen.findByRole("button", { name: "Alliance: Road Pact" }, T(8_000))).toBeInTheDocument();
    expect(router.state.location.search).toBe("");
  });

  it("asks to join Stone Pact from Find an alliance; led from the community, it takes the guild a little later", async () => {
    const { later } = open();
    await createGuild("Mill Lane");
    await userEvent.click(await screen.findByRole("button", { name: "Alliance" }, T(8_000)));
    await userEvent.click(await screen.findByRole("button", { name: "Find an alliance" }, T(8_000)));
    await title("Find an alliance");
    const list = await screen.findByRole("list", { name: "Alliances" }, T(8_000));
    await userEvent.click(within(list).getByRole("button", { name: /^Stone Pact,/ }));
    await screen.findByRole("heading", { level: 2, name: "Stone Pact" }, T(8_000));
    // Back from an alliance opened in Find comes back to Find (its view kept in the history entry).
    await back();
    await title("Find an alliance");
    await userEvent.click(within(await screen.findByRole("list", { name: "Alliances" }, T(8_000))).getByRole("button", { name: /^Stone Pact,/ }));
    await screen.findByRole("heading", { level: 2, name: "Stone Pact" }, T(8_000));
    await userEvent.click(await screen.findByRole("button", { name: "Request to join Stone Pact" }, T(8_000)));
    await waitFor(() => expect(screen.getByRole("button", { name: "Request sent" })).toBeDisabled(), T(8_000));
    await later(MOCK_ACCEPT_S);
    await waitFor(() => expect(screen.getByRole("heading", { level: 2, name: "Stone Pact" }).closest("header")).toHaveTextContent("Member guild"), T(8_000));
    expect(within(screen.getByRole("list", { name: "Guilds" })).getByRole("button", { name: /^Mill Lane \(your guild\)/ })).toBeInTheDocument();
  });

  it("opens an alliance from the Leaderboard's Alliances tab, in the guild page's drawer, its guilds in its place, Back to the ranking", async () => {
    const { router } = open("/ranking?tab=alliances");
    const ranking = await screen.findByRole("list", { name: "Alliances by score" }, T(10_000));
    await userEvent.click(within(ranking).getByRole("button", { name: /^2\. Stone Pact/ }));
    await screen.findByRole("heading", { level: 2, name: "Stone Pact" }, T(10_000));
    expect(router.state.location.pathname).toBe("/guild");
    expect(router.state.location.search).toBe("?alliance=700");
    await title("Alliance");
    // A guild of the alliance: its page in the drawer's place (DRAWER-NAV-IN-PLACE), the alliance kept under it; Back to the alliance.
    await userEvent.click(within(screen.getByRole("list", { name: "Guilds" })).getByRole("button", { name: /^Order of the Millstone/ }));
    await waitFor(() => expect(shownView("guild-sheet")).not.toBeNull(), T(8_000));
    expect(drawer()).toContainElement(shownView("guild-sheet"));
    expect(router.state.location.search).toBe("?alliance=700&guild=20003");
    expect(await within(shownView("guild-sheet")!).findByRole("button", { name: "Alliance: Stone Pact" }, T(8_000))).toBeInTheDocument();
    await back();
    await waitFor(() => expect(shownView()).toBeNull(), T(8_000));
    expect(router.state.location.search).toBe("?alliance=700");
    await title("Alliance");
    await back();
    await waitFor(() => expect(router.state.location.pathname).toBe("/ranking"), T(8_000));
    expect(router.state.location.search).toBe("?tab=alliances");
  });
});
