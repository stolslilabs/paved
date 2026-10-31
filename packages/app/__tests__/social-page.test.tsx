import { slow } from "../test-slow";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import type { ReactNode } from "react";
import { Outlet, type RouteObject } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import type { GameSigner } from "../src/data";
import { socialTotal } from "../src/components/containers/social-tabs";
import { SocialScene } from "../src/components/scenes/social-scene";
import { SEEDED_PLAYERS } from "../src/data/mock/players";
import { mockRivalsV2 } from "../src/data/mock/v2";
import { queryClient } from "../src/lib/query-client";
import { SOCIAL } from "../src/mocks/social";
import { createTestRouter } from "../src/routes/router";
import { resetSocialTabForTests, socialTabStored, storeSocialTab } from "../src/routes/social-tab";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { mockImplementation } from "./mock-fakes";
import { preloadPages } from "./route-helpers";
import { fakeWallet } from "./wallet-fakes";

// The Social page (#952, PR 2): its header, the player search, the three tabs with their badges and empty states, the last tab
// used kept on the device, and the page on the mock: a search opens a seeded player's and a rival's profile.

const wrap = (ui: ReactNode) => (
  <LazyMotion features={domMax}>
    <MotionConfig reducedMotion="always">{ui}</MotionConfig>
  </LazyMotion>
);

describe("SocialScene (#952)", () => {
  it("has its title, Back, the search and three tabs, Guild, Friends and Chat, each empty until its issue", async () => {
    const onBack = vi.fn();
    const onTabChange = vi.fn();
    render(wrap(<SocialScene {...SOCIAL.guild} onBack={onBack} onTabChange={onTabChange} />));
    expect(screen.getByRole("heading", { level: 1, name: "Social" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Name or player ID" })).toBeInTheDocument();
    const tabs = within(screen.getByRole("tablist", { name: "Social" })).getAllByRole("tab");
    expect(tabs.map((t) => t.getAttribute("aria-label"))).toEqual(["Guild", "Friends", "Chat"]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("No guild yet");
    await userEvent.click(tabs[2]!);
    expect(onTabChange).toHaveBeenCalledWith("chat");
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("shows each tab's empty state", () => {
    const { rerender } = render(wrap(<SocialScene {...SOCIAL.friends} />));
    expect(screen.getByRole("tabpanel")).toHaveTextContent("No friends yet");
    rerender(wrap(<SocialScene {...SOCIAL.chat} />));
    expect(screen.getByRole("tabpanel")).toHaveTextContent("No messages yet");
  });

  it("puts what waits on each tab's badge, in its name too; the home's button counts the three", () => {
    render(wrap(<SocialScene {...SOCIAL.badges} />));
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.getAttribute("aria-label"))).toEqual(["Guild, 2 waiting", "Friends, 5 waiting", "Chat, 12 waiting"]);
    expect(tabs[2]).toHaveTextContent("Chat12");
    render(wrap(<SocialScene {...SOCIAL.stress} />));
    expect(screen.getAllByRole("tab", { name: "Chat, 999 waiting" })[0]).toHaveTextContent("Chat99+");
    expect(socialTotal(SOCIAL.badges.badges)).toBe(19);
  });

  it("draws a tab's content as the page gives it", () => {
    render(wrap(<SocialScene {...SOCIAL.guild} renderTab={(tab) => <p>{tab} content</p>} />));
    expect(screen.getByRole("tabpanel")).toHaveTextContent("guild content");
  });
});

describe("the last tab used (#952)", () => {
  beforeEach(() => {
    resetSocialTabForTests();
    localStorage.clear();
  });

  it("is Guild at first, then the one kept, across a reload; a value not written here is Guild", () => {
    expect(socialTabStored()).toBe("guild");
    storeSocialTab("chat");
    resetSocialTabForTests();
    expect(socialTabStored()).toBe("chat");
    localStorage.setItem("social-tab", "nope");
    resetSocialTabForTests();
    expect(socialTabStored()).toBe("guild");
  });
});

/** The routes with a plain home: the shell stays, the panels' pages drawn as full pages (below `desktop`). */
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

describe("/social on the mock (#952)", { timeout: slow(20_000) }, () => {
  preloadPages("social");
  beforeEach(() => {
    queryClient.clear();
    resetWelcomedForTests();
    markWelcomed();
    resetSocialTabForTests();
  });
  afterEach(() => {
    queryClient.clear();
    resetWelcomedForTests();
    resetSocialTabForTests();
    localStorage.clear();
  });

  function open(path: string) {
    const s = mockImplementation();
    const me = s.sources.signer!.address;
    const wallet = fakeWallet({ address: me, restored: true });
    wallet.connector.signer = () => s.sources.signer as GameSigner;
    const router = createTestRouter(path, plainHome);
    render(<App router={router} sources={s.sources} connector={wallet.load} />);
    return { router };
  }

  it("opens on the last tab used, each tab's chunk with its content", async () => {
    storeSocialTab("friends");
    resetSocialTabForTests();
    open("/social");
    expect(await screen.findByRole("heading", { level: 1, name: "Social" }, { timeout: slow(8000) })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Friends" })).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByText(/^No friends yet/, undefined, { timeout: slow(5000) })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Chat" }));
    expect(await screen.findByText("No messages yet", undefined, { timeout: slow(5000) })).toBeInTheDocument();
    expect(localStorage.getItem("social-tab")).toBe("chat");
  });

  it("finds a seeded player and a rival by name and by ID, each opening their profile", async () => {
    const { router } = open("/social");
    const field = await screen.findByRole("searchbox", { name: "Name or player ID" }, { timeout: slow(8000) });
    const seeded = SEEDED_PLAYERS[3]!;
    const rival = mockRivalsV2()[5]!;
    for (const [query, player] of [
      [seeded.name.split(" ")[0]!, seeded],
      [rival.address, rival],
    ] as const) {
      await userEvent.clear(field);
      await userEvent.type(field, query);
      const results = await screen.findByRole("list", { name: "Players found" }, { timeout: slow(5000) });
      const result = await within(results).findByRole("button", { name: new RegExp(`^${player.name}`) }, { timeout: slow(5000) });
      await userEvent.click(result);
      expect(await screen.findByRole("dialog", { name: player.name }, { timeout: slow(8000) })).toBeInTheDocument();
      expect(new URLSearchParams(router.state.location.search).get("player")).toBe(player.address);
      await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    }
    expect(router.state.location.pathname).toBe("/social");
  });
});
