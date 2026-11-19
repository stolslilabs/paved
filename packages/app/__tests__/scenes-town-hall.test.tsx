import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LayoutBoard } from "../src/components/containers/layout-board";
import { townHallTiles } from "../src/components/containers/layout-starter";
import { TownHallScene } from "../src/components/scenes/town-hall-scene";
import { TOWN_HALL_PAGE } from "../src/mocks/town-hall";
import { wrap } from "./scenes-helpers";

afterEach(cleanup);

// The Town Hall's page (TOWN-HALL-PAGE): the Town Hall at the top, the next level first, an arrow on each side to go from a level to the next; under it the
// level in view and what it asks, each checked once the player has it; the upgrade in the footer, "Owned" for a level the player has,
// held while a requirement is short.

const upgrade = (level: number, price: string) => screen.getByRole("button", { name: `Upgrade to level ${level} for ${price} Cobbles` });
const next = () => userEvent.click(screen.getByRole("button", { name: "Next level" }));
const previous = () => userEvent.click(screen.getByRole("button", { name: "Previous level" }));
const asks = () => within(screen.getByRole("list", { name: "Requirements" })).getAllByRole("listitem");

describe("the Town Hall's page", () => {
  it("opens on the next level, the upgrade the player is after: its requirements met, the upgrade on at its price", async () => {
    const onUpgrade = vi.fn();
    render(wrap(<TownHallScene {...TOWN_HALL_PAGE.ready} onUpgrade={onUpgrade} />));
    const page = screen.getByRole("dialog", { name: "Town Hall" });
    const view = within(page).getByRole("region", { name: "Town Hall level" });
    expect(within(view).getByRole("img", { name: "Town Hall, level 4" })).toBeInTheDocument();
    expect(view).toHaveTextContent("Level 4");
    expect(view).not.toHaveTextContent("Yours");
    expect(view).toHaveTextContent("A village holds 14 tiles round it.");
    expect(asks().map((r) => r.getAttribute("aria-label"))).toEqual(["Town Hall level 3: met", "Player level 6: met", "150 Cobbles: met"]);
    await userEvent.click(upgrade(4, "150"));
    expect(onUpgrade).toHaveBeenCalledTimes(1);
  });

  it("goes back to the player's own level by the arrow: its tiles, its requirements met, the upgrade off as Owned", async () => {
    render(wrap(<TownHallScene {...TOWN_HALL_PAGE.ready} onUpgrade={() => {}} />));
    await previous();
    const view = screen.getByRole("region", { name: "Town Hall level" });
    expect(view).toHaveTextContent("Level 3");
    expect(view).toHaveTextContent("Yours");
    expect(view).toHaveTextContent("A village holds 12 tiles round it.");
    expect(asks().map((r) => r.getAttribute("aria-label"))).toEqual(["Town Hall level 2: met", "Player level 4: met", "80 Cobbles: met"]);
    expect(screen.getByRole("button", { name: "Level 3 owned" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Level 3 owned" })).toHaveTextContent("Owned");
    expect(screen.queryByRole("group", { name: "Price" })).toBeNull();
  });

  it("keeps the upgrade off for a level further on: the level before it is not met", async () => {
    render(wrap(<TownHallScene {...TOWN_HALL_PAGE.ready} onUpgrade={() => {}} />));
    await next();
    expect(asks().map((r) => r.getAttribute("aria-label"))).toEqual(["Town Hall level 4: not met", "Player level 8: not met", "250 Cobbles: met"]);
    expect(upgrade(5, "250")).toBeDisabled();
  });

  it("stops at both ends, shows the first level in the others' format, and opens on the last level once reached", async () => {
    render(wrap(<TownHallScene {...TOWN_HALL_PAGE.first} onUpgrade={() => {}} />));
    await previous();
    expect(screen.getByRole("button", { name: "Previous level" })).toBeDisabled();
    expect(asks().map((r) => r.getAttribute("aria-label"))).toEqual(["Village founded: met", "Player level 1: met", "0 Cobbles: met"]);
    expect(screen.getByRole("button", { name: "Level 1 owned" })).toBeDisabled();
    cleanup();
    render(wrap(<TownHallScene {...TOWN_HALL_PAGE.last} onUpgrade={() => {}} />));
    expect(screen.getByRole("button", { name: "Next level" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Level 10 owned" })).toBeDisabled();
    await previous();
    expect(screen.getByRole("button", { name: "Level 9 owned" })).toBeDisabled();
  });

  it("keeps the upgrade off while the player's level is short, the requirement marked not met", async () => {
    render(wrap(<TownHallScene {...TOWN_HALL_PAGE.levelShort} onUpgrade={() => {}} />));
    expect(upgrade(4, "150")).toBeDisabled();
    expect(asks()[1]).toHaveAttribute("aria-label", "Player level 6: not met");
  });

  it("keeps it off while the Cobbles are short, with the way to the packs, or while it is on its way", async () => {
    const onGetCobbles = vi.fn();
    const { rerender } = render(wrap(<TownHallScene {...TOWN_HALL_PAGE.cobblesShort} onUpgrade={() => {}} onGetCobbles={onGetCobbles} />));
    expect(upgrade(4, "150")).toBeDisabled();
    expect(asks()[2]).toHaveAttribute("aria-label", "150 Cobbles: not met");
    await userEvent.click(screen.getByRole("button", { name: "Get Cobbles" }));
    expect(onGetCobbles).toHaveBeenCalledTimes(1);
    rerender(wrap(<TownHallScene {...TOWN_HALL_PAGE.upgrading} onUpgrade={() => {}} />));
    expect(upgrade(4, "150")).toBeDisabled();
  });

  it("goes on to the level after an upgrade, and shows a refusal in words with Dismiss", async () => {
    const onDismissRefusal = vi.fn();
    const { rerender } = render(wrap(<TownHallScene {...TOWN_HALL_PAGE.ready} onUpgrade={() => {}} />));
    rerender(wrap(<TownHallScene {...TOWN_HALL_PAGE.ready} hall={{ ...TOWN_HALL_PAGE.ready.hall, level: 4 }} onUpgrade={() => {}} />));
    expect(upgrade(5, "250")).toBeDisabled();
    rerender(wrap(<TownHallScene {...TOWN_HALL_PAGE.refused} onDismissRefusal={onDismissRefusal} />));
    expect(screen.getByRole("dialog")).toHaveTextContent("The price changed: check it and buy again.");
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismissRefusal).toHaveBeenCalledTimes(1);
  });

  it("shows its shape while the village is read, Retry on a failed read, and says where no Town Hall is served", async () => {
    const onRetry = vi.fn();
    const { rerender } = render(wrap(<TownHallScene {...TOWN_HALL_PAGE.loading} />));
    expect(screen.getByRole("status", { name: "Reading the Town Hall" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Upgrade|owned/ })).toBeNull();
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
