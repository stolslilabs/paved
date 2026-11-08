import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, domMax } from "motion/react";
import { Outlet, type RouteObject } from "react-router";
import { App } from "../src/App";
import type { GameSigner } from "../src/data";
import { queryClient } from "../src/lib/query-client";
import { PlayerProfileHost } from "../src/routes/player-profile";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { drawerBack, preloadPages, shownView } from "./route-helpers";
import { fakeWallet } from "./wallet-fakes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PLAYER_RANKING_LIMIT, formatInteger, guildScore, rankPlayers } from "@paved/game-core";
import { LeaderboardScene, outOfViewSide, type LeaderboardSceneProps } from "../src/components/scenes/leaderboard-scene";
import { useGuildRanking } from "../src/data/guilds";
import { addressKey } from "../src/data/keys";
import { community } from "../src/data/mock/community";
import { MOCK_KEY } from "../src/data/mock/ledger";
import { rankingKeys, useFriendsRanking, usePlayerRanking } from "../src/data/player-ranking";
import { guildSource, type FollowLists, type FollowSource, type PublicProfile, type SocialSource } from "../src/data/social-source";
import { LEADERBOARD } from "../src/mocks/ranking";
import { slow } from "../test-slow";
import { dataOf, fakeSources, renderData } from "./data-fakes";
import { mockImplementation } from "./mock-fakes";

// The Leaderboard (LEADERBOARD-PAGE): the players' ranking on the mock (by crowns, the viewer's place), a guild's score the sum of
// its members' crowns as the players' ranking reads them, the viewer among their friends, the hooks, and the scene's states.

/** The mock's sources with the signer's village founded (stored on the device) and, given, its crowns this season. */
async function mockWith(crowns?: number) {
  const s = mockImplementation();
  const me = s.sources.signer!.address;
  await s.ledger.writesFor(me).foundFreeVillage();
  if (crowns !== undefined) {
    const season = (await s.ledger.pvpLeague(me)).season;
    const state = JSON.parse(s.store.getItem(MOCK_KEY)!);
    state.players[addressKey(me)].pvp = { crowns, draws: 0, match: null, attacks: [], shieldUntil: 0, season, seasonAttacks: 1, peak: 0 };
    s.store.setItem(MOCK_KEY, JSON.stringify(state));
  }
  return { ...s, me };
}

describe("the players' ranking on the mock (LEADERBOARD-PAGE)", () => {
  it("ranks the community and the device's players by crowns, and gives the viewer's place", async () => {
    const { sources, me } = await mockWith(1_300);
    const ranking = await sources.social!.playerRanking!(me);
    expect(ranking.players.length).toBe(community().length + 1);
    expect(ranking.players.length).toBeLessThanOrEqual(PLAYER_RANKING_LIMIT);
    const crowns = ranking.players.map((p) => p.crowns);
    expect(crowns).toEqual([...crowns].sort((a, b) => b - a));
    const place = ranking.players.findIndex((p) => addressKey(p.address) === addressKey(me)) + 1;
    expect(ranking.me).toMatchObject({ place, profile: { crowns: 1_300 } });
    expect(ranking.players[place - 1]!.crowns).toBe(1_300);
    // Read by a player of no ID it knows, and by no viewer: no place.
    expect((await sources.social!.playerRanking!("0xdead")).me).toBeNull();
    expect((await sources.social!.playerRanking!(null)).me).toBeNull();
  });

  it("counts a guild's score as the sum of its members' crowns, the same crowns the players' ranking reads", async () => {
    const { sources, me } = await mockWith(250);
    const guilds = guildSource(sources.social)!;
    // The viewer founds a guild: their crowns are in its score.
    await guilds.createGuild(me, { name: "Stone Road", emblem: { icon: 1, primary: 2, secondary: 3 }, description: "", joinType: "open", requirements: { level: 0, crowns: 0 } });
    const players = new Map((await sources.social!.playerRanking!(me)).players.map((p) => [addressKey(p.address), p.crowns]));
    const ranking = await guilds.guildRanking();
    expect(ranking.find((g) => g.name === "Stone Road")!.score).toBe(250);
    for (const summary of ranking) {
      const page = (await guilds.guild(summary.id, null))!;
      const sum = page.roster.reduce((total, m) => total + players.get(addressKey(m.profile.address))!, 0);
      expect(summary.score, summary.name).toBe(sum);
      expect(summary.score, summary.name).toBe(guildScore(page.roster.map((m) => m.profile)));
    }
    // The viewer's guild's place in the whole ranking, the ranking's order; no guild of that ID, none.
    const mine = ranking.findIndex((g) => g.name === "Stone Road");
    expect(await guilds.guildPlace(ranking[mine]!.id)).toEqual({ place: mine + 1, guild: ranking[mine] });
    expect(await guilds.guildPlace(999_999)).toBeNull();
  });
});

describe("usePlayerRanking (LEADERBOARD-PAGE)", () => {
  it("reads the ranking as the viewer reads it, under the social domain's key", async () => {
    const { sources, me } = await mockWith(600);
    const { result, client } = renderData(() => usePlayerRanking(me), sources);
    const ranking = await dataOf(result);
    expect(ranking.me!.profile.crowns).toBe(600);
    expect(rankingKeys.players(me)).toEqual(["social", "ranking", "players", addressKey(me)]);
    expect(client.getQueryData(rankingKeys.players(me))).toBe(ranking);
    // Both rankings read together, as the page does.
    const both = renderData(() => ({ players: usePlayerRanking(null), guilds: useGuildRanking() }), sources);
    await waitFor(() => expect(both.result.current.players.data && both.result.current.guilds.data).toBeTruthy());
    expect(both.result.current.players.data!.me).toBeNull();
  });

  it("answers unavailable without a ranking on the social source, and ends its wait on a failed read", async () => {
    const plain: SocialSource = { profile: async () => null, searchPlayers: async () => [] };
    const off = renderData(() => usePlayerRanking(null), fakeSources({ social: plain }).sources);
    expect(off.result.current).toMatchObject({ unavailable: true, isPending: false, data: undefined, error: null });
    const failing: SocialSource = { ...plain, playerRanking: () => Promise.reject(new Error("no answer")) };
    const { result } = renderData(() => usePlayerRanking(null), fakeSources({ social: failing }).sources);
    await waitFor(() => expect(result.current.error?.message).toBe("no answer"));
    expect(result.current.isPending).toBe(false);
  });
});

describe("useFriendsRanking (LEADERBOARD-PAGE)", () => {
  const person = (address: string, crowns: number): PublicProfile => ({ address, name: address, look: null, level: 3, crowns, league: 0, score: 0, lastSeen: 0 });
  const ME = person("0x0aa", 500);
  const FRIENDS = [person("0xb1", 900), person("0xb2", 100), person("0xb3", 700)];
  const lists = (friends: PublicProfile[]): FollowLists => ({ friends: friends.map((profile) => ({ profile, since: 0, isNew: false })), following: [], followers: [], newFollowers: 0, blocked: [], nextChangeAt: null });
  /** A social source with the viewer's ranking and their follow lists; the follows' other calls unused here. */
  const social = (friends: PublicProfile[], listsRead?: () => Promise<FollowLists>): SocialSource => ({
    profile: async () => null,
    searchPlayers: async () => [],
    playerRanking: async () => ({ players: [], me: { place: 51, profile: ME } }),
    follows: { lists: listsRead ?? (async () => lists(friends)) } as Partial<FollowSource> as FollowSource,
  });

  it("ranks the viewer among their friends by crowns, their place among them; no friend, an empty ranking", async () => {
    const { result } = renderData(() => useFriendsRanking(ME.address), fakeSources({ social: social(FRIENDS) }).sources);
    const ranking = await dataOf(result);
    expect(ranking.players.map((p) => p.address)).toEqual(rankPlayers([ME, ...FRIENDS]).map((p) => p.address));
    expect(ranking.me).toEqual({ place: 3, profile: ME });
    const none = renderData(() => useFriendsRanking(ME.address), fakeSources({ social: social([]) }).sources);
    expect(await dataOf(none.result)).toEqual({ players: [], me: null });
  });

  it("answers unavailable without the follows, and ends its wait on a failed read", async () => {
    const plain: SocialSource = { profile: async () => null, searchPlayers: async () => [] };
    const off = renderData(() => useFriendsRanking(ME.address), fakeSources({ social: plain }).sources);
    expect(off.result.current).toMatchObject({ unavailable: true, isPending: false, data: undefined, error: null });
    const failing = social(FRIENDS, () => Promise.reject(new Error("no answer")));
    const { result } = renderData(() => useFriendsRanking(ME.address), fakeSources({ social: failing }).sources);
    await waitFor(() => expect(result.current.error?.message).toBe("no answer"));
    expect(result.current.isPending).toBe(false);
  });
});

/** The scene with every callback a spy. */
function scene(props: Partial<LeaderboardSceneProps> & Pick<LeaderboardSceneProps, "tab" | "players" | "guilds" | "friends">) {
  const spies = { onTabChange: vi.fn(), onOpenPlayer: vi.fn(), onOpenGuild: vi.fn(), onBack: vi.fn() };
  const view = render(
    <LazyMotion features={domMax}>
      <LeaderboardScene {...spies} {...props} />
    </LazyMotion>,
  );
  return { ...view, ...spies, drawer: screen.getByRole("dialog", { name: "Ranking" }) };
}

describe("the Leaderboard's scene (LEADERBOARD-PAGE)", () => {
  it("lists the players by crowns, the first three under their medals, the viewer's row in gold with You; a row opens the player", async () => {
    const { drawer, onOpenPlayer } = scene(LEADERBOARD.playersInView);
    const list = within(drawer).getByRole("list", { name: "Players by crowns" });
    const rows = within(list).getAllByRole("button");
    const ranking = LEADERBOARD.playersInView.players.data!;
    expect(rows).toHaveLength(ranking.players.length);
    // The title is the fixed word (TILE-COUNTS): the rows say how many.
    expect(within(drawer).getByRole("heading", { name: "Players" })).toBeInTheDocument();
    const first = ranking.players[0]!;
    expect(rows[0]).toHaveAccessibleName(`1. ${first.name}, level ${first.level}, ${formatInteger(first.crowns)} crowns`);
    expect(rows.slice(0, 4).map((r) => r.querySelector("[data-slot=ranking-place]")!.tagName)).toEqual(["IMG", "IMG", "SPAN", "SPAN"]);
    expect(rows[2]!.querySelector("[data-slot=ranking-place] img[data-icon=medal]")).not.toBeNull();
    expect(rows[3]!.querySelector("[data-slot=ranking-place]")).toHaveTextContent("4");
    // The viewer, fourth: their row on the gold wash with You; in view, nothing pinned.
    const own = rows[3]!;
    expect(own).toHaveAttribute("data-own", "true");
    expect(own).toHaveClass("bg-primary/15");
    // Its wash takes its place's shape in the list (the owner's rule of 2026-11-07): square between two rows, the list's
    // corners on its first and last rows only.
    const rounding = (row: HTMLElement) => [...row.classList].filter((c) => c.startsWith("rounded"));
    expect(rounding(own)).toEqual(["rounded-none"]);
    expect(rounding(rows[0]!)).toEqual(["rounded-none", "rounded-t-xl"]);
    expect(rounding(rows.at(-1)!)).toEqual(["rounded-none", "rounded-b-xl"]);
    expect(within(own).getByText("You")).toBeInTheDocument();
    expect(rows.filter((r) => r.hasAttribute("data-own"))).toHaveLength(1);
    expect(drawer.querySelector("[data-slot=ranking-pinned]")).toBeNull();
    await userEvent.click(rows[1]!);
    expect(onOpenPlayer).toHaveBeenCalledWith(ranking.players[1]!.address);
  });

  it("puts its tabs at the drawer's foot: Players, Guilds, Friends at the end; a press asks for its tab alone", async () => {
    const { drawer, onTabChange } = scene(LEADERBOARD.playersInView);
    const tabs = within(drawer).getByRole("tablist", { name: "Ranking" });
    expect(drawer.querySelector("[data-slot=hud-drawer-footer]")).toContainElement(tabs);
    expect(tabs).toHaveAttribute("data-slot", "footer-tabs");
    expect(within(tabs).getAllByRole("tab").map((t) => t.getAttribute("aria-label") ?? t.textContent)).toEqual(["Players", "Allegiances", "Friends"]);
    // Guilds under the dock's Guild (its two banners), the HUD's player on Players, the handshake on Friends.
    const guilds = within(tabs).getByRole("tab", { name: "Allegiances" });
    expect(guilds.querySelector("img[data-icon=guild]")).not.toBeNull();
    expect(guilds.querySelector('img[src*="/ui-art/ranking/"]')).toBeNull();
    expect(within(tabs).getByRole("tab", { name: "Friends" }).querySelector("img[data-icon=friends]")).not.toBeNull();
    await userEvent.click(within(tabs).getByRole("tab", { name: "Allegiances" }));
    // Radix calls twice on a press (the page's change is idempotent: the URL's tab replaced by itself).
    expect(new Set(onTabChange.mock.calls.flat())).toEqual(new Set(["guilds"]));
    onTabChange.mockClear();
    await userEvent.click(within(tabs).getByRole("tab", { name: "Friends" }));
    expect(new Set(onTabChange.mock.calls.flat())).toEqual(new Set(["friends"]));
  });

  it("lists the viewer among their friends by crowns, their row in gold; no friend, the words for it", async () => {
    const { drawer, onOpenPlayer, unmount } = scene(LEADERBOARD.friends);
    const ranking = LEADERBOARD.friends.friends.data!;
    const rows = within(within(drawer).getByRole("list", { name: "Friends by crowns" })).getAllByRole("button");
    expect(rows).toHaveLength(ranking.players.length);
    expect(within(drawer).getByRole("heading", { name: "Friends" })).toBeInTheDocument();
    const own = rows.find((r) => r.hasAttribute("data-own"))!;
    expect(rows.indexOf(own) + 1).toBe(ranking.me!.place);
    expect(own).toHaveAccessibleName(new RegExp(`^${ranking.me!.place}\\. .+ \\(you\\), `));
    await userEvent.click(rows.find((r) => r !== own)!);
    expect(onOpenPlayer).toHaveBeenCalledOnce();
    unmount();
    const none = scene(LEADERBOARD.noFriends);
    expect(within(none.drawer).getByText(/^No friend to rank yet/)).toBeInTheDocument();
    expect(within(none.drawer).queryByRole("list")).toBeNull();
  });

  it("lists the guilds by score, the viewer's in gold with Yours; a row opens the guild", async () => {
    const { drawer, onOpenGuild } = scene(LEADERBOARD.guilds);
    const rows = within(within(drawer).getByRole("list", { name: "Allegiances by score" })).getAllByRole("button");
    const guilds = LEADERBOARD.guilds.guilds.data!;
    expect(rows).toHaveLength(guilds.length);
    const scores = guilds.map((g) => g.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    const own = rows.find((r) => r.hasAttribute("data-own"))!;
    expect(own).toHaveAccessibleName(new RegExp(`^${guilds.findIndex((g) => g.id === LEADERBOARD.guilds.myGuild) + 1}\\. The Quarrymen \\(your allegiance\\), `));
    expect(within(own).getByText("Yours")).toBeInTheDocument();
    await userEvent.click(rows[0]!);
    expect(onOpenGuild).toHaveBeenCalledWith(guilds[0]!.id);
  });

  it("pins the viewer past the list's end at the foot, with their place; a tap opens their profile", async () => {
    const { drawer, onOpenPlayer } = scene(LEADERBOARD.playersPastList);
    const me = LEADERBOARD.playersPastList.players.data!.me!;
    const pinned = drawer.querySelector<HTMLElement>("[data-slot=ranking-pinned]")!;
    expect(drawer.querySelector("[data-slot=hud-drawer-footer]")).toContainElement(pinned);
    const row = within(pinned).getByRole("button");
    expect(row).toHaveAccessibleName(`${me.place}. Ada (you), level 2, 0 crowns`);
    await userEvent.click(row);
    expect(onOpenPlayer).toHaveBeenCalledWith(me.profile.address);
  });

  it("pins the viewer's guild past the list's end at the foot, with its place in the whole ranking; a tap opens its page", async () => {
    const { drawer, onOpenGuild } = scene(LEADERBOARD.guildsPastList);
    const { guild, place } = LEADERBOARD.guildsPastList.myGuildPlace;
    const rows = within(within(drawer).getByRole("list", { name: "Allegiances by score" })).getAllByRole("button");
    expect(rows.some((r) => r.hasAttribute("data-own"))).toBe(false);
    const pinned = drawer.querySelector<HTMLElement>("[data-slot=ranking-pinned]")!;
    expect(drawer.querySelector("[data-slot=hud-drawer-footer]")).toContainElement(pinned);
    const row = within(pinned).getByRole("button");
    expect(place).toBeGreaterThan(rows.length);
    expect(row).toHaveAccessibleName(new RegExp(`^${place}\\. ${guild.name} \\(your allegiance\\), `));
    expect(row).toHaveAttribute("data-own", "true");
    expect(within(row).getByText("Yours")).toBeInTheDocument();
    await userEvent.click(row);
    expect(onOpenGuild).toHaveBeenCalledWith(guild.id);
  });

  it("pins no guild in the list in view, nor on another tab", () => {
    const listed = scene({ ...LEADERBOARD.guilds, myGuildPlace: { place: 1, guild: LEADERBOARD.guilds.guilds.data![0]! } });
    expect(listed.drawer.querySelector("[data-slot=ranking-pinned]")).toBeNull();
    listed.unmount();
    const players = scene({ ...LEADERBOARD.guildsPastList, tab: "players" });
    expect(players.drawer.querySelector("[data-slot=ranking-pinned]")).toBeNull();
  });

  describe("with the viewer's row out of view", () => {
    let observed: { callback: IntersectionObserverCallback; target: Element | null }[] = [];
    beforeEach(() => {
      observed = [];
      vi.stubGlobal(
        "IntersectionObserver",
        class {
          entry: { callback: IntersectionObserverCallback; target: Element | null };
          constructor(callback: IntersectionObserverCallback) {
            this.entry = { callback, target: null };
            observed.push(this.entry);
          }
          observe(target: Element) {
            this.entry.target = target;
          }
          disconnect() {}
        },
      );
    });
    afterEach(() => vi.unstubAllGlobals());

    it("pins it over the tabs while it is out of view; a tap brings the row into view and focuses it", async () => {
      const { drawer } = scene(LEADERBOARD.playersOutOfView);
      const own = within(within(drawer).getByRole("list", { name: "Players by crowns" })).getAllByRole("button").find((r) => r.hasAttribute("data-own"))!;
      const watch = observed.find((o) => o.target === own)!;
      expect(drawer.querySelector("[data-slot=ranking-pinned]")).toBeNull();
      act(() => watch.callback([{ isIntersecting: false, intersectionRatio: 0 } as IntersectionObserverEntry], {} as IntersectionObserver));
      const pinned = drawer.querySelector<HTMLElement>("[data-slot=ranking-pinned]")!;
      expect(within(pinned).getByRole("button")).toHaveAccessibleName(/^30\. .+ \(you\), /);
      own.scrollIntoView = vi.fn();
      await userEvent.click(within(pinned).getByRole("button"));
      expect(own.scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: "center" }));
      expect(own).toHaveFocus();
      act(() => watch.callback([{ isIntersecting: true, intersectionRatio: 1 } as IntersectionObserverEntry], {} as IntersectionObserver));
      expect(drawer.querySelector("[data-slot=ranking-pinned]")).toBeNull();
    });
    // RANK-OWN-ROW-SIDE (#1061): the row is pinned on the side it left, at the body's top above the view, at the foot below it.
    const entry = (ratio: number, top: number) =>
      ({ isIntersecting: ratio > 0, intersectionRatio: ratio, boundingClientRect: { top } as DOMRectReadOnly, rootBounds: { top: 100 } as DOMRectReadOnly }) as IntersectionObserverEntry;
    const pinOf = (drawer: HTMLElement) => drawer.querySelector<HTMLElement>("[data-slot=ranking-pinned]");

    it("tells the side from the entry: shown at 95 % or more, above when the row's top is above the body's, below otherwise", () => {
      expect(outOfViewSide(entry(1, 120))).toBeNull();
      expect(outOfViewSide(entry(0.95, 96))).toBeNull();
      expect(outOfViewSide(entry(0.9, 96))).toBe("above");
      expect(outOfViewSide(entry(0, 20))).toBe("above");
      expect(outOfViewSide(entry(0.9, 700))).toBe("below");
      expect(outOfViewSide(entry(0, 900))).toBe("below");
      expect(outOfViewSide({ ...entry(0, 20), rootBounds: null })).toBe("below");
    });

    it("pins the viewer's row at the foot below the view, none in it, at the top above it; a tap on the top one brings the row into view", async () => {
      const { drawer } = scene(LEADERBOARD.playersOutOfView);
      const own = within(within(drawer).getByRole("list", { name: "Players by crowns" })).getAllByRole("button").find((r) => r.hasAttribute("data-own"))!;
      const watch = observed.find((o) => o.target === own)!;
      const send = (e: IntersectionObserverEntry) => act(() => watch.callback([e], {} as IntersectionObserver));
      const footer = drawer.querySelector("[data-slot=hud-drawer-footer]") ?? drawer.querySelector("[data-slot=ranking-footer]")!;
      const top = drawer.querySelector("[data-slot=ranking-top]")!;
      // Foot, none, top, none, foot: scrolled down past the row and back up.
      send(entry(0, 900));
      expect(pinOf(drawer)).toHaveAttribute("data-side", "foot");
      expect(footer).toContainElement(pinOf(drawer));
      send(entry(1, 400));
      expect(pinOf(drawer)).toBeNull();
      send(entry(0.5, 70));
      expect(pinOf(drawer)).toHaveAttribute("data-side", "top");
      expect(top).toContainElement(pinOf(drawer));
      expect(footer).not.toContainElement(pinOf(drawer));
      expect(within(pinOf(drawer)!).getByRole("button")).toHaveAccessibleName(/^30\. .+ \(you\), /);
      own.scrollIntoView = vi.fn();
      await userEvent.click(within(pinOf(drawer)!).getByRole("button"));
      expect(own.scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: "center" }));
      expect(own).toHaveFocus();
      send(entry(1, 400));
      expect(pinOf(drawer)).toBeNull();
      send(entry(0, 900));
      expect(pinOf(drawer)).toHaveAttribute("data-side", "foot");
    });

    it("pins the viewer's row among their friends on the side it left: foot, none, top, none, foot", async () => {
      const { drawer } = scene(LEADERBOARD.friends);
      const own = within(within(drawer).getByRole("list", { name: "Friends by crowns" })).getAllByRole("button").find((r) => r.hasAttribute("data-own"))!;
      const watch = observed.find((o) => o.target === own)!;
      const send = (e: IntersectionObserverEntry) => act(() => watch.callback([e], {} as IntersectionObserver));
      const footer = drawer.querySelector("[data-slot=hud-drawer-footer]") ?? drawer.querySelector("[data-slot=ranking-footer]")!;
      const top = drawer.querySelector("[data-slot=ranking-top]")!;
      const place = LEADERBOARD.friends.friends.data!.me!.place;
      send(entry(0, 900));
      expect(pinOf(drawer)).toHaveAttribute("data-side", "foot");
      expect(footer).toContainElement(pinOf(drawer));
      send(entry(1, 400));
      expect(pinOf(drawer)).toBeNull();
      send(entry(0.5, 70));
      expect(pinOf(drawer)).toHaveAttribute("data-side", "top");
      expect(top).toContainElement(pinOf(drawer));
      expect(within(pinOf(drawer)!).getByRole("button")).toHaveAccessibleName(new RegExp(`^${place}\\. .+ \\(you\\), `));
      own.scrollIntoView = vi.fn();
      await userEvent.click(within(pinOf(drawer)!).getByRole("button"));
      expect(own.scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: "center" }));
      send(entry(1, 400));
      expect(pinOf(drawer)).toBeNull();
      send(entry(0, 900));
      expect(pinOf(drawer)).toHaveAttribute("data-side", "foot");
    });

    it("pins the viewer's guild on the side it left too", () => {
      const { drawer } = scene(LEADERBOARD.guilds);
      const own = within(within(drawer).getByRole("list", { name: "Allegiances by score" })).getAllByRole("button").find((r) => r.hasAttribute("data-own"))!;
      const watch = observed.find((o) => o.target === own)!;
      act(() => watch.callback([entry(0, 20)], {} as IntersectionObserver));
      expect(pinOf(drawer)).toHaveAttribute("data-side", "top");
      act(() => watch.callback([entry(0, 900)], {} as IntersectionObserver));
      expect(pinOf(drawer)).toHaveAttribute("data-side", "foot");
    });

    it("keeps a place past the list's end at the foot, whatever the scroll", () => {
      const { drawer } = scene(LEADERBOARD.playersPastList);
      expect(pinOf(drawer)).toHaveAttribute("data-side", "foot");
      expect(drawer.querySelector("[data-slot=ranking-top]")).not.toContainElement(pinOf(drawer));
    });
  });

  // RANKING-TOP-PADDING (the owner, 2026-11-08): the first title 16 px under the body's top, at its padding, as the Profile's and the
  // Missions' content (measured at 375, 768 and 1440: the title stood at 0). jsdom lays nothing out: the strip's spacing classes hold it.
  it("stands the first title at the body's padding on every tab and state: the top pin's strip gives back under it what it takes above", () => {
    // A spacing class's figure in Tailwind's 4 px units, signed (`-mt-4` -4, `mb-1` 1); none, 0.
    const units = (el: Element, prop: string) => {
      const found = [...el.classList].find((c) => new RegExp(`^-?${prop}-\\d+$`).test(c));
      return found ? (found.startsWith("-") ? -1 : 1) * Number(found.slice(found.lastIndexOf("-") + 1)) : 0;
    };
    for (const state of [LEADERBOARD.playersInView, LEADERBOARD.guilds, LEADERBOARD.friends, LEADERBOARD.loading, LEADERBOARD.empty, LEADERBOARD.unavailable]) {
      const { drawer, unmount } = scene(state);
      const body = drawer.querySelector<HTMLElement>("[data-hud-drawer-body]")!;
      const strip = drawer.querySelector<HTMLElement>("[data-slot=ranking-top]")!;
      const tabs = strip.parentElement!;
      // The strip opens the body, of no height: the tabs the body's first child, the strip theirs.
      expect(body.firstElementChild).toBe(tabs);
      expect(tabs.firstElementChild).toBe(strip);
      expect(strip).toHaveClass("h-0");
      // Above, the body's top padding taken back: the strip at the body's very top, and stuck there as it scrolls.
      expect(units(body, "pt")).toBe(4);
      expect(units(strip, "mt")).toBe(-units(body, "pt"));
      expect(units(strip, "top")).toBe(-units(body, "pt"));
      // Under it, all of it given back with the tabs' gap: what comes next (the title, or the network's note) starts at the padding.
      expect(units(strip, "mt") + units(strip, "mb") + units(tabs, "gap")).toBe(0);
      unmount();
    }
  });

  it("shows the wait, nothing ranked, and a failed read with Retry", async () => {
    const loading = scene(LEADERBOARD.loading);
    expect(within(loading.drawer).getByRole("status", { name: "Loading the players" })).toBeInTheDocument();
    loading.unmount();
    const empty = scene(LEADERBOARD.empty);
    expect(within(empty.drawer).getByText("No player is ranked yet.")).toBeInTheDocument();
    empty.unmount();
    const onRetry = vi.fn();
    const failed = scene({ ...LEADERBOARD.error, players: { ...LEADERBOARD.error.players, onRetry } });
    expect(within(failed.drawer).getByText("Could not load the players")).toBeInTheDocument();
    await userEvent.click(within(failed.drawer).getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledOnce();
    failed.unmount();
    const off = scene(LEADERBOARD.unavailable);
    expect(within(off.drawer).getByText("Rankings are not on this network yet.")).toBeInTheDocument();
    expect(within(off.drawer).queryByRole("list")).toBeNull();
  }, slow(10_000));
});

/** The home as a plain outlet with the app's profile host (the drawers' pages mount none of their own), as social-pages.test's. */
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
                <PlayerProfileHost />
              </main>
            ),
          }
        : c,
    ),
  })) as RouteObject[];

describe("/ranking on the mock (LEADERBOARD-PAGE)", { timeout: slow(30_000) }, () => {
  preloadPages("ranking", "guild");
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

  async function open(path: string, crowns = 90) {
    const s = await mockWith(crowns);
    const wallet = fakeWallet({ address: s.me, restored: true });
    wallet.connector.signer = () => s.sources.signer as GameSigner;
    const router = createTestRouter(path, plainHome);
    render(<App router={router} sources={s.sources} connector={wallet.load} />);
    return { router, me: s.me, drawer: await screen.findByRole("dialog", { name: "Ranking" }, { timeout: slow(8000) }) };
  }

  it("lists the players with the viewer's own row; a player's row opens their profile in the drawer's place, Back to the list at its scroll", async () => {
    const { router, drawer } = await open("/ranking");
    const list = await within(drawer).findByRole("list", { name: "Players by crowns" }, { timeout: slow(8000) });
    const own = within(list).getAllByRole("button").find((r) => r.hasAttribute("data-own"))!;
    expect(own).toHaveAccessibleName(/\(you\), level \d+, 90 crowns$/);
    // jsdom lays nothing out: the body keeps the scroll it is given.
    const body = drawer.querySelector<HTMLElement>("[data-hud-drawer-body]")!;
    body.scrollTop = 420;
    const first = within(list).getAllByRole("button")[0]!;
    const name = first.getAttribute("aria-label")!.replace(/^1\. /, "").split(",")[0]!;
    await userEvent.click(first);
    // DRAWER-NAV-IN-PLACE (#1064): one drawer, the profile in its place, named after the player; no second drawer over it.
    expect(await screen.findByRole("dialog", { name }, { timeout: slow(8000) })).toBe(drawer);
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(drawer).toContainElement(shownView("public-profile"));
    expect(within(drawer).queryByRole("list", { name: "Players by crowns" })).toBeNull();
    // The tabs at the foot are the list's: hidden under the profile.
    expect(drawer.querySelector("[data-slot=hud-drawer-footer]")).toHaveClass("hidden");
    expect(router.state.location.pathname).toBe("/ranking");
    expect(new URLSearchParams(router.state.location.search).get("player")).not.toBeNull();
    // Back: the list again, at its scroll, the URL's profile gone.
    await userEvent.click(drawerBack(drawer));
    await waitFor(() => expect(shownView()).toBeNull(), { timeout: slow(5000) });
    expect(new URLSearchParams(router.state.location.search).get("player")).toBeNull();
    expect(screen.getByRole("dialog", { name: "Ranking" })).toBe(drawer);
    expect(within(drawer).getByRole("list", { name: "Players by crowns" })).toBe(list);
    expect(body.scrollTop).toBe(420);
  });

  it("goes Back from the profile on Escape, and the drawer stays", async () => {
    const { router, drawer } = await open("/ranking");
    const list = await within(drawer).findByRole("list", { name: "Players by crowns" }, { timeout: slow(8000) });
    const first = within(list).getAllByRole("button")[0]!;
    const name = first.getAttribute("aria-label")!.replace(/^1\. /, "").split(",")[0]!;
    await userEvent.click(first);
    await screen.findByRole("dialog", { name }, { timeout: slow(8000) });
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(shownView()).toBeNull(), { timeout: slow(5000) });
    expect(router.state.location.pathname).toBe("/ranking");
    expect(screen.getByRole("dialog", { name: "Ranking" })).toBe(drawer);
  });

  it("opens on Friends from the URL: the viewer, new, has none yet", async () => {
    const { drawer } = await open("/ranking?tab=friends");
    expect(within(drawer).getByRole("tab", { name: "Friends" })).toHaveAttribute("aria-selected", "true");
    expect(await within(drawer).findByText(/^No friend to rank yet/, undefined, { timeout: slow(8000) })).toBeInTheDocument();
  });

  it("opens on Guilds from the URL; a guild's row opens its page", async () => {
    const { router, drawer } = await open("/ranking?tab=guilds");
    expect(within(drawer).getByRole("tab", { name: "Allegiances" })).toHaveAttribute("aria-selected", "true");
    const list = await within(drawer).findByRole("list", { name: "Allegiances by score" }, { timeout: slow(8000) });
    const first = within(list).getAllByRole("button")[0]!;
    await userEvent.click(first);
    // DRAWER-NAV-IN-PLACE (#1064): in the ranking's drawer, in its place, on the Guilds tab still.
    await waitFor(() => expect(drawer).toContainElement(shownView("guild-sheet")), { timeout: slow(8000) });
    expect(router.state.location.pathname).toBe("/ranking");
    const search = new URLSearchParams(router.state.location.search);
    expect(search.get("guild")).toMatch(/^\d+$/);
    expect(search.get("tab")).toBe("guilds");
    // A member of it: their profile over the guild, which stays under it as it was (DRAWER-NAV-IN-PLACE: a chain, one step at a time).
    const guild = shownView("guild-sheet")!;
    const members = await within(guild).findByRole("list", { name: "Members" }, { timeout: slow(8000) });
    guild.scrollTop = 300;
    await userEvent.click(within(members).getAllByRole("button")[0]!);
    await waitFor(() => expect(shownView()).toBe(shownView("public-profile")), { timeout: slow(8000) });
    expect(guild).toHaveAttribute("inert");
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(new URLSearchParams(router.state.location.search).get("guild")).toBeNull();
    // Back: the same guild page (not mounted again), at its scroll; then the list.
    await userEvent.click(drawerBack(drawer));
    await waitFor(() => expect(shownView()).toBe(guild), { timeout: slow(5000) });
    expect(guild).not.toHaveAttribute("inert");
    expect(guild.scrollTop).toBe(300);
    expect(within(guild).getByRole("list", { name: "Members" })).toBe(members);
    expect(new URLSearchParams(router.state.location.search).get("guild")).toMatch(/^\d+$/);
    await userEvent.click(drawerBack(drawer));
    await waitFor(() => expect(shownView()).toBeNull(), { timeout: slow(5000) });
    expect(within(drawer).getByRole("list", { name: "Allegiances by score" })).toBe(list);
  });
});
