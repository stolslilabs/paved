import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { FollowProfileActions } from "../src/components/containers/follow-profile";
import { FollowResultButton } from "../src/components/containers/follow-result-button";
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

  it("shows the Friend or Follows you mark and both counts on the profile", () => {
    const { rerender } = render(wrap(<PublicProfileSheet state={PUBLIC_PROFILES.online} now={MOCK_NOW} open onOpenChange={() => {}} follow={FOLLOW_STATUS.friend} />));
    const sheet = screen.getByRole("dialog");
    expect(within(sheet).getByText("Friend")).toBeInTheDocument();
    expect(within(sheet).getByText("Followers").nextSibling).toHaveTextContent("15");
    expect(within(sheet).getByText("Following").nextSibling).toHaveTextContent("5");
    rerender(wrap(<PublicProfileSheet state={PUBLIC_PROFILES.online} now={MOCK_NOW} open onOpenChange={() => {}} follow={FOLLOW_STATUS.followsYou} />));
    expect(within(screen.getByRole("dialog")).getByText("Follows you")).toBeInTheDocument();
    rerender(wrap(<PublicProfileSheet state={PUBLIC_PROFILES.online} now={MOCK_NOW} open onOpenChange={() => {}} />));
    expect(within(screen.getByRole("dialog")).queryByText("Followers")).toBeNull();
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

describe("the Friends tab's panel (#954)", () => {
  it("counts each list, marks the new followers, and offers Follow back and Remove only to followers", async () => {
    const onAction = vi.fn(async () => {});
    const onListChange = vi.fn();
    const { rerender } = render(wrap(<FriendsPanel {...FRIENDS_TAB.friends} onAction={onAction} onListChange={onListChange} />));
    expect(screen.getByRole("radio", { name: "Friends, 4" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Following, 6" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Followers, 7, 2 new" })).toBeInTheDocument();
    const friends = screen.getByRole("region", { name: "Friends" });
    expect(within(friends).getAllByRole("button", { name: /^Unfollow / })).toHaveLength(4);
    expect(within(friends).queryByRole("button", { name: /^Remove / })).toBeNull();
    // Online first: the first two rows say Online.
    expect(within(friends).getAllByRole("listitem").slice(0, 2).every((li) => li.textContent?.includes("Online"))).toBe(true);
    await userEvent.click(screen.getByRole("radio", { name: /^Followers/ }));
    expect(onListChange).toHaveBeenLastCalledWith("followers");
    rerender(wrap(<FriendsPanel {...FRIENDS_TAB.newFollowers} onAction={onAction} onListChange={onListChange} />));
    const followers = screen.getByRole("region", { name: "Followers" });
    expect(within(followers).getAllByText("New")).toHaveLength(2);
    expect(within(followers).getAllByRole("button", { name: /^Remove / })).toHaveLength(7);
    // Follow back only for those the player does not follow: the three followers who are not friends.
    const back = within(followers).getAllByRole("button", { name: /^Follow back / });
    expect(back).toHaveLength(3);
    await userEvent.click(back[0]!);
    expect(onAction).toHaveBeenLastCalledWith("follow", expect.any(String));
  });

  it("lists the blocked players in the tab's menu, with Unblock", async () => {
    const onAction = vi.fn(async () => {});
    render(wrap(<FriendsPanel {...FRIENDS_TAB.blocked} onAction={onAction} />));
    const sheet = await screen.findByRole("dialog", { name: "Blocked players" });
    const unblock = within(sheet).getByRole("button", { name: /^Unblock / });
    await userEvent.click(unblock);
    expect(onAction).toHaveBeenLastCalledWith("unblock", FRIENDS_TAB.blocked.lists!.blocked[0]!.profile.address);
  });
});
