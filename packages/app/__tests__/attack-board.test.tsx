import { slow } from "../test-slow";
import { act, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AttackRun, CENTER } from "@paved/game-core";
import { App } from "../src/App";
import type { BoardViewportProps } from "../src/components/containers/board-viewport";
import type { GameSigner } from "../src/data";
import { BOARD_FOG } from "../src/data/settings";
import { RIVAL_BACKDROP, RIVAL_FOG, sideSettings } from "../src/data/board-settings";
import { RENDERER_ASSETS } from "../src/data/renderer-manifest";
import { queryClient } from "../src/lib/query-client";
import { useAttackLegality } from "../src/routes/attack-board";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { mockImplementation } from "./mock-fakes";
import { preloadPages } from "./route-helpers";
import { fakeWallet } from "./wallet-fakes";

// BOARD-MODULE-2 (#772): the attack, its scout and its replay on the boards' module. The attack's routes draw the 3D board every
// game draws (the board module's canvas, the defender's skins, the rival's red void), place through the boards' placement
// (`usePlacement` on `AttackRun`'s legality), and the scout and the replay draw the same board, read only.

// The renderer's canvas, recorded instead of drawn (jsdom has no WebGL); the module believes WebGL is there.
const drawn = vi.hoisted(() => ({ board: [] as BoardViewportProps[] }));
vi.mock("../src/components/containers/board-viewport", async (actual) => ({
  ...(await actual<object>()),
  BoardViewport: (props: BoardViewportProps) => {
    drawn.board.push(props);
    return <div data-testid="board-3d" />;
  },
}));
vi.mock("../src/components/containers/tile-view", async (actual) => ({ ...(await actual<object>()), hasWebGL: () => true }));
vi.mock("../src/components/containers/stack-view", async (actual) => ({ ...(await actual<object>()), canDrawStack: () => false }));

const WAIT = { timeout: slow(8000) };
const last = () => drawn.board.at(-1)!;
const backdropOf = (props: BoardViewportProps) => (props.settings?.squareGrid as { backdrop?: Record<string, unknown> } | undefined)?.backdrop;

describe("the rival's void (#772)", () => {
  it("keeps the green on the player's own boards and gives a rival's the reds, with less of the season", () => {
    const grid = { enabled: true, backdrop: { pattern: "voxels" as const } };
    expect(sideSettings("own", grid)).toEqual({ fog: BOARD_FOG, squareGrid: grid });
    const rival = sideSettings("rival", grid);
    expect(rival.squareGrid).toEqual({ enabled: true, backdrop: { pattern: "voxels", ...RIVAL_BACKDROP } });
    expect(RIVAL_BACKDROP.seasonShare).toBe(0.3);
    expect(rival.fog).toEqual({ ...BOARD_FOG, ...RIVAL_FOG });
  });

  it("with the square grid off, tints the fog only (the void is the fog then)", () => {
    expect(sideSettings("rival", { enabled: false })).toEqual({ fog: { ...BOARD_FOG, ...RIVAL_FOG }, squareGrid: { enabled: false } });
  });
});

describe("an attack's legality for the boards' placement", () => {
  it("gives `usePlacement` the cells and rotations `AttackRun` allows, in the board's coordinates", () => {
    const run = new AttackRun({ territory: null });
    const plan = 3;
    const cells = run.slots(plan);
    const { result } = renderHook(() => useAttackLegality(run, plan));
    const board = cells.map((c) => ({ x: CENTER + c.x, y: CENTER + c.y }));
    // Every legal cell is a slot of some rotation, and each rotation's slots are exactly the cells it fits.
    for (const o of [1, 2, 3, 4]) {
      const fits = cells.filter((c) => run.orientations(plan, c).includes(o)).map((c) => ({ x: CENTER + c.x, y: CENTER + c.y }));
      expect(result.current.slotsAt(o)).toEqual(fits);
    }
    expect(result.current.orientationsAt(board[0]!)).toEqual(run.orientations(plan, cells[0]!));
    expect(result.current.orientationsAt({ x: CENTER + 40, y: CENTER })).toEqual([]);
    expect(result.current.empty).toBe(cells.length === 0);
    // No tile in hand: nothing legal.
    expect(renderHook(() => useAttackLegality(run, null)).result.current.slotsAt(1)).toEqual([]);
  });
});

/** The mock's sources, the wallet restored; `v1` hides PvP v2's attack, as `pvp-route.test.tsx` does. */
async function open(path: string, prepare?: (s: ReturnType<typeof mockImplementation>, me: string) => Promise<void>, v1 = false) {
  const s = mockImplementation();
  if (v1) s.sources.views = new Proxy(s.sources.views, { get: (target, key) => (key === "attackV2" ? undefined : Reflect.get(target, key)) });
  const me = s.sources.signer!.address;
  await prepare?.(s, me);
  const wallet = fakeWallet({ address: me, restored: true });
  wallet.connector.signer = () => s.sources.signer as GameSigner;
  render(<App router={createTestRouter(path)} sources={s.sources} connector={wallet.load} />);
  return { ...s, me };
}

preloadPages("home");
beforeAll(async () => {
  await Promise.all([import("../src/routes/pages/pvp"), import("../src/routes/pvp-v2"), import("../src/routes/pages/pvp-result"), import("../src/routes/pages/pvp-replay")]);
}, slow(60_000));
beforeEach(() => {
  drawn.board.length = 0;
  queryClient.clear();
  localStorage.clear();
  resetWelcomedForTests();
  markWelcomed();
});
afterEach(() => {
  queryClient.clear();
  localStorage.clear();
  resetWelcomedForTests();
});

describe("/pvp on the board module", { timeout: slow(30_000) }, () => {
  it("scouts the rival's village on the 3D board, read only, in the red void", async () => {
    await open("/pvp", async (s, me) => {
      const writes = s.ledger.writesFor(me);
      await writes.foundFreeVillage();
      await writes.drawOpponentV2("search");
    });
    expect(await screen.findByRole("heading", { name: "Scout" }, WAIT)).toBeInTheDocument();
    await waitFor(() => expect(last().tiles.length).toBeGreaterThan(1), WAIT);
    expect(screen.getByTestId("board-3d")).toBeInTheDocument();
    expect(last()).toMatchObject({ basePath: RENDERER_ASSETS });
    expect(last().slots).toBeUndefined();
    expect(backdropOf(last())).toMatchObject(RIVAL_BACKDROP);
  });

  it("plays the attack as a Training game: the 3D board, the red void, a slot chosen, the bubble's hold, the green flash", async () => {
    const s = await open("/pvp", async (s, me) => {
      const writes = s.ledger.writesFor(me);
      await writes.foundFreeVillage();
      await writes.drawOpponentV2("search");
      await writes.startAttackV2();
    });
    expect(await screen.findByRole("heading", { name: /^Attack: / }, WAIT)).toBeInTheDocument();
    // The boards' scene: the season dial and the stack beside it, the star meter in the attack's slot.
    expect(screen.getByRole("meter")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Your tile" })).toBeInTheDocument();
    await waitFor(() => expect(last().slots?.length).toBeGreaterThan(0), WAIT);
    expect(backdropOf(last())).toMatchObject(RIVAL_BACKDROP);
    expect(last().settings?.fog).toMatchObject(RIVAL_FOG);
    expect(last().bubble).toBeNull();
    // A tap on a lit cell places the tile there: the ghost and the bubble go to the canvas, as on Training's board.
    const slot = last().slots!.find((c) => c.fits) ?? last().slots![0]!;
    act(() => last().onCellClick?.({ x: slot.x, y: slot.y }));
    await waitFor(() => expect(last().bubble).not.toBeNull(), WAIT);
    expect(last().ghost).toMatchObject({ x: slot.x, y: slot.y, placed: true, fits: true });
    act(() => last().bubble!.onConfirm());
    await waitFor(async () => expect((await s.ledger.attackV2(s.me)).attack!.moves).toHaveLength(1), WAIT);
    const move = (await s.ledger.attackV2(s.me)).attack!.moves[0]!;
    expect(move).toMatchObject({ discard: false, cell: { x: slot.x - CENTER, y: slot.y - CENTER } });
    // The move lands: the tile on the board, the confirm's green flash, the bubble gone.
    await waitFor(() => expect(last().tiles).toHaveLength(2), WAIT);
    expect(last().confirmed).toMatchObject({ x: slot.x, y: slot.y });
    expect(last().bubble).toBeNull();
  });
});

describe("/pvp/replay on the board module", { timeout: slow(30_000) }, () => {
  it("replays an attack on the 3D board, read only, red on the rival's village", async () => {
    await open(
      "/pvp/result/1",
      async (s, me) => {
        const writes = s.ledger.writesFor(me);
        await writes.foundVillage();
        await writes.drawOpponent("search");
        await writes.startAttack();
        for (;;) {
          const attack = await s.ledger.pvpAttack(me);
          if (attack.status !== 1) return;
          await writes.playAttack({ discard: true });
        }
      },
      true,
    );
    await screen.findByRole("heading", { name: /Defeat|Victory|Triumph/ }, WAIT);
    await userEvent.click(screen.getByRole("button", { name: /Replay/ }));
    const bar = await screen.findByRole("group", { name: "Replay" }, WAIT);
    await waitFor(() => expect(drawn.board.length).toBeGreaterThan(0), WAIT);
    expect(screen.getByTestId("board-3d")).toBeInTheDocument();
    expect(last().slots).toBeUndefined();
    expect(last().ghost).toBeNull();
    expect(backdropOf(last())).toMatchObject(RIVAL_BACKDROP);
    await userEvent.click(within(bar).getByRole("button", { name: "Next move" }));
    expect(within(bar).getByText(/^1\//)).toBeInTheDocument();
  });
});
