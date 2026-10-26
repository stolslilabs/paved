import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InventoryTray } from "../src/components/containers/inventory-tray";
import { PLAN } from "../src/mocks/village";
import { INVENTORY } from "../src/mocks/village-v2";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** The screen from `desktop` (64 rem) or under it. */
const screenAt = (desktop: boolean) =>
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: desktop && query.includes("min-width"), addEventListener: vi.fn(), removeEventListener: vi.fn() }));

const inventory = () => screen.getByRole("region", { name: "Inventory tiles" });

describe("the editor's inventory (#757)", () => {
  it("is a carousel below desktop and a wrapping grid from desktop, the same cards in both", () => {
    screenAt(false);
    const { unmount } = render(<InventoryTray tray={INVENTORY} />);
    expect(inventory()).toHaveAttribute("aria-roledescription", "carousel");
    const carousel = within(inventory()).getAllByRole("button").map((b) => b.getAttribute("aria-label"));
    unmount();
    screenAt(true);
    render(<InventoryTray tray={INVENTORY} />);
    expect(inventory()).toHaveAttribute("data-layout", "grid");
    expect(inventory()).not.toHaveAttribute("aria-roledescription");
    expect(within(inventory()).getAllByRole("listitem")).toHaveLength(carousel.length);
    expect(within(inventory()).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(carousel);
  });

  it.each([false, true])("a card that cannot be chosen is aria-disabled, not disabled, and a click does not choose it (desktop: %s)", async (desktop) => {
    screenAt(desktop);
    const onSelect = vi.fn();
    const { rerender } = render(<InventoryTray tray={{ ...INVENTORY, [PLAN.wonder]: 0 }} onSelect={onSelect} />);
    // None left: the card stays in the tray, read as disabled, but keeps its pointer events (a drag starting on it reaches Embla).
    const empty = within(inventory()).getByRole("button", { name: /, 0 left$/ });
    expect(empty).toHaveAttribute("aria-disabled", "true");
    expect(empty).not.toBeDisabled();
    await userEvent.click(empty);
    fireEvent.click(empty);
    expect(onSelect).not.toHaveBeenCalled();
    expect(empty).toHaveAttribute("aria-pressed", "false");
    // Every slot used: every card waits; one free slot: a card with copies is chosen.
    rerender(<InventoryTray tray={INVENTORY} full onSelect={onSelect} />);
    for (const card of within(inventory()).getAllByRole("button")) {
      expect(card).toHaveAttribute("aria-disabled", "true");
      fireEvent.click(card);
    }
    expect(onSelect).not.toHaveBeenCalled();
    rerender(<InventoryTray tray={INVENTORY} busy onSelect={onSelect} />);
    fireEvent.click(within(inventory()).getAllByRole("button")[0]!);
    expect(onSelect).not.toHaveBeenCalled();
    rerender(<InventoryTray tray={INVENTORY} onSelect={onSelect} />);
    const first = within(inventory()).getAllByRole("button")[0]!;
    expect(first).not.toHaveAttribute("aria-disabled");
    await userEvent.click(first);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("greys the tray when every slot is used, in both layouts", () => {
    for (const desktop of [false, true]) {
      screenAt(desktop);
      const { unmount } = render(<InventoryTray tray={INVENTORY} full />);
      expect(inventory()).toHaveClass("opacity-50", "grayscale");
      expect(screen.getByText("Every slot is used")).toBeInTheDocument();
      unmount();
    }
  });
});
