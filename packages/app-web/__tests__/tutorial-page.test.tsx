// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TutorialPage } from "../src/pages/Tutorial";
import { TUTORIAL_STORAGE_KEY } from "../src/tutorial/tutorial-storage";
import { WRONG_ORIENTATION, WRONG_SQUARE, orientationCode, scriptedMoves, tutorialSteps, type TutorialMove } from "../src/tutorial/tutorial-run";

// Nothing of the chain may be touched: any use of the package throws.
const chainTouched = vi.hoisted(() => ({ count: 0 }));
vi.mock("@paved/chain", () => {
  const boom = () => {
    chainTouched.count += 1;
    throw new Error("the tutorial touched the chain package");
  };
  return new Proxy({}, { get: boom, has: boom, ownKeys: boom });
});

interface CanvasProps {
  tiles: Array<{ worldX: number; worldZ: number }>;
  availableSlots: Array<{ x: number; y: number }>;
  hover: { x: number; y: number; valid: boolean; orientation: number } | null;
  onTileClick?: (x: number, y: number) => void;
}
const canvas: { props: CanvasProps | null } = vi.hoisted(() => ({ props: null }));
vi.mock("@paved/renderer/react", () => ({
  GameCanvas: (props: CanvasProps) => {
    canvas.props = props;
    return <div data-testid="canvas" data-tiles={props.tiles.length} data-slots={JSON.stringify(props.availableSlots)} />;
  },
}));
vi.mock("@paved/ui", () => ({
  IngameStatus: ({ score }: { score: number }) => <output data-testid="score">{score}</output>,
  ActionBar: (p: { orientation: number; onRotate: () => void; onConfirm: () => void; onDiscard: () => void; confirmDisabled: boolean; discardDisabled: boolean }) => (
    <div data-testid="bar" data-orientation={p.orientation}>
      <button type="button" onClick={p.onRotate}>Rotate</button>
      <button type="button" disabled={p.confirmDisabled} onClick={p.onConfirm}>Confirm</button>
      <button type="button" disabled={p.discardDisabled} onClick={p.onDiscard}>Discard</button>
    </div>
  ),
}));

const steps = tutorialSteps();
const orientationOnBar = () => Number(screen.getByTestId("bar").getAttribute("data-orientation"));
const mount = () => render(<MemoryRouter><TutorialPage /></MemoryRouter>);
const stageText = () => screen.getByTestId("stage-text").textContent;

/** Rotates the tile to the step's orientation, then confirms (or discards on the burn step). */
function playStep(index: number) {
  const step = steps[index]!;
  if (step.kind === "burn") {
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    return;
  }
  const want = orientationCode(step.placement!.orientation);
  for (let i = 0; i < 4 && orientationOnBar() !== want; i++) fireEvent.click(screen.getByRole("button", { name: "Rotate" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
}

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  canvas.props = null;
});

describe("Tutorial page", () => {
  it("plays from the first stage to the last, and the final score is the tutorial golden's", () => {
    mount();
    expect(stageText()).toBe(steps[0]!.text);
    expect(screen.getByTestId("canvas").getAttribute("data-tiles")).toBe("1");
    steps.forEach((_, i) => {
      expect(stageText()).toBe(steps[i]!.text);
      playStep(i);
    });
    expect(screen.getByTestId("tutorial-complete")).toBeTruthy();
    expect(screen.getByTestId("final-score").textContent).toBe("Final score: 2794");
    expect(screen.getByTestId("score").textContent).toBe("2794");
    expect(screen.getByText("THE TUTORIAL IS COMPLETE.")).toBeTruthy();
    // Training (the Landing until T1's route exists) and the Landing.
    expect(screen.getByRole("link", { name: "Training" }).getAttribute("href")).toBe("/");
    expect(screen.getByRole("link", { name: "Landing" }).getAttribute("href")).toBe("/");
    expect(chainTouched.count).toBe(0);
  });

  it("highlights the preset's square and shows the closures of a move", () => {
    mount();
    const preset = steps[0]!.placement!;
    expect(JSON.parse(screen.getByTestId("canvas").getAttribute("data-slots")!)).toEqual([{ x: preset.x, y: 0 - preset.y }]);
    for (let i = 0; i < 3; i++) playStep(i);
    // The third stage closes the city: a closure line is in the live region.
    expect(screen.getByTestId("closures").textContent).toMatch(/closed/i);
  });

  it("refuses another orientation or square, says so, and keeps the stage", () => {
    mount();
    const want = orientationCode(steps[0]!.placement!.orientation);
    expect(orientationOnBar()).toBe(want);
    fireEvent.click(screen.getByRole("button", { name: "Rotate" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(screen.getByTestId("notice").textContent).toBe(WRONG_ORIENTATION);
    expect(screen.getByTestId("score").textContent).toBe("0");
    expect(stageText()).toBe(steps[0]!.text);

    fireEvent.click(screen.getByRole("button", { name: "Rotate" }));
    fireEvent.click(screen.getByRole("button", { name: "Rotate" }));
    fireEvent.click(screen.getByRole("button", { name: "Rotate" }));
    act(() => canvas.props!.onTileClick!(5, 5));
    expect(screen.getByTestId("notice").textContent).toBe(WRONG_SQUARE);
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(screen.getByTestId("notice").textContent).toBe(WRONG_SQUARE);
    expect(screen.getByTestId("canvas").getAttribute("data-tiles")).toBe("1");
  });

  it("the burn step is a discard through Next, Back undoes a move, Restart starts over", () => {
    window.localStorage.setItem(TUTORIAL_STORAGE_KEY, JSON.stringify({ version: 1, moves: scriptedMoves().slice(0, 7) }));
    mount();
    expect(stageText()).toBe(steps[7]!.text);
    expect((screen.getByRole("button", { name: "Confirm" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Discard" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(stageText()).toBe(steps[8]!.text);
    expect((screen.getByRole("button", { name: "Next" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(stageText()).toBe(steps[7]!.text);
    fireEvent.click(screen.getByRole("button", { name: "Restart" }));
    expect(stageText()).toBe(steps[0]!.text);
    expect(screen.getByTestId("score").textContent).toBe("0");
    expect(window.localStorage.getItem(TUTORIAL_STORAGE_KEY)).toBeNull();
    expect((screen.getByRole("button", { name: "Back" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("keys: R rotates, C confirms", () => {
    mount();
    const want = orientationCode(steps[0]!.placement!.orientation);
    fireEvent.keyDown(window, { key: "r" });
    expect(orientationOnBar()).toBe((want % 4) + 1);
    fireEvent.keyDown(window, { key: "r" });
    fireEvent.keyDown(window, { key: "r" });
    fireEvent.keyDown(window, { key: "r" });
    fireEvent.keyDown(window, { key: "c" });
    expect(stageText()).toBe(steps[1]!.text);
  });

  it("a reload resumes the stage from the saved moves", () => {
    mount();
    for (let i = 0; i < 4; i++) playStep(i);
    const saved = JSON.parse(window.localStorage.getItem(TUTORIAL_STORAGE_KEY)!) as { moves: TutorialMove[] };
    expect(saved.moves).toHaveLength(4);
    cleanup();
    mount();
    expect(stageText()).toBe(steps[4]!.text);
    expect(screen.getByTestId("canvas").getAttribute("data-tiles")).toBe("5");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Tutorial: step 5 of 9");
  });

  it("a save that no longer replays starts over", () => {
    window.localStorage.setItem(TUTORIAL_STORAGE_KEY, JSON.stringify({ version: 1, moves: [{ kind: "discard" }] }));
    mount();
    expect(stageText()).toBe(steps[0]!.text);
  });

  it("works with storage that throws", () => {
    const original = Object.getOwnPropertyDescriptor(window, "localStorage");
    const fail = () => {
      throw new Error("blocked");
    };
    Object.defineProperty(window, "localStorage", { configurable: true, get: fail });
    try {
      mount();
      for (let i = 0; i < steps.length; i++) playStep(i);
      expect(screen.getByTestId("final-score").textContent).toBe("Final score: 2794");
      fireEvent.click(screen.getByRole("button", { name: "Restart" }));
      expect(stageText()).toBe(steps[0]!.text);
    } finally {
      if (original) Object.defineProperty(window, "localStorage", original);
      else Reflect.deleteProperty(window, "localStorage");
    }
  });

  it("keeps the stage text in a polite live region and the controls as buttons", () => {
    mount();
    const live = screen.getByTestId("stage-text");
    expect(live.getAttribute("role")).toBe("status");
    expect(live.getAttribute("aria-live")).toBe("polite");
    for (const name of ["Back", "Next", "Restart", "Rotate", "Confirm"]) {
      expect(screen.getByRole("button", { name }).tagName).toBe("BUTTON");
    }
  });

  it("constructs no writer, account, Controller session or indexer client", () => {
    mount();
    for (let i = 0; i < steps.length; i++) playStep(i);
    expect(chainTouched.count).toBe(0);
  });
});
