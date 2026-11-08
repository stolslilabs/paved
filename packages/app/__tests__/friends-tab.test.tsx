import { slow } from "../test-slow";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Outlet, type RouteObject } from "react-router";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "../src/App";
import type { GameSigner } from "../src/data";
import { followBackDelay } from "../src/data/mock/follows";
import { SEEDED_PLAYERS } from "../src/data/mock/players";
import { memoryStore } from "./data-fakes";
import { queryClient } from "../src/lib/query-client";
import { PlayerProfileHost } from "../src/routes/player-profile";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { mockImplementation } from "./mock-fakes";
import { preloadPages, shownView } from "./route-helpers";
import { fakeWallet } from "./wallet-fakes";

// The Friends tab and the profile's follow actions on the mock (#954, PR 2): the acceptance's flows through the page, the tab,
// the search and the profiles, on the ledger's follows (`data/mock/follows.ts`), its clock in the test's hands.

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
                {/* The home's profile host, as the app's (FRIENDS-PAGE: the drawers' pages mount none of their own). */}
                <PlayerProfileHost />
              </main>
            ),
          }
        : c,
    ),
  })) as RouteObject[];

const T = (ms: number) => ({ timeout: slow(ms) });

describe("/friends on the mock (#954, a page since #973)", { timeout: slow(40_000) }, () => {
  preloadPages("friends");
  beforeEach(() => {
    queryClient.clear();
    resetWelcomedForTests();
    markWelcomed();
  });
  afterEach(() => {
    queryClient.clear();
    resetWelcomedForTests();
    localStorage.clear();
  });

  /** The page on the mock; `home`: the home drawn as the app draws it, not plain. */
  function open(path = "/friends", { home = false }: { home?: boolean } = {}) {
    const clock = { now: T0 };
    const s = mockImplementation(memoryStore(), undefined, () => clock.now);
    const me = s.sources.signer!.address;
    const wallet = fakeWallet({ address: me, restored: true });
    wallet.connector.signer = () => s.sources.signer as GameSigner;
    const router = createTestRouter(path, home ? undefined : plainHome);
    render(<App router={router} sources={s.sources} connector={wallet.load} />);
    /** Moves the ledger's clock, then reads the follows again (nothing polls). */
    const later = async (seconds: number) => {
      clock.now += seconds;
      await act(() => queryClient.invalidateQueries({ queryKey: ["social"] }));
    };
    const backer = SEEDED_PLAYERS.find((p) => followBackDelay(me, p.address) !== null)!;
    const other = SEEDED_PLAYERS.find((p) => followBackDelay(me, p.address) === null)!;
    return { router, later, me, backer, other, delay: followBackDelay(me, backer.address)!, follows: s.sources.social!.follows! };
  }

  const lists = () => screen.findByRole("tablist", { name: "Lists" }, T(10_000));
  const list = (name: "Friends" | "Following" | "Followers") => screen.getByRole("region", { name });
  const count = (name: string, n: number) => waitFor(() => expect(screen.getByRole("tab", { name: new RegExp(`^${name}, ${n}`) })).toBeInTheDocument(), T(8_000));

  async function confirm(title: string | RegExp, button: string) {
    const dialog = await screen.findByRole("dialog", { name: title }, T(5_000));
    await userEvent.click(within(dialog).getByRole("button", { name: button }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: title })).toBeNull(), T(5_000));
  }

  it("starts a new player with no follows, and suggests players to follow", async () => {
    open();
    await lists();
    await count("Friends", 0);
    await count("Following", 0);
    await count("Followers", 0);
    expect(list("Friends")).toHaveTextContent("No friends yet");
    const suggested = screen.getByRole("region", { name: "Suggested players" });
    await waitFor(() => expect(within(suggested).getAllByRole("button", { name: /^Follow / }).length).toBeGreaterThan(0), T(8_000));
  });

  it("follows from a suggestion, then unfollows from the Following list after confirming", async () => {
    open();
    await lists();
    const suggested = screen.getByRole("region", { name: "Suggested players" });
    const first = await within(suggested).findAllByRole("button", { name: /^Follow / }, T(8_000));
    const name = first[0]!.getAttribute("aria-label")!.replace(/^Follow /, "");
    await userEvent.click(first[0]!);
    await count("Following", 1);
    await userEvent.click(screen.getByRole("tab", { name: /^Following/ }));
    expect(list("Following")).toHaveTextContent(name);
    await userEvent.click(within(list("Following")).getByRole("button", { name: `Following ${name}: unfollow` }));
    await confirm(`Unfollow ${name}?`, "Unfollow");
    await count("Following", 0);
  });

  it("follows from the search, and the result shows Following", async () => {
    const { other } = open();
    await lists();
    await userEvent.type(screen.getByRole("searchbox", { name: "Name or player ID" }), other.name);
    const found = await screen.findByRole("list", { name: "Players found" }, T(8_000));
    await userEvent.click(await within(found).findByRole("button", { name: `Follow ${other.name}` }, T(8_000)));
    await waitFor(() => expect(within(found).getAllByText("Following").length).toBeGreaterThan(0), T(8_000));
    await count("Following", 1);
  });

  it("follows from a profile; the follow back makes a friend, marked new until seen, then unfollowed from the Followers", async () => {
    const { router, later, backer, delay } = open();
    await lists();
    await act(() => router.navigate(`/friends?player=${backer.address}`));
    const profile = await screen.findByRole("dialog", { name: backer.name }, T(8_000));
    await userEvent.click(await within(profile).findByRole("button", { name: "Follow" }, T(8_000)));
    expect(await within(profile).findByRole("button", { name: `Following ${backer.name}: unfollow` }, T(8_000))).toBeInTheDocument();
    // The follow back, once due: a friend, and a new follower on the badges.
    await later(delay + 1);
    // The profile in the drawer's place (DRAWER-NAV-IN-PLACE): the friends' page kept under it.
    expect(await within(shownView("public-profile")!).findByText("Friends", undefined, T(8_000))).toBeInTheDocument();
    await userEvent.click(within(profile).getByRole("button", { name: "Back" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: backer.name })).toBeNull(), T(5_000));
    await count("Friends", 1);
    expect(list("Friends")).toHaveTextContent(backer.name);
    expect(screen.getByRole("tab", { name: "Followers, 1, 1 new" })).toBeInTheDocument();
    // Seen: the badges go, the New mark stays while the list is shown.
    await userEvent.click(screen.getByRole("tab", { name: /^Followers, 1, 1 new/ }));
    expect(list("Followers").querySelector("[data-slot=new-dot]")).not.toBeNull();
    await waitFor(() => expect(screen.getByRole("tab", { name: "Followers, 1" })).toBeInTheDocument(), T(8_000));
    expect(list("Followers").querySelector("[data-slot=new-dot]")).not.toBeNull();
    // Unfollowed from their row's Following (FRIENDS-PAGE: the book's rows have no Remove): no longer friends; they still follow.
    await userEvent.click(within(list("Followers")).getByRole("button", { name: `Following ${backer.name}: unfollow` }));
    await confirm(`Unfollow ${backer.name}?`, "Unfollow");
    await count("Friends", 0);
    await count("Following", 0);
    await count("Followers", 1);
    expect(within(list("Followers")).getByRole("button", { name: `Follow back ${backer.name}` })).toBeInTheDocument();
  });

  it("blocks from a profile, which ends the follows, and unblocks from the blocked players", async () => {
    const { router, later, backer, delay } = open();
    await lists();
    await act(() => router.navigate(`/friends?player=${backer.address}`));
    const profile = await screen.findByRole("dialog", { name: backer.name }, T(8_000));
    await userEvent.click(await within(profile).findByRole("button", { name: "Follow" }, T(8_000)));
    await later(delay + 1);
    // The profile in the drawer's place (DRAWER-NAV-IN-PLACE): the friends' page kept under it.
    expect(await within(shownView("public-profile")!).findByText("Friends", undefined, T(8_000))).toBeInTheDocument();
    await userEvent.click(within(profile).getByRole("button", { name: "Block" }));
    await confirm(`Block ${backer.name}?`, "Block");
    expect(await within(profile).findByRole("button", { name: "Unblock" }, T(8_000))).toBeInTheDocument();
    expect(within(profile).queryByRole("button", { name: "Follow" })).toBeNull();
    await userEvent.click(within(profile).getByRole("button", { name: "Back" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: backer.name })).toBeNull(), T(5_000));
    await count("Friends", 0);
    await count("Following", 0);
    await count("Followers", 0);
    await userEvent.click(screen.getByRole("button", { name: /^Blocked players/ }));
    const sheet = await screen.findByRole("dialog", { name: "Blocked players" }, T(5_000));
    expect(sheet).toHaveTextContent(backer.name);
    await userEvent.click(within(sheet).getByRole("button", { name: `Unblock ${backer.name}` }));
    await waitFor(() => expect(sheet).toHaveTextContent("You block no one"), T(8_000));
    // The follows the block ended do not come back.
    // In the friends drawer's place (DRAWER-NAV-IN-PLACE): its Back to the lists (the red cross would leave the drawer).
    expect(sheet).toContainElement(shownView("blocked-players"));
    await userEvent.click(within(sheet).getByRole("button", { name: "Back" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Blocked players" })).toBeNull(), T(5_000));
    await count("Following", 0);
    await count("Followers", 0);
  });

  it("is the HUD's drawer over the home (FRIENDS-PAGE): a row opens the player's profile over it, its close back to the list", async () => {
    const { router } = open("/friends", { home: true });
    const drawer = await screen.findByRole("dialog", { name: "Friends" }, T(10_000));
    expect(drawer).toHaveAttribute("data-hud-drawer", "friends");
    const suggested = within(drawer).getByRole("region", { name: "Suggested players" });
    const row = (await within(suggested).findAllByRole("button", { name: /, level \d+, / }, T(8_000)))[0]!;
    const name = row.getAttribute("aria-label")!.split(",")[0]!;
    await userEvent.click(row);
    // The home's host draws it (the drawer's page mounts none of its own), in the drawer's place (DRAWER-NAV-IN-PLACE): one drawer,
    // named after the player, its header "Profile", the friends' page hidden under it.
    const profile = await screen.findByRole("dialog", { name }, T(8_000));
    expect(profile).toBe(drawer);
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(within(profile).getByRole("heading", { name })).toHaveTextContent("Profile");
    expect(drawer).toContainElement(shownView("public-profile"));
    expect(within(drawer).queryByRole("region", { name: "Suggested players" })).toBeNull();
    await userEvent.click(within(profile).getByRole("button", { name: "Back" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name })).toBeNull(), T(5_000));
    expect(shownView()).toBeNull();
    expect(router.state.location.pathname).toBe("/friends");
    expect(screen.getByRole("dialog", { name: "Friends" })).toBe(drawer);
    expect(within(drawer).getByRole("region", { name: "Suggested players" })).toContainElement(row);
  });

  it("opens a profile the URL names on arrival over the drawer, not under it (FRIENDS-PAGE: the old `/social?player=` links)", async () => {
    const player = SEEDED_PLAYERS[3]!;
    const { router } = open(`/friends?player=${player.address}`, { home: true });
    // Once the drawer is there: the profile in its place (DRAWER-NAV-IN-PLACE), the friends' page hidden under it.
    await waitFor(() => {
      expect(document.querySelector('[data-hud-drawer="friends"]')).toContainElement(shownView("public-profile"));
      expect(screen.getByRole("dialog", { name: player.name })).toBeInTheDocument();
      expect(screen.queryByRole("dialog", { name: "Friends" })).toBeNull();
    }, T(10_000));
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    const profile = screen.getByRole("dialog", { name: player.name });
    expect(new URLSearchParams(router.state.location.search).get("player")).toBe(player.address);
    await userEvent.click(within(profile).getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("dialog", { name: "Friends" }, T(5_000))).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/friends");
  });

  it("counts a new follower on the home's Friends button (#973)", async () => {
    const { later, me, backer, delay, follows } = open("/", { home: true });
    await follows.follow(me, backer.address);
    // Its two places (the phone's column on the right, the left column from `desktop`) show the same count.
    expect((await screen.findAllByRole("button", { name: "Friends" }, T(10_000))).length).toBeGreaterThan(0);
    await later(delay + 1);
    expect((await screen.findAllByRole("button", { name: "Friends, 1 waiting" }, T(8_000))).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole("button", { name: "Friends" })).toHaveLength(0);
    // The follow's count is the Friends button's alone.
    expect(screen.queryAllByRole("button", { name: /^(Chat|Guild), / })).toHaveLength(0);
  });

  it("shows the player's own counts of followers and following on their own profile", async () => {
    const { router, me, other } = open();
    await lists();
    await userEvent.type(screen.getByRole("searchbox", { name: "Name or player ID" }), other.name);
    const found = await screen.findByRole("list", { name: "Players found" }, T(8_000));
    await userEvent.click(await within(found).findByRole("button", { name: `Follow ${other.name}` }, T(8_000)));
    await count("Following", 1);
    await act(() => router.navigate(`/friends?player=${me}`));
    await screen.findByRole("dialog", undefined, T(8_000));
    // Their own sheet (Edit avatar), not the public one, in the drawer's place (DRAWER-NAV-IN-PLACE).
    const sheet = await waitFor(() => shownView("profile")!, T(8_000));
    expect(await within(sheet).findByRole("button", { name: "Edit avatar" }, T(8_000))).toBeInTheDocument();
    await waitFor(() => expect(within(sheet).getByText("Following").nextSibling).toHaveTextContent("1"), T(8_000));
    expect(within(sheet).getByText("Followers").nextSibling).toHaveTextContent("0");
  });
});
