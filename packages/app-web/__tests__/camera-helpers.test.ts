import { describe, expect, it } from "vitest";
import { getCameraHotkeyAction, toggleCameraMode } from "../src/utils/camera-helpers";

describe("camera-helpers", () => {
  it("toggles play/showcase camera mode", () => {
    expect(toggleCameraMode("play")).toBe("showcase");
    expect(toggleCameraMode("showcase")).toBe("play");
  });

  it("maps V key to mode toggle", () => {
    expect(getCameraHotkeyAction("v")).toBe("toggle-mode");
    expect(getCameraHotkeyAction("V")).toBe("toggle-mode");
  });

  it("maps F key to recenter", () => {
    expect(getCameraHotkeyAction("f")).toBe("recenter");
    expect(getCameraHotkeyAction("F")).toBe("recenter");
  });

  it("returns null for non-camera keys", () => {
    expect(getCameraHotkeyAction("r")).toBeNull();
    expect(getCameraHotkeyAction("1")).toBeNull();
  });
});
