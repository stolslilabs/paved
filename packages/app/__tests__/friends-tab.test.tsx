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
import { createTestRouter } from "../src/routes/router";
import { resetSocialTabForTests, storeSocialTab } from "../src/routes/social-tab";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { mockImplementation } from "./mock-fakes";
import { preloadPages } from "./route-helpers";
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
              </main>
            ),
          }
        : c,
    ),
  })) as RouteObject[];

const T = (ms: number) => ({ timeout: slow(ms) });

describe("/social's Friends tab on the mock (#954)", { timeout: slow(40_000) }, () => {
  preloadPages("social");
  beforeEach(() => {
    queryClient.clear();
    resetWelcomedForTests();
    markWelcomed();
    resetSocialTabForTests();
    storeSocialTab("friends");
  });
  afterEach(() => {
    queryClient.clear();
    resetWelcomedForTests();
    resetSocialTabForTests();
    localStorage.clear();
  });

  /** The page on the mock; `home`: the home drawn as the app draws it, not plain. */
  function open(path = "/social", { home = false }: { home?: boolean } = {}) {
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

  const lists = () => screen.findByRole("radiogroup", { name: "Lists" }, T(10_000));
  const list = (name: "Friends" | "Following" | "Followers") => screen.getByRole("region", { name });
  const count = (name: string, n: number) => waitFor(() => expect(screen.getByRole("radio", { name: new RegExp(`^${name}, ${n}`) })).toBeInTheDocument(), T(8_000));

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
    await userEvent.click(screen.getByRole("radio", { name: /^Following/ }));
    expect(list("Following")).toHaveTextContent(name);
    await userEvent.click(within(list("Following")).getByRole("button", { name: `Unfollow ${name}` }));
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

  it("follows from a profile; the follow back makes a friend, marked new until seen, then removed as a follower", async () => {
    const { router, later, backer, delay } = open();
    await lists();
    await act(() => router.navigate(`/social?player=${backer.address}`));
    const profile = await screen.findByRole("dialog", { name: backer.name }, T(8_000));
    await userEvent.click(await within(profile).findByRole("button", { name: "Follow" }, T(8_000)));
    expect(await within(profile).findByRole("button", { name: `Following ${backer.name}: unfollow` }, T(8_000))).toBeInTheDocument();
    // The follow back, once due: a friend, and a new follower on the badges.
    await later(delay + 1);
    expect(await within(profile).findByText("Friend", undefined, T(8_000))).toBeInTheDocument();
    await userEvent.click(within(profile).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), T(5_000));
    await count("Friends", 1);
    expect(list("Friends")).toHaveTextContent(backer.name);
    expect(screen.getByRole("tab", { name: "Friends, 1 waiting" })).toBeInTheDocument();
    // Seen: the badges go, the New mark stays while the list is shown.
    await userEvent.click(screen.getByRole("radio", { name: /^Followers, 1, 1 new/ }));
    expect(within(list("Followers")).getByText("New")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("tab", { name: "Friends" })).toBeInTheDocument(), T(8_000));
    expect(within(list("Followers")).getByText("New")).toBeInTheDocument();
    // Removed: they no longer follow; the player still follows them.
    await userEvent.click(within(list("Followers")).getByRole("button", { name: `Remove ${backer.name}` }));
    await confirm(`Remove ${backer.name}?`, "Remove");
    await count("Followers", 0);
    await count("Friends", 0);
    await count("Following", 1);
  });

  it("blocks from a profile, which ends the follows, and unblocks from the blocked players", async () => {
    const { router, later, backer, delay } = open();
    await lists();
    await act(() => router.navigate(`/social?player=${backer.address}`));
    const profile = await screen.findByRole("dialog", { name: backer.name }, T(8_000));
    await userEvent.click(await within(profile).findByRole("button", { name: "Follow" }, T(8_000)));
    await later(delay + 1);
    expect(await within(profile).findByText("Friend", undefined, T(8_000))).toBeInTheDocument();
    await userEvent.click(within(profile).getByRole("button", { name: "Block" }));
    await confirm(`Block ${backer.name}?`, "Block");
    expect(await within(profile).findByRole("button", { name: "Unblock" }, T(8_000))).toBeInTheDocument();
    expect(within(profile).queryByRole("button", { name: "Follow" })).toBeNull();
    await userEvent.click(within(profile).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), T(5_000));
    await count("Friends", 0);
    await count("Following", 0);
    await count("Followers", 0);
    await userEvent.click(screen.getByRole("button", { name: /^Blocked players/ }));
    const sheet = await screen.findByRole("dialog", { name: "Blocked players" }, T(5_000));
    expect(sheet).toHaveTextContent(backer.name);
    await userEvent.click(within(sheet).getByRole("button", { name: `Unblock ${backer.name}` }));
    await waitFor(() => expect(sheet).toHaveTextContent("You block no one"), T(8_000));
    // The follows the block ended do not come back.
    await userEvent.click(within(sheet).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), T(5_000));
    await count("Following", 0);
    await count("Followers", 0);
  });

  it("counts a new follower on the home's Social button", async () => {
    const { later, me, backer, delay, follows } = open("/", { home: true });
    await follows.follow(me, backer.address);
    // Its two places (the right column, and the phone's row under `desktop`) show the same count.
    expect((await screen.findAllByRole("button", { name: "Social" }, T(10_000))).length).toBeGreaterThan(0);
    await later(delay + 1);
    expect((await screen.findAllByRole("button", { name: "Social, 1 waiting" }, T(8_000))).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole("button", { name: "Social" })).toHaveLength(0);
  });

  it("shows the player's own counts of followers and following on their own profile", async () => {
    const { router, me, other } = open();
    await lists();
    await userEvent.type(screen.getByRole("searchbox", { name: "Name or player ID" }), other.name);
    const found = await screen.findByRole("list", { name: "Players found" }, T(8_000));
    await userEvent.click(await within(found).findByRole("button", { name: `Follow ${other.name}` }, T(8_000)));
    await count("Following", 1);
    await act(() => router.navigate(`/social?player=${me}`));
    const sheet = await screen.findByRole("dialog", undefined, T(8_000));
    // Their own sheet (Disconnect, Edit avatar), not the public one.
    expect(await within(sheet).findByRole("button", { name: "Disconnect" }, T(8_000))).toBeInTheDocument();
    await waitFor(() => expect(within(sheet).getByText("Following").nextSibling).toHaveTextContent("1"), T(8_000));
    expect(within(sheet).getByText("Followers").nextSibling).toHaveTextContent("0");
  });
});
