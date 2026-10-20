import { useSidePanel } from "../../lib/side-panel";
import { autoQuality, deviceSettings, useDeviceSettings, withVolume } from "../../data/settings";
import { ScrollRegion } from "../ui/scroll-region";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../ui/sheet";
import { DeviceSettingsPanel, type DeviceSettingsPanelProps } from "./device-settings-panel";

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
      <SheetContent side={where} className={where === "bottom" ? "max-h-[85dvh] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]" : "w-full max-w-sm p-4"} aria-describedby={undefined}>
        <SheetHeader className="pr-10">
          <SheetTitle className="font-display text-lg">Settings</SheetTitle>
          <SheetDescription>On this device. A change applies at once.</SheetDescription>
        </SheetHeader>
        {/* The header stays; the settings scroll under it with the edge hint (NO-SCROLLBARS, #609). */}
        <ScrollRegion className="-mx-4 min-h-0 px-4">
          <DeviceSettingsPanel {...panel} />
        </ScrollRegion>
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
