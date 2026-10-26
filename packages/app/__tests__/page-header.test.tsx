import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, within } from "@testing-library/react";
import { LazyMotion, domMax } from "motion/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { BalancesProvider } from "../src/components/containers/balances-context";
import { TabPage } from "../src/components/containers/tab-page";
import { PageHeader, TopBar } from "../src/components/containers/top-bar";

// ONE-HEADER (#781, the owner's decisions of 2026-10-26): one header on every page but the game scenes. Back and the title at the
// top left, no subtitle; the home's balances at the top right, in the header's row; nothing under it.
const READY = { status: "ready", usdc: 48_500_000n, paved: 142_350_000_000_000_000_000n, cobbles: 240 } as const;
const withBalances = (page: ReactNode) =>
  render(
    <LazyMotion features={domMax}>
      <BalancesProvider value={{ state: READY }}>{page}</BalancesProvider>
    </LazyMotion>,
  );

describe("the page header (#781)", () => {
  it.each([
    ["a tab page", () => <TabPage tab="vault" title="Vault" onNavigate={() => {}}>Body</TabPage>],
    ["a flow's top bar", () => <TopBar title="Vault" onBack={() => {}} />],
  ])("%s draws the one header: Back, then the title, then the home's balances, one row", async (_, page) => {
    const { container } = withBalances(page());
    const headers = container.querySelectorAll<HTMLElement>('[data-slot="page-header"]');
    expect(headers).toHaveLength(1);
    const header = headers[0]!;
    const back = within(header).getByRole("button", { name: "Back" });
    const title = within(header).getByRole("heading", { level: 1, name: "Vault" });
    // In the Vault's format: the display font, one line cut with an ellipsis, the whole title in the tooltip.
    expect(title).toHaveClass("font-display");
    const line = title.closest<HTMLElement>('[data-slot="page-title"]')!;
    expect(line).toHaveClass("whitespace-nowrap", "text-ellipsis", "min-w-0");
    expect(line).toHaveAttribute("title", "Vault");
    // Back at the top left, then the title, then the balances: in the document's order of one row.
    const regions = await within(header).findAllByRole("region", { name: "Balances" });
    expect(regions.map((r) => r.className.match(/(hidden desktop:flex|desktop:hidden)/)?.[1])).toEqual(["desktop:hidden", "hidden desktop:flex"]);
    expect(back.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(title.compareDocumentPosition(regions[0]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // No line under the title, and nothing between the header and the content.
    expect(line.parentElement!.children).toHaveLength(3);
    expect(container.querySelector('[data-slot="page-balances"]')).toBeNull();
    expect(screen.getAllByRole("region", { name: "Balances" })).toHaveLength(2);
  });

  it("at 320 px the title gives way first: Back and the balances never shrink", () => {
    const { container } = withBalances(<PageHeader title="Themes and tiles of the season" onBack={() => {}} />);
    expect(screen.getByRole("button", { name: "Back" })).toHaveClass("shrink-0");
    expect(container.querySelector('[data-slot="page-header-end"]')).toHaveClass("shrink-0");
    expect(container.querySelector('[data-slot="page-title"]')).toHaveClass("min-w-0", "flex-1");
  });

  it("Back only when the page has one; no balances where the page shows none or the shell gives none", () => {
    const onBack = vi.fn();
    const { rerender } = withBalances(<PageHeader title="Something broke" balances={false} />);
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Balances" })).toBeNull();
    rerender(
      <LazyMotion features={domMax}>
        <PageHeader title="Chests" onBack={onBack} />
      </LazyMotion>,
    );
    screen.getByRole("button", { name: "Back" }).click();
    expect(onBack).toHaveBeenCalledOnce();
    expect(screen.queryByRole("region", { name: "Balances" })).toBeNull();
  });

  it("the pages carry no subtitle, and PageBalances is gone", () => {
    const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
    for (const file of ["src/components/containers/tab-page.tsx", "src/components/containers/top-bar.tsx"]) {
      expect(read(file)).not.toMatch(/subtitle\?:|PageBalances/);
    }
    expect(read("src/components/containers/balances-context.tsx")).not.toMatch(/PageBalances|PanelBalances|page-balances/);
  });
});
