import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { ALLIANCE_MAX_GUILDS } from "@paved/game-core";
import { NoAlliance } from "../src/components/containers/alliance-finder";
import { AlliancePage } from "../src/components/containers/alliance-page";
import { AllianceGuildActions, AllianceLine, AllianceTile } from "../src/components/containers/alliance-parts";
import { AllianceEmblem } from "../src/components/elements/alliance-emblem";
import { LeaderboardScene } from "../src/components/scenes/leaderboard-scene";
import { AllianceRefusedError } from "../src/data/social-source";
import { ALLIANCE_REFUSALS, allianceErrorText } from "../src/lib/alliance-text";
import { ALLIANCE_BADGE, ALLIANCE_LISTS, ALLIANCE_PAGE, PLAYER_ALLIANCE } from "../src/mocks/alliances";
import { LEADERBOARD } from "../src/mocks/ranking";
import { allianceApply } from "../src/routes/social/alliance-apply";

// ALLIANCES' interface: the alliance's page as its leader, a member guild's leader, a member and an outside guild's leader see it; the
// "No alliance" view; the guild pages' alliance line, tile and actions; the Leaderboard's Alliances tab; and what an outside guild's
// leader may do.

const wrap = (ui: ReactNode) => (
  <MemoryRouter>
    <LazyMotion features={domMax}>
      <MotionConfig reducedMotion="always">{ui}</MotionConfig>
    </LazyMotion>
  </MemoryRouter>
);
const button = (name: string | RegExp) => screen.queryByRole("button", { name });
const guildRows = () => within(screen.getByRole("list", { name: "Guilds" })).getAllByRole("button");

describe("AlliancePage (ALLIANCES)", () => {
  it("the alliance's leader: the identity, the figures, the guilds head first with theirs in gold, the requests and the invitations sent", async () => {
    const onAction = vi.fn(async () => {});
    const onOpenGuild = vi.fn();
    render(wrap(<AlliancePage {...ALLIANCE_PAGE.leader} onAction={onAction} onOpenGuild={onOpenGuild} />));
    const header = screen.getByRole("heading", { level: 2, name: "Stone Pact" }).closest("header")!;
    expect(header).toHaveTextContent("Head guild");
    expect(within(header).getByLabelText(`3 of ${ALLIANCE_MAX_GUILDS} guilds`)).toBeInTheDocument();
    expect(guildRows().map((r) => r.getAttribute("data-role"))).toEqual(["head", "member", "member"]);
    expect(guildRows()[0]).toHaveAttribute("data-own");
    expect(guildRows()[0]).toHaveAccessibleName(/^The Quarrymen, head guild \(your guild\)/);
    await userEvent.click(guildRows()[1]!);
    expect(onOpenGuild).toHaveBeenCalledWith(ALLIANCE_PAGE.leader.alliance.roster[1]!.guild.id);
    expect(screen.getByRole("region", { name: "Requests" })).toHaveTextContent("Hollow Oak");
    expect(screen.getByRole("region", { name: "Invitations sent" })).toHaveTextContent(/Wild Furrow.*Lapses in 6d/);
    await userEvent.click(screen.getByRole("button", { name: "Accept Hollow Oak" }));
    expect(onAction).toHaveBeenCalledWith({ type: "answer-request", guild: 20_001, accept: true });
    // No apply footer for a guild of the alliance.
    expect(button(/Request to join/)).toBeNull();
  });

  it("the leader's menu: Invite a guild and Alliance settings as views; Leave waits for another head", async () => {
    const onClose = vi.fn();
    render(wrap(<AlliancePage {...ALLIANCE_PAGE.leader} invite={<p>The guild search</p>} onClose={onClose} />));
    await userEvent.click(screen.getByRole("button", { name: "Alliance menu" }));
    const menu = screen.getByRole("list", { name: "Alliance menu" });
    expect(within(menu).getAllByRole("button").map((b) => b.textContent)).toEqual(["Invite a guild", "Alliance settings", "Leave the alliance"]);
    expect(within(menu).getByRole("button", { name: "Leave the alliance" })).toBeDisabled();
    expect(menu).toHaveTextContent(ALLIANCE_REFUSALS["head-must-transfer"]);
    await userEvent.click(within(menu).getByRole("button", { name: "Invite a guild" }));
    expect(screen.getByText("The guild search")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Invite a guild" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    await userEvent.click(within(screen.getByRole("list", { name: "Alliance menu" })).getByRole("button", { name: "Alliance settings" }));
    expect(screen.getByRole("textbox", { name: "Description" })).toHaveValue(ALLIANCE_PAGE.leader.alliance.description);
    expect(screen.queryByRole("textbox", { name: "Name" })).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("a member guild's leader: the menu's Leave, asked in the HUD's dialog first; a member who does not lead: no menu", async () => {
    const onAction = vi.fn(async () => {});
    const { unmount } = render(wrap(<AlliancePage {...ALLIANCE_PAGE.memberLeader} onAction={onAction} />));
    expect(screen.getByRole("heading", { level: 2, name: "Stone Pact" }).closest("header")).toHaveTextContent("Member guild");
    expect(screen.queryByRole("region", { name: "Requests" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Alliance menu" }));
    await userEvent.click(screen.getByRole("button", { name: "Leave the alliance" }));
    const dialog = await screen.findByRole("dialog", { name: "Leave Stone Pact?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Leave" }));
    expect(onAction).toHaveBeenCalledWith({ type: "leave" });
    unmount();
    render(wrap(<AlliancePage {...ALLIANCE_PAGE.member} />));
    expect(button("Alliance menu")).toBeNull();
  });

  it("the only guild's leader: the menu's Disband", async () => {
    render(wrap(<AlliancePage {...ALLIANCE_PAGE.alone} />));
    await userEvent.click(screen.getByRole("button", { name: "Alliance menu" }));
    expect(screen.getByRole("button", { name: "Disband the alliance" })).toBeEnabled();
  });

  it("an outside guild's leader: Cancel and the gold action in their places, the word and the dimming changing with the state", async () => {
    const onAction = vi.fn(async () => {});
    const { unmount } = render(wrap(<AlliancePage {...ALLIANCE_PAGE.visitor} onAction={onAction} />));
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Request to join Northern Accord" }));
    expect(onAction).toHaveBeenCalledWith({ type: "request" });
    unmount();
    const requested = render(wrap(<AlliancePage {...ALLIANCE_PAGE.requested} onAction={onAction} />));
    expect(screen.getByRole("button", { name: "Request sent" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onAction).toHaveBeenLastCalledWith({ type: "cancel-request" });
    requested.unmount();
    const invited = render(wrap(<AlliancePage {...ALLIANCE_PAGE.invited} onAction={onAction} />));
    await userEvent.click(screen.getByRole("button", { name: "Accept Stone Pact's invitation" }));
    expect(onAction).toHaveBeenLastCalledWith({ type: "answer-invitation", accept: true });
    await userEvent.click(screen.getByRole("button", { name: "Decline" }));
    expect(onAction).toHaveBeenLastCalledWith({ type: "answer-invitation", accept: false });
    invited.unmount();
    render(wrap(<AlliancePage {...ALLIANCE_PAGE.full} />));
    expect(screen.getByRole("button", { name: /^Request to join/ })).toBeDisabled();
    expect(screen.getByText(ALLIANCE_REFUSALS.full)).toBeInTheDocument();
  });

  it("shows a refusal's words and keeps the dialog open", async () => {
    const onAction = vi.fn(async () => {
      throw new AllianceRefusedError("head-must-transfer");
    });
    render(wrap(<AlliancePage {...ALLIANCE_PAGE.memberLeader} onAction={onAction} />));
    await userEvent.click(screen.getByRole("button", { name: "Alliance menu" }));
    await userEvent.click(screen.getByRole("button", { name: "Leave the alliance" }));
    const dialog = await screen.findByRole("dialog", { name: "Leave Stone Pact?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Leave" }));
    expect(await within(dialog).findByText(ALLIANCE_REFUSALS["head-must-transfer"])).toBeInTheDocument();
    expect(allianceErrorText(new Error("down"))).toBe("down");
  });
});

describe("allianceApply (ALLIANCES): what an outside guild's leader may do", () => {
  it("nothing for a member who does not lead, or a guild in an alliance; else invited, requested, request, or why not", () => {
    const pact = ALLIANCE_PAGE.leader.alliance;
    expect(allianceApply(pact, PLAYER_ALLIANCE.none)).toBeUndefined();
    expect(allianceApply(pact, PLAYER_ALLIANCE.memberLeader)).toBeUndefined();
    expect(allianceApply(pact, PLAYER_ALLIANCE.invited)).toEqual({ kind: "invited" });
    expect(allianceApply(pact, PLAYER_ALLIANCE.requested)).toEqual({ kind: "requested" });
    expect(allianceApply(pact, PLAYER_ALLIANCE.free)).toEqual({ kind: "request" });
    expect(allianceApply({ id: 701, guilds: 2 }, PLAYER_ALLIANCE.requested)).toEqual({ kind: "blocked", reason: "Your guild's request waits at Stone Pact." });
    expect(allianceApply({ ...pact, guilds: ALLIANCE_MAX_GUILDS }, PLAYER_ALLIANCE.free)).toEqual({ kind: "blocked", reason: ALLIANCE_REFUSALS.full });
  });
});

describe("NoAlliance (ALLIANCES)", () => {
  const list = { alliances: ALLIANCE_LISTS.ranking };
  it("a guild's leader: No alliance written out, the invitation's Accept and Decline, Create and Find as views", async () => {
    const onAction = vi.fn(async () => {});
    const onOpenAlliance = vi.fn();
    render(wrap(<NoAlliance player={PLAYER_ALLIANCE.invited} query="" list={list} onAction={onAction} onOpenAlliance={onOpenAlliance} />));
    expect(screen.getByRole("region", { name: "No alliance" })).toHaveTextContent("Wild Furrow is in no alliance.");
    await userEvent.click(screen.getByRole("button", { name: "Accept Stone Pact" }));
    expect(onAction).toHaveBeenCalledWith({ type: "answer-invitation", alliance: 700, accept: true });
    await userEvent.click(screen.getByRole("button", { name: /^Stone Pact, 3 of 5 guilds/ }));
    expect(onOpenAlliance).toHaveBeenCalledWith(700);
    await userEvent.click(screen.getByRole("button", { name: "Find an alliance" }));
    expect(screen.getByRole("searchbox", { name: "Search alliances" })).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Alliances" })).getAllByRole("button").map((b) => b.getAttribute("aria-label")?.split(",")[0])).toEqual(["Northern Accord", "Stone Pact"]);
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    await userEvent.click(screen.getByRole("button", { name: "Create an alliance" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Name" }), "Road Pact");
    await userEvent.click(screen.getByRole("button", { name: "Create the alliance" }));
    expect(onAction).toHaveBeenLastCalledWith({ type: "create", draft: expect.objectContaining({ name: "Road Pact" }) });
  });

  it("a request waiting: Cancel; a member who does not lead: one line, nothing to press", async () => {
    const onAction = vi.fn(async () => {});
    const { unmount } = render(wrap(<NoAlliance player={PLAYER_ALLIANCE.requested} query="" list={list} onAction={onAction} />));
    await userEvent.click(screen.getByRole("button", { name: "Cancel the request" }));
    expect(onAction).toHaveBeenCalledWith({ type: "cancel-request" });
    unmount();
    render(wrap(<NoAlliance player={PLAYER_ALLIANCE.none} query="" list={list} />));
    expect(screen.getByRole("region", { name: "No alliance" })).toHaveTextContent("Your guild's leader can create one or ask to join one.");
    expect(button("Create an alliance")).toBeNull();
  });
});

describe("the guild pages' alliance parts (ALLIANCES)", () => {
  it("the line under a guild's tag opens its alliance; none is written out", async () => {
    const onOpen = vi.fn();
    const { unmount } = render(wrap(<AllianceLine badge={ALLIANCE_BADGE.head} onOpen={onOpen} />));
    await userEvent.click(screen.getByRole("button", { name: "Alliance: Stone Pact" }));
    expect(onOpen).toHaveBeenCalledWith(700);
    unmount();
    render(wrap(<AllianceLine badge={null} />));
    expect(screen.getByText("No alliance")).toBeInTheDocument();
  });

  it("the tile says what waits, capped at 99+", () => {
    const { unmount } = render(wrap(<AllianceTile count={3} />));
    expect(screen.getByRole("button", { name: "Alliance, 3 waiting" })).toBeInTheDocument();
    unmount();
    render(wrap(<AllianceTile count={120} />));
    expect(screen.getByText("99+")).toBeInTheDocument();
  });

  it("the alliance's leader on another guild: Invite, Invited dimmed, why not; on a guild of theirs, Make head and Remove asked first", async () => {
    const onAction = vi.fn(async () => {});
    const view = render(wrap(<AllianceGuildActions alliance="Stone Pact" guild="Hollow Oak" state={{ kind: "invite", refused: null }} onAction={onAction} />));
    await userEvent.click(screen.getByRole("button", { name: "Invite to Stone Pact" }));
    expect(onAction).toHaveBeenCalledWith({ type: "invite" });
    view.rerender(wrap(<AllianceGuildActions alliance="Stone Pact" guild="Hollow Oak" state={{ kind: "invited" }} />));
    expect(screen.getByRole("button", { name: "Invited" })).toBeDisabled();
    view.rerender(wrap(<AllianceGuildActions alliance="Stone Pact" guild="Hollow Oak" state={{ kind: "invite", refused: ALLIANCE_REFUSALS["in-alliance"] }} />));
    expect(screen.getByRole("button", { name: "Invite to Stone Pact" })).toBeDisabled();
    expect(screen.getByText(ALLIANCE_REFUSALS["in-alliance"])).toBeInTheDocument();
    view.rerender(wrap(<AllianceGuildActions alliance="Stone Pact" guild="Hollow Oak" state={{ kind: "member" }} onAction={onAction} />));
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    const dialog = await screen.findByRole("dialog", { name: "Remove Hollow Oak?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Remove" }));
    expect(onAction).toHaveBeenLastCalledWith({ type: "remove" });
  });

  it("an alliance's emblem: the laurel and the shield, named only when asked", () => {
    const { container } = render(wrap(<AllianceEmblem emblem={ALLIANCE_BADGE.head.emblem} size="lg" label="Stone Pact" />));
    expect(screen.getByRole("img", { name: "Stone Pact" })).toHaveAttribute("data-size", "lg");
    expect(container.querySelector("img")!.getAttribute("srcset")).toContain("/ui-art/emblems/256/alliance-laurel.webp 256w");
  });
});

describe("the Leaderboard's Alliances tab (ALLIANCES)", () => {
  it("is live: the alliances by score under a title without their count, the viewer's in gold, a row opening its page", async () => {
    const onOpenAlliance = vi.fn();
    render(wrap(<LeaderboardScene {...LEADERBOARD.alliances} onOpenAlliance={onOpenAlliance} />));
    const drawer = screen.getByRole("dialog", { name: "Ranking" });
    const tab = within(drawer).getByRole("tab", { name: /Alliances/ });
    expect(tab).toBeEnabled();
    expect(tab).not.toHaveAccessibleName(/coming soon/);
    // The section's title is the word alone (the owner's word of 2026-11-08; TILE-COUNTS: no section title carries a figure).
    expect(within(within(drawer).getByRole("region", { name: "Alliances" })).getByRole("heading")).toHaveTextContent(/^Alliances$/);
    const rows = within(within(drawer).getByRole("list", { name: "Alliances by score" })).getAllByRole("button");
    expect(rows.map((r) => r.getAttribute("aria-label")?.split(",")[0])).toEqual(["1. Harbour Union", "2. Ember Crown", "3. Northern Accord", "4. Stone Pact (your alliance)", "5. Moorland Oath", "6. Lantern Road"]);
    expect(rows[3]).toHaveAttribute("data-own");
    await userEvent.click(rows[2]!);
    expect(onOpenAlliance).toHaveBeenCalledWith(701);
  });

  it("pins the viewer's alliance past the list's end, and says when none is ranked", () => {
    const { unmount } = render(wrap(<LeaderboardScene {...LEADERBOARD.alliancesPastList} />));
    expect(screen.getByRole("button", { name: /^37\. Kerbside Pact \(your alliance\)/ }).closest("[data-slot=ranking-pinned]")).toHaveAttribute("data-side", "foot");
    unmount();
    render(wrap(<LeaderboardScene {...LEADERBOARD.noAlliances} />));
    expect(screen.getByText(/No alliance is ranked yet/)).toBeInTheDocument();
  });
});
