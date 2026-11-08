import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FooterTab, FooterTabsList } from "../src/components/containers/footer-tabs";
import { Tabs } from "../src/components/ui/tabs";

/** FOOTER-TABS (VAULT-PAGE): a sheet's tabs at its foot; LEADERBOARD-PAGE adds a tab coming soon (`soon`, the Leaderboard's Alliances). */
describe("FooterTab", () => {
  it("a tab coming soon keeps its place, disabled, a carved Soon in place of its count, read 'coming soon'", () => {
    render(
      <Tabs value="players">
        <FooterTabsList aria-label="Ranking">
          <FooterTab value="players" label="Players" art={<span />} />
          <FooterTab value="guilds" label="Guilds" art={<span />} badge={3} />
          <FooterTab value="alliances" label="Alliances" art={<span />} badge={5} soon />
        </FooterTabsList>
      </Tabs>,
    );
    const tabs = within(screen.getByRole("tablist", { name: "Ranking" })).getAllByRole("tab");
    expect(tabs.map((t) => t.getAttribute("aria-label") ?? t.textContent)).toEqual(["Players", "Guilds, 3 waiting", "Alliances, coming soon"]);
    const [players, guilds, alliances] = tabs as [HTMLElement, HTMLElement, HTMLElement];
    // In its place, last, not pressable; its mark where a count would be, the count it was given not shown.
    expect(alliances).toBeDisabled();
    expect(alliances.querySelector("[data-slot=footer-tab-soon]")).toHaveTextContent("Soon");
    expect(alliances.querySelector("[data-slot=footer-tab-badge]")).toBeNull();
    // The others as they were: no mark, pressable, a count where one waits.
    for (const tab of [players, guilds]) {
      expect(tab).toBeEnabled();
      expect(tab.querySelector("[data-slot=footer-tab-soon]")).toBeNull();
    }
    expect(guilds.querySelector("[data-slot=footer-tab-badge]")).toHaveTextContent("3");
  });
});
