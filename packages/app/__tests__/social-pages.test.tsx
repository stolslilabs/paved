import { slow } from "../test-slow";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import type { ReactNode } from "react";
import { Outlet, type RouteObject } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import type { GameSigner } from "../src/data";
import { ChatScene } from "../src/components/scenes/chat-scene";
import { resetChatTabForTests } from "../src/routes/chat-tab";
import { FriendsScene } from "../src/components/scenes/friends-scene";
import { GuildScene } from "../src/components/scenes/guild-scene";
import { SEEDED_PLAYERS } from "../src/data/mock/players";
import { mockRivalsV2 } from "../src/data/mock/v2";
import { queryClient } from "../src/lib/query-client";
import { FRIENDS_SEARCH } from "../src/mocks/social";
import { PlayerProfileHost } from "../src/routes/player-profile";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { mockImplementation } from "./mock-fakes";
import { preloadPages, shownView } from "./route-helpers";
import { fakeWallet } from "./wallet-fakes";

// SOCIAL-SPLIT (#973, PR 1): the Chat, Guild and Friends pages in place of the Social page (#952): each its header and empty
// state, the friends page's search, the pages on the mock, and the old `/social` links landing on them.

const wrap = (ui: ReactNode) => (
  <LazyMotion features={domMax}>
    <MotionConfig reducedMotion="always">{ui}</MotionConfig>
  </LazyMotion>
);

describe("the social pages' scenes (#973)", () => {
  it("each has its title, Back, and its empty state for a guest", async () => {
    const onBack = vi.fn();
    for (const [scene, title, empty] of [
      [<ChatScene onBack={onBack} />, "Chat", "No messages yet"],
      [<GuildScene onBack={onBack} />, "Guild", "No guild yet"],
      [<FriendsScene {...FRIENDS_SEARCH.idle} onBack={onBack} />, "Friends", "No friends yet"],
    ] as const) {
      const { unmount } = render(wrap(scene));
      // The page's title: the header's h1, or the HUD's drawer's (CHAT-PAGE, GUILD-PAGE, FRIENDS-PAGE: a drawer's title is the dialog's, an h2).
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
      expect(screen.getByText(empty)).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Back" }));
      unmount();
    }
    expect(onBack).toHaveBeenCalledTimes(3);
  });

  it("puts the player search at the top of the friends page only", () => {
    const { unmount } = render(wrap(<FriendsScene {...FRIENDS_SEARCH.idle} />));
    expect(screen.getByRole("searchbox", { name: "Name or player ID" })).toBeInTheDocument();
    unmount();
    render(wrap(<ChatScene />));
    expect(screen.queryByRole("searchbox")).toBeNull();
  });

  it("draws the chat page's three tabs around the tab's content, with no bottom bar", () => {
    render(wrap(<ChatScene tab="guild" badges={{ guild: 2, private: 0 }}>{<p>guild conversation</p>}</ChatScene>));
    const tabs = within(screen.getByRole("tablist", { name: "Conversations" })).getAllByRole("tab");
    expect(tabs.map((t) => t.getAttribute("aria-label"))).toEqual(["World", "Guild, 2 waiting", "Private"]);
    expect(tabs[1]).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("guild conversation")).toBeInTheDocument();
    // No bottom bar: no page carries the dock (DOCK-UNDER-PAGES).
    expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull();
  });

  it("draws the content the page gives it", () => {
    render(wrap(<GuildScene>{<p>guild content</p>}</GuildScene>));
    expect(screen.getByText("guild content")).toBeInTheDocument();
    expect(screen.queryByText("No guild yet")).toBeNull();
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
                {/* The home's profile host, as the app's (FRIENDS-PAGE: the drawers' pages mount none of their own). */}
                <PlayerProfileHost />
              </main>
            ),
          }
        : c,
    ),
  })) as RouteObject[];

describe("the social pages on the mock (#973)", { timeout: slow(20_000) }, () => {
  preloadPages("chat", "guild", "friends");
  beforeEach(() => {
    queryClient.clear();
    resetWelcomedForTests();
    markWelcomed();
  });
  afterEach(() => {
    queryClient.clear();
    resetWelcomedForTests();
    resetChatTabForTests();
    localStorage.clear();
  });

  function open(path: string) {
    const s = mockImplementation();
    const me = s.sources.signer!.address;
    const wallet = fakeWallet({ address: me, restored: true });
    wallet.connector.signer = () => s.sources.signer as GameSigner;
    const router = createTestRouter(path, plainHome);
    render(<App router={router} sources={s.sources} connector={wallet.load} />);
    return { router, me };
  }

  it("opens the chat page on the World's tab for a player in no guild", async () => {
    const { router } = open("/chat");
    expect(await screen.findByRole("dialog", { name: "Chat" }, { timeout: slow(8000) })).toBeInTheDocument();
    expect(await screen.findByRole("tab", { name: "World" }, { timeout: slow(8000) })).toHaveAttribute("aria-selected", "true");
    await waitFor(() => expect(router.state.location.pathname).toBe("/chat/world"), { timeout: slow(8000) });
    expect(await screen.findByRole("region", { name: "World conversation" }, { timeout: slow(8000) })).toBeInTheDocument();
  });

  it("opens the guild page on the finder of a player in no guild", async () => {
    open("/guild");
    expect(await screen.findByRole("dialog", { name: "Guild" }, { timeout: slow(8000) })).toBeInTheDocument();
    expect(await screen.findByText("You are in no guild", undefined, { timeout: slow(8000) })).toBeInTheDocument();
  });

  it("opens the friends page on its three tabs, Friends selected, under the search", async () => {
    open("/friends");
    // FRIENDS-PAGE: the HUD's drawer, its title the Sheet's (an h2).
    expect(await screen.findByRole("heading", { level: 2, name: "Friends" }, { timeout: slow(8000) })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Name or player ID" })).toBeInTheDocument();
    const tabs = within(await screen.findByRole("tablist", { name: "Lists" }, { timeout: slow(8000) })).getAllByRole("tab");
    expect(tabs.map((t) => t.getAttribute("aria-label")?.split(",")[0])).toEqual(["Friends", "Following", "Followers"]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
  });

  it("finds a seeded player and a rival by name and by ID on the friends page, each opening their profile", async () => {
    const { router } = open("/friends");
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
      await userEvent.click(within(screen.getByRole("dialog", { name: player.name })).getByRole("button", { name: "Back" }));
      await waitFor(() => expect(screen.queryByRole("dialog", { name: player.name })).toBeNull());
    }
    expect(router.state.location.pathname).toBe("/friends");
  });

  describe("an old /social link (#973)", () => {
    it("lands on the friends page", async () => {
      const { router } = open("/social?ref=abc");
      expect(await screen.findByRole("heading", { level: 2, name: "Friends" }, { timeout: slow(8000) })).toBeInTheDocument();
      expect(router.state.location.pathname).toBe("/friends");
      expect(new URLSearchParams(router.state.location.search).get("ref")).toBe("abc");
    });

    it("with ?guild= opens that guild on the guild page", async () => {
      const { router } = open("/social?guild=2");
      expect(await screen.findByRole("dialog", { name: /Guild/ }, { timeout: slow(8000) })).toBeInTheDocument();
      expect(router.state.location.pathname).toBe("/guild");
      expect(new URLSearchParams(router.state.location.search).get("guild")).toBe("2");
      // The guild's page in the guild drawer's place (DRAWER-NAV-IN-PLACE, #1064): one drawer, no sheet over it.
      await waitFor(() => expect(document.querySelector("[data-hud-drawer=guild]")).toContainElement(shownView("guild-sheet")), { timeout: slow(8000) });
      expect(screen.getAllByRole("dialog")).toHaveLength(1);
    });

    it("a guild's link, /guild/<id>, opens that guild's page over the guild page, the ?ref= kept", async () => {
      const { router } = open("/guild/2?ref=abc");
      expect(await screen.findByRole("dialog", { name: /Guild/ }, { timeout: slow(8000) })).toBeInTheDocument();
      expect(router.state.location.pathname).toBe("/guild");
      expect(new URLSearchParams(router.state.location.search).get("guild")).toBe("2");
      expect(new URLSearchParams(router.state.location.search).get("ref")).toBe("abc");
      // In the guild drawer's place (DRAWER-NAV-IN-PLACE, #1064).
      const sheet = await waitFor(() => shownView("guild-sheet")!, { timeout: slow(8000) });
      expect(screen.getAllByRole("dialog")).toHaveLength(1);
      expect(sheet).toBeInTheDocument();
      // Its title on the drawer's header (no guild 2 in the mock: "Guild not found").
      expect(await within(screen.getByRole("dialog")).findByRole("heading", { level: 2, name: /Guild/ }, { timeout: slow(8000) })).toBeInTheDocument();
    });

    it("with ?chat= opens that conversation's tab on the chat page", async () => {
      const { router } = open("/social?chat=world&ref=abc");
      expect(await screen.findByRole("dialog", { name: "Chat" }, { timeout: slow(8000) })).toBeInTheDocument();
      await waitFor(() => expect(router.state.location.pathname).toBe("/chat/world"), { timeout: slow(8000) });
      expect(new URLSearchParams(router.state.location.search).get("chat")).toBeNull();
      expect(new URLSearchParams(router.state.location.search).get("ref")).toBe("abc");
      expect(await screen.findByRole("log", { name: "Messages" }, { timeout: slow(8000) })).toBeInTheDocument();
    });

    it("with ?player= keeps the player's profile open over the friends page", async () => {
      const player = SEEDED_PLAYERS[3]!;
      const { router } = open(`/social?player=${player.address}`);
      expect(await screen.findByRole("dialog", { name: player.name }, { timeout: slow(8000) })).toBeInTheDocument();
      expect(router.state.location.pathname).toBe("/friends");
    });
  });
});
