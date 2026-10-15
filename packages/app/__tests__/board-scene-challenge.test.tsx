import { render, screen, within } from "@testing-library/react";
import { LazyMotion, domMax } from "motion/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { Notice } from "../src/components/elements/notice";
import { BoardScene } from "../src/components/scenes/board-scene";
import { BOARD } from "../src/mocks/scenes";

const wrap = (ui: ReactNode) => <LazyMotion features={domMax}>{ui}</LazyMotion>;

// The board scene's props the Challenge board adds (P5): a read-only board, notices, the expiry's Surrender prompt.
describe("BoardScene, Challenge (P5)", () => {
  it("read only: no hand, the notices under the header", () => {
    render(wrap(<BoardScene {...BOARD.placing} readOnly notices={<Notice title="Connect to play">Read only.</Notice>} />));
    expect(screen.queryByRole("region", { name: "Your tile" })).not.toBeInTheDocument();
    expect(screen.getByText("Connect to play")).toBeInTheDocument();
  });

  it("promptSurrender opens the Surrender dialog, which says why", () => {
    render(wrap(<BoardScene {...BOARD.expired} promptSurrender />));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/24 hours are over/)).toBeInTheDocument();
  });

  it("without it the dialog stays closed", () => {
    render(wrap(<BoardScene {...BOARD.expired} />));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
