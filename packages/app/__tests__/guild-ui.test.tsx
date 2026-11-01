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
import { openingGuildTab } from "../src/routes/guild-tab";
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

/** The guild page's tabs, as their labels read. */
const tabNames = () => within(screen.getByRole("tablist", { name: "Guild" })).getAllByRole("tab").map((t) => t.textContent);
/** Opens the header's menu (a sheet); its items, by their names. */
async function menu() {
  await userEvent.click(screen.getByRole("button", { name: "Guild menu" }));
  const sheet = await screen.findByRole("dialog", { name: "Guild menu" });
  return within(sheet).getAllByRole("listitem").map((i) => within(i).getByRole("button").textContent);
}
/** An item of the open menu. */
const item = (name: string | RegExp) => within(screen.getByRole("dialog", { name: "Guild menu" })).getByRole("button", { name });
const tab = (name: string) => userEvent.click(screen.getByRole("tab", { name: new RegExp(`^${name}`) }));

describe("GuildPage (#953, #973): the header, the menu and the tabs; each rank sees only its own", () => {
  it("a Member: the header with Chat; Announcements, Members and Log, on Members the first time; the menu's Find guilds and Leave", async () => {
    const onOpenChat = vi.fn();
    render(wrap(<GuildPage {...GUILD_PAGE.member} onOpenChat={onOpenChat} onFindGuilds={vi.fn()} />));
    const header = screen.getByRole("heading", { level: 2, name: "The Quarrymen" }).closest("header")!;
    expect(header).toHaveTextContent("Member");
    expect(header).toHaveTextContent(/\d+\/50/);
    expect(header).toHaveTextContent("Requirements:");
    expect(tabNames()).toEqual(["Announcements", "Members", "Log"]);
    expect(screen.getByRole("tab", { name: "Members" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("region", { name: "Members" })).toBeInTheDocument();
    await userEvent.click(within(header).getByRole("button", { name: "Chat" }));
    expect(onOpenChat).toHaveBeenCalled();
    expect(await menu()).toEqual(["Find guilds", "Leave the guild"]);
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await tab("Announcements");
    expect(screen.getByRole("region", { name: "Announcements" })).toBeInTheDocument();
    expect(button(/Post/)).toBeNull();
    expect(button(/Edit/)).toBeNull();
    await tab("Log");
    expect(screen.getByRole("region", { name: "Log" })).toBeInTheDocument();
  });

  it("opens on Announcements while one is unread, badged", () => {
    render(wrap(<GuildPage {...GUILD_PAGE.member} unread={2} />));
    expect(screen.getByRole("tab", { name: "Announcements, 2 waiting" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("region", { name: "Announcements" })).toBeInTheDocument();
  });

  it("an Officer: the Requests tab badged, the requests then the invitations sent; Post, their own announcements only; Invite in the menu, no settings", async () => {
    const onInvite = vi.fn();
    render(wrap(<GuildPage {...GUILD_PAGE.officer} onInvite={onInvite} onFindGuilds={vi.fn()} />));
    expect(tabNames()).toEqual(["Announcements", "Members", "Requests2", "Log"]);
    await tab("Requests");
    expect(within(screen.getByRole("region", { name: "Requests" })).getByRole("heading")).toHaveTextContent("Requests2");
    expect(within(screen.getByRole("region", { name: "Invitations sent" })).getByRole("heading")).toHaveTextContent("Invitations sent1");
    await tab("Announcements");
    expect(button(/Post/)).toBeInTheDocument();
    // The officer wrote the second announcement only: one Edit.
    expect(screen.getAllByRole("button", { name: /Edit/ })).toHaveLength(1);
    expect(await menu()).toEqual(["Invite a player", "Find guilds", "Leave the guild"]);
    await userEvent.click(item("Invite a player"));
    expect(onInvite).toHaveBeenCalled();
  });

  it("the Leader: every announcement's Edit and Delete; the menu's Guild settings; Leave waits for another leader", async () => {
    render(wrap(<GuildPage {...GUILD_PAGE.leader} defaultTab="announcements" onInvite={vi.fn()} onFindGuilds={vi.fn()} />));
    expect(screen.getAllByRole("button", { name: /Edit/ })).toHaveLength(GUILD_PAGE.leader.guild.announcements!.length);
    expect(screen.getAllByRole("button", { name: /Delete/ })).toHaveLength(GUILD_PAGE.leader.guild.announcements!.length);
    const items = await menu();
    expect(items.slice(0, 3)).toEqual(["Invite a player", "Guild settings", "Find guilds"]);
    expect(item("Leave the guild")).toBeDisabled();
    expect(within(screen.getByRole("dialog", { name: "Guild menu" })).getByText(REFUSALS["leader-must-transfer"])).toBeInTheDocument();
    await userEvent.click(item("Guild settings"));
    expect(await screen.findByRole("dialog", { name: /settings/i })).toBeInTheDocument();
  });

  it("a leader alone disbands the guild from the menu, after confirming", async () => {
    const onAction = vi.fn(async () => {});
    render(wrap(<GuildPage {...GUILD_PAGE.alone} onAction={onAction} />));
    await menu();
    await userEvent.click(item("Disband the guild"));
    const dialog = await screen.findByRole("dialog", { name: "Disband Ashford Lanterns?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Disband" }));
    expect(onAction).toHaveBeenCalledWith({ type: "leave" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("lists the members by rank, then crowns; a row shows the Profile, and only the actions the viewer's rank allows", async () => {
    const onOpenPlayer = vi.fn();
    const { unmount } = render(wrap(<GuildPage {...GUILD_PAGE.member} onOpenPlayer={onOpenPlayer} />));
    const rows = within(screen.getByRole("region", { name: "Members" })).getAllByRole("button");
    expect(rows[0]).toHaveTextContent("Leader");
    const roster = GUILD_PAGE.member.guild.roster;
    expect(roster.map((m) => m.rank)).toEqual([...roster.map((m) => m.rank)].sort((a, b) => b - a));
    // A Member on the Leader: the Profile only.
    await userEvent.click(rows[0]!);
    let sheet = await screen.findByRole("dialog", { name: roster[0]!.profile.name! });
    expect(within(sheet).queryByRole("button", { name: /Promote|Demote|Kick|Make leader/ })).toBeNull();
    await userEvent.click(within(sheet).getByRole("button", { name: "Profile" }));
    expect(onOpenPlayer).toHaveBeenCalledWith(roster[0]!.profile.address);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    unmount();

    // The Leader on a Member: Promote, Make leader, Kick; on an Officer: Demote instead of Promote.
    const leader = GUILD_PAGE.leader.guild.roster;
    const member = leader.find((m) => m.rank === GUILD_RANK.member)!;
    const officer = leader.find((m) => m.rank === GUILD_RANK.officer)!;
    const onAction = vi.fn(async () => {});
    render(wrap(<GuildPage {...GUILD_PAGE.leader} onAction={onAction} />));
    const members = screen.getByRole("region", { name: "Members" });
    await userEvent.click(within(members).getAllByRole("button").find((b) => b.textContent?.includes(officer.profile.name!))!);
    sheet = await screen.findByRole("dialog", { name: officer.profile.name! });
    expect(within(sheet).getAllByRole("button").map((b) => b.textContent)).toEqual(expect.arrayContaining(["Profile", "Demote to Member", "Make leader", "Kick"]));
    expect(within(sheet).queryByRole("button", { name: "Promote to Officer" })).toBeNull();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await userEvent.click(within(members).getAllByRole("button").find((b) => b.textContent?.includes(member.profile.name!))!);
    sheet = await screen.findByRole("dialog", { name: member.profile.name! });
    await userEvent.click(within(sheet).getByRole("button", { name: "Promote to Officer" }));
    const confirm = await screen.findByRole("dialog", { name: /^Promote / });
    await userEvent.click(within(confirm).getByRole("button", { name: "Promote to Officer" }));
    expect(onAction).toHaveBeenCalledWith({ type: "member", target: member.profile.address, action: { type: "promote" } });
    // Done, the row's sheet closes.
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("an Officer's row of a Member: Profile and Kick only", async () => {
    const member = GUILD_PAGE.officer.guild.roster.find((m) => m.rank === GUILD_RANK.member)!;
    render(wrap(<GuildPage {...GUILD_PAGE.officer} initialMember={member.profile.address} />));
    const sheet = await screen.findByRole("dialog", { name: member.profile.name! });
    expect(within(sheet).getAllByRole("button", { name: /Profile|Promote|Demote|Kick|Make leader/ }).map((b) => b.textContent)).toEqual(["Profile", "Kick"]);
  });

  it("posts an announcement through its dialog, and keeps the dialog with why when refused", async () => {
    const onAction = vi.fn(async () => Promise.reject(new GuildRefusedError("announcement-length")));
    render(wrap(<GuildPage {...GUILD_PAGE.officer} defaultTab="announcements" onAction={onAction} />));
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
    render(wrap(<GuildPage {...GUILD_PAGE.officer} defaultTab="requests" onAction={onAction} />));
    const first = within(screen.getByRole("region", { name: "Requests" })).getAllByRole("listitem")[0]!;
    await userEvent.click(within(first).getByRole("button", { name: "Accept" }));
    expect(onAction).toHaveBeenCalledWith({ type: "answer-request", applicant: GUILD_PAGE.officer.guild.requests![0]!.profile.address, accept: true });
  });
});

describe("openingGuildTab (#973)", () => {
  it("opens on Announcements while one is unread, else on the last tab used, the first time on Members", () => {
    expect(openingGuildTab(1, false, "log")).toBe("announcements");
    expect(openingGuildTab(0, false, null)).toBe("members");
    expect(openingGuildTab(0, false, "log")).toBe("log");
    expect(openingGuildTab(0, true, "requests")).toBe("requests");
    // Requests is an officer's: anyone else opens on Members.
    expect(openingGuildTab(0, false, "requests")).toBe("members");
  });
});

describe("GuildPage (#953) for a player outside", () => {
  it("shows the header and the members, no tab, Chat or menu; Join for an Open guild; a row opens the member's profile", async () => {
    const onAction = vi.fn(async () => {});
    const onOpenPlayer = vi.fn();
    render(wrap(<GuildPage {...GUILD_PAGE.join} onAction={onAction} onOpenPlayer={onOpenPlayer} />));
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("region", { name: "Announcements" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Log" })).toBeNull();
    expect(button("Chat")).toBeNull();
    expect(button("Guild menu")).toBeNull();
    expect(button(/Leave/)).toBeNull();
    await userEvent.click(within(screen.getByRole("region", { name: "Members" })).getAllByRole("button")[0]!);
    expect(onOpenPlayer).toHaveBeenCalledWith(GUILD_PAGE.join.guild.roster[0]!.profile.address);
    expect(screen.queryByRole("dialog")).toBeNull();
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

  it("takes any whole number of crowns as a requirement, not only multiples of 50", async () => {
    const onAction = vi.fn(async () => {});
    render(wrap(<GuildFinder {...GUILD_FINDER.guildless} onAction={onAction} />));
    await userEvent.click(button("Create a guild")!);
    const sheet = await screen.findByRole("dialog", { name: "Create a guild" });
    await userEvent.type(within(sheet).getByRole("textbox", { name: "Name" }), "Review Guild");
    const crowns = within(sheet).getByRole("spinbutton", { name: "Minimum crowns" }) as HTMLInputElement;
    await userEvent.clear(crowns);
    await userEvent.type(crowns, "125");
    expect(crowns.validity.valid).toBe(true);
    expect(crowns.closest("form")!.checkValidity()).toBe(true);
    await userEvent.click(within(sheet).getByRole("button", { name: "Create the guild" }));
    expect(onAction).toHaveBeenCalledWith({ type: "create", draft: expect.objectContaining({ requirements: { level: 0, crowns: 125 } }) });
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

  it("invites only after confirming", async () => {
    const onAction = vi.fn(async () => {});
    render(wrap(<GuildMemberActions {...GUILD_ACTIONS.invite} onAction={onAction} />));
    await userEvent.click(button("Invite to The Quarrymen")!);
    const dialog = await screen.findByRole("dialog", { name: /^Invite .* to The Quarrymen\?$/ });
    expect(onAction).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: "Invite" }));
    expect(onAction).toHaveBeenCalledWith({ type: "invite" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
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
