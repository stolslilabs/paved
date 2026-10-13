import { describe, expect, it } from "vitest";
import { getCameraHotkeyAction } from "../src/utils/camera-helpers";

describe("camera/gameplay hotkey compatibility", () => {
  it("keeps gameplay keys out of camera actions", () => {
    for (const key of ["r", "c", "d"]) {
      expect(getCameraHotkeyAction(key)).toBeNull();
    }
  });

  it("still maps camera keys to their intended actions", () => {
    expect(getCameraHotkeyAction("v")).toBe("toggle-mode");
    expect(getCameraHotkeyAction("f")).toBe("recenter");
  });
});
