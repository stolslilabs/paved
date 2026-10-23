import { slow } from "../test-slow";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, domMax } from "motion/react";
import { useContext } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GameCanvasProps } from "@paved/renderer/react";
import { BoardScene } from "../src/components/scenes/board-scene";
import { BoardCovered } from "../src/components/containers/board-covered";
import { BoardViewport } from "../src/components/containers/board-viewport";
import { BOARD } from "../src/mocks/scenes";

// The board is covered while a sheet hides it (#572): the renderer's ambient loop stops (`GameScene.setCovered`).

const canvas = vi.hoisted(() => ({ props: null as GameCanvasProps | null }));
vi.mock("@paved/renderer/react", () => ({
  GameCanvas: (props: GameCanvasProps) => {
    canvas.props = props;
    return null;
  },
}));

/** A stand-in for the page's canvas: what it reads of the cover. */
function Probe() {
  return <span data-testid="covered">{String(useContext(BoardCovered))}</span>;
}

function stubWidth(wide: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: wide && query.includes("min-width"), addEventListener: vi.fn(), removeEventListener: vi.fn() }));
}

afterEach(() => vi.unstubAllGlobals());

describe("the board covered (#572)", () => {
  it("on a phone, the settings sheet covers the board's canvas until it closes", async () => {
    stubWidth(false);
    render(
      <LazyMotion features={domMax}>
        <BoardScene {...BOARD.placing} canvas={<Probe />} />
      </LazyMotion>,
    );
    expect(screen.getByTestId("covered")).toHaveTextContent("false");
    await userEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByTestId("covered")).toHaveTextContent("true");
    await screen.findByRole("dialog", { name: "Settings" }, { timeout: slow(5000) });
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.getByTestId("covered")).toHaveTextContent("false"));
  });

  it("from tablet up the sheet is a side panel: the board stays in view, not covered", async () => {
    stubWidth(true);
    render(
      <LazyMotion features={domMax}>
        <BoardScene {...BOARD.placing} canvas={<Probe />} />
      </LazyMotion>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByTestId("covered")).toHaveTextContent("false");
  });

  it("BoardViewport hands the cover to the renderer's canvas", () => {
    const { rerender } = render(<BoardViewport tiles={[]} />);
    expect(canvas.props?.covered).toBe(false);
    rerender(
      <BoardCovered.Provider value={true}>
        <BoardViewport tiles={[]} />
      </BoardCovered.Provider>,
    );
    expect(canvas.props?.covered).toBe(true);
  });
});
