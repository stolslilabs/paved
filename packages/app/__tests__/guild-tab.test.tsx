import { slow } from "../test-slow";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Outlet, type RouteObject } from "react-router";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "../src/App";
import type { GameSigner } from "../src/data";
import { community } from "../src/data/mock/community";
import { MOCK_INVITATION_S, MOCK_INVITE_ANSWER_S, MOCK_SEED_REQUEST_S, seededGuildWorld } from "../src/data/mock/guilds";
import { memoryStore } from "./data-fakes";
import { queryClient } from "../src/lib/query-client";
import { createTestRouter } from "../src/routes/router";
import { resetGuildTabForTests } from "../src/routes/guild-tab";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { mockImplementation } from "./mock-fakes";
import { preloadPages } from "./route-helpers";
import { fakeWallet } from "./wallet-fakes";

// The guild page on the mock (#953, PR 2; the Social page's Guild tab until #973): the acceptance's flows through the page, the sheets and the profiles, on the ledger's
// guilds (`data/mock/guilds.ts`), its clock in the test's hands.

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

/** A community player in no seeded guild. */
const guildless = () => community().filter((m) => !seededGuildWorld().guilds.some((g) => g.members.some((x) => BigInt(x.address) === BigInt(m.address))));

const T = (ms: number) => ({ timeout: slow(ms) });

describe("/guild on the mock (#953, a page since #973)", { timeout: slow(40_000) }, () => {
  preloadPages("guild");
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
    /** Moves the ledger's clock, then reads the guilds again (nothing polls). */
    const later = async (seconds: number) => {
      clock.now += seconds;
      await act(() => queryClient.invalidateQueries({ queryKey: ["social"] }));
    };
    return { router, later, me };
  }

  const finder = () => screen.findByText("You are in no guild", undefined, T(10_000));
  const ownPage = (name: string) => screen.findByRole("heading", { level: 2, name }, T(8_000));

  async function create(name: string, joinType: "Open" | "By request" | "Invite only") {
    await userEvent.click(await screen.findByRole("button", { name: "Create a guild" }, T(8_000)));
    const sheet = await screen.findByRole("dialog", { name: "Create a guild" }, T(5_000));
    await userEvent.type(within(sheet).getByRole("textbox", { name: "Name" }), name);
    await userEvent.click(within(sheet).getByRole("radio", { name: joinType }));
    await userEvent.click(within(sheet).getByRole("button", { name: "Create the guild" }));
    await ownPage(name);
  }

  /** Shows a tab of the guild page. */
  const tab = (name: string) => userEvent.click(screen.getByRole("tab", { name: new RegExp(`^${name}`) }));
  /** Picks an item of the guild page's menu. */
  async function menuItem(name: string | RegExp) {
    await userEvent.click(screen.getByRole("button", { name: "Guild menu" }));
    const sheet = await screen.findByRole("dialog", { name: "Guild menu" }, T(5_000));
    await userEvent.click(within(sheet).getByRole("button", { name }));
  }
  /** The member's row's sheet gone, its slide out included. */
  const sheetGone = () => waitFor(() => expect(document.querySelector("[data-sheet=guild-member-sheet]")).toBeNull(), T(5_000));
  /** Taps a member's row, the `index`-th of the Members tab: their sheet. */
  async function memberSheet(index: number) {
    await sheetGone();
    const members = screen.getByRole("region", { name: "Members" });
    await userEvent.click(within(members).getAllByRole("button")[index]!);
    return screen.findByRole("dialog", undefined, T(5_000));
  }

  async function confirm(title: string | RegExp, button: string, text?: string) {
    const dialog = await screen.findByRole("dialog", { name: title }, T(5_000));
    if (text) await userEvent.type(within(dialog).getByRole("textbox"), text);
    await userEvent.click(within(dialog).getByRole("button", { name: button }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: title })).toBeNull(), T(5_000));
  }

  it("creates a guild of each join type, posts an announcement, and disbands it as its only member", async () => {
    open();
    await finder();
    for (const [name, type] of [
      ["Stone Road", "Open"],
      ["Mill Lane", "By request"],
      ["Gate Ward", "Invite only"],
    ] as const) {
      await create(name, type);
      const header = screen.getByRole("heading", { level: 2, name }).closest("header")!;
      expect(header).toHaveTextContent(type);
      expect(header).toHaveTextContent("Leader");
      // The first visit opens on Members; the next guilds, on the last tab used.
      expect(screen.getByRole("tab", { name: name === "Stone Road" ? "Members" : "Announcements" })).toHaveAttribute("aria-selected", "true");
      if (type === "Open") {
        await tab("Announcements");
        await userEvent.click(screen.getByRole("button", { name: "Post" }));
        await confirm("Post an announcement", "Post", "First stones laid today");
        expect(await screen.findByText("First stones laid today", undefined, T(5_000))).toBeInTheDocument();
      }
      await menuItem("Disband the guild");
      await confirm(`Disband ${name}?`, "Disband");
      await finder();
    }
  });

  it("joins an Open guild from its card's page, then leaves it as a member", async () => {
    const { router } = open();
    await finder();
    await userEvent.click(await screen.findByRole("button", { name: /^Ashford Lanterns/ }, T(5_000)));
    const sheet = await screen.findByRole("dialog", { name: "Ashford Lanterns" }, T(8_000));
    expect(new URLSearchParams(router.state.location.search).get("guild")).not.toBeNull();
    await userEvent.click(within(sheet).getByRole("button", { name: "Join" }));
    await ownPage("Ashford Lanterns");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), T(5_000));
    expect(screen.getByRole("heading", { level: 2, name: "Ashford Lanterns" }).closest("header")).toHaveTextContent("Member");
    // A Member sees no officer's part.
    expect(screen.queryByRole("tab", { name: /^Requests/ })).toBeNull();
    await tab("Announcements");
    expect(screen.queryByRole("button", { name: "Post" })).toBeNull();
    // Chat opens the chat page on Guild; Back returns to the guild.
    await userEvent.click(screen.getByRole("button", { name: "Chat" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/chat/guild"), T(5_000));
    await act(() => router.navigate(-1));
    await ownPage("Ashford Lanterns");
    await menuItem("Leave the guild");
    await confirm("Leave Ashford Lanterns?", "Leave");
    await finder();
  });

  it("shows why a guild's requirements keep a new player out", async () => {
    open();
    await finder();
    await userEvent.click(screen.getByRole("radio", { name: /Ranking/ }));
    await userEvent.click(await screen.findByRole("button", { name: /^Thistle Watch/ }, T(5_000)));
    const sheet = await screen.findByRole("dialog", { name: "Thistle Watch" }, T(8_000));
    expect(within(sheet).getByText("Your level is below the guild's requirement.")).toBeInTheDocument();
    expect(within(sheet).queryByRole("button", { name: "Join" })).toBeNull();
  });

  it("gets a request on a By-request guild, accepts it, then promotes, demotes and makes another leader from their row", async () => {
    const { later } = open();
    await finder();
    await create("Mill Lane", "By request");
    await later(MOCK_SEED_REQUEST_S + 1);
    // Requests badges the request waiting.
    await waitFor(() => expect(screen.getByRole("tab", { name: "Requests, 1 waiting" })).toBeInTheDocument(), T(5_000));
    await tab("Requests");
    const requests = screen.getByRole("region", { name: "Requests" });
    expect(within(requests).getByRole("heading")).toHaveTextContent("Requests1");
    await userEvent.click(within(requests).getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(screen.getByRole("tab", { name: "Requests" })).toBeInTheDocument(), T(5_000));
    await tab("Members");
    await waitFor(() => expect(within(screen.getByRole("region", { name: "Members" })).getAllByRole("button")).toHaveLength(2), T(5_000));
    // Their row: the Leader's actions on a Member; each done, the sheet closes.
    await userEvent.click(await within(await memberSheet(1)).findByRole("button", { name: "Promote to Officer" }, T(5_000)));
    await confirm(/^Promote /, "Promote to Officer");
    await userEvent.click(await within(await memberSheet(1)).findByRole("button", { name: "Demote to Member" }, T(5_000)));
    await confirm(/^Demote /, "Demote to Member");
    await userEvent.click(await within(await memberSheet(1)).findByRole("button", { name: "Make leader" }, T(5_000)));
    await confirm(/^Make .* the leader\?$/, "Make leader");
    await sheetGone();
    // Now an Officer: on the new Leader, the Profile only.
    await waitFor(() => expect(screen.getByRole("heading", { level: 2, name: "Mill Lane" }).closest("header")).toHaveTextContent("Officer"), T(5_000));
    const sheet = await memberSheet(0);
    expect(within(sheet).getByRole("button", { name: "Profile" })).toBeInTheDocument();
    expect(within(sheet).queryByRole("button", { name: /Kick|Demote|Make leader/ })).toBeNull();
  });

  it("kicks a member with a reason, which the log shows", async () => {
    const { later } = open();
    await finder();
    await create("Mill Lane", "By request");
    await later(MOCK_SEED_REQUEST_S + 1);
    await waitFor(() => expect(screen.getByRole("tab", { name: /^Requests, 1/ })).toBeInTheDocument(), T(5_000));
    await tab("Requests");
    await userEvent.click(await within(screen.getByRole("region", { name: "Requests" })).findByRole("button", { name: "Accept" }, T(5_000)));
    await tab("Members");
    await waitFor(() => expect(within(screen.getByRole("region", { name: "Members" })).getAllByRole("button")).toHaveLength(2), T(5_000));
    // The profile keeps the rank actions: from the row's Profile.
    await userEvent.click(within(await memberSheet(1)).getByRole("button", { name: "Profile" }));
    await sheetGone();
    await userEvent.click(await within(await screen.findByRole("dialog", undefined, T(8_000))).findByRole("button", { name: "Kick" }, T(5_000)));
    await confirm(/^Kick /, "Kick", "Never plays");
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), T(5_000));
    await tab("Log");
    await waitFor(() => expect(within(screen.getByRole("region", { name: "Log" })).getByRole("list")).toHaveTextContent("“Never plays”"), T(8_000));
  });

  it("invites a guildless player found from the menu's Invite a player, through their profile, who joins", async () => {
    const { later } = open();
    await finder();
    await create("Gate Ward", "Invite only");
    const target = guildless()[0]!;
    await menuItem("Invite a player");
    const invite = await screen.findByRole("dialog", { name: "Invite a player" }, T(5_000));
    await userEvent.type(within(invite).getByRole("searchbox"), target.name);
    await userEvent.click(await within(invite).findByRole("button", { name: new RegExp(`^${target.name},`) }, T(8_000)));
    const profile = await screen.findByRole("dialog", { name: target.name }, T(8_000));
    await userEvent.click(await within(profile).findByRole("button", { name: "Invite to Gate Ward" }, T(5_000)));
    await confirm(`Invite ${target.name} to Gate Ward?`, "Invite");
    expect(await within(profile).findByRole("button", { name: "Invited to Gate Ward" }, T(5_000))).toBeDisabled();
    await userEvent.click(within(profile).getByRole("button", { name: "Close" }));
    await later(MOCK_INVITE_ANSWER_S + 1);
    await waitFor(() => expect(screen.getByRole("region", { name: "Members" })).toHaveTextContent(target.name), T(8_000));
  });

  it("gets the mock's invitation a minute after the first visit, and accepts it, the requirements waived", async () => {
    const { later } = open();
    await finder();
    await later(MOCK_INVITATION_S + 1);
    const invitations = await screen.findByRole("region", { name: "Invitations" }, T(8_000));
    expect(invitations).toHaveTextContent("Iron Quay Wardens");
    // The Guild button's count is the home's (#973): `social-pages.test`.
    await userEvent.click(within(invitations).getByRole("button", { name: "Accept" }));
    await ownPage("Iron Quay Wardens");
  });
});
