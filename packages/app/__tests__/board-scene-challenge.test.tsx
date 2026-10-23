import { render, screen, within } from "@testing-library/react";
import { LazyMotion, domMax } from "motion/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { Notice } from "../src/components/elements/notice";
import { BoardScene } from "../src/components/scenes/board-scene";
import { BOARD } from "../src/mocks/scenes";
import type { StackFrame } from "../src/components/containers/tile-stack";
import { PlanType, deckSheetOrder } from "@paved/game-core";

const wrap = (ui: ReactNode) => <LazyMotion features={domMax}>{ui}</LazyMotion>;

// The board scene's props the Challenge board adds (P5): a read-only board, notices, the expiry's Surrender prompt.
describe("BoardScene, Challenge (P5)", () => {
  it("read only: the player's tile and coming tiles on the one stack, nothing to play (#701), the notices under the header", () => {
    const hand = { ...BOARD.queue.hand, state: "refused" as const, error: "Refused." };
    render(wrap(<BoardScene {...BOARD.queue} hand={hand} readOnly notices={<Notice title="Connect to play">Read only.</Notice>} />));
    expect(screen.queryByRole("region", { name: "Your tile" })).not.toBeInTheDocument();
    const stack = screen.getByRole("region", { name: "Deck" });
    expect(within(stack).getByRole("list", { name: "Coming tiles" }).querySelectorAll("li")).toHaveLength(2);
    expect(stack.querySelector("[data-stack-top]")).not.toBeNull();
    expect(within(stack).queryByTestId("hand-hint")).toBeNull();
    expect(within(stack).queryByTestId("stack-discard")).toBeNull();
    expect(within(stack).queryByRole("alert")).toBeNull();
    expect(screen.getAllByRole("region", { name: /^(Deck|Your tile)$/ })).toHaveLength(1);
    expect(screen.getByText("Connect to play")).toBeInTheDocument();
  });

  it("read only: the 3D stack gets the board's renderer, its pile the base deck or a Story level's own deck", () => {
    const frames: StackFrame[] = [];
    const renderHandStack = (v: StackFrame) => {
      frames.push(v);
      return <span data-testid="stack-3d" />;
    };
    const { unmount } = render(wrap(<BoardScene {...BOARD.queue} readOnly renderHandStack={renderHandStack} />));
    expect(screen.getByTestId("stack-3d")).toBeInTheDocument();
    const pile = () => new Set(frames.at(-1)!.tiles.filter((t) => t.thickness !== undefined).map((t) => t.plan));
    expect(pile().size).toBeGreaterThan(1);
    unmount();
    const order = deckSheetOrder([PlanType.CCCCCFFFC], []);
    render(wrap(<BoardScene {...BOARD.queue} mode="story" deckOrder={order} readOnly renderHandStack={renderHandStack} />));
    expect(pile()).toEqual(new Set([order.slots[0]!.plan]));
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
