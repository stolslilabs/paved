import { slow } from "../test-slow";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, domMax } from "motion/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { KING_TRAITS, encodeTraits } from "@paved/renderer";
import { avatarInitial, PlayerAvatar } from "../src/components/elements/player-avatar";
import { ProfileProvider, ProfileSlot, type ProfileValue } from "../src/components/containers/profile-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProfileSheet } from "../src/components/containers/profile-sheet";
import { DOCK_REACH_PX } from "../src/components/elements/dock-room";
import { DataProvider, type DataSources } from "../src/data/sources";
import { TabPage } from "../src/components/containers/tab-page";
import { HomeVillageScene } from "../src/components/scenes/home-village-scene";
import { HOME_VILLAGE } from "../src/mocks/village-v2";
import { PLAYER_ID } from "../src/mocks/players";
import { HALL_OF_FAME, PROFILE, RECORDS } from "../src/mocks/scenes";

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
    const { container } = render(<PlayerAvatar player={{ name: "ada", address: PLAYER_ID }} look={encodeTraits({ ...KING_TRAITS, hairStyle: "long" })} />);
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
  it("connected: the name and its pencil, the address a tap copies, the figures, the actions; no Disconnect (Settings')", async () => {
    const onCopy = vi.fn(async () => {});
    const onEditName = vi.fn();
    const onEditAvatar = vi.fn();
    const onOpenLeague = vi.fn();
    const onOpenCollection = vi.fn();
    const onOpenInvite = vi.fn();
    render(
      wrap(
        <ProfileSheet
          open
          onOpenChange={() => {}}
          state={PROFILE.connected}
          onCopy={onCopy}
          onEditName={onEditName}
          onEditAvatar={onEditAvatar}
          onOpenLeague={onOpenLeague}
          onOpenCollection={onOpenCollection}
          onOpenInvite={onOpenInvite}
        />,
      ),
    );
    const sheet = await screen.findByRole("dialog", { name: "Profile" });
    expect(within(sheet).getByRole("heading", { name: "Profile" })).toBeInTheDocument();
    expect(within(sheet).getByText("bal7hazar")).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole("button", { name: "Edit name" }));
    expect(onEditName).toHaveBeenCalledOnce();
    // The mockup's tiles, in its order (PROFILE-DRAWER).
    expect(Array.from(sheet.querySelectorAll("[data-slot=profile-action]"), (b) => b.textContent)).toEqual(["Battle logs", "Avatar", "Collection", "Invite"]);
    await userEvent.click(within(sheet).getByRole("button", { name: "Collection" }));
    expect(onOpenCollection).toHaveBeenCalledOnce();
    await userEvent.click(within(sheet).getByRole("button", { name: "Invite" }));
    expect(onOpenInvite).toHaveBeenCalledOnce();
    expect(within(sheet).getByText("21")).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole("button", { name: /Edit avatar/ }));
    expect(onEditAvatar).toHaveBeenCalledOnce();
    // The league's button reads "Battle logs" (#834).
    await userEvent.click(within(sheet).getByRole("button", { name: "Battle logs" }));
    expect(onOpenLeague).toHaveBeenCalledOnce();
    // The address as a subtitle, "#" before it: a tap copies it, then it says so.
    const address = within(sheet).getByRole("button", { name: "Copy address" });
    expect(address).toHaveTextContent("#0x05f1…6e7f");
    await userEvent.click(address);
    expect(onCopy).toHaveBeenCalledWith(PLAYER_ID);
    expect(await within(sheet).findByRole("button", { name: "Copied" })).toBeInTheDocument();
    expect(within(sheet).queryByRole("button", { name: /Disconnect/ })).toBeNull();
  });

  it("the Hall of Fame picks the Stats' season (the current one first); a tap on it again shows all time, as the badge's cross does", async () => {
    render(wrap(<ProfileSheet open onOpenChange={() => {}} state={PROFILE.connected} league={null} hallOfFame={HALL_OF_FAME} records={RECORDS} />));
    const sheet = await screen.findByRole("dialog");
    const stats = within(sheet).getByRole("region", { name: "Stats" });
    // A figure from a million is short ("1.2M"), its whole number for screen readers.
    const total = () => Array.from(stats.querySelectorAll("[data-slot=profile-records-total] dd"), (d) => d.querySelector(".sr-only")?.textContent ?? d.textContent);
    const card = (season: number) => within(sheet).getByRole("button", { name: new RegExp(`^Season ${season}:`) });
    // Season 6, under way: picked, its totals in the owner's order (Total points, Best points, Total closed).
    expect(card(6)).toHaveAttribute("aria-pressed", "true");
    expect(within(stats).getByText("Season 6")).toBeInTheDocument();
    expect(Array.from(stats.querySelectorAll("[data-slot=profile-records-total] dt"), (d) => d.textContent)).toEqual(["Total points", "Best points", "Total closed"]);
    expect(total()).toEqual(["269,120", "8,950", "316"]);
    expect(Array.from(stats.querySelectorAll("[data-slot=profile-structure]"), (s) => s.getAttribute("aria-label"))).toEqual(["Cities", "Roads", "Forests", "Wonders"]);
    // Another season.
    await userEvent.click(card(4));
    expect(card(4)).toHaveAttribute("aria-pressed", "true");
    expect(card(6)).toHaveAttribute("aria-pressed", "false");
    expect(total()).toEqual(["285,190", "9,840", "250"]);
    // The badge's cross: all time, no cross left, no season picked.
    await userEvent.click(within(stats).getByRole("button", { name: "Show all time" }));
    expect(within(stats).getByText("All time")).toBeInTheDocument();
    expect(within(stats).queryByRole("button", { name: "Show all time" })).toBeNull();
    expect(card(4)).toHaveAttribute("aria-pressed", "false");
    expect(total()).toEqual(["1,248,630", "9,840", "1,184"]);
    expect(stats.querySelector("[data-slot=profile-records-total] dd")).toHaveAttribute("title", "1,248,630");
    expect(stats.querySelector("[data-slot=profile-records-total] dd [aria-hidden]")).toHaveTextContent("1.2M");
    // The current season again, then a tap on it lets go.
    await userEvent.click(card(6));
    expect(total()).toEqual(["269,120", "8,950", "316"]);
    await userEvent.click(card(6));
    expect(within(stats).getByText("All time")).toBeInTheDocument();
  });

  it("in the app (its sources), the Hall of Fame and the Stats are the mock's for now (`playerRecords`, the owner's ask of 2026-11-04)", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      wrap(
        <QueryClientProvider client={client}>
          <DataProvider sources={{ views: {} } as unknown as DataSources}>
            <ProfileSheet open onOpenChange={() => {}} state={PROFILE.connected} league={null} follows={{ followers: 0, followed: 0 }} />
          </DataProvider>
        </QueryClientProvider>,
      ),
    );
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getAllByRole("button", { name: /^Season \d+:/ })).toHaveLength(RECORDS.season);
    expect(within(within(sheet).getByRole("region", { name: "Stats" })).getByText(`Season ${RECORDS.season}`)).toBeInTheDocument();
  });

  it("with no sources (a story, a test) and none given: no Hall of Fame and no Stats", async () => {
    render(wrap(<ProfileSheet open onOpenChange={() => {}} state={PROFILE.connected} league={null} />));
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).queryByRole("region", { name: "Hall of Fame" })).toBeNull();
    expect(within(sheet).queryByRole("region", { name: "Stats" })).toBeNull();
    expect(within(sheet).queryByRole("button", { name: "Edit name" })).toBeNull();
  });

  it("the player's league under their name (#917): its crest and name, Unranked, or none when not read", async () => {
    const { rerender } = render(wrap(<ProfileSheet open onOpenChange={() => {}} state={PROFILE.connected} league={{ crowns: 1_172, league: 5, unranked: false }} />));
    const sheet = await screen.findByRole("dialog");
    const crest = () => sheet.querySelector<HTMLElement>("[data-slot=league-crest-icon]");
    expect(within(sheet).getByText("Bronze II")).toBeInTheDocument();
    expect(crest()).toHaveAttribute("data-tier", "bronze");
    expect(crest()).toHaveAttribute("data-division", "II");
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

  it("offers only the actions it is given: none, no tiles", async () => {
    render(wrap(<ProfileSheet open onOpenChange={() => {}} state={PROFILE.connected} onEditAvatar={() => {}} />));
    const sheet = await screen.findByRole("dialog");
    expect(Array.from(sheet.querySelectorAll("[data-slot=profile-action]"), (b) => b.textContent)).toEqual(["Avatar"]);
    expect(within(sheet).queryByRole("button", { name: "Battle logs" })).toBeNull();
  });

  it("the HUD's drawer (PROFILE-DRAWER): on a phone a full page with Back, from `tablet` a side panel with the red cross; its end leaves the dock room", async () => {
    const onOpenChange = vi.fn();
    const { unmount } = render(wrap(<ProfileSheet open onOpenChange={onOpenChange} state={PROFILE.connected} />));
    const page = await screen.findByRole("dialog");
    expect(page).toHaveAttribute("data-hud-drawer", "profile");
    // The phone's layout inside, whatever the width; the page slides in from the right.
    expect(page).toHaveAttribute("data-page-panel");
    expect(page).toHaveAttribute("data-side", "right");
    // The drawer takes the focus as it opens, not its Back.
    expect(page).toHaveFocus();
    expect(within(page).queryByRole("button", { name: "Close" })).toBeNull();
    // Its body's end: the dock's reach, a gap and the safe area.
    const end = page.querySelector<HTMLElement>("[data-hud-drawer-body]")!.style.paddingBottom;
    expect(end).toContain(`${DOCK_REACH_PX}px`);
    expect(end).toContain("env(safe-area-inset-bottom)");
    await userEvent.click(within(page).getByRole("button", { name: "Back" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    unmount();
    // From `tablet`: the side panel at the left, its close the red cross.
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query === "(min-width: 40rem)", media: query, addEventListener() {}, removeEventListener() {} }));
    try {
      render(wrap(<ProfileSheet open onOpenChange={onOpenChange} state={PROFILE.connected} />));
      const side = await screen.findByRole("dialog");
      expect(side).toHaveAttribute("data-side", "left");
      expect(within(side).queryByRole("button", { name: "Back" })).toBeNull();
      await userEvent.click(within(side).getByRole("button", { name: "Close" }));
      expect(onOpenChange).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
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
  const value = (state: ProfileValue["state"]): ProfileValue => ({ state, onConnect: vi.fn(), onEditAvatar: vi.fn(), onCopy: vi.fn(async () => {}) });

  it("draws nothing without the shell's profile", () => {
    render(wrap(<ProfileSlot />));
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("a tap opens the sheet in its own chunk; an action that leaves for another screen (Edit avatar) closes it", async () => {
    const v = value(PROFILE.connected);
    render(withProfile(v, <ProfileSlot />));
    expect(screen.queryByRole("dialog")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Profile: bal7hazar" }));
    const sheet = await screen.findByRole("dialog");
    await userEvent.click(within(sheet).getByRole("button", { name: "Edit avatar" }));
    expect(v.onEditAvatar).toHaveBeenCalledOnce();
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

  it("Home (PROFILE-DRAWER): the player card opens the profile's page, the dock marked to stay over it (`data-dock`, theme.css)", async () => {
    render(withProfile(value(PROFILE.connected), <HomeVillageScene {...HOME_VILLAGE.view} />));
    await screen.findByRole("img", { name: /^Village layout/ }, { timeout: slow(5000) });
    await userEvent.click(screen.getByRole("button", { name: /^Profile: bal7hazar/ }));
    const page = await screen.findByRole("dialog", { name: "Profile" });
    expect(within(page).getByRole("button", { name: "Back" })).toBeInTheDocument();
    // The rule's two ends: an open page (`data-page-panel`) and the dock's box, which it raises over the page.
    expect(page).toHaveAttribute("data-page-panel");
    const dock = await screen.findByRole("navigation", { name: "Main", hidden: true }, { timeout: slow(5000) });
    expect(dock.closest("[data-dock]")).not.toBeNull();
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
