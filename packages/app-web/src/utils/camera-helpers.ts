import type { CameraMode } from "@paved/renderer";

export type CameraHotkeyAction = "toggle-mode" | "recenter";

export function toggleCameraMode(mode: CameraMode): CameraMode {
  return mode === "play" ? "showcase" : "play";
}

export function getCameraHotkeyAction(key: string): CameraHotkeyAction | null {
  switch (key.toLowerCase()) {
    case "v":
      return "toggle-mode";
    case "f":
      return "recenter";
    default:
      return null;
  }
}
