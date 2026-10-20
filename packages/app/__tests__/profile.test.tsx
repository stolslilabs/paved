import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, domMax } from "motion/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { avatarInitial, PlayerAvatar } from "../src/components/elements/player-avatar";
import { ProfileProvider, ProfileSlot, type ProfileValue } from "../src/components/containers/profile-context";
import { ProfileSheet } from "../src/components/containers/profile-sheet";
import { TabPage } from "../src/components/containers/tab-page";
import { HomeScene } from "../src/components/scenes/home-scene";
import { PLAYER_ID } from "../src/mocks/players";
import { HOME, PROFILE } from "../src/mocks/scenes";

const wrap = (ui: ReactNode) => <LazyMotion features={domMax}>{ui}</LazyMotion>;
const withProfile = (value: ProfileValue, ui: ReactNode) => wrap(<ProfileProvider value={value}>{ui}</ProfileProvider>);

describe("PlayerAvatar (#624)", () => {
  it("shows the name's initial, else the address's first digit", () => {
    expect(avatarInitial({ name: "bal7hazar", address: PLAYER_ID })).toBe("B");
    expect(avatarInitial({ name: null, address: PLAYER_ID })).toBe("0");
    const { container } = render(<PlayerAvatar player={{ name: "ada", address: PLAYER_ID }} />);
    expect(container).toHaveTextContent("A");
  });

  it("a guest is a silhouette, a pending wallet a placeholder", () => {
    const { container, rerender } = render(<PlayerAvatar player={null} />);
    expect(container.querySelector("[data-slot=player-avatar]")).toHaveTextContent("");
    rerender(<PlayerAvatar player={null} loading />);
    expect(container.querySelector("[data-slot=skeleton]")).not.toBeNull();
  });
});

describe("ProfileSheet (#624)", () => {
  it("connected: the name, the address to copy, the figures, Edit avatar not yet, Disconnect", async () => {
    const onCopy = vi.fn(async () => {});
    const onDisconnect = vi.fn();
    render(wrap(<ProfileSheet open onOpenChange={() => {}} state={PROFILE.connected} onCopy={onCopy} onDisconnect={onDisconnect} />));
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByRole("heading", { name: "bal7hazar" })).toBeInTheDocument();
    expect(within(sheet).getByText("0x05f1…6e7f")).toBeInTheDocument();
    expect(within(sheet).getByText("21")).toBeInTheDocument();
    expect(within(sheet).getByText("1,840")).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: /Edit avatar/ })).toBeDisabled();
    await userEvent.click(within(sheet).getByRole("button", { name: /Copy/ }));
    expect(onCopy).toHaveBeenCalledWith(PLAYER_ID);
    expect(await within(sheet).findByRole("button", { name: /Copied/ })).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole("button", { name: /Disconnect/ }));
    expect(onDisconnect).toHaveBeenCalledOnce();
  });

  it("a guest: the Training line and Connect, nothing to copy", async () => {
    const onConnect = vi.fn();
    render(wrap(<ProfileSheet open onOpenChange={() => {}} state={PROFILE.guest} onConnect={onConnect} />));
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByText("Training is free. Connect to enter the Challenge.")).toBeInTheDocument();
    expect(within(sheet).queryByRole("button", { name: /Copy/ })).toBeNull();
    await userEvent.click(within(sheet).getByRole("button", { name: "Connect" }));
    expect(onConnect).toHaveBeenCalledOnce();
  });
});

describe("ProfileSlot (#624)", () => {
  const value = (state: ProfileValue["state"]): ProfileValue => ({ state, onConnect: vi.fn(), onDisconnect: vi.fn(), onCopy: vi.fn(async () => {}) });

  it("draws nothing without the shell's profile", () => {
    render(wrap(<ProfileSlot />));
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("a tap opens the sheet in its own chunk; Disconnect closes it", async () => {
    const v = value(PROFILE.connected);
    render(withProfile(v, <ProfileSlot />));
    expect(screen.queryByRole("dialog")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Profile: bal7hazar" }));
    const sheet = await screen.findByRole("dialog");
    await userEvent.click(within(sheet).getByRole("button", { name: /Disconnect/ }));
    expect(v.onDisconnect).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("is at the top left of a tab page and in the navigation; Back takes its place on a sub-page", () => {
    const { rerender } = render(withProfile(value(PROFILE.guest), <TabPage tab="vault" title="Vault">x</TabPage>));
    const avatars = screen.getAllByRole("button", { name: "Profile: guest" });
    expect(avatars).toHaveLength(2);
    expect(within(screen.getByRole("navigation", { name: "Main" })).getByRole("button", { name: "Profile: guest" })).toBeInTheDocument();
    rerender(withProfile(value(PROFILE.guest), <TabPage tab="settings" title="Themes" onBack={() => {}}>x</TabPage>));
    expect(screen.getAllByRole("button", { name: "Profile: guest" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
  });

  it("Home: the avatar replaces the player card", () => {
    render(withProfile(value(PROFILE.connected), <HomeScene {...HOME.connected} />));
    expect(screen.getAllByRole("button", { name: "Profile: bal7hazar" })).toHaveLength(2);
    expect(screen.queryByText(/games · best/)).toBeNull();
    expect(screen.queryByText("Playing as a guest")).toBeNull();
  });
});
