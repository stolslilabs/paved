import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ChatTabs } from "../src/components/containers/chat-tabs";
import { FriendsPanel } from "../src/components/containers/friends-panel";
import { GuildBrowse } from "../src/components/containers/guild-finder";
import { GuildPage } from "../src/components/containers/guild-page";
import { HudDrawer } from "../src/components/containers/hud-drawer";
import { ShopScene } from "../src/components/scenes/shop-scene";
import { FRIENDS_TAB } from "../src/mocks/follows";
import { GUILD_FINDER, GUILD_PAGE } from "../src/mocks/guilds";
import { SHOP } from "../src/mocks/shop";

// FOOTER-TABS (#1062): the Chat's, the Shop's, the Friends', the Guild's and the guild finder's tabs as the footer's (`FooterTabsList`
// in the drawer's `DrawerFooter`), the Vault's and the Ranking's standard: at the drawer's foot, out of its scroll, with their keyboard.

const wrap = (ui: ReactNode) => (
  <LazyMotion features={domMax}>
    <MotionConfig reducedMotion="always">{ui}</MotionConfig>
  </LazyMotion>
);
const inDrawer = (ui: ReactNode) => wrap(<HudDrawer open onOpenChange={() => {}} title="Page">{ui}</HudDrawer>);

const { candidate, query, filters, results, suggested, ranking } = GUILD_FINDER.guildless;

/** Each page's tabs, by their list's name, in order (a tab's name is its word, and the count waiting in it). */
const PAGES: readonly { page: string; list: string; ui: () => ReactNode; tabs: readonly string[] }[] = [
  { page: "Chat", list: "Conversations", ui: () => inDrawer(<ChatTabs tab="world" badges={{ guild: 3, private: 2 }}>{<p>world</p>}</ChatTabs>), tabs: ["World", "Allegiance, 3 waiting", "Inbox, 2 waiting"] },
  { page: "Shop", list: "Shop", ui: () => wrap(<ShopScene {...SHOP.tiles} />), tabs: ["Tiles", "Cobbles", "Themes"] },
  { page: "Friends", list: "Lists", ui: () => inDrawer(<FriendsPanel {...FRIENDS_TAB.friends} />), tabs: ["Friends", "Following", "Followers, 2 new"] },
  { page: "Allegiance", list: "Allegiance", ui: () => inDrawer(<GuildPage {...GUILD_PAGE.officer} defaultTab="announcements" />), tabs: ["Announcements", "Members", "Requests, 2 waiting", "Log"] },
  {
    page: "Allegiance finder",
    list: "Allegiances",
    ui: () => inDrawer(<GuildBrowse candidate={candidate} query={query} filters={filters} results={results} suggested={suggested} ranking={ranking} />),
    tabs: ["Suggested", "Ranking"],
  },
];

const nameOf = (tab: HTMLElement) => tab.getAttribute("aria-label") ?? tab.textContent;

describe("the pages' footer tabs (#1062)", () => {
  for (const { page, list, ui, tabs: names } of PAGES) {
    it(`${page}: the tabs at the drawer's foot, out of its scroll, each its icon and word, the keyboard's arrows, Home and End`, async () => {
      render(ui());
      const bar = screen.getByRole("tablist", { name: list });
      expect(bar).toHaveAttribute("data-slot", "footer-tabs");
      // In the drawer's footer, not in its scrolling body.
      expect(bar.closest("[data-slot=hud-drawer-footer]")).not.toBeNull();
      expect(bar.closest("[data-hud-drawer-body]")).toBeNull();
      const tabs = within(bar).getAllByRole("tab");
      expect(tabs.map(nameOf)).toEqual(names);
      for (const tab of tabs) expect(tab).toHaveAttribute("data-footer-tab");
      // Radix's roving focus: the arrows move it along the bar, Home and End to its ends (activating the tab focused).
      tabs[0]!.focus();
      await userEvent.keyboard("{ArrowRight}");
      expect(tabs[1]).toHaveFocus();
      await userEvent.keyboard("{End}");
      expect(tabs.at(-1)).toHaveFocus();
      await userEvent.keyboard("{Home}");
      expect(tabs[0]).toHaveFocus();
      await userEvent.keyboard("{ArrowLeft}");
      expect(tabs.at(-1)).toHaveFocus();
    });
  }

  it("Shop: a theme's view keeps the tabs, Themes current; another tab leaves it (open point 3)", async () => {
    const onTab = vi.fn();
    render(wrap(<ShopScene {...SHOP.forest} onTab={onTab} />));
    const tabs = within(screen.getByRole("tablist", { name: "Shop" })).getAllByRole("tab");
    expect(tabs[2]).toHaveAttribute("aria-selected", "true");
    await userEvent.click(tabs[0]!);
    expect(onTab).toHaveBeenCalledWith("tiles");
  });

  it("Friends: each list's title holds no count (the book's rule of 2026-11-08)", async () => {
    render(inDrawer(<FriendsPanel {...FRIENDS_TAB.friends} />));
    expect(within(screen.getByRole("region", { name: "Friends" })).getByRole("heading")).toHaveTextContent(/^Friends$/);
  });

  it("leaves the old words underlined in gold to the avatar's categories and the match's view switch only", () => {
    const root = join(__dirname, "../src/components");
    const files = ["containers", "scenes"].flatMap((dir) => readdirSync(join(root, dir)).filter((f) => f.endsWith(".tsx") && !f.endsWith(".stories.tsx")).map((f) => `${dir}/${f}`));
    const old = files.filter((f) => /<TabsList\b/.test(readFileSync(join(root, f), "utf8")));
    expect(old.sort()).toEqual(["containers/footer-tabs.tsx", "scenes/avatar-creator-scene.tsx", "scenes/pvp-match-scene.tsx"].sort());
  });
});
