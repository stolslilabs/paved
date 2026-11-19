import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LayoutBoard } from "../src/components/containers/layout-board";
import { townHallTiles } from "../src/components/containers/layout-starter";
import { TownHallScene } from "../src/components/scenes/town-hall-scene";
import { TOWN_HALL_PAGE } from "../src/mocks/town-hall";
import { wrap } from "./scenes-helpers";

afterEach(cleanup);

// The Town Hall's page (TOWN-HALL-PAGE): its level and tiles, the next level and what it asks, every level, and the upgrade in the
// footer, held while the player's level or Cobbles are short.

const upgrade = (level: number, price: string) => screen.getByRole("button", { name: `Upgrade to level ${level} for ${price} Cobbles` });

describe("the Town Hall's page", () => {
  it("says the level and its tiles, the next one's, and upgrades at its price", async () => {
    const onUpgrade = vi.fn();
    render(wrap(<TownHallScene {...TOWN_HALL_PAGE.ready} onUpgrade={onUpgrade} />));
    const page = screen.getByRole("dialog", { name: "Town Hall" });
    const yours = within(page).getByRole("region", { name: "Your Town Hall" });
    expect(yours).toHaveTextContent("Level 3");
    expect(yours).toHaveTextContent("Your village holds 12 tiles round it; 9 placed.");
    const next = within(page).getByRole("region", { name: "Next level" });
    expect(next).toHaveTextContent("12 → 14");
    expect(next).toHaveTextContent("You are level 7.");
    await userEvent.click(upgrade(4, "150"));
    expect(onUpgrade).toHaveBeenCalledTimes(1);
  });

  it("lists every level: the reached ones checked, the player's own marked, the others with what they ask", () => {
    render(wrap(<TownHallScene {...TOWN_HALL_PAGE.ready} />));
    const rows = within(screen.getByRole("list", { name: "Levels" })).getAllByRole("listitem");
    expect(rows).toHaveLength(10);
    expect(within(rows[0]!).getByRole("img", { name: "Reached" })).toBeInTheDocument();
    expect(rows[2]).toHaveAttribute("aria-current", "true");
    expect(rows[2]).toHaveTextContent("Yours");
    expect(rows[3]).toHaveTextContent("14 tiles");
    expect(within(rows[3]!).getByRole("img", { name: "Level 6" })).toBeInTheDocument();
    expect(within(rows[3]!).getByRole("img", { name: "150 Cobbles" })).toBeInTheDocument();
    expect(rows[9]).toHaveTextContent("26 tiles");
  });

  it("keeps the upgrade off while the player's level is short, and says the level it opens at", () => {
    render(wrap(<TownHallScene {...TOWN_HALL_PAGE.levelShort} onUpgrade={() => {}} />));
    expect(upgrade(4, "150")).toBeDisabled();
    expect(screen.getByRole("dialog")).toHaveTextContent("It opens at player level 6 (you are level 5).");
  });

  it("keeps it off while the Cobbles are short, with the way to the packs, or while it is on its way", async () => {
    const onGetCobbles = vi.fn();
    const { rerender } = render(wrap(<TownHallScene {...TOWN_HALL_PAGE.cobblesShort} onUpgrade={() => {}} onGetCobbles={onGetCobbles} />));
    expect(upgrade(4, "150")).toBeDisabled();
    expect(screen.getByRole("dialog")).toHaveTextContent("Not enough Cobbles yet.");
    await userEvent.click(screen.getByRole("button", { name: "Get Cobbles" }));
    expect(onGetCobbles).toHaveBeenCalledTimes(1);
    rerender(wrap(<TownHallScene {...TOWN_HALL_PAGE.upgrading} onUpgrade={() => {}} />));
    expect(upgrade(4, "150")).toBeDisabled();
  });

  it("offers no upgrade at the last level, and shows a refusal in words with Dismiss", async () => {
    const onDismissRefusal = vi.fn();
    const { rerender } = render(wrap(<TownHallScene {...TOWN_HALL_PAGE.last} onUpgrade={() => {}} />));
    expect(screen.getByRole("dialog")).toHaveTextContent("Your Town Hall is at its last level.");
    expect(screen.queryByRole("button", { name: /Upgrade/ })).toBeNull();
    rerender(wrap(<TownHallScene {...TOWN_HALL_PAGE.refused} onDismissRefusal={onDismissRefusal} />));
    expect(screen.getByRole("dialog")).toHaveTextContent("The price changed: check it and buy again.");
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismissRefusal).toHaveBeenCalledTimes(1);
  });

  it("shows its shape while the village is read, Retry on a failed read, and says where no Town Hall is served", async () => {
    const onRetry = vi.fn();
    const { rerender } = render(wrap(<TownHallScene {...TOWN_HALL_PAGE.loading} />));
    expect(screen.getByRole("status", { name: "Reading the Town Hall" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Upgrade/ })).toBeNull();
    rerender(wrap(<TownHallScene {...TOWN_HALL_PAGE.failed} onRetry={onRetry} />));
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    rerender(wrap(<TownHallScene {...TOWN_HALL_PAGE.notServed} />));
    expect(screen.getByRole("dialog")).toHaveTextContent("No Town Hall here yet");
  });

  it("closes back to the village", async () => {
    const onBack = vi.fn();
    render(wrap(<TownHallScene {...TOWN_HALL_PAGE.ready} onBack={onBack} />));
    await userEvent.keyboard("{Escape}");
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe("the Town Hall on the plan view (no 3D scene)", () => {
  it("opens its page from any of its cells in view; in edit mode, or with no page to open, the cells stay inert", async () => {
    const onTownHall = vi.fn();
    const tiles = [...townHallTiles(), { id: 5, plan: 10, orientation: 1, x: -1, y: 1 }];
    const { rerender } = render(<LayoutBoard tiles={tiles} onTownHall={onTownHall} />);
    const cells = screen.getAllByRole("button", { name: "Town Hall: open it" });
    expect(cells).toHaveLength(4);
    await userEvent.click(cells[2]!);
    expect(onTownHall).toHaveBeenCalledTimes(1);
    rerender(<LayoutBoard tiles={tiles} editing onTownHall={onTownHall} />);
    expect(screen.queryByRole("button", { name: "Town Hall: open it" })).toBeNull();
    rerender(<LayoutBoard tiles={tiles} />);
    expect(screen.queryByRole("button", { name: "Town Hall: open it" })).toBeNull();
  });
});
