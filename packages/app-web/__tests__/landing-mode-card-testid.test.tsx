// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { TamaguiProvider } from "tamagui";
import { tamaguiConfig } from "@paved/ui";
import { LandingPage } from "../src/pages/Landing";
import { notConfigured, renderPage } from "./helpers/page-fixtures";

// jsdom has no matchMedia, which Tamagui reads when it loads: the stub is hoisted above the imports.
vi.hoisted(() => {
  window.matchMedia ??= ((query: string) => ({ matches: false, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as typeof window.matchMedia;
});

// The real @paved/ui (no mock): scripts/e2e-sepolia/part-b.mjs clicks the Challenge card by `data-testid="mode-card-challenge"`,
// so the attribute must reach the DOM through Tamagui, not only the element's props.
afterEach(cleanup);

describe("The Landing's mode cards in the DOM", () => {
  it("renders data-testid mode-card-<mode> on the Challenge, Training and Tutorial cards, each holding its own title", async () => {
    const { container } = renderPage({
      page: <LandingPage />,
      path: "/",
      deployment: notConfigured,
      account: null,
      wrap: (routes) => (
        <TamaguiProvider config={tamaguiConfig} defaultTheme="dark">
          {routes}
        </TamaguiProvider>
      ),
    });
    await screen.findByText("Training");
    for (const [mode, title] of [
      ["challenge", "Challenge"],
      ["training", "Training"],
      ["tutorial", "Tutorial"],
    ]) {
      const cards = container.querySelectorAll(`[data-testid="mode-card-${mode}"]`);
      expect(cards.length, mode).toBe(1);
      expect(cards[0]!.textContent).toContain(title);
    }
  });
});
