import { slow } from "../test-slow";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, domMax } from "motion/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_AVATAR, encodeAvatar } from "@paved/renderer";
import { avatarInitial, PlayerAvatar } from "../src/components/elements/player-avatar";
import { ProfileProvider, ProfileSlot, type ProfileValue } from "../src/components/containers/profile-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProfileSheet } from "../src/components/containers/profile-sheet";
import { DataProvider, type DataSources } from "../src/data/sources";
import { TabPage } from "../src/components/containers/tab-page";
import { HomeVillageScene } from "../src/components/scenes/home-village-scene";
import { HOME_VILLAGE } from "../src/mocks/village-v2";
import { PLAYER_ID } from "../src/mocks/players";
import { PROFILE } from "../src/mocks/scenes";

const wrap = (ui: ReactNode) => <LazyMotion features={domMax}>{ui}</LazyMotion>;
const withProfile = (value: ProfileValue, ui: ReactNode) => wrap(<ProfileProvider value={value}>{ui}</ProfileProvider>);

describe("PlayerAvatar (#624)", () => {
  it("shows the name's initial, else the address's first digit", () => {
    expect(avatarInitial({ name: "bal7hazar", address: PLAYER_ID })).toBe("B");
    expect(avatarInitial({ name: null, address: PLAYER_ID })).toBe("0");
    const { container } = render(<PlayerAvatar player={{ name: "ada", address: PLAYER_ID }} />);
    expect(container).toHaveTextContent("A");
  });

  it("a saved avatar keeps the initial until its still is rendered (no WebGL in the test's DOM: the initial stays)", () => {
    const { container } = render(<PlayerAvatar player={{ name: "ada", address: PLAYER_ID }} look={encodeAvatar({ ...DEFAULT_AVATAR, hair: 3 })} />);
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
  it("connected: the name, the address to copy, the figures, Edit avatar, Disconnect", async () => {
    const onCopy = vi.fn(async () => {});
    const onDisconnect = vi.fn();
    const onEditAvatar = vi.fn();
    const onOpenLeague = vi.fn();
    render(wrap(<ProfileSheet open onOpenChange={() => {}} state={PROFILE.connected} onCopy={onCopy} onDisconnect={onDisconnect} onEditAvatar={onEditAvatar} onOpenLeague={onOpenLeague} />));
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByRole("heading", { name: "bal7hazar" })).toBeInTheDocument();
    expect(within(sheet).getByText("0x05f1…6e7f")).toBeInTheDocument();
    expect(within(sheet).getByText("21")).toBeInTheDocument();
    expect(within(sheet).getByText("1,840")).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole("button", { name: /Edit avatar/ }));
    expect(onEditAvatar).toHaveBeenCalledOnce();
    // The league's button reads "Battle logs" (#834).
    await userEvent.click(within(sheet).getByRole("button", { name: "Battle logs" }));
    expect(onOpenLeague).toHaveBeenCalledOnce();
    await userEvent.click(within(sheet).getByRole("button", { name: /Copy/ }));
    expect(onCopy).toHaveBeenCalledWith(PLAYER_ID);
    expect(await within(sheet).findByRole("button", { name: /Copied/ })).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole("button", { name: /Disconnect/ }));
    expect(onDisconnect).toHaveBeenCalledOnce();
  });

  it("the player's league under their name (#917): its crest and name, Unranked, or none when not read", async () => {
    const { rerender } = render(wrap(<ProfileSheet open onOpenChange={() => {}} state={PROFILE.connected} league={{ crowns: 1_172, league: 5, unranked: false }} />));
    const sheet = await screen.findByRole("dialog");
    const crest = () => sheet.querySelector<HTMLElement>("[data-slot=league-crest-icon]");
    expect(within(sheet).getByText("Bronze II")).toBeInTheDocument();
    expect(crest()).toHaveAttribute("data-tier", "bronze");
    expect(crest()).toHaveAttribute("data-pips", "2");
    rerender(wrap(<ProfileSheet open onOpenChange={() => {}} state={PROFILE.connected} league={{ crowns: 0, league: 0, unranked: true }} />));
    expect(within(sheet).getByText("Unranked")).toBeInTheDocument();
    expect(crest()).toHaveAttribute("data-tier", "unranked");
    // Not read, and no sources to read it from (a story, a test): no league.
    rerender(wrap(<ProfileSheet open onOpenChange={() => {}} state={PROFILE.connected} league={null} />));
    expect(crest()).toBeNull();
    rerender(wrap(<ProfileSheet open onOpenChange={() => {}} state={PROFILE.connected} />));
    expect(crest()).toBeNull();
  });

  it("reads the league itself where the app's sources are: the crowns' league, Unranked only if never attacked", async () => {
    const sheetWith = (league: number, crowns: number, attack: number) => {
      const views = { pvpLeague: async () => ({ season: 1, crowns, league, peak: league, attacks: 0, pending: 0 }), pvpAttack: async () => ({ id: attack }) };
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      return wrap(
        <QueryClientProvider client={client}>
          <DataProvider sources={{ views } as unknown as DataSources}>
            <ProfileSheet open onOpenChange={() => {}} state={PROFILE.connected} />
          </DataProvider>
        </QueryClientProvider>,
      );
    };
    const { unmount } = render(sheetWith(16, 3_250, 4));
    expect(await within(await screen.findByRole("dialog")).findByText("Diamond III")).toBeInTheDocument();
    unmount();
    const second = render(sheetWith(0, 0, 0));
    expect(await within(await screen.findByRole("dialog")).findByText("Unranked")).toBeInTheDocument();
    second.unmount();
    render(sheetWith(0, 0, 3));
    expect(await within(await screen.findByRole("dialog")).findByText("Wood")).toBeInTheDocument();
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

  it("Escape closes the sheet and the focus returns to the avatar (keyboard)", async () => {
    render(withProfile(value(PROFILE.guest), <ProfileSlot />));
    const avatar = screen.getByRole("button", { name: "Profile: guest" });
    avatar.focus();
    await userEvent.keyboard("{Enter}");
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(avatar).toHaveFocus());
    // A second open still works and returns the focus again.
    await userEvent.keyboard("{Enter}");
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(avatar).toHaveFocus());
  });

  it("the width crosses `desktop` while open: the focus goes to the avatar shown now, not the hidden one that opened it", async () => {
    // Two avatars, one per width: the header's below `desktop`, another from it (as the navigation's header had, before #762).
    render(
      withProfile(
        value(PROFILE.connected),
        <>
          <ProfileSlot className="desktop:hidden" />
          <nav aria-label="Wide">
            <ProfileSlot className="hidden desktop:block" />
          </nav>
        </>,
      ),
    );
    const nav = within(screen.getByRole("navigation", { name: "Wide" })).getByRole("button", { name: "Profile: bal7hazar" });
    const header = screen.getAllByRole("button", { name: "Profile: bal7hazar" }).find((b) => b !== nav)!;
    const shown = (el: HTMLElement, on: boolean) => vi.spyOn(el, "getClientRects").mockReturnValue((on ? [new DOMRect(0, 0, 44, 44)] : []) as unknown as DOMRectList);
    // A phone: the header's avatar is shown, the navigation's hidden.
    shown(header, true);
    shown(nav, false);
    header.focus();
    await userEvent.keyboard("{Enter}");
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    // Resized to desktop: the header's avatar hides, the navigation's shows.
    shown(header, false);
    shown(nav, true);
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(nav).toHaveFocus());
    await userEvent.keyboard("{Enter}");
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("a tab page has Back at its top left, not the avatar, which is the home's (#760; no navigation header from desktop, #762)", () => {
    const { rerender } = render(withProfile(value(PROFILE.guest), <TabPage tab="vault" title="Vault">x</TabPage>));
    expect(screen.queryAllByRole("button", { name: "Profile: guest" })).toHaveLength(0);
    expect(within(screen.getByRole("banner")).getByRole("button", { name: "Back" })).toBeInTheDocument();
    rerender(withProfile(value(PROFILE.guest), <TabPage tab="settings" title="Themes" onBack={() => {}}>x</TabPage>));
    expect(screen.queryAllByRole("button", { name: "Profile: guest" })).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
  });

  it("Home (#753): the avatar and its name at the top left, no player card", async () => {
    render(withProfile(value(PROFILE.connected), <HomeVillageScene {...HOME_VILLAGE.view} />));
    // The stage's chunk in (the village's plan), so its import does not outlast the file's environment.
    await screen.findByRole("img", { name: /^Village layout/ }, { timeout: slow(5000) });
    expect(screen.getByRole("button", { name: "Profile: bal7hazar" })).toHaveTextContent("bal7hazar");
    expect(screen.queryByText(/games · best/)).toBeNull();
    expect(screen.queryByText("Playing as a guest")).toBeNull();
  });
});
