import { slow } from "../test-slow";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Outlet, type RouteObject } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHAT_WORLD_MIN_LEVEL, guildConversation, privateConversation, xpFloor, type GuildDraft } from "@paved/game-core";
import { App } from "../src/App";
import type { GameSigner } from "../src/data";
import { MOCK_REQUEST_S } from "../src/data/mock/chat";
import { followBackDelay } from "../src/data/mock/follows";
import { MOCK_KEY } from "../src/data/mock/ledger";
import { SEEDED_PLAYERS } from "../src/data/mock/players";
import { freshV2 } from "../src/data/mock/v2";
import type { ChatSource, GuildSource, SocialSource } from "../src/data/social-source";
import { memoryStore } from "./data-fakes";
import { queryClient } from "../src/lib/query-client";
import { createTestRouter } from "../src/routes/router";
import { resetSocialTabForTests, storeSocialTab } from "../src/routes/social-tab";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { mockImplementation } from "./mock-fakes";
import { preloadPages } from "./route-helpers";
import { fakeWallet } from "./wallet-fakes";

// The Chat tab, the conversations and the profile's Message on the mock (#955, PR 2): the acceptance's flows through the page,
// on the ledger's chat (`data/mock/chat.ts`), its clock in the test's hands.

/** 2026-10-31 12:00 UTC. */
const T0 = 1_793_448_000;
/** Device players, outside the community. */
const OTHER = "0xabc002";
const THIRD = "0xabc003";

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
const draft = (over: Partial<GuildDraft> = {}): GuildDraft => ({ name: "Stone Road", emblem: { icon: 1, primary: 2, secondary: 3 }, description: "We pave.", joinType: "open", requirements: { level: 0, crowns: 0 }, ...over });

/** Puts `player` at `level` in the stored state (their XP), so that they may write in the World. */
function levelUp(store: ReturnType<typeof memoryStore>, level: number, player: string) {
  const state = JSON.parse(store.getItem(MOCK_KEY) ?? JSON.stringify({ version: 1, players: {}, vault: { assets: "1", supply: "1" }, transactions: 0 }));
  const key = `0x${BigInt(player).toString(16)}`;
  const base = state.players[key] ?? { cobbles: 0, credits: 0, achievementsClaimed: "0", days: {}, weeks: {}, owned: {}, active: [], shares: "0", paved: "0", usdc: "0", v2: freshV2() };
  state.players[key] = { ...base, v2: { ...(base.v2 ?? freshV2()), xp: xpFloor(level) } };
  store.setItem(MOCK_KEY, JSON.stringify(state));
}

describe("/social's Chat tab on the mock (#955)", { timeout: slow(60_000) }, () => {
  preloadPages("social");
  beforeEach(() => {
    queryClient.clear();
    resetWelcomedForTests();
    markWelcomed();
    resetSocialTabForTests();
    storeSocialTab("chat");
  });
  afterEach(() => {
    vi.restoreAllMocks();
    queryClient.clear();
    resetWelcomedForTests();
    resetSocialTabForTests();
    localStorage.clear();
  });

  /** The page on the mock at `path`; `level`: the player's level first. */
  function open(path = "/social", { level }: { level?: number } = {}) {
    const clock = { now: T0 };
    const store = memoryStore();
    const s = mockImplementation(store, undefined, () => clock.now);
    const me = s.sources.signer!.address;
    if (level !== undefined) levelUp(store, level, me);
    const wallet = fakeWallet({ address: me, restored: true });
    wallet.connector.signer = () => s.sources.signer as GameSigner;
    const router = createTestRouter(path, plainHome);
    render(<App router={router} sources={s.sources} connector={wallet.load} />);
    const social = s.sources.social as SocialSource & GuildSource & { chat: ChatSource };
    /** Moves the ledger's clock, then reads the chat again. */
    const later = async (seconds: number) => {
      clock.now += seconds;
      await act(() => queryClient.invalidateQueries({ queryKey: ["social"] }));
    };
    return { router, me, social, chat: social.chat, later, clock };
  }

  const conversation = (name: RegExp | string) => screen.findByRole("region", { name: typeof name === "string" ? `${name} conversation` : name }, T(10_000));
  const field = (name: string) => screen.findByRole("textbox", { name: `Message ${name}` }, T(8_000));
  async function send(name: string, text: string) {
    const input = await field(name);
    await userEvent.clear(input);
    await userEvent.type(input, `${text}{enter}`);
  }

  it("lists the World first; below level 2 it is read, not written, with the reason", async () => {
    open();
    const world = await screen.findByRole("button", { name: /^World/ }, T(10_000));
    expect(screen.queryByRole("button", { name: /^Stone Road/ })).toBeNull();
    await userEvent.click(world);
    const log = within(await conversation("World")).getByRole("log", { name: "Messages" });
    await waitFor(() => expect(within(log).getAllByRole("listitem").length).toBeGreaterThan(5), T(8_000));
    expect(screen.getByText(`Writing in the World opens at level ${CHAT_WORLD_MIN_LEVEL}.`)).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Message World" })).toBeNull();
    // Links and addresses are plain text: no link anywhere in the conversation.
    expect(within(log).queryAllByRole("link")).toEqual([]);
  });

  it("writes in the World from level 2, deletes the message, and refuses a second one within 5 seconds with the countdown", async () => {
    // The page's countdown reads the wall clock, as the mock does outside the tests: both held at T0, so the 5 seconds do not
    // run out however slow the machine.
    vi.spyOn(Date, "now").mockReturnValue(T0 * 1000);
    open("/social", { level: CHAT_WORLD_MIN_LEVEL });
    await userEvent.click(await screen.findByRole("button", { name: /^World/ }, T(10_000)));
    await conversation("World");
    await send("World", "hello builders, see paved-gifts.example and 0x04a3");
    const log = screen.getByRole("log", { name: "Messages" });
    const mine = await within(log).findByText("hello builders, see paved-gifts.example and 0x04a3", undefined, T(8_000));
    expect(within(log).queryAllByRole("link")).toEqual([]);
    // The rate limit: Send waits, counting down.
    await userEvent.type(await field("World"), "again");
    expect(await screen.findByRole("button", { name: "Send, in 5 s" }, T(5_000))).toBeDisabled();
    // Delete one's own message: "Message deleted" in its place.
    const row = mine.closest("li")!;
    await userEvent.click(within(row as HTMLElement).getByRole("button", { name: "More for You's message" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Delete" }, T(5_000)));
    const dialog = await screen.findByRole("dialog", { name: "Delete this message?" }, T(5_000));
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(await within(log).findByText("Message deleted", undefined, T(8_000))).toBeInTheDocument();
    expect(within(log).queryByText("hello builders, see paved-gifts.example and 0x04a3")).toBeNull();
  });

  it("reports a message, mutes its author (their messages go), and unmutes them from the tab's menu", async () => {
    open("/social?chat=world", { level: CHAT_WORLD_MIN_LEVEL });
    await conversation("World");
    const log = screen.getByRole("log", { name: "Messages" });
    const menus = await within(log).findAllByRole("button", { name: /^More for .+'s message$/ }, T(8_000));
    const target = menus.at(-1)!;
    const author = /^More for (.+)'s message$/.exec(target.getAttribute("aria-label")!)![1]!;
    const count = () => within(log).queryAllByRole("button", { name: `More for ${author}'s message` }).length;
    expect(count()).toBeGreaterThan(0);
    // Report: a reason, then Report; the menu no longer offers it on that message.
    await userEvent.click(target);
    await userEvent.click(await screen.findByRole("menuitem", { name: "Report" }, T(5_000)));
    const dialog = await screen.findByRole("dialog", { name: `Report ${author}'s message?` }, T(5_000));
    await userEvent.click(within(dialog).getByRole("radio", { name: /^Scam/ }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Report" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), T(5_000));
    // Mute: their messages are hidden.
    await userEvent.click(within(log).getAllByRole("button", { name: `More for ${author}'s message` }).at(-1)!);
    expect(screen.queryByRole("menuitem", { name: "Report" })).toBeNull();
    await userEvent.click(await screen.findByRole("menuitem", { name: "Mute" }, T(5_000)));
    await waitFor(() => expect(count()).toBe(0), T(8_000));
    // Back to the list, its menu: the muted player, then Unmute.
    await userEvent.click(screen.getByRole("button", { name: "Back to the conversations" }));
    await userEvent.click(await screen.findByRole("button", { name: /^Muted players/ }, T(8_000)));
    const sheet = await screen.findByRole("dialog", { name: "Muted players" }, T(5_000));
    await userEvent.click(await within(sheet).findByRole("button", { name: `Unmute ${author}` }, T(5_000)));
    expect(await within(sheet).findByText(/You mute no one/, undefined, T(8_000))).toBeInTheDocument();
  });

  it("hides a player's messages at once when the player blocks them from a profile opened on one", async () => {
    open("/social?chat=world");
    await conversation("World");
    const log = screen.getByRole("log", { name: "Messages" });
    const avatars = await within(log).findAllByRole("button", { name: /^.+'s profile$/ }, T(8_000));
    const target = avatars.find((b) => b.getAttribute("aria-label") !== "You's profile")!;
    const name = /^(.+)'s profile$/.exec(target.getAttribute("aria-label")!)![1]!;
    const shown = () => within(log).queryAllByRole("button", { name: `${name}'s profile` }).length;
    expect(shown()).toBeGreaterThan(0);
    await userEvent.click(target);
    const profile = await screen.findByRole("dialog", { name }, T(10_000));
    await userEvent.click(await within(profile).findByRole("button", { name: "Block" }, T(8_000)));
    const confirm = await screen.findByRole("dialog", { name: `Block ${name}?` }, T(5_000));
    await userEvent.click(within(confirm).getByRole("button", { name: "Block" }));
    expect(await within(profile).findByRole("button", { name: "Unblock" }, T(8_000))).toBeInTheDocument();
    await userEvent.click(within(profile).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), T(5_000));
    // The conversation stayed open under the profile: no reload, and the blocked player's messages are gone.
    expect(screen.getByRole("log", { name: "Messages" })).toBe(log);
    await waitFor(() => expect(shown()).toBe(0), T(8_000));
  });

  it("writes in the guild, where the log's lines show; an officer deletes a member's message", async () => {
    const { me, social, chat } = open("/social");
    // OTHER leads the guild, the player joins and is made an officer, THIRD joins and writes.
    const gid = await social.createGuild(OTHER, draft());
    await social.joinGuild(me, gid);
    await social.promote(OTHER, me);
    await social.joinGuild(THIRD, gid);
    await chat.send(THIRD, guildConversation(gid), "a member's line");
    await act(() => queryClient.invalidateQueries({ queryKey: ["social"] }));
    await userEvent.click(await screen.findByRole("button", { name: /^Stone Road/ }, T(10_000)));
    await conversation("Stone Road");
    const log = screen.getByRole("log", { name: "Messages" });
    expect(await within(log).findByText(/promoted .* to Officer/, undefined, T(8_000))).toBeInTheDocument();
    await send("Stone Road", "officer here");
    expect(await within(log).findByText("officer here", undefined, T(8_000))).toBeInTheDocument();
    // The member's message: Delete in its menu, for the officer.
    const row = within(log).getByText("a member's line").closest("li") as HTMLElement;
    await userEvent.click(within(row).getByRole("button", { name: /^More for .+'s message$/ }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Delete" }, T(5_000)));
    await userEvent.click(within(await screen.findByRole("dialog", { name: "Delete this message?" }, T(5_000))).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(within(log).queryByText("a member's line")).toBeNull(), T(8_000));
    expect(within(log).getByText("Message deleted")).toBeInTheDocument();
  });

  it("opens a private conversation with a friend from the Friends tab's Message, with the notice once", async () => {
    const { me, social, later } = open("/social");
    const friend = SEEDED_PLAYERS.find((p) => followBackDelay(me, p.address) !== null)!;
    await social.follows!.follow(me, friend.address);
    await later(followBackDelay(me, friend.address)! + 1);
    await userEvent.click(await screen.findByRole("tab", { name: /^Friends/ }, T(8_000)));
    await userEvent.click(await screen.findByRole("button", { name: `Message ${friend.name}` }, T(10_000)));
    await conversation(friend.name);
    expect(screen.getByText("Paved never asks for your key or your password.")).toBeInTheDocument();
    await send(friend.name, "hello friend");
    expect(await within(screen.getByRole("log", { name: "Messages" })).findByText("hello friend", undefined, T(8_000))).toBeInTheDocument();
    expect(screen.queryByText(/wait in their Requests/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Got it" }));
    await waitFor(() => expect(screen.queryByText("Paved never asks for your key or your password.")).toBeNull(), T(8_000));
  });

  it("brings a stranger's request after the first visit: opened, then accepted", async () => {
    const { later } = open("/social");
    await screen.findByRole("button", { name: /^World/ }, T(10_000));
    expect(screen.queryByRole("region", { name: "Requests" })).toBeNull();
    await later(MOCK_REQUEST_S + 1);
    const requests = await screen.findByRole("region", { name: "Requests" }, T(8_000));
    await waitFor(() => expect(screen.getByRole("tab", { name: /^Chat, \d+ waiting/ })).toBeInTheDocument(), T(8_000));
    await userEvent.click(within(requests).getAllByRole("button")[0]!);
    await screen.findByRole("region", { name: /conversation$/ }, T(8_000));
    await userEvent.click(await screen.findByRole("button", { name: "Accept" }, T(5_000)));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Accept" })).toBeNull(), T(8_000));
    await userEvent.click(screen.getByRole("button", { name: "Back to the conversations" }));
    await screen.findByRole("button", { name: /^World/ }, T(8_000));
    expect(screen.queryByRole("region", { name: "Requests" })).toBeNull();
  });

  it("declines a stranger's request: it goes away, back to the list", async () => {
    const { later } = open("/social");
    await screen.findByRole("button", { name: /^World/ }, T(10_000));
    await later(MOCK_REQUEST_S + 1);
    const requests = await screen.findByRole("region", { name: "Requests" }, T(8_000));
    await userEvent.click(within(requests).getAllByRole("button")[0]!);
    await userEvent.click(await screen.findByRole("button", { name: "Decline" }, T(8_000)));
    await screen.findByRole("button", { name: /^World/ }, T(8_000));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Requests" })).toBeNull(), T(8_000));
  });

  it("opens a private conversation from a stranger's profile (Message): the player's messages wait in their Requests", async () => {
    const stranger = SEEDED_PLAYERS[5]!;
    open(`/social?player=${stranger.address}`);
    const profile = await screen.findByRole("dialog", { name: stranger.name }, T(10_000));
    await userEvent.click(await within(profile).findByRole("button", { name: `Message ${stranger.name}` }, T(8_000)));
    await conversation(stranger.name);
    await send(stranger.name, "hello stranger");
    expect(await within(screen.getByRole("log", { name: "Messages" })).findByText("hello stranger", undefined, T(8_000))).toBeInTheDocument();
    expect(await screen.findByText("Your messages wait in their Requests until they reply or accept.", undefined, T(8_000))).toBeInTheDocument();
  });

  it("says a conversation that is not the player's is not there", async () => {
    open(`/social?chat=${privateConversation("0x0a", "0x0b")}`);
    expect(await screen.findByText("This conversation is not there any more.", undefined, T(10_000))).toBeInTheDocument();
  });
});
