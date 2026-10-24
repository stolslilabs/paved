import { describe, expect, it } from "vitest";
import { CAMPAIGNS } from "@paved/game-core";
import { SKIN_THEMES, THEMES, THEME_CODES } from "../src/components/containers/theme-card";

// The rule of docs/client/story-mode.md (#721): every new tile theme ships with its Story campaign, drawn in that theme,
// released together. A theme made available (SKIN_THEMES) without a campaign fails here.
describe("Story campaigns and tile themes (#721)", () => {
  it("has a campaign for every available theme but Default", () => {
    const themes = new Set(CAMPAIGNS.map((campaign) => campaign.theme));
    for (const theme of SKIN_THEMES) expect(themes.has(THEME_CODES[theme.id]), `${theme.name} has no Story campaign`).toBe(true);
  });

  it("draws every campaign in an available theme", () => {
    const codes = new Set(THEMES.filter((theme) => theme.available).map((theme) => THEME_CODES[theme.id]));
    for (const campaign of CAMPAIGNS) expect(codes.has(campaign.theme), campaign.name).toBe(true);
  });
});
