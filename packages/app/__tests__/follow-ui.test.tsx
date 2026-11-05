import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { FollowProfileActions } from "../src/components/containers/follow-profile";
import { FollowResultButton } from "../src/components/containers/follow-result-button";
import { GuildMemberActions } from "../src/components/containers/guild-profile";
import { GUILD_ACTIONS } from "../src/mocks/guilds";
import { FriendsPanel } from "../src/components/containers/friends-panel";
import { PublicProfileSheet } from "../src/components/containers/public-profile-sheet";
import { FollowRefusedError } from "../src/data/social-source";
import { FOLLOW_ACTIONS, FOLLOW_STATUS, FRIENDS_TAB } from "../src/mocks/follows";
import { MOCK_NOW } from "../src/mocks/clock";
import { PUBLIC_PROFILES } from "../src/mocks/social";

// The follows' views (#954): the profile's actions in each state, the marks and counts, a hidden block's refusal, the search's
// button, and the Friends tab's lists, rows and menu.

const wrap = (ui: ReactNode) => (
  <LazyMotion features={domMax}>
    <MotionConfig reducedMotion="always">{ui}</MotionConfig>
  </LazyMotion>
);

describe("the profile's follow actions (#954)", () => {
  it("offers Follow, Follow back to a follower, and Following, which unfollows once confirmed", async () => {
    const onAction = vi.fn(async () => {});
    const { rerender } = render(wrap(<FollowProfileActions {...FOLLOW_ACTIONS.follow} onAction={onAction} />));
    await userEvent.click(screen.getByRole("button", { name: "Follow" }));
    expect(onAction).toHaveBeenLastCalledWith("follow");
    rerender(wrap(<FollowProfileActions {...FOLLOW_ACTIONS.followBack} onAction={onAction} />));
    expect(screen.getByRole("button", { name: "Follow back" })).toBeInTheDocument();
    rerender(wrap(<FollowProfileActions {...FOLLOW_ACTIONS.friend} onAction={onAction} />));
    await userEvent.click(screen.getByRole("button", { name: /^Following .*: unfollow$/ }));
    const dialog = await screen.findByRole("dialog", { name: /^Unfollow / });
    expect(dialog).toHaveTextContent("You stop being friends");
    await userEvent.click(within(dialog).getByRole("button", { name: "Unfollow" }));
    await waitFor(() => expect(onAction).toHaveBeenLastCalledWith("unfollow"));
  });

  it("blocks once confirmed, and a blocked player shows only Unblock", async () => {
    const onAction = vi.fn(async () => {});
    const { rerender } = render(wrap(<FollowProfileActions {...FOLLOW_ACTIONS.follow} onAction={onAction} />));
    await userEvent.click(screen.getByRole("button", { name: "Block" }));
    const dialog = await screen.findByRole("dialog", { name: /^Block / });
    expect(dialog).toHaveTextContent("They are not told.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Block" }));
    await waitFor(() => expect(onAction).toHaveBeenLastCalledWith("block"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    rerender(wrap(<FollowProfileActions {...FOLLOW_ACTIONS.blocking} onAction={onAction} />));
    expect(screen.queryByRole("button", { name: "Follow" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Block" })).toBeNull();
    expect(screen.getByRole("button", { name: "Unblock" })).toBeInTheDocument();
  });

  it("says only that a follow is not available when the other player blocks the viewer", async () => {
    render(wrap(<FollowProfileActions {...FOLLOW_ACTIONS.follow} onAction={() => Promise.reject(new FollowRefusedError("blocked"))} />));
    await userEvent.click(screen.getByRole("button", { name: "Follow" }));
    expect(await screen.findByText("This is not available.")).toBeInTheDocument();
    // Nothing tells them of the block: no word of it but the viewer's own Block button.
    expect(document.body.textContent?.replace(/Block/g, "")).not.toMatch(/block/i);
  });

  it("shows the Friends or Follows you mark and both counts on the profile", () => {
    const { rerender } = render(wrap(<PublicProfileSheet state={PUBLIC_PROFILES.online} now={MOCK_NOW} open onOpenChange={() => {}} follow={FOLLOW_STATUS.friend} />));
    const sheet = screen.getByRole("dialog");
    // FRIENDS-PAGE: the book's "Friends" beside the painted handshake.
    expect(within(sheet).getByText("Friends")).toBeInTheDocument();
    expect(within(sheet).getByText("Followers").nextSibling).toHaveTextContent("15");
    expect(within(sheet).getByText("Following").nextSibling).toHaveTextContent("5");
    rerender(wrap(<PublicProfileSheet state={PUBLIC_PROFILES.online} now={MOCK_NOW} open onOpenChange={() => {}} follow={FOLLOW_STATUS.followsYou} />));
    expect(within(screen.getByRole("dialog")).getByText("Follows you")).toBeInTheDocument();
    rerender(wrap(<PublicProfileSheet state={PUBLIC_PROFILES.online} now={MOCK_NOW} open onOpenChange={() => {}} />));
    expect(within(screen.getByRole("dialog")).queryByText("Followers")).toBeNull();
  });
});

describe("the guild's actions on a profile, as the Profile's tiles (FRIENDS-PAGE)", () => {
  it("names each tile as its button (Promote to Officer, Make leader, Kick), its word short under the icon", async () => {
    const onAction = vi.fn(async () => {});
    render(wrap(<GuildMemberActions {...GUILD_ACTIONS.leaderOnMember} look="tiles" onAction={onAction} />));
    const tiles = screen.getAllByRole("button");
    expect(tiles.map((b) => b.getAttribute("aria-label"))).toEqual(["Promote to Officer", "Make leader", "Kick"]);
    expect(tiles.map((b) => b.textContent)).toEqual(["Promote", "Leader", "Kick"]);
    await userEvent.click(tiles[1]!);
    const dialog = await screen.findByRole("dialog", { name: /the leader\?$/ });
    await userEvent.click(within(dialog).getByRole("button", { name: "Make leader" }));
    await waitFor(() => expect(onAction).toHaveBeenLastCalledWith({ type: "make-leader" }));
  });
});

describe("the search's Follow (#954)", () => {
  it("follows, says why when refused, and shows Following or Blocked", async () => {
    const onFollow = vi.fn(() => Promise.reject(new FollowRefusedError("limit")));
    const { rerender } = render(wrap(<FollowResultButton state="follow" name="Wren" onFollow={onFollow} />));
    await userEvent.click(screen.getByRole("button", { name: "Follow Wren" }));
    expect(await screen.findByText(/You follow 500 players, the most/)).toBeInTheDocument();
    rerender(wrap(<FollowResultButton state="following" name="Wren" />));
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Following")).toBeInTheDocument();
    rerender(wrap(<FollowResultButton state="blocking" name="Wren" />));
    expect(screen.getByText("Blocked")).toBeInTheDocument();
  });
});

describe("the friends page's panel (#954, #973)", () => {
  it("counts each list, marks the new followers, and offers Follow back or Following, as the book's rows (FRIENDS-PAGE)", async () => {
    const onAction = vi.fn(async () => {});
    const onListChange = vi.fn();
    const { rerender } = render(wrap(<FriendsPanel {...FRIENDS_TAB.friends} onAction={onAction} onListChange={onListChange} />));
    // The friends page's three tabs (#973; a toggle before).
    expect(screen.getByRole("tab", { name: "Friends, 4" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Following, 6" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Followers, 7, 2 new" })).toBeInTheDocument();
    // The book's tabs: each word with its count.
    expect(screen.getByRole("tab", { name: "Friends, 4" })).toHaveTextContent("Friends4");
    const friends = screen.getByRole("region", { name: "Friends" });
    // The book's Friends rows: online or when last seen at their end, no button (Message and Following are on the profile).
    expect(within(friends).getAllByRole("listitem")).toHaveLength(4);
    expect(within(friends).getAllByRole("button").every((b) => /, level \d+, .+ league/.test(b.getAttribute("aria-label") ?? ""))).toBe(true);
    // Online first: the first two rows say Online.
    expect(within(friends).getAllByRole("listitem").slice(0, 2).every((li) => li.textContent?.includes("Online"))).toBe(true);
    expect(within(friends).getAllByRole("listitem")[2]).toHaveTextContent("3h ago");
    await userEvent.click(screen.getByRole("tab", { name: /^Followers/ }));
    expect(onListChange).toHaveBeenLastCalledWith("followers");
    rerender(wrap(<FriendsPanel {...FRIENDS_TAB.newFollowers} onAction={onAction} onListChange={onListChange} />));
    const followers = screen.getByRole("region", { name: "Followers" });
    // The owner's red dot on a new follower's portrait (in place of the book's New), said in the row's name.
    expect(followers.querySelectorAll("[data-slot=new-dot]")).toHaveLength(2);
    expect(within(followers).getAllByRole("button", { name: /, new follower$/ })).toHaveLength(2);
    // No Remove (the book's rows have none).
    expect(within(followers).queryByRole("button", { name: /^Remove / })).toBeNull();
    // Follow back only for those the player does not follow: the three followers who are not friends.
    const back = within(followers).getAllByRole("button", { name: /^Follow back / });
    expect(back).toHaveLength(3);
    // The four friends among them: Following, which unfollows.
    expect(within(followers).getAllByRole("button", { name: /^Following .*: unfollow$/ })).toHaveLength(4);
    // The new ones first.
    expect(within(followers).getAllByRole("listitem").slice(0, 2).every((li) => li.querySelector("[data-slot=new-dot]"))).toBe(true);
    await userEvent.click(back[0]!);
    expect(onAction).toHaveBeenLastCalledWith("follow", expect.any(String));
  });

  it("unfollows from the Following list once confirmed", async () => {
    const onAction = vi.fn(async () => {});
    render(wrap(<FriendsPanel {...FRIENDS_TAB.following} onAction={onAction} />));
    const following = screen.getByRole("region", { name: "Following" });
    const buttons = within(following).getAllByRole("button", { name: /^Following .*: unfollow$/ });
    expect(buttons).toHaveLength(6);
    await userEvent.click(buttons[0]!);
    const dialog = await screen.findByRole("dialog", { name: /^Unfollow / });
    expect(dialog).toHaveTextContent("You stop being friends");
    await userEvent.click(within(dialog).getByRole("button", { name: "Unfollow" }));
    await waitFor(() => expect(onAction).toHaveBeenLastCalledWith("unfollow", FRIENDS_TAB.following.lists!.following[0]!.profile.address));
  });

  it("lists the blocked players in the tab's menu, with Unblock", async () => {
    const onAction = vi.fn(async () => {});
    render(wrap(<FriendsPanel {...FRIENDS_TAB.blocked} onAction={onAction} />));
    const sheet = await screen.findByRole("dialog", { name: "Blocked players" });
    const unblock = within(sheet).getByRole("button", { name: /^Unblock / });
    await userEvent.click(unblock);
    expect(onAction).toHaveBeenLastCalledWith("unblock", FRIENDS_TAB.blocked.lists!.blocked[0]!.profile.address);
  });

  it("tells which followers are on screen, the new ones first, a page at a time", async () => {
    const onFollowersShown = vi.fn();
    const { lists } = FRIENDS_TAB.stress;
    render(wrap(<FriendsPanel {...FRIENDS_TAB.stress} onFollowersShown={onFollowersShown} />));
    const newOnes = new Set(lists!.followers.filter((r) => r.isNew).map((r) => r.profile.address));
    const first = onFollowersShown.mock.lastCall![0] as string[];
    expect(first).toHaveLength(20);
    expect(first.every((a) => newOnes.has(a))).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: /^Show more/ }));
    await waitFor(() => expect(onFollowersShown.mock.lastCall![0]).toHaveLength(40));
  });
});
