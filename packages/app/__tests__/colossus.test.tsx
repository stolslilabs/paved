import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, domMax } from "motion/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ColossusBoard } from "../src/components/containers/colossus-board";
import { ColossusPlaque } from "../src/components/containers/colossus-plaque";
import { ColossusGauge, colossusShare } from "../src/components/containers/colossus-site";
import { PlayModes } from "../src/components/containers/play-modes";
import { ColossusScene } from "../src/components/scenes/colossus-scene";
import { COLOSSUS, COLOSSUS_BOARD, COLOSSUS_CARD, COLOSSUS_NEXT, COLOSSUS_PLAQUE } from "../src/mocks/colossus";

// The Colossus's scenes (the weekly collective event) on their mocks: Play's card, the site's view, the builders, a board and its
// pick, last week's plaque. The routes are `colossus-route.test.tsx`'s, the mock's rules `colossus-mock.test.ts`'s.

const wrap = (ui: ReactNode) => <LazyMotion features={domMax}>{ui}</LazyMotion>;

describe("Play's Colossus card", () => {
  it("shows no card where the network has no Colossus", () => {
    render(wrap(<PlayModes spawnPaused={false} />));
    expect(screen.queryByRole("button", { name: "Colossus" })).toBeNull();
  });

  it("says the day, the monument, the gauge and the tiles in hand, with the week's time left, and opens on a tap", async () => {
    const onColossus = vi.fn();
    render(wrap(<PlayModes spawnPaused={false} {...COLOSSUS_CARD.week} onColossus={onColossus} />));
    const button = screen.getByRole("button", { name: "Colossus" });
    const { state } = COLOSSUS.site;
    expect(button).toHaveTextContent(`${state.monument} · ${Math.floor((state.stones * 100) / state.cells)}% · ${state.me!.hand.length} tiles`);
    expect(screen.getByRole("timer", { name: "3d 6h left this week" })).toBeInTheDocument();
    await userEvent.click(button);
    expect(onColossus).toHaveBeenCalledOnce();
  });

  it("shows no hand without an account", () => {
    render(wrap(<PlayModes spawnPaused={false} {...COLOSSUS_CARD.guest} />));
    expect(screen.getByRole("button", { name: "Colossus" })).not.toHaveTextContent("tiles");
  });
});

describe("the Colossus's site", () => {
  it("shows the gauge and its tiers, the viewer's week, the map, last week's plaque and the rules", () => {
    render(wrap(<ColossusScene {...COLOSSUS.site} />));
    const { state } = COLOSSUS.site;
    expect(screen.getByRole("heading", { name: state.monument })).toBeInTheDocument();
    expect(screen.getByText(/Day 4 of 7 · Thursday/)).toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveTextContent("3d 6h");
    const gauge = screen.getByRole("region", { name: "The gauge" });
    expect(within(gauge).getByRole("progressbar", { name: "Stones set" })).toHaveAttribute("aria-valuetext", colossusShare(state.stones, state.cells));
    expect(within(gauge).getByRole("list", { name: "Tiers" }).children).toHaveLength(4);
    const week = screen.getByRole("group", { name: "Your week" });
    expect(week).toHaveTextContent(`${state.me!.tiles}tiles laid`);
    expect(week).toHaveTextContent(`${state.me!.stones}stones`);
    // Nine tiles laid: the name is won.
    expect(state.me!.tiles).toBe(9);
    expect(screen.getByText(/Your name wears/)).toHaveTextContent(state.stone);
    // The map: a button a district, one for the heart.
    expect(screen.getAllByRole("button", { name: /^District [A-D][1-4]:/ })).toHaveLength(12);
    expect(screen.getByRole("button", { name: /^The heart:/ })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Last week's Colossus" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "The week's rules" })).toBeInTheDocument();
  });

  it("opens a district, the builders, and leads Build to a board with holes", async () => {
    const onLot = vi.fn();
    const onBuilders = vi.fn();
    render(wrap(<ColossusScene {...COLOSSUS.site} onLot={onLot} onBuilders={onBuilders} />));
    await userEvent.click(screen.getByRole("button", { name: /^District A1:/ }));
    expect(onLot).toHaveBeenLastCalledWith(1);
    await userEvent.click(screen.getByRole("button", { name: "Build" }));
    const target = COLOSSUS.site.state.lots.find((l) => l.board === onLot.mock.lastCall![0])!;
    expect(target.holes).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole("button", { name: "Builders" }));
    expect(onBuilders).toHaveBeenCalledOnce();
  });

  it("claims the tiers reached, for a builder who laid a tile", async () => {
    const onClaim = vi.fn();
    const state = { ...COLOSSUS.site.state, me: { ...COLOSSUS.site.state.me!, toClaim: 25 } };
    render(wrap(<ColossusScene {...COLOSSUS.site} state={state} onClaim={onClaim} />));
    await userEvent.click(within(screen.getByRole("region", { name: "The gauge" })).getByRole("button", { name: "Claim +25 Cobbles" }));
    expect(onClaim).toHaveBeenCalledWith(state.week);
  });

  it("tells a newcomer the tiers pay whoever lays a tile, and shows a guest no week of their own", () => {
    const { unmount } = render(wrap(<ColossusScene {...COLOSSUS.newcomer} />));
    expect(screen.getByText(/The tiers pay every builder who laid at least one tile/)).toBeInTheDocument();
    expect(screen.getByText(/0\/9/)).toBeInTheDocument();
    unmount();
    render(wrap(<ColossusScene {...COLOSSUS.guest} />));
    expect(screen.queryByRole("group", { name: "Your week" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Build" })).toBeNull();
  });

  it("waits while it is read, and says why it could not be", async () => {
    const { unmount } = render(wrap(<ColossusScene {...COLOSSUS.loading} />));
    expect(screen.getByLabelText("Colossus")).toHaveAttribute("aria-busy", "true");
    unmount();
    const onRetry = vi.fn();
    render(wrap(<ColossusScene {...COLOSSUS.failed} onRetry={onRetry} />));
    expect(screen.getByText("The Colossus could not be read.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

describe("the Colossus's builders", () => {
  it("lists every builder by stones set, the top 10 with their Cobbles, the viewer's row marked", async () => {
    const onOpenPlayer = vi.fn();
    render(wrap(<ColossusScene {...COLOSSUS.builders} onOpenPlayer={onOpenPlayer} />));
    const rows = within(screen.getByRole("list", { name: "Builders by stones set" })).getAllByRole("listitem");
    expect(rows).toHaveLength(COLOSSUS.builders.builders.length);
    expect(rows[0]).toHaveTextContent("150");
    expect(rows[10]).not.toHaveAttribute("title");
    expect(rows.filter((r) => r.hasAttribute("data-me"))).toHaveLength(1);
    await userEvent.click(within(rows[0]!).getByRole("button"));
    expect(onOpenPlayer).toHaveBeenCalledWith(COLOSSUS.builders.builders[0]!.profile.address);
  });
});

describe("a board of the Colossus", () => {
  it("shows the district's cells: tiles, holes, and the hand, with nothing to tap until a tile is picked", async () => {
    const onSelect = vi.fn();
    render(wrap(<ColossusBoard {...COLOSSUS_BOARD.idle} onSelect={onSelect} />));
    const { board } = COLOSSUS_BOARD.idle;
    const grid = screen.getByRole("grid", { name: `District ${board.name}` });
    expect(within(grid).getAllByRole("gridcell")).toHaveLength(64);
    expect(grid.querySelectorAll("[data-hole]")).toHaveLength(board.holes);
    expect(grid.querySelectorAll("[data-option]")).toHaveLength(0);
    expect(screen.getByText("Pick a tile of your hand.")).toBeInTheDocument();
    const hand = within(screen.getByRole("list", { name: "Hand" })).getAllByRole("button");
    expect(hand).toHaveLength(board.hand.length);
    await userEvent.click(hand[0]!);
    expect(onSelect).toHaveBeenCalledWith(board.hand[0]!.card);
  });

  it("marks the holes a picked tile may take with their stones, shows it where it is tapped, and lays it on Place", async () => {
    const onPlace = vi.fn();
    render(wrap(<ColossusBoard {...COLOSSUS_BOARD.picked} onPlace={onPlace} />));
    const { options, board } = COLOSSUS_BOARD.picked;
    const cells = new Set(options.placements.map((p) => `${p.x},${p.y}`));
    const grid = screen.getByRole("grid");
    expect(grid.querySelectorAll("[data-option]")).toHaveLength(cells.size);
    expect(grid.querySelectorAll("[data-refused]")).toHaveLength(options.refused.length);
    expect(screen.queryByRole("button", { name: /^Place/ })).toBeNull();
    const { x, y } = COLOSSUS_NEXT;
    const cell = within(grid).getByRole("gridcell", { name: new RegExp(`^row ${board.size - y}, column ${x + 1}: `) });
    await userEvent.click(cell);
    expect(cell).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: /^Place/ }));
    const first = options.placements.find((p) => p.x === x && p.y === y)!;
    expect(onPlace).toHaveBeenCalledWith({ card: COLOSSUS_NEXT.card, board: board.board, x, y, orientation: first.orientation });
  });

  it("waits for the holes of a tile just picked, and takes no tap while a tile is on its way", () => {
    const { unmount } = render(wrap(<ColossusBoard {...COLOSSUS_BOARD.reading} />));
    expect(screen.getByText("Looking where it fits…")).toBeInTheDocument();
    unmount();
    render(wrap(<ColossusBoard {...COLOSSUS_BOARD.busy} />));
    for (const cell of screen.getByRole("grid").querySelectorAll("[data-option]")) expect(cell).toBeDisabled();
  });

  it("shows the heart a quarter at a time", async () => {
    render(wrap(<ColossusBoard {...COLOSSUS_BOARD.heart} />));
    expect(within(screen.getByRole("grid", { name: "The heart, north-west quarter" })).getAllByRole("gridcell")).toHaveLength(64);
    await userEvent.click(screen.getByRole("button", { name: "South-east" }));
    expect(screen.getByRole("grid", { name: "The heart, south-east quarter" })).toBeInTheDocument();
  });

  it("says what the last tile did, over its board", () => {
    render(wrap(<ColossusScene {...COLOSSUS.placed} />));
    const { placed } = COLOSSUS.placed;
    expect(document.querySelector("[data-slot=colossus-placed]")).toHaveTextContent(`#${placed.mine.place} of ${placed.mine.builders} builders`);
  });
});

describe("last week's plaque", () => {
  it("names the top 10 and the capstone, and claims the viewer's tiers and place together", async () => {
    const onClaim = vi.fn();
    render(wrap(<ColossusPlaque {...COLOSSUS_PLAQUE.toClaim} onClaim={onClaim} />));
    const { result } = COLOSSUS_PLAQUE.toClaim;
    expect(within(screen.getByRole("list", { name: "The plaque: the top 10" })).getAllByRole("listitem")).toHaveLength(result.plaque.length);
    expect(screen.getByText(/You: /)).toHaveTextContent("#4 with 15 tiles");
    await userEvent.click(screen.getByRole("button", { name: "Claim +125 Cobbles" }));
    expect(onClaim).toHaveBeenCalledWith(result.week);
  });

  it("says the Cobbles are claimed, or that a player who laid no tile is paid nothing", () => {
    const { unmount } = render(wrap(<ColossusPlaque {...COLOSSUS_PLAQUE.claimed} />));
    expect(screen.getByText(/125 Cobbles claimed/)).toBeInTheDocument();
    unmount();
    render(wrap(<ColossusPlaque {...COLOSSUS_PLAQUE.absent} />));
    expect(screen.getByText(/You laid no tile last week/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Claim/ })).toBeNull();
  });

  it("shows the gauge a week reached when it ended before the last stone", () => {
    render(wrap(<ColossusPlaque {...COLOSSUS_PLAQUE.short} />));
    const { result } = COLOSSUS_PLAQUE.short;
    expect(screen.getByRole("heading", { name: colossusShare(result.stones, result.cells) })).toBeInTheDocument();
    expect(screen.queryByText("Complete!")).toBeNull();
  });
});

describe("the gauge", () => {
  it("never rounds a share up: 100% is every stone set", () => {
    expect(colossusShare(1_023, 1_024)).toBe("99.9%");
    expect(colossusShare(1_024, 1_024)).toBe("100.0%");
    render(wrap(<ColossusGauge stones={512} cells={1_024} builders={40} tiers={COLOSSUS.site.state.tiers} weekStart={0} />));
    expect(screen.getByText("50.0%")).toBeInTheDocument();
  });
});
