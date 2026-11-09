import { slow } from "../test-slow";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { planCode } from "../src/components/elements/tile-chip";
import { TileView } from "../src/components/containers/tile-view";
import { BoardScene } from "../src/components/scenes/board-scene";
import { SOURCE_ASSETS, originalTileArt } from "../src/mocks/assets";
import { BOARD_38 } from "../src/mocks/board";
import { BOARD } from "../src/mocks/scenes";
import { pts, settleBoardChunks, wrap } from "./scenes-helpers";
import { flushPending } from "./lazy-chunks";

// Each test's pending timers and effects run before its tree is unmounted (`lazy-chunks.ts`).
afterEach(flushPending);

describe("Board", () => {
  // Every chunk the board scene started loaded before the file ends (`scenes-helpers.tsx`).
  afterAll(settleBoardChunks, slow(30_000));

  it("draws the recorded board, the score, the tiles left and the time left", () => {
    render(wrap(<BoardScene {...BOARD.placing} />));
    expect(screen.getByRole("img", { name: `Board of ${BOARD_38.tiles.length} tiles` })).toBeInTheDocument();
    expect(screen.getByTestId("score-value")).toHaveTextContent(pts(BOARD.placing.score));
    expect(screen.getByTestId("tiles-left")).toHaveTextContent("12");
    expect(screen.queryByText(/discarded/)).not.toBeInTheDocument();
    expect(screen.getByRole("timer", { name: "Expires in 19:00:00" })).toBeInTheDocument();
  });

  it("the queue (#645): the two coming tiles beside the hand; a move on its way waits for the chain's draw", () => {
    const { unmount } = render(wrap(<BoardScene {...BOARD.queue} />));
    const coming = within(screen.getByRole("region", { name: "Your tile" })).getByRole("list", { name: "Coming tiles" });
    expect(within(coming).getAllByRole("listitem")).toHaveLength(2);
    unmount();
    render(wrap(<BoardScene {...BOARD.queueDrawing} />));
    const waiting = within(screen.getByRole("region", { name: "Your tile" })).getByRole("list", { name: "Coming tiles" });
    expect(within(waiting).getAllByRole("listitem")).toHaveLength(2);
    expect(within(waiting).getByRole("img", { name: "The chain draws this tile" })).toBeInTheDocument();
    expect(screen.getByText("Placing…")).toBeInTheDocument();
  });

  it("no dial at the bottom left (SEASONS-SETTINGS: the seasons and the day and night are Settings' choices): the stack has the board's width, read-only boards too", () => {
    const { container, unmount } = render(wrap(<BoardScene {...BOARD.queue} />));
    expect(container.querySelector("[data-dial-place]")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Season/ })).toBeNull();
    expect(screen.getByRole("region", { name: "Your tile" }).className).not.toMatch(/calc\(100vw-8\.25rem\)/);
    unmount();
    const readOnly = render(wrap(<BoardScene {...BOARD.placing} readOnly />));
    expect(readOnly.container.querySelector("[data-dial-place]")).toBeNull();
    expect(screen.getByRole("region", { name: "Deck" })).toBeInTheDocument();
  });

  it("shows the tile in hand with the board's art, turned to its orientation", () => {
    render(wrap(<BoardScene {...BOARD.placing} />));
    const chip = within(screen.getByRole("region", { name: "Your tile" })).getByRole("img", { name: /^Tile / });
    expect(chip).toHaveAttribute("data-view", "art");
    const art = chip.querySelector("img");
    expect(art).toHaveAttribute("src", `${SOURCE_ASSETS}/assets/tiles/${planCode(BOARD_38.next.plan).toLowerCase()}.png`);
    expect(art?.style.transform).toBe(`rotate(${(BOARD_38.next.orientation - 1) * 90}deg)`);
  });

  it("falls back to the tile art when there is no WebGL, without an error", () => {
    // jsdom has no WebGL: the renderer's tile view shows the PNG chip.
    const { unmount } = render(wrap(<TileView plan={BOARD_38.next.plan} orientation={2} basePath={SOURCE_ASSETS} tileArt={originalTileArt(SOURCE_ASSETS)} />));
    const chip = screen.getByRole("img", { name: /^Tile / });
    expect(chip).toHaveAttribute("data-view", "art");
    expect(chip.querySelector("img")).toHaveAttribute("src", `${SOURCE_ASSETS}/assets/tiles/${planCode(BOARD_38.next.plan).toLowerCase()}.png`);
    expect(document.querySelector("canvas")).toBeNull();
    unmount();
  });

  it("falls back to the plan's nine areas without the art", () => {
    render(wrap(<BoardScene {...BOARD.placing} tileArt={undefined} />));
    expect(within(screen.getByRole("region", { name: "Your tile" })).getByRole("img", { name: /^Tile / })).toHaveAttribute("data-view", "areas");
  });

  it("has no Place tile: no bubble before a slot, then the bubble's hold places and the HUD shows the points (#568)", async () => {
    const { unmount } = render(wrap(<BoardScene {...BOARD.placing} />));
    expect(screen.queryByRole("button", { name: /Place tile/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Hold to place the tile" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("score-preview")).not.toBeInTheDocument();
    unmount();
    const onConfirm = vi.fn();
    render(wrap(<BoardScene {...BOARD.slotChosen} bubble={{ ...BOARD.slotChosen.bubble, onConfirm }} />));
    expect(screen.getByTestId("score-preview")).toHaveTextContent("(+30)");
    const validate = await screen.findByRole("button", { name: "Hold to place the tile" });
    // A tap does not place: the ring starts and rewinds.
    await userEvent.click(validate);
    expect(onConfirm).not.toHaveBeenCalled();
    // A screen reader's activation (no press before it) places at once.
    fireEvent.click(validate);
    expect(onConfirm).toHaveBeenCalledOnce();
    // The hand has no Rotate and no Place: they are the bubble's, on the tile.
    const hand = screen.getByRole("region", { name: "Your tile" });
    expect(within(hand).queryByRole("button", { name: /Rotate|Place/ })).not.toBeInTheDocument();
  });

  it("the bubble (plan view): Rotate only with several valid rotations, Close always, and the R and Escape keys", async () => {
    const onRotate = vi.fn();
    const onClose = vi.fn();
    const cell = { x: 0, y: 0 };
    const { unmount } = render(wrap(<BoardScene {...BOARD.slotChosen} bubble={{ cell, rotations: 1, onRotate, onClose }} />));
    await screen.findByRole("button", { name: "Cancel placement" });
    expect(screen.queryByRole("button", { name: "Rotate tile" })).not.toBeInTheDocument();
    await userEvent.keyboard("r");
    expect(onRotate).not.toHaveBeenCalled();
    unmount();

    render(wrap(<BoardScene {...BOARD.slotChosen} bubble={{ cell, rotations: 2, onRotate, onClose }} />));
    await userEvent.click(await screen.findByRole("button", { name: "Rotate tile" }));
    await userEvent.keyboard("R");
    expect(onRotate).toHaveBeenCalledTimes(2);
    await userEvent.click(screen.getByRole("button", { name: "Cancel placement" }));
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("the stack: the tile and the hint, its Discard held while no cell is chosen; then the bubble has Discard (#606)", async () => {
    const onDiscard = vi.fn();
    const { unmount } = render(wrap(<BoardScene {...BOARD.placing} onDiscard={onDiscard} />));
    const stack = screen.getByRole("region", { name: "Your tile" });
    expect(screen.getByTestId("hand-hint")).toHaveTextContent("Tap a lit slot on the board.");
    const discard = within(stack).getByRole("button", { name: /^Hold to discard the tile/ });
    // The score is above 50: a discard costs 50, and its name says so.
    expect(discard).toHaveAccessibleName("Hold to discard the tile (costs 50 points)");
    // A tap does not discard; a screen reader's activation does.
    await userEvent.click(discard);
    expect(onDiscard).not.toHaveBeenCalled();
    fireEvent.click(discard);
    expect(onDiscard).toHaveBeenCalledOnce();
    // No Surrender on the board: it is in the settings.
    expect(screen.queryByRole("button", { name: /Surrender/ })).not.toBeInTheDocument();
    unmount();
    render(wrap(<BoardScene {...BOARD.slotChosen} bubble={{ ...BOARD.slotChosen.bubble, onDiscard }} />));
    expect(within(screen.getByRole("region", { name: "Your tile" })).queryByRole("button", { name: /discard/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId("hand-hint")).not.toBeInTheDocument();
    const names = (await screen.findByRole("toolbar", { name: "Tile" })).querySelectorAll("button");
    expect([...names].map((b) => b.getAttribute("aria-label"))).toEqual(["Cancel placement", "Hold to place the tile", "Rotate tile", "Hold to discard the tile (costs 50 points)"]);
  });

  it("says when the tile fits nowhere, its Discard still offered", () => {
    render(wrap(<BoardScene {...BOARD.placing} hand={{ ...BOARD.placing.hand, fitsNowhere: true }} />));
    expect(screen.getByTestId("stack-discard")).toHaveTextContent("This tile fits nowhere");
    expect(within(screen.getByTestId("stack-discard")).getByRole("button", { name: /^Hold to discard/ })).toBeEnabled();
  });

  it("the stack: the tiles left on its badge, a tap opens the deck sheet; a read-only board keeps it", async () => {
    const { unmount } = render(wrap(<BoardScene {...BOARD.placing} />));
    await userEvent.click(screen.getByRole("button", { name: "Tiles left: 12. Show the deck" }));
    expect(await screen.findByRole("dialog", { name: "Deck" }, { timeout: slow(5000) })).toBeInTheDocument();
    unmount();
    render(wrap(<BoardScene {...BOARD.placing} readOnly />));
    expect(screen.queryByRole("region", { name: "Your tile" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Deck" })).getByTestId("tiles-left")).toHaveTextContent("12");
  });

  it("shows the closing points of the last move", () => {
    render(wrap(<BoardScene {...BOARD.closing} />));
    expect(screen.getByText("City")).toBeInTheDocument();
    expect(screen.getByText("+320")).toBeInTheDocument();
    expect(screen.getByText("+370")).toBeInTheDocument();
  });

  it("locks the hand while a move is pending, and the bubble's Validate and Discard wait", async () => {
    const { unmount } = render(wrap(<BoardScene {...BOARD.slotChosen} bubble={{ ...BOARD.slotChosen.bubble, onDiscard: vi.fn(), busy: true }} />));
    expect(await screen.findByRole("button", { name: "Hold to place the tile" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: /^Hold to discard/ })).toBeDisabled();
    unmount();
    render(wrap(<BoardScene {...BOARD.pending} />));
    expect(screen.getByTestId("hand-hint")).toHaveTextContent("Placing…");
    expect(screen.queryByRole("button", { name: /discard/i })).not.toBeInTheDocument();
  });

  it("says why a move was refused, in a banner above the stack, and lets the player try again", () => {
    render(wrap(<BoardScene {...BOARD.refused} hand={{ ...BOARD.refused.hand, slotChosen: false }} />));
    expect(within(screen.getByRole("region", { name: "Your tile" })).getByRole("alert")).toHaveTextContent("Move refused");
    expect(screen.getByRole("button", { name: /^Hold to discard/ })).toBeEnabled();
  });

  it("asks to surrender an expired game from its banner and allows nothing else", async () => {
    const onSurrender = vi.fn();
    render(wrap(<BoardScene {...BOARD.expired} onSurrender={onSurrender} />));
    expect(screen.getByRole("timer", { name: "Expired" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /discard/i })).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Game expired");
    await userEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: /Surrender/ }));
    expect(onSurrender).not.toHaveBeenCalled();
    await userEvent.click(within(await screen.findByRole("dialog", { name: "Surrender this game?" })).getByRole("button", { name: "Surrender" }));
    expect(onSurrender).toHaveBeenCalledOnce();
  });

  it("asks before a surrender, from the settings (#606); Esc and Keep playing close the dialog without surrendering (P3)", async () => {
    const onSurrender = vi.fn();
    render(wrap(<BoardScene {...BOARD.placing} onSurrender={onSurrender} />));
    const surrender = async () => {
      await userEvent.click(screen.getByRole("button", { name: "Settings" }));
      await userEvent.click(within(await screen.findByRole("dialog", { name: "Settings" }, { timeout: slow(5000) })).getByRole("button", { name: /^Surrender/ }));
    };
    await surrender();
    expect(await screen.findByRole("dialog", { name: "Surrender this game?" })).toHaveTextContent(pts(BOARD.placing.score));
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await surrender();
    await userEvent.click(await screen.findByRole("button", { name: "Keep playing" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(onSurrender).not.toHaveBeenCalled();
    await surrender();
    await userEvent.click(within(await screen.findByRole("dialog", { name: "Surrender this game?" })).getByRole("button", { name: "Surrender" }));
    expect(onSurrender).toHaveBeenCalledOnce();
  });

  it("training (TRAINING-END): Restart is the painted arrow in the header, held as Story's; no dialog, the settings have no game row", async () => {
    const onRestart = vi.fn();
    const { unmount } = render(wrap(<BoardScene {...BOARD.training} onRestart={onRestart} />));
    const restart = screen.getByRole("button", { name: "Hold to restart the game" });
    // In the header, before the gear, as Story's.
    expect(restart.closest("header")).not.toBeNull();
    expect(restart.querySelector("img")).toHaveAttribute("src", expect.stringContaining("/restart.webp"));
    const controls = within(restart.closest("header")!).getAllByRole("button").map((b) => b.getAttribute("aria-label"));
    expect(controls.slice(-2)).toEqual(["Hold to restart the game", "Settings"]);
    // A tap does nothing; a hold of HOLD_MS restarts, with no dialog.
    fireEvent.pointerDown(restart, { button: 0 });
    fireEvent.pointerUp(restart, { button: 0 });
    fireEvent.click(restart, { detail: 1 });
    expect(onRestart).not.toHaveBeenCalled();
    fireEvent.pointerDown(restart, { button: 0 });
    await waitFor(() => expect(onRestart).toHaveBeenCalledOnce(), { timeout: slow(2000) });
    fireEvent.pointerUp(restart, { button: 0 });
    expect(screen.queryByRole("dialog", { name: /Restart/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Settings" }));
    const sheet = await screen.findByRole("dialog", { name: "Settings" }, { timeout: slow(5000) });
    expect(within(sheet).queryByRole("button", { name: /Restart|Surrender/ })).not.toBeInTheDocument();
    unmount();
    // The game over (no tile in hand, its end on its way): the arrow keeps its place, dimmed.
    render(wrap(<BoardScene {...BOARD.training} hand={{ ...BOARD.training.hand, state: "empty" }} onRestart={onRestart} />));
    expect(screen.getByRole("button", { name: "Hold to restart the game" })).toBeDisabled();
  });

  it("story (GAME-OVERLAY): Restart is the painted arrow on the board, held as the tile's Discard; the settings have no game row", async () => {
    const onRestart = vi.fn();
    const { unmount } = render(wrap(<BoardScene {...BOARD.training} mode="story" onRestart={onRestart} />));
    const restart = screen.getByRole("button", { name: "Hold to restart the level" });
    // In the header, before the gear: the painted icon is the whole button, no word.
    expect(restart.closest("header")).not.toBeNull();
    expect(restart).toHaveTextContent("");
    expect(restart.querySelector("img")).toHaveAttribute("src", expect.stringContaining("/restart.webp"));
    expect(restart.querySelector("[data-tube='red']")).not.toBeNull();
    // A tap does nothing; a hold of HOLD_MS restarts, with no dialog.
    fireEvent.pointerDown(restart, { button: 0 });
    fireEvent.pointerUp(restart, { button: 0 });
    fireEvent.click(restart, { detail: 1 });
    expect(onRestart).not.toHaveBeenCalled();
    fireEvent.pointerDown(restart, { button: 0 });
    await waitFor(() => expect(onRestart).toHaveBeenCalledOnce(), { timeout: slow(2000) });
    fireEvent.pointerUp(restart, { button: 0 });
    expect(screen.queryByRole("dialog", { name: /Restart/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Settings" }));
    const sheet = await screen.findByRole("dialog", { name: "Settings" }, { timeout: slow(5000) });
    expect(within(sheet).queryByRole("button", { name: /Restart|Surrender/ })).not.toBeInTheDocument();
    unmount();
    // The level's intro or end over the board: the arrow keeps its place, dimmed.
    render(wrap(<BoardScene {...BOARD.training} mode="story" readOnly onRestart={onRestart} />));
    expect(screen.getByRole("button", { name: "Hold to restart the level" })).toBeDisabled();
  });

  it("plays on the plan view's slots", async () => {
    const onSlotClick = vi.fn();
    const slot = { x: BOARD_38.next.x, y: BOARD_38.next.y };
    render(wrap(<BoardScene {...BOARD.training} slots={[slot]} onSlotClick={onSlotClick} />));
    expect(screen.getByRole("group", { name: `Board of ${BOARD_38.tiles.length} tiles` })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^Slot / }));
    expect(onSlotClick).toHaveBeenCalledWith(slot);
  });

  it("the plan view draws its plates only while the placement highlight is on; off, the slots stay buttons", async () => {
    const onSlotClick = vi.fn();
    const slot = { x: BOARD_38.next.x, y: BOARD_38.next.y };
    const plate = () => screen.getByRole("button", { name: /^Slot / }).querySelector("[data-plate]");
    const { rerender } = render(wrap(<BoardScene {...BOARD.training} slots={[{ ...slot, fits: false }]} onSlotClick={onSlotClick} />));
    expect(screen.getByRole("button", { name: /^Slot / })).toHaveAttribute("data-lit", "true");
    // One playable plate whether or not the current rotation fits (PLACEMENT-TINTS).
    expect(plate()).toHaveAttribute("data-plate", "playable");
    rerender(wrap(<BoardScene {...BOARD.training} slots={[{ ...slot, fits: true }]} onSlotClick={onSlotClick} />));
    expect(plate()).toHaveAttribute("data-plate", "playable");
    expect(screen.getByRole("button", { name: /^Slot / })).toHaveAttribute("data-fits", "true");
    rerender(wrap(<BoardScene {...BOARD.training} slots={[slot]} onSlotClick={onSlotClick} placementHighlight={false} />));
    const plain = screen.getByRole("button", { name: /^Slot / });
    expect(plain).toHaveAttribute("data-lit", "false");
    expect(plain.querySelector("[data-plate]")).toBeNull();
    await userEvent.click(plain);
    expect(onSlotClick).toHaveBeenCalledWith(slot);
  });

  it("a Training game shows no deadline and no storage notice (#718)", () => {
    render(wrap(<BoardScene {...BOARD.training} />));
    expect(screen.getByRole("heading", { name: "Training" })).toBeInTheDocument();
    expect(screen.queryByText("Storage is off")).not.toBeInTheDocument();
    expect(screen.queryByText(/Expires in/)).not.toBeInTheDocument();
  });

  it("warns in Story when storage is off: its progress is not saved", () => {
    render(wrap(<BoardScene {...BOARD.storageDisabled} />));
    expect(screen.getByText("Storage is off")).toBeInTheDocument();
  });

  it("draws the 72-tile board and the canvas a page gives instead of the plan view", () => {
    const { unmount } = render(wrap(<BoardScene {...BOARD.large} />));
    expect(screen.getByRole("img", { name: "Board of 72 tiles" })).toBeInTheDocument();
    unmount();
    render(wrap(<BoardScene {...BOARD.placing} canvas={<canvas data-testid="renderer" />} />));
    expect(screen.getByTestId("renderer")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /Board of/ })).not.toBeInTheDocument();
  });
});
