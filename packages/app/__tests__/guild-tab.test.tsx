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
      if (type === "Open") {
        await userEvent.click(screen.getByRole("button", { name: "Post" }));
        await confirm("Post an announcement", "Post", "First stones laid today");
        expect(await screen.findByText("First stones laid today", undefined, T(5_000))).toBeInTheDocument();
      }
      await userEvent.click(screen.getByRole("button", { name: /Disband the guild/ }));
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
    expect(screen.queryByRole("region", { name: "Requests" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Post" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /Leave the guild/ }));
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

  it("gets a request on a By-request guild, accepts it, then promotes, demotes, kicks and makes another leader", async () => {
    const { later } = open();
    await finder();
    await create("Mill Lane", "By request");
    await later(MOCK_SEED_REQUEST_S + 1);
    const requests = await screen.findByRole("region", { name: "Requests" }, T(5_000));
    await waitFor(() => expect(within(requests).getByRole("heading")).toHaveTextContent("Requests1"), T(5_000));
    await userEvent.click(within(requests).getByRole("button", { name: "Accept" }));
    const members = screen.getByRole("region", { name: "Members" });
    await waitFor(() => expect(within(members).getAllByRole("button")).toHaveLength(2), T(5_000));
    // Their profile, from their row: the Leader's actions on a Member.
    await userEvent.click(within(members).getAllByRole("button")[1]!);
    const profile = await screen.findByRole("dialog", undefined, T(8_000));
    await userEvent.click(await within(profile).findByRole("button", { name: "Promote to Officer" }, T(5_000)));
    await confirm(/^Promote /, "Promote to Officer");
    await userEvent.click(await within(screen.getByRole("dialog")).findByRole("button", { name: "Demote to Member" }, T(5_000)));
    await confirm(/^Demote /, "Demote to Member");
    await userEvent.click(await within(screen.getByRole("dialog")).findByRole("button", { name: "Make leader" }, T(5_000)));
    await confirm(/^Make .* the leader\?$/, "Make leader");
    // Now an Officer: on the new Leader, no action.
    await waitFor(() => expect(within(screen.getByRole("dialog")).queryByRole("button", { name: "Kick" })).toBeNull(), T(5_000));
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: /Mill Lane, Leader/ })).toBeInTheDocument();
  });

  it("kicks a member with a reason, which the log shows", async () => {
    const { later } = open();
    await finder();
    await create("Mill Lane", "By request");
    await later(MOCK_SEED_REQUEST_S + 1);
    const requests = await screen.findByRole("region", { name: "Requests" }, T(5_000));
    await userEvent.click(await within(requests).findByRole("button", { name: "Accept" }, T(5_000)));
    const members = screen.getByRole("region", { name: "Members" });
    await waitFor(() => expect(within(members).getAllByRole("button")).toHaveLength(2), T(5_000));
    await userEvent.click(within(members).getAllByRole("button")[1]!);
    await userEvent.click(await within(await screen.findByRole("dialog", undefined, T(8_000))).findByRole("button", { name: "Kick" }, T(5_000)));
    await confirm(/^Kick /, "Kick", "Never plays");
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(within(screen.getByRole("region", { name: "Log" })).getByRole("list")).toHaveTextContent("“Never plays”"), T(8_000));
  });

  it("invites a guildless player from their profile, who joins", async () => {
    const { later, router } = open();
    await finder();
    await create("Gate Ward", "Invite only");
    const target = guildless()[0]!;
    await act(() => router.navigate(`/guild?player=${target.address}`));
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
