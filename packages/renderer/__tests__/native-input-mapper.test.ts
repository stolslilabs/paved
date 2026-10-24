import { describe, expect, it } from "vitest";
import { NativeInputMapper } from "../src/core/native-input-mapper";

describe("NativeInputMapper", () => {
  it("emits click for tap within threshold", () => {
    const mapper = new NativeInputMapper({ clickThreshold: 6 });

    mapper.handleStart({ pointerId: 1, x: 100, y: 100 });
    mapper.handleMove({ pointerId: 1, x: 103, y: 102 });
    const events = mapper.handleEnd({ pointerId: 1, x: 103, y: 102 });

    expect(events).toEqual([{ type: "click", x: 103, y: 102 }]);
  });

  it("suppresses click after drag and emits pan deltas", () => {
    const mapper = new NativeInputMapper({ clickThreshold: 4 });

    mapper.handleStart({ pointerId: 1, x: 50, y: 50 });
    const moveEvents = mapper.handleMove({ pointerId: 1, x: 62, y: 46 });
    const endEvents = mapper.handleEnd({ pointerId: 1, x: 64, y: 45 });

    expect(moveEvents).toEqual([{ type: "pan", dx: 12, dy: -4 }]);
    expect(endEvents).toEqual([]);
  });

  it("emits pinch scale when two touches move", () => {
    const mapper = new NativeInputMapper();

    mapper.handleStart({ pointerId: 1, x: 10, y: 10 });
    mapper.handleStart({ pointerId: 2, x: 30, y: 10 });

    const events = mapper.handleMove({ pointerId: 2, x: 40, y: 10 });

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("pinch");
    expect(events[0]).toMatchObject({ scale: 1.5 });
  });

  it("emits only pinches, never a tilt, when two touches move up or down together, and no click after (#719)", () => {
    const mapper = new NativeInputMapper();

    mapper.handleStart({ pointerId: 1, x: 10, y: 100 });
    mapper.handleStart({ pointerId: 2, x: 60, y: 100 });

    expect(mapper.handleMove({ pointerId: 1, x: 10, y: 80 })).toEqual([{ type: "pinch", scale: Math.hypot(50, 20) / 50 }]);
    expect(mapper.handleMove({ pointerId: 2, x: 60, y: 80 })).toEqual([{ type: "pinch", scale: 50 / Math.hypot(50, 20) }]);
    expect(mapper.handleEnd({ pointerId: 1, x: 10, y: 80 })).toEqual([]);
    expect(mapper.handleEnd({ pointerId: 2, x: 60, y: 80 })).toEqual([]);
  });
});
