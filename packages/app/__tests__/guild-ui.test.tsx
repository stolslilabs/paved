import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { GUILD_RANK } from "@paved/game-core";
import { GuildCard } from "../src/components/containers/guild-card";
import { GuildFinder } from "../src/components/containers/guild-finder";
import { GuildPage } from "../src/components/containers/guild-page";
import { GuildLine, GuildMemberActions } from "../src/components/containers/guild-profile";
import { GuildRefusedError } from "../src/data/social-source";
import { logLine, REFUSALS } from "../src/lib/guild-text";
import { GUILD_ACTIONS, GUILD_BADGE, GUILD_FINDER, GUILD_PAGE } from "../src/mocks/guilds";
import { guildApply } from "../src/routes/social/guild-apply";

// The guilds' interface (#953, PR 2): the guild page as each rank and a visitor see it, the finder, the cards, the profile's
// guild line and actions, and the rule that says what a visitor may do.

const wrap = (ui: ReactNode) => (
  <MemoryRouter>
    <LazyMotion features={domMax}>
      <MotionConfig reducedMotion="always">{ui}</MotionConfig>
    </LazyMotion>
  </MemoryRouter>
);

const button = (name: string | RegExp) => screen.queryByRole("button", { name });

describe("GuildPage (#953): each rank sees only its actions", () => {
  it("a Member: the announcements, the members and the log; no Post, requests, invitations or settings; Leave", () => {
    render(wrap(<GuildPage {...GUILD_PAGE.member} />));
    expect(screen.getByRole("heading", { name: "The Quarrymen" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Announcements" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Members" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Log" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Requests" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Invitations sent" })).toBeNull();
    expect(button(/Post/)).toBeNull();
    expect(button(/Edit/)).toBeNull();
    expect(button(/Guild settings/)).toBeNull();
    expect(button(/Leave the guild/)).toBeEnabled();
  });

  it("an Officer: the requests and invitations with their counts, Post, their own announcements only; no settings", () => {
    render(wrap(<GuildPage {...GUILD_PAGE.officer} />));
    const requests = screen.getByRole("region", { name: "Requests" });
    expect(within(requests).getByRole("heading")).toHaveTextContent("Requests2");
    expect(within(screen.getByRole("region", { name: "Invitations sent" })).getByRole("heading")).toHaveTextContent("Invitations sent1");
    expect(button(/Post/)).toBeInTheDocument();
    // The officer wrote the second announcement only: one Edit.
    expect(screen.getAllByRole("button", { name: /Edit/ })).toHaveLength(1);
    expect(button(/Guild settings/)).toBeNull();
  });

  it("the Leader: every announcement's Edit and Delete, the settings; Leave waits for another leader", () => {
    render(wrap(<GuildPage {...GUILD_PAGE.leader} />));
    expect(screen.getAllByRole("button", { name: /Edit/ })).toHaveLength(GUILD_PAGE.leader.guild.announcements!.length);
    expect(screen.getAllByRole("button", { name: /Delete/ })).toHaveLength(GUILD_PAGE.leader.guild.announcements!.length);
    expect(button(/Guild settings/)).toBeInTheDocument();
    expect(button(/Leave the guild/)).toBeDisabled();
    expect(screen.getByText(REFUSALS["leader-must-transfer"])).toBeInTheDocument();
  });

  it("a leader alone disbands the guild, after confirming", async () => {
    const onAction = vi.fn(async () => {});
    render(wrap(<GuildPage {...GUILD_PAGE.alone} onAction={onAction} />));
    await userEvent.click(button(/Disband the guild/)!);
    const dialog = await screen.findByRole("dialog", { name: "Disband Ashford Lanterns?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Disband" }));
    expect(onAction).toHaveBeenCalledWith({ type: "leave" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("lists the members by rank, then crowns, each opening their profile", async () => {
    const onOpenPlayer = vi.fn();
    render(wrap(<GuildPage {...GUILD_PAGE.member} onOpenPlayer={onOpenPlayer} />));
    const rows = within(screen.getByRole("region", { name: "Members" })).getAllByRole("button");
    expect(rows[0]).toHaveTextContent("Leader");
    const roster = GUILD_PAGE.member.guild.roster;
    expect(roster.map((m) => m.rank)).toEqual([...roster.map((m) => m.rank)].sort((a, b) => b - a));
    await userEvent.click(rows[1]!);
    expect(onOpenPlayer).toHaveBeenCalledWith(roster[1]!.profile.address);
  });

  it("posts an announcement through its dialog, and keeps the dialog with why when refused", async () => {
    const onAction = vi.fn(async () => Promise.reject(new GuildRefusedError("announcement-length")));
    render(wrap(<GuildPage {...GUILD_PAGE.officer} onAction={onAction} />));
    await userEvent.click(button(/Post/)!);
    const dialog = await screen.findByRole("dialog", { name: "Post an announcement" });
    const post = within(dialog).getByRole("button", { name: "Post" });
    expect(post).toBeDisabled();
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Announcement" }), "Shields up tonight");
    await userEvent.click(post);
    expect(onAction).toHaveBeenCalledWith({ type: "post", text: "Shields up tonight" });
    expect(await within(dialog).findByText(REFUSALS["announcement-length"])).toBeInTheDocument();
  });

  it("answers a request", async () => {
    const onAction = vi.fn(async () => {});
    render(wrap(<GuildPage {...GUILD_PAGE.officer} onAction={onAction} />));
    const first = within(screen.getByRole("region", { name: "Requests" })).getAllByRole("listitem")[0]!;
    await userEvent.click(within(first).getByRole("button", { name: "Accept" }));
    expect(onAction).toHaveBeenCalledWith({ type: "answer-request", applicant: GUILD_PAGE.officer.guild.requests![0]!.profile.address, accept: true });
  });
});

describe("GuildPage (#953) for a player outside", () => {
  it("shows no announcement, log or Leave; Join for an Open guild", async () => {
    const onAction = vi.fn(async () => {});
    render(wrap(<GuildPage {...GUILD_PAGE.join} onAction={onAction} />));
    expect(screen.queryByRole("region", { name: "Announcements" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Log" })).toBeNull();
    expect(button(/Leave/)).toBeNull();
    await userEvent.click(button("Join")!);
    expect(onAction).toHaveBeenCalledWith({ type: "join" });
  });

  it("sends a request with its optional message", async () => {
    const onAction = vi.fn(async () => {});
    render(wrap(<GuildPage {...GUILD_PAGE.request} onAction={onAction} />));
    await userEvent.click(button("Request to join")!);
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByRole("textbox"), "Hello");
    await userEvent.click(within(dialog).getByRole("button", { name: "Send request" }));
    expect(onAction).toHaveBeenCalledWith({ type: "request", message: "Hello" });
  });

  it("says why a full guild, unmet requirements or Invite only keep them out", () => {
    const { unmount } = render(wrap(<GuildPage {...GUILD_PAGE.full} />));
    expect(screen.getByText(REFUSALS.full)).toBeInTheDocument();
    expect(button("Join")).toBeNull();
    unmount();
    const second = render(wrap(<GuildPage {...GUILD_PAGE.requirementsNotMet} />));
    expect(screen.getByText(REFUSALS["level-low"])).toBeInTheDocument();
    second.unmount();
    render(wrap(<GuildPage {...GUILD_PAGE.inviteOnly} />));
    expect(screen.getByText(REFUSALS["invite-only"])).toBeInTheDocument();
  });

  it("answers an invitation, and cancels a request", async () => {
    const onAction = vi.fn(async () => {});
    const { unmount } = render(wrap(<GuildPage {...GUILD_PAGE.invited} onAction={onAction} />));
    await userEvent.click(button("Accept")!);
    expect(onAction).toHaveBeenCalledWith({ type: "answer-invitation", accept: true, leaving: false });
    unmount();
    render(wrap(<GuildPage {...GUILD_PAGE.requested} onAction={onAction} />));
    await userEvent.click(button("Cancel the request")!);
    expect(onAction).toHaveBeenCalledWith({ type: "cancel-request" });
  });

  it("asks to leave the current guild before accepting another's invitation", async () => {
    const onAction = vi.fn(async () => {});
    render(wrap(<GuildPage {...GUILD_PAGE.invited} apply={{ kind: "invited", leaving: "Hollow Oak" }} onAction={onAction} />));
    await userEvent.click(button("Accept")!);
    const dialog = await screen.findByRole("dialog", { name: "Leave Hollow Oak?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Leave and join" }));
    expect(onAction).toHaveBeenCalledWith({ type: "answer-invitation", accept: true, leaving: true });
  });
});

describe("guildApply (#953)", () => {
  const player = GUILD_FINDER.guildless.player;
  const ranking = GUILD_FINDER.guildless.ranking.guilds!;
  const named = (name: string) => ranking.find((g) => g.name === name)!;
  it("joins an Open guild, requests a By-request one, and says why not otherwise", () => {
    expect(guildApply(named("Ashford Lanterns"), player, { level: 1, crowns: 0 })).toEqual({ kind: "join" });
    expect(guildApply(named("Hollow Oak"), player, { level: 9, crowns: 900 })).toEqual({ kind: "request" });
    expect(guildApply(named("Hollow Oak"), player, { level: 9, crowns: 10 })).toEqual({ kind: "blocked", reason: REFUSALS["crowns-low"] });
    expect(guildApply(named("Iron Quay Wardens"), player, null)).toEqual({ kind: "blocked", reason: REFUSALS["invite-only"] });
    expect(guildApply({ ...named("Ashford Lanterns"), members: 50 }, player, null)).toEqual({ kind: "blocked", reason: REFUSALS.full });
  });
  it("answers an invitation, cancels a request, and refuses a player in a guild", () => {
    const invited = GUILD_FINDER.invited.player;
    expect(guildApply(invited.invitations[0]!.guild, invited, { level: 1, crowns: 0 })).toEqual({ kind: "invited", leaving: null });
    const requested = GUILD_FINDER.requested.player;
    expect(guildApply(requested.request!.guild, requested, null)).toEqual({ kind: "requested" });
    expect(guildApply(named("Thistle Watch"), requested, { level: 20, crowns: 2_000 })).toEqual({ kind: "join" });
    expect(guildApply(named("Hollow Oak"), { ...player, guild: GUILD_PAGE.member.guild }, null)).toEqual({ kind: "blocked", reason: REFUSALS["in-guild"] });
  });
});

describe("GuildFinder and GuildCard (#953)", () => {
  it("creates a guild of a join type, the name checked first", async () => {
    const onAction = vi.fn(async () => {});
    render(wrap(<GuildFinder {...GUILD_FINDER.guildless} onAction={onAction} />));
    await userEvent.click(button("Create a guild")!);
    const sheet = await screen.findByRole("dialog", { name: "Create a guild" });
    const create = within(sheet).getByRole("button", { name: "Create the guild" });
    await userEvent.type(within(sheet).getByRole("textbox", { name: "Name" }), "Ab");
    expect(create).toBeDisabled();
    expect(within(sheet).getByText(REFUSALS["name-length"])).toBeInTheDocument();
    await userEvent.type(within(sheet).getByRole("textbox", { name: "Name" }), "bey Road");
    await userEvent.click(within(sheet).getByRole("radio", { name: "Invite only" }));
    await userEvent.click(within(sheet).getByRole("radio", { name: "castle" }));
    await userEvent.click(create);
    expect(onAction).toHaveBeenCalledWith({ type: "create", draft: expect.objectContaining({ name: "Abbey Road", joinType: "invite", emblem: expect.objectContaining({ icon: 5 }) }) });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("shows the invitations and the request, with their answers", async () => {
    const onAction = vi.fn(async () => {});
    const { unmount } = render(wrap(<GuildFinder {...GUILD_FINDER.invited} onAction={onAction} />));
    const invitation = screen.getByRole("region", { name: "Invitations" });
    expect(invitation).toHaveTextContent("Iron Quay Wardens");
    await userEvent.click(within(invitation).getByRole("button", { name: "Decline" }));
    expect(onAction).toHaveBeenCalledWith({ type: "answer-invitation", guild: GUILD_FINDER.invited.player.invitations[0]!.guild.id, accept: false, leaving: false });
    unmount();
    render(wrap(<GuildFinder {...GUILD_FINDER.requested} onAction={onAction} />));
    await userEvent.click(within(screen.getByRole("region", { name: "Your request" })).getByRole("button", { name: "Cancel" }));
    expect(onAction).toHaveBeenCalledWith({ type: "cancel-request" });
  });

  it("lists the suggestions or the ranking, the search's results, and sets the filters", async () => {
    const onFiltersChange = vi.fn();
    const { unmount } = render(wrap(<GuildFinder {...GUILD_FINDER.guildless} onFiltersChange={onFiltersChange} />));
    expect(screen.getAllByRole("button", { name: /#/ }).length).toBe(GUILD_FINDER.guildless.suggested.guilds!.length);
    await userEvent.click(screen.getByRole("radio", { name: /Ranking/ }));
    expect(screen.getAllByRole("button", { name: /#/ }).length).toBe(GUILD_FINDER.guildless.ranking.guilds!.length);
    await userEvent.click(screen.getByRole("radio", { name: "By request" }));
    expect(onFiltersChange).toHaveBeenCalledWith({ joinType: "request", meets: false, size: "any" });
    await userEvent.click(screen.getByRole("switch", { name: "Requirements I meet" }));
    expect(onFiltersChange).toHaveBeenCalledWith({ joinType: null, meets: true, size: "any" });
    unmount();
    render(wrap(<GuildFinder {...GUILD_FINDER.none} />));
    expect(screen.getByText("No guild found.")).toBeInTheDocument();
  });

  it("a card says why a player cannot join: full, or a requirement", () => {
    const thistle = GUILD_FINDER.guildless.ranking.guilds!.find((g) => g.name === "Thistle Watch")!;
    const { unmount } = render(wrap(<GuildCard guild={thistle} player={{ level: 1, crowns: 0 }} />));
    expect(screen.getByRole("button")).toHaveTextContent(REFUSALS["level-low"]);
    unmount();
    render(wrap(<GuildCard guild={GUILD_PAGE.full.guild} player={{ level: 20, crowns: 2_000 }} />));
    expect(screen.getByRole("button")).toHaveTextContent(REFUSALS.full);
    expect(screen.getByRole("img", { name: "50 of 50 members" })).toBeInTheDocument();
  });
});

describe("the profile's guild parts (#953)", () => {
  const names = () => screen.queryAllByRole("button").map((b) => b.textContent);
  it("shows each rank only the actions it allows", () => {
    const cases: [keyof typeof GUILD_ACTIONS, string[]][] = [
      ["leaderOnMember", ["Promote to Officer", "Make leader", "Kick"]],
      ["leaderOnOfficer", ["Demote to Member", "Make leader", "Kick"]],
      ["officerOnMember", ["Kick"]],
      ["officerOnLeader", []],
      ["memberOnMember", []],
      ["invite", ["Invite to The Quarrymen"]],
    ];
    for (const [state, expected] of cases) {
      const { unmount } = render(wrap(<GuildMemberActions {...GUILD_ACTIONS[state]} />));
      expect(names(), state).toEqual(expected);
      unmount();
    }
  });

  it("holds an officer's next kick for 20 minutes, and an invitation sent once", () => {
    const { unmount } = render(wrap(<GuildMemberActions {...GUILD_ACTIONS.officerCooldown} />));
    expect(button(/Kick again in 5 min/)).toBeDisabled();
    unmount();
    render(wrap(<GuildMemberActions {...GUILD_ACTIONS.invited} />));
    expect(button("Invited to The Quarrymen")).toBeDisabled();
  });

  it("kicks with a reason, after confirming", async () => {
    const onAction = vi.fn(async () => {});
    render(wrap(<GuildMemberActions {...GUILD_ACTIONS.leaderOnMember} onAction={onAction} />));
    await userEvent.click(button("Kick")!);
    const dialog = await screen.findByRole("dialog", { name: /^Kick / });
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Reason (optional)" }), "Inactive");
    await userEvent.click(within(dialog).getByRole("button", { name: "Kick" }));
    expect(onAction).toHaveBeenCalledWith({ type: "kick", reason: "Inactive" });
  });

  it("shows the guild's emblem, name and rank, opening its page", async () => {
    const onOpen = vi.fn();
    render(wrap(<GuildLine badge={GUILD_BADGE.officer} onOpen={onOpen} />));
    await userEvent.click(screen.getByRole("button", { name: "The Quarrymen, Officer" }));
    expect(onOpen).toHaveBeenCalledWith(GUILD_BADGE.officer.id);
  });

  it("words every log line", () => {
    const base = { at: 0, actor: "0x1", actorName: "Ann", target: "0x2", targetName: "Bo", reason: null };
    expect(logLine({ ...base, kind: "kicked", reason: "Rude" })).toBe("Ann kicked Bo: “Rude”");
    expect(logLine({ ...base, kind: "leader", target: "0x1" })).toBe("Ann became the leader");
    expect(logLine({ ...base, kind: "promoted" })).toBe("Ann promoted Bo to Officer");
    expect(GUILD_RANK.leader).toBeGreaterThan(GUILD_RANK.officer);
  });
});
