import { useEffect, useState } from "react";
import { autoQuality, deviceSettings, useDeviceSettings, withVolume } from "../../data/settings";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../ui/sheet";
import { DeviceSettingsPanel, type DeviceSettingsPanelProps } from "./device-settings-panel";

/** The side panel from this width (`--breakpoint-tablet`), the bottom sheet under it. */
const SIDE_PANEL_QUERY = "(min-width: 40rem)";

function useSidePanel(): boolean {
  const [side, setSide] = useState(() => typeof matchMedia === "function" && matchMedia(SIDE_PANEL_QUERY).matches);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const query = matchMedia(SIDE_PANEL_QUERY);
    const on = () => setSide(query.matches);
    query.addEventListener("change", on);
    return () => query.removeEventListener("change", on);
  }, []);
  return side;
}

export interface DeviceSettingsSheetProps extends DeviceSettingsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Force a side (the stories show both at one width); by the screen's width otherwise. */
  side?: "bottom" | "right";
}

/**
 * The device settings over the board (#541): a bottom sheet on a phone, a side panel from `tablet` up, the same
 * `DeviceSettingsPanel` as the Settings page. The board stays alive behind it; a change applies at once.
 */
export function DeviceSettingsSheet({ open, onOpenChange, side, ...panel }: DeviceSettingsSheetProps) {
  const wide = useSidePanel();
  const where = side ?? (wide ? "right" : "bottom");
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={where} className={where === "bottom" ? "max-h-[85dvh] overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]" : "w-full max-w-sm overflow-y-auto p-4"} aria-describedby={undefined}>
        <SheetHeader className="pr-10">
          <SheetTitle className="font-display text-lg">Settings</SheetTitle>
          <SheetDescription>On this device. A change applies at once.</SheetDescription>
        </SheetHeader>
        <DeviceSettingsPanel {...panel} />
      </SheetContent>
    </Sheet>
  );
}

/** The sheet on the app's stores: what the board opens from its gear. Its own chunk (`BoardScene` imports it on demand). */
export default function BoardSettingsSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [settings, set] = useDeviceSettings();
  return (
    <DeviceSettingsSheet
      open={open}
      onOpenChange={onOpenChange}
      preferences={settings}
      autoQuality={autoQuality()}
      onChange={set}
      onVolumeChange={(channel, volume) => deviceSettings.set(withVolume(deviceSettings.get(), channel, volume))}
    />
  );
}
