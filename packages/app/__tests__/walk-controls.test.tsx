import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { LazyMotion, domMax } from "motion/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WalkControl } from "@paved/renderer";
import { MIN_STICK_PX, VirtualStick, tiltOf } from "../src/components/elements/virtual-stick";
import { WALK_HINTS, WalkControls } from "../src/components/containers/walk-controls";
import { useWalkInput } from "../src/lib/use-walk-input";

// V4-WALK-1 (#876): the walk's sticks, its overlay and its desktop input.
const wrap = (ui: ReactNode) => <LazyMotion features={domMax}>{ui}</LazyMotion>;

afterEach(() => vi.restoreAllMocks());

describe("VirtualStick", () => {
  it("tilts by the finger's place from its centre, up positive, held to the rim, nothing in the dead zone", () => {
    expect(tiltOf(32, 0, 64)).toEqual({ x: 0.5, y: 0 });
    expect(tiltOf(0, -64, 64)).toEqual({ x: 0, y: 1 });
    const far = tiltOf(300, 400, 64);
    expect(far.x).toBeCloseTo(0.6);
    expect(far.y).toBeCloseTo(-0.8);
    expect(tiltOf(2, 2, 64)).toEqual({ x: 0, y: 0 });
  });

  it("follows the finger that pressed it and comes back to rest when let go; at least 120 px", () => {
    const onTilt = vi.fn();
    render(<VirtualStick label="Move" onTilt={onTilt} size={80} />);
    const stick = screen.getByRole("group", { name: "Move" });
    expect(stick.style.width).toBe(`${MIN_STICK_PX}px`);
    vi.spyOn(stick, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 120, height: 120, right: 120, bottom: 120, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.pointerDown(stick, { pointerId: 1, clientX: 90, clientY: 60 });
    expect(onTilt).toHaveBeenLastCalledWith({ x: 0.5, y: 0 });
    // A second finger on the same stick is ignored.
    fireEvent.pointerMove(stick, { pointerId: 2, clientX: 0, clientY: 0 });
    expect(onTilt).toHaveBeenCalledTimes(1);
    fireEvent.pointerMove(stick, { pointerId: 1, clientX: 60, clientY: 0 });
    expect(onTilt).toHaveBeenLastCalledWith({ x: 0, y: 1 });
    fireEvent.pointerUp(stick, { pointerId: 1 });
    expect(onTilt).toHaveBeenLastCalledWith({ x: 0, y: 0 });
  });
});

describe("WalkControls", () => {
  it("on touch while walking: Exit, the move stick and the look stick", () => {
    const onExit = vi.fn();
    render(wrap(<WalkControls input="touch" phase="walking" onExit={onExit} />));
    expect(screen.getByRole("group", { name: "Move" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Look" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Exit" }));
    expect(onExit).toHaveBeenCalledOnce();
  });

  it("on a desktop: a line of help, by whether the mouse is locked, and no stick", () => {
    const { rerender } = render(wrap(<WalkControls input="desktop" phase="walking" onExit={() => {}} />));
    expect(screen.getByText(WALK_HINTS.free)).toBeInTheDocument();
    expect(screen.queryByRole("group")).toBeNull();
    rerender(wrap(<WalkControls input="desktop" phase="walking" mouseLocked onExit={() => {}} />));
    expect(screen.getByText(WALK_HINTS.locked)).toBeInTheDocument();
  });

  it("shows no stick until the walker stands, says it is loading, and spends Exit on the way back", () => {
    const { rerender } = render(wrap(<WalkControls input="touch" phase="loading" onExit={() => {}} />));
    expect(screen.getByRole("status")).toHaveTextContent("Finding a street");
    expect(screen.queryByRole("group")).toBeNull();
    rerender(wrap(<WalkControls input="touch" phase="entering" onExit={() => {}} />));
    expect(screen.queryByRole("group")).toBeNull();
    rerender(wrap(<WalkControls input="touch" phase="leaving" onExit={() => {}} />));
    expect(screen.getByRole("button", { name: "Exit" })).toBeDisabled();
  });
});

describe("useWalkInput", () => {
  function control(): WalkControl & { setMove: ReturnType<typeof vi.fn>; look: ReturnType<typeof vi.fn> } {
    return { setMove: vi.fn(), setLookRate: vi.fn(), look: vi.fn(), state: vi.fn() } as never;
  }

  it("moves by the keys' places (ZQSD on AZERTY sends KeyW, KeyA, KeyS, KeyD) and stops when they come up", () => {
    const walk = control();
    const target = { current: document.createElement("div") };
    renderHook(() => useWalkInput(walk, target, () => {}));
    // Z on an AZERTY keyboard: `key` is "z", `code` is KeyW.
    act(() => void window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW", key: "z" })));
    expect(walk.setMove).toHaveBeenLastCalledWith({ x: 0, y: 1 });
    act(() => void window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyA", key: "q" })));
    const diagonal = walk.setMove.mock.lastCall![0];
    expect(diagonal.x).toBeLessThan(0);
    expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(1);
    act(() => void window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyW" })));
    act(() => void window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyA" })));
    expect(walk.setMove).toHaveBeenLastCalledWith({ x: 0, y: 0 });
    // A key that does not walk does nothing.
    const calls = walk.setMove.mock.calls.length;
    act(() => void window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyZ" })));
    expect(walk.setMove).toHaveBeenCalledTimes(calls);
  });

  it("stops on a lost focus, leaves on Escape with the mouse free, and binds nothing without a walk", () => {
    const walk = control();
    const onExit = vi.fn();
    const target = { current: document.createElement("div") };
    const { rerender } = renderHook(({ c }) => useWalkInput(c, target, onExit), { initialProps: { c: walk as WalkControl | null } });
    act(() => void window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyD" })));
    act(() => void window.dispatchEvent(new Event("blur")));
    expect(walk.setMove).toHaveBeenLastCalledWith({ x: 0, y: 0 });
    act(() => void window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape" })));
    expect(onExit).toHaveBeenCalledOnce();
    rerender({ c: null });
    act(() => void window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape" })));
    expect(onExit).toHaveBeenCalledOnce();
  });

  it("asks for the pointer lock on a click on the board and looks by the mouse's movement while locked", () => {
    const walk = control();
    const element = document.createElement("div");
    const canvas = document.createElement("canvas");
    const button = document.createElement("button");
    element.append(canvas, button);
    const requestPointerLock = vi.fn();
    element.requestPointerLock = requestPointerLock;
    const target = { current: element };
    const { result } = renderHook(() => useWalkInput(walk, target, () => {}));
    // A press on the overlay (Exit, a stick) asks for nothing; one on the board does.
    act(() => void button.click());
    expect(requestPointerLock).not.toHaveBeenCalled();
    act(() => void canvas.click());
    expect(requestPointerLock).toHaveBeenCalledOnce();
    Object.defineProperty(document, "pointerLockElement", { value: element, configurable: true });
    act(() => void document.dispatchEvent(new Event("pointerlockchange")));
    expect(result.current.mouseLocked).toBe(true);
    const move = new MouseEvent("mousemove");
    Object.defineProperties(move, { movementX: { value: 12 }, movementY: { value: -4 } });
    act(() => void document.dispatchEvent(move));
    expect(walk.look).toHaveBeenCalledWith(12, -4);
    // The browser's jump as the lock starts is dropped.
    const jump = new MouseEvent("mousemove");
    Object.defineProperties(jump, { movementX: { value: -900 }, movementY: { value: 0 } });
    act(() => void document.dispatchEvent(jump));
    expect(walk.look).toHaveBeenCalledOnce();
    Object.defineProperty(document, "pointerLockElement", { value: null, configurable: true });
  });
});

describe("useWalkInput on touch", () => {
  it("asks for no pointer lock", () => {
    const element = document.createElement("div");
    const canvas = document.createElement("canvas");
    element.append(canvas);
    element.requestPointerLock = vi.fn();
    const target = { current: element };
    renderHook(() => useWalkInput({ setMove: vi.fn(), setLookRate: vi.fn(), look: vi.fn(), state: vi.fn() } as never, target, () => {}, false));
    act(() => void canvas.click());
    expect(element.requestPointerLock).not.toHaveBeenCalled();
  });
});
