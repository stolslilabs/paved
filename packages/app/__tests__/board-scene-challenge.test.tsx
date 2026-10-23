import { render, screen, within } from "@testing-library/react";
import { LazyMotion, domMax } from "motion/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { PlanType, deckSheetOrder } from "@paved/game-core";
import type { StackFrame } from "../src/components/containers/tile-stack";
import { Notice } from "../src/components/elements/notice";
import { BoardScene } from "../src/components/scenes/board-scene";
import { BOARD } from "../src/mocks/scenes";

const wrap = (ui: ReactNode) => <LazyMotion features={domMax}>{ui}</LazyMotion>;

// The board scene's props the Challenge board adds (P5): a read-only board, notices, the expiry's Surrender prompt.
describe("BoardScene, Challenge (P5)", () => {
  it("read only: no hand (the stack keeps the tiles left and the deck), the notices under the header", () => {
    render(wrap(<BoardScene {...BOARD.placing} readOnly notices={<Notice title="Connect to play">Read only.</Notice>} />));
    expect(screen.queryByRole("region", { name: "Your tile" })).not.toBeInTheDocument();
    expect(screen.getByText("Connect to play")).toBeInTheDocument();
  });

  it("read only: the same stack as the player's (#701), the game's tiles over the 3D pile, nothing to play", () => {
    const frames: StackFrame[] = [];
    const renderHandStack = (v: StackFrame) => {
      frames.push(v);
      return <span data-testid="stack-3d" />;
    };
    render(wrap(<BoardScene {...BOARD.queue} readOnly onDiscard={vi.fn()} onSurrender={vi.fn()} renderHandStack={renderHandStack} />));
    const deck = screen.getByRole("region", { name: "Deck" });
    expect(within(deck).getByTestId("stack-3d")).toBeInTheDocument();
    const top = frames.at(-1)!.tiles.filter((t) => t.thickness === undefined).map((t) => t.plan);
    expect(top).toEqual([...BOARD.queue.hand.coming.map((t) => t.plan), BOARD.queue.hand.tile.plan]);
    expect(within(deck).queryByTestId("stack-discard")).toBeNull();
    expect(within(deck).queryByTestId("hand-hint")).toBeNull();
  });

  it("a Story level's pile draws its tiles from the level's own deck (#701)", () => {
    const frames: StackFrame[] = [];
    const renderHandStack = (v: StackFrame) => {
      frames.push(v);
      return null;
    };
    const order = deckSheetOrder([PlanType.CCCCCCCCC, PlanType.WFFFFFFFF], []);
    render(wrap(<BoardScene {...BOARD.queue} mode="story" deckOrder={order} renderHandStack={renderHandStack} />));
    const pile = frames.at(-1)!.tiles.filter((t) => t.thickness !== undefined);
    expect(pile.length).toBe(BOARD.queue.remaining);
    expect(pile.every((t) => order.slots.some((s) => s.plan === t.plan))).toBe(true);
  });

  it("promptSurrender opens the Surrender dialog, which says why", async () => {
    render(wrap(<BoardScene {...BOARD.expired} promptSurrender />));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/24 hours are over/)).toBeInTheDocument();
  });

  it("without it the dialog stays closed", () => {
    render(wrap(<BoardScene {...BOARD.expired} />));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
