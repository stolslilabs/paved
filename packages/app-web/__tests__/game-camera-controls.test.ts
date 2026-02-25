import { describe, expect, it } from "vitest";
import { getCameraHotkeyAction } from "../src/utils/camera-helpers";
import { spotKeyToNumber } from "../src/utils/game-helpers";

describe("camera/gameplay hotkey compatibility", () => {
  it("keeps gameplay keys out of camera actions", () => {
    for (const key of ["r", "c", "d", "1", "5", "9"]) {
      expect(getCameraHotkeyAction(key)).toBeNull();
    }
  });

  it("keeps camera keys out of spot-selection mapping", () => {
    expect(spotKeyToNumber("v")).toBeNull();
    expect(spotKeyToNumber("f")).toBeNull();
    expect(spotKeyToNumber("V")).toBeNull();
    expect(spotKeyToNumber("F")).toBeNull();
  });

  it("still maps camera keys to their intended actions", () => {
    expect(getCameraHotkeyAction("v")).toBe("toggle-mode");
    expect(getCameraHotkeyAction("f")).toBe("recenter");
  });
});
