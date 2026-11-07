import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FooterTab, FooterTabsList } from "../src/components/containers/footer-tabs";
import { Tabs } from "../src/components/ui/tabs";

/** FOOTER-TABS (VAULT-PAGE): a sheet's tabs at its foot; LEADERBOARD-PAGE adds a tab coming soon (`soon`, the Leaderboard's Alliances). */
describe("FooterTab", () => {
  it("a tab coming soon keeps its place, disabled, a carved Soon at its icon's corner, read 'coming soon'", () => {
    render(
      <Tabs value="players">
        <FooterTabsList aria-label="Ranking">
          <FooterTab value="players" label="Players" art={<span />} />
          <FooterTab value="guilds" label="Guilds" art={<span />} />
          <FooterTab value="alliances" label="Alliances" art={<span />} soon />
        </FooterTabsList>
      </Tabs>,
    );
    const tabs = within(screen.getByRole("tablist", { name: "Ranking" })).getAllByRole("tab");
    expect(tabs.map((t) => t.getAttribute("aria-label") ?? t.textContent)).toEqual(["Players", "Guilds", "Alliances, coming soon"]);
    const [players, guilds, alliances] = tabs as [HTMLElement, HTMLElement, HTMLElement];
    // In its place, last, not pressable, its mark at its icon's corner.
    expect(alliances).toBeDisabled();
    expect(alliances.querySelector("[data-slot=footer-tab-soon]")).toHaveTextContent("Soon");
    // The others as they were: no mark, pressable.
    for (const tab of [players, guilds]) {
      expect(tab).toBeEnabled();
      expect(tab.querySelector("[data-slot=footer-tab-soon]")).toBeNull();
    }
  });
});
