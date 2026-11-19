import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LayoutBoard } from "../src/components/containers/layout-board";
import { townHallTiles } from "../src/components/containers/layout-starter";
import { TownHallDialog, type TownHallProps } from "../src/components/containers/town-hall-dialog";

afterEach(cleanup);

// The Town Hall's dialog (TOWN-HALL): what the level holds, what the next one brings, and the upgrade, off while the player's
// level or Cobbles are short.

const base: TownHallProps = { level: 1, slots: 9, next: { slots: 11, price: 40, playerLevel: 2 }, playerLevel: 2, cobbles: 100 };
const upgrade = () => screen.getByRole("button", { name: "Upgrade to level 2 for 40 Cobbles" });

describe("the Town Hall's dialog", () => {
  it("says the level's tiles and the next one's, and upgrades at its price", async () => {
    const onUpgrade = vi.fn();
    render(<TownHallDialog {...base} open onClose={() => {}} onUpgrade={onUpgrade} />);
    const dialog = screen.getByRole("dialog", { name: "Town Hall level 1" });
    expect(dialog).toHaveTextContent("Your village holds 8 tiles round its Town Hall.");
    expect(dialog).toHaveTextContent("Level 2 holds 10 tiles");
    await userEvent.click(upgrade());
    expect(onUpgrade).toHaveBeenCalledTimes(1);
  });

  it("keeps the upgrade off while the player's level is short, and says the level it opens at", () => {
    render(<TownHallDialog {...base} playerLevel={1} open onClose={() => {}} onUpgrade={() => {}} />);
    expect(upgrade()).toBeDisabled();
    expect(screen.getByRole("dialog")).toHaveTextContent("it opens at player level 2 (you are level 1)");
  });

  it("keeps it off while the Cobbles are short, or while it is on its way", () => {
    const { rerender } = render(<TownHallDialog {...base} cobbles={39} open onClose={() => {}} onUpgrade={() => {}} />);
    expect(upgrade()).toBeDisabled();
    expect(screen.getByRole("dialog")).toHaveTextContent("Not enough Cobbles yet.");
    rerender(<TownHallDialog {...base} busy open onClose={() => {}} onUpgrade={() => {}} />);
    expect(upgrade()).toBeDisabled();
  });

  it("offers no upgrade at the last level, and shows a refusal in words", () => {
    render(<TownHallDialog level={10} slots={27} next={null} playerLevel={20} cobbles={5} error="Your Town Hall is at its last level." open onClose={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: "Town Hall level 10" });
    expect(dialog).toHaveTextContent("It is at its last level.");
    expect(dialog).toHaveTextContent("Your Town Hall is at its last level.");
    expect(screen.queryByRole("button", { name: /Upgrade/ })).toBeNull();
  });
});

describe("the Town Hall on the plan view (no 3D scene)", () => {
  it("opens its dialog from any of its cells in view; in edit mode, or with no dialog to open, the cells stay inert", async () => {
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
