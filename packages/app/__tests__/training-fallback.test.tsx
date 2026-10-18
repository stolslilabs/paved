import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GameCanvasProps } from "@paved/renderer/react";
import { App } from "../src/App";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed } from "../src/routes/welcomed";
import { fakeSources, memoryStore } from "./data-fakes";
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

const open = () => render(<App router={createTestRouter("/training")} sources={fakeSources({ store: () => memoryStore() }).sources} />);
// The plan view lights the slots as buttons; the 3D board lights them in its canvas.
const planView = () => screen.queryAllByRole("button", { name: /^Slot / });

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

describe("/training: the plan view is the fallback of the 3D board (ASSETS)", () => {
  it("shows the 3D board when WebGL is there, and loads its assets from the app's own origin", async () => {
    open();
    await screen.findByTestId("renderer", {}, { timeout: 5000 });
    expect(planView()).toHaveLength(0);
    expect(canvas.props!.basePath).toBe("/renderer-assets");
  });

  it("falls back to the plan view when an asset does not load, and the game still plays", async () => {
    open();
    await screen.findByTestId("renderer", {}, { timeout: 5000 });
    act(() => canvas.props!.onError!(new Error("GLTFLoader: Couldn't load /renderer-assets/models/ccccccccc.glb (404)")));
    expect(screen.queryByTestId("renderer")).not.toBeInTheDocument();
    expect(planView().length).toBeGreaterThan(0);
    await chooseFirstSlot();
    expect(await screen.findByRole("button", { name: "Cancel placement" })).toBeEnabled();
  });

  it("shows the plan view at once, and starts no renderer, when the browser has no WebGL", async () => {
    canvas.webgl = false;
    open();
    expect(await screen.findByRole("heading", { level: 1, name: "Training" }, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByTestId("renderer")).not.toBeInTheDocument();
    expect(canvas.props).toBeNull();
    expect(planView().length).toBeGreaterThan(0);
  });
});
