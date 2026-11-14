import { slow } from "../test-slow";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameCanvasProps } from "@paved/renderer/react";
import { markWelcomed } from "../src/routes/welcomed";
import { openPuzzleBoard, resetPuzzleBoard } from "./puzzle-fakes";
import { preloadPages } from "./route-helpers";

// The renderer's canvas, as the page drives it: the test hands it the failure a model that does not load raises.
const canvas = vi.hoisted(() => ({ props: null as GameCanvasProps | null, webgl: true }));
vi.mock("@paved/renderer/react", () => ({
  GameCanvas: (props: GameCanvasProps) => {
    canvas.props = props;
    return <canvas data-testid="renderer" />;
  },
}));
vi.mock("../src/components/containers/tile-view", async (original) => ({
  ...(await original<typeof import("../src/components/containers/tile-view")>()),
  hasWebGL: () => canvas.webgl,
}));

/** A Puzzle board of the mocks' player (`openPuzzleBoard`): a board page whose game plays on the device. */
const open = () => openPuzzleBoard();
// The plan view lights the slots as buttons; the 3D board lights them in its canvas.
const planView = () => screen.queryAllByRole("button", { name: /^Slot / });

/**
 * The 3D board, its slots lit: the wallet gave the player's account (until then the game shows read-only, with no slot to light).
 */
async function litCanvas() {
  await screen.findByTestId("renderer", {}, { timeout: slow(8000) });
  await waitFor(() => expect(canvas.props!.availableSlots!.some((s) => s.legal !== false)).toBe(true), { timeout: slow(5000) });
}

/** The plan view lights every slot the tile fits in any rotation: choosing one places it and shows the bubble. */
async function chooseFirstSlot() {
  await userEvent.click(planView()[0]!);
}

preloadPages("board");

beforeEach(() => {
  canvas.props = null;
  canvas.webgl = true;
  markWelcomed();
});
afterEach(resetPuzzleBoard);

describe("the board: the plan view is the fallback of the 3D board (ASSETS)", () => {
  it("shows the 3D board when WebGL is there, and loads its assets from the app's own origin", async () => {
    await open();
    await litCanvas();
    expect(planView()).toHaveLength(0);
    expect(canvas.props!.basePath).toBe("/renderer-assets");
  });

  it("falls back to the plan view when an asset does not load, and the game still plays", async () => {
    await open();
    await litCanvas();
    act(() => canvas.props!.onError!(new Error("GLTFLoader: Couldn't load /renderer-assets/models/ccccccccc.glb (404)")));
    expect(screen.queryByTestId("renderer")).not.toBeInTheDocument();
    expect(planView().length).toBeGreaterThan(0);
    await chooseFirstSlot();
    expect(await screen.findByRole("button", { name: "Cancel placement" })).toBeEnabled();
  });

  it("shows the plan view at once, and starts no renderer, when the browser has no WebGL", async () => {
    canvas.webgl = false;
    await open();
    // The plan view's slots, lit once the wallet gave the player's account (until then the game shows read-only).
    expect(await screen.findAllByRole("button", { name: /^Slot / }, { timeout: slow(8000) })).not.toHaveLength(0);
    expect(screen.getByRole("heading", { level: 1, name: "Puzzle" })).toBeInTheDocument();
    expect(screen.queryByTestId("renderer")).not.toBeInTheDocument();
    expect(canvas.props).toBeNull();
    expect(planView().length).toBeGreaterThan(0);
  });
});
