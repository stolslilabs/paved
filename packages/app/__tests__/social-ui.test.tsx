import { slow } from "../test-slow";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import type { ReactNode } from "react";
import { Outlet, type RouteObject } from "react-router";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import type { GameSigner } from "../src/data";
import { MatchCard } from "../src/components/containers/match-list";
import { PlayerSearch } from "../src/components/containers/player-search";
import { PublicProfileSheet } from "../src/components/containers/public-profile-sheet";
import { Presence } from "../src/components/elements/presence";
import { SEEDED_PLAYERS } from "../src/data/mock/players";
import { mockRivalsV2 } from "../src/data/mock/v2";
import { queryClient } from "../src/lib/query-client";
import { PlayerProfileHost } from "../src/routes/player-profile";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { MATCH_CARDS } from "../src/mocks/pvp";
import { MOCK_NOW } from "../src/mocks/clock";
import { PUBLIC_PROFILE, PUBLIC_PROFILES, SEARCH } from "../src/mocks/social";
import { mockImplementation } from "./mock-fakes";
import { fakeWallet } from "./wallet-fakes";

// The social base's views (#952): online or last seen, the public profile's states, the player search, the battle logs' cards
// opening the rival's profile, and `/player/:id` opening the sheet over the home on the mock.

const wrap = (ui: ReactNode) => (
  <LazyMotion features={domMax}>
    <MotionConfig reducedMotion="always">{ui}</MotionConfig>
  </LazyMotion>
);

describe("Presence (#952)", () => {
  it("says Online within 5 minutes, else when the player was last seen, in words beside the dot", () => {
    const { rerender } = render(<Presence lastSeen={MOCK_NOW - 299} now={MOCK_NOW} />);
    expect(screen.getByText("Online").closest("[data-slot=presence]")).toHaveAttribute("data-online", "true");
    rerender(<Presence lastSeen={MOCK_NOW - 3 * 3_600} now={MOCK_NOW} />);
    expect(screen.getByText(/Last seen/)).toHaveTextContent("Last seen 3h ago");
    expect(document.querySelector("[data-slot=presence]")).toHaveAttribute("data-online", "false");
  });
});

describe("PublicProfileSheet (#952)", () => {
  const sheet = (props: Partial<Parameters<typeof PublicProfileSheet>[0]>) =>
    render(wrap(<PublicProfileSheet state={{ status: "ready", profile: PUBLIC_PROFILE.online }} now={MOCK_NOW} open onOpenChange={() => {}} {...props} />));

  it("shows the avatar, the name, online, the league, the level, the crowns and the village score, and copies the player ID", async () => {
    const onCopy = vi.fn(async () => {});
    sheet({ onCopy });
    const dialog = screen.getByRole("dialog", { name: PUBLIC_PROFILE.online.name! });
    expect(within(dialog).getByText("Online")).toBeInTheDocument();
    expect(within(dialog).getByText("Iron III")).toBeInTheDocument();
    const figures = within(dialog).getAllByRole("definition").map((d) => d.textContent);
    expect(figures).toEqual(["7", "838"]);
    expect(within(dialog).getByRole("img", { name: "420 crowns" })).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Copy player ID" }));
    expect(onCopy).toHaveBeenCalledWith(PUBLIC_PROFILE.online.address);
    expect(await within(dialog).findByRole("button", { name: "Player ID copied" })).toBeInTheDocument();
  });

  it("shows when an offline player was last seen", () => {
    sheet({ state: { status: "ready", profile: PUBLIC_PROFILE.offline } });
    expect(screen.getByRole("dialog")).toHaveTextContent("Last seen 2d ago");
  });

  it("holds the actions the social features give, and the guild line, above Copy player ID", () => {
    sheet({ actions: <button type="button">Follow</button>, guild: <span>The Masons</span> });
    const actions = document.querySelector("[data-slot=profile-actions]")!;
    expect(within(actions as HTMLElement).getAllByRole("button").map((b) => b.textContent)).toEqual(["Follow", "Copy ID"]);
    expect(document.querySelector("[data-slot=profile-guild]")).toHaveTextContent("The Masons");
  });

  it("says when the player is still read, not found, unreadable or not on this network", async () => {
    const onRetry = vi.fn();
    const { rerender } = sheet({ state: PUBLIC_PROFILES.loading });
    expect(screen.getByRole("dialog", { name: "Player" })).toHaveTextContent("Looking for this player");
    rerender(wrap(<PublicProfileSheet state={PUBLIC_PROFILES.missing} now={MOCK_NOW} open onOpenChange={() => {}} />));
    expect(screen.getByRole("dialog", { name: "Player not found" })).toHaveTextContent("No player has this ID.");
    rerender(wrap(<PublicProfileSheet state={PUBLIC_PROFILES.error} now={MOCK_NOW} open onOpenChange={() => {}} onRetry={onRetry} />));
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalled();
    rerender(wrap(<PublicProfileSheet state={PUBLIC_PROFILES.unavailable} now={MOCK_NOW} open onOpenChange={() => {}} />));
    expect(screen.getByRole("dialog")).toHaveTextContent("not on this network yet");
    expect(screen.queryByRole("button", { name: "Copy player ID" })).toBeNull();
  });
});

describe("PlayerSearch (#952)", () => {
  it("asks for a name or an ID before any is typed", () => {
    render(wrap(<PlayerSearch {...SEARCH.idle} />));
    expect(screen.getByRole("searchbox", { name: "Name or player ID" })).toHaveValue("");
    expect(screen.getByText(/Search a name, or paste a player ID/)).toBeInTheDocument();
  });

  it("lists the players found with their level and league, each opening their profile", async () => {
    const onOpen = vi.fn();
    render(wrap(<PlayerSearch {...SEARCH.results} onOpen={onOpen} />));
    const found = within(screen.getByRole("list", { name: "Players found" })).getAllByRole("button");
    expect(found).toHaveLength(SEARCH.results.results!.length);
    const first = SEARCH.results.results![0]!;
    expect(found[0]).toHaveAccessibleName(expect.stringMatching(new RegExp(`^${first.name}, level ${first.level}, .+ league$`)));
    await userEvent.click(found[0]!);
    expect(onOpen).toHaveBeenCalledWith(first.address);
  });

  it("types, clears, and says when no player is found, while reading, or when the read failed", async () => {
    const onQueryChange = vi.fn();
    const { rerender } = render(wrap(<PlayerSearch {...SEARCH.none} onQueryChange={onQueryChange} />));
    expect(screen.getByText("No player found.")).toBeInTheDocument();
    await userEvent.type(screen.getByRole("searchbox"), "x");
    expect(onQueryChange).toHaveBeenLastCalledWith(`${SEARCH.none.query}x`);
    await userEvent.click(screen.getByRole("button", { name: "Clear the search" }));
    expect(onQueryChange).toHaveBeenLastCalledWith("");
    rerender(wrap(<PlayerSearch {...SEARCH.loading} />));
    expect(document.querySelector("[aria-busy]")).not.toBeNull();
    rerender(wrap(<PlayerSearch {...SEARCH.error} />));
    expect(screen.getByText(SEARCH.error.error!)).toBeInTheDocument();
    rerender(wrap(<PlayerSearch {...SEARCH.unavailable} />));
    expect(screen.getByRole("searchbox")).toBeDisabled();
  });
});

describe("the battle logs' card (#952): the rival's avatar and name open their profile", () => {
  it("keeps one control for the match and gives the rival's profile its own", async () => {
    const onOpen = vi.fn();
    const onOpenPlayer = vi.fn();
    const match = MATCH_CARDS.attackWon;
    render(wrap(<MatchCard match={match} now={MOCK_NOW} onOpen={onOpen} onOpenPlayer={onOpenPlayer} />));
    const card = screen.getByRole("button", { name: /^Your attack on / });
    expect(card.querySelector("button")).toBeNull();
    await userEvent.click(card);
    expect(onOpen).toHaveBeenCalledWith(match.id);
    await userEvent.click(screen.getByRole("button", { name: `${match.rival.name}'s profile` }));
    expect(onOpenPlayer).toHaveBeenCalledWith(match.rival.address);
    // The name, for the pointer: the same profile, no second control for the keyboard.
    await userEvent.click(document.querySelector<HTMLElement>("[data-slot=match-card] [aria-hidden=true][tabindex='-1']")!);
    expect(onOpenPlayer).toHaveBeenCalledTimes(2);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("stays one button without the profile", () => {
    render(wrap(<MatchCard match={MATCH_CARDS.attackWon} now={MOCK_NOW} onOpen={() => {}} />));
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });
});

/** The routes with a plain home: the shell stays, and the home is its public profile's host alone (no village canvas). */
const plainHome = (routes: RouteObject[]): RouteObject[] =>
  routes.map((r) => ({
    ...r,
    children: r.children?.map((c) =>
      c.id === "home"
        ? {
            ...c,
            element: (
              <main>
                <h1>Home</h1>
                <Outlet />
              </main>
            ),
            // The home page's host of the public profile (#952), without the village.
            children: c.children?.map((h) => (h.index ? { index: true, element: <PlayerProfileHost /> } : h)),
          }
        : c,
    ),
  })) as RouteObject[];

describe("/player/:id on the mock (#952)", { timeout: slow(20_000) }, () => {
  beforeAll(async () => {
    await import("../src/routes/player-profile-sheet");
  }, slow(60_000));
  beforeEach(() => {
    queryClient.clear();
    resetWelcomedForTests();
    markWelcomed();
  });
  afterEach(() => {
    queryClient.clear();
    resetWelcomedForTests();
  });

  function open(path: string, routes = plainHome) {
    const s = mockImplementation();
    const me = s.sources.signer!.address;
    const wallet = fakeWallet({ address: me, restored: true });
    wallet.connector.signer = () => s.sources.signer as GameSigner;
    const router = createTestRouter(path, routes);
    render(<App router={router} sources={s.sources} connector={wallet.load} />);
    return { router, me };
  }

  it("opens the home with a seeded player's public profile, and Close drops it from the URL", async () => {
    const seeded = SEEDED_PLAYERS[2]!;
    const { router } = open(`/player/${seeded.address}`);
    const dialog = await screen.findByRole("dialog", { name: seeded.name }, { timeout: slow(8000) });
    expect(screen.getByRole("heading", { level: 1, name: "Home", hidden: true })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/");
    expect(new URLSearchParams(router.state.location.search).get("player")).toBe(seeded.address);
    expect(within(dialog).getByText(/Online|Last seen/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(router.state.location.search).toBe(""));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("opens a rival's profile too, and says when no player has the ID", async () => {
    const rival = mockRivalsV2()[0]!;
    const { router } = open(`/player/${rival.address}`);
    expect(await screen.findByRole("dialog", { name: rival.name }, { timeout: slow(8000) })).toBeInTheDocument();
    await act(() => router.navigate("/?player=0xdead"));
    expect(await screen.findByRole("dialog", { name: "Player not found" }, { timeout: slow(8000) })).toBeInTheDocument();
  });

  it("opens the connected player's own profile sheet for their own ID", async () => {
    const s = mockImplementation();
    const me = s.sources.signer!.address;
    open(`/player/${me}`);
    const dialog = (await screen.findByText("Your profile", {}, { timeout: slow(8000) })).closest<HTMLElement>("[role=dialog]")!;
    expect(within(dialog).queryByRole("button", { name: "Copy player ID" })).toBeNull();
  });

  it("an opening from the app is undone by Back", async () => {
    const seeded = SEEDED_PLAYERS[0]!;
    const { router } = open("/");
    await screen.findByRole("heading", { level: 1, name: "Home" });
    await act(() => router.navigate(`/?player=${seeded.address}`, { state: { playerSheet: true } }));
    const dialog = await screen.findByRole("dialog", { name: seeded.name }, { timeout: slow(8000) });
    await userEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(router.state.historyAction).toBe("POP"));
    expect(router.state.location.search).toBe("");
  });
});
