import { useState } from "react";
import { useSidePanel } from "../../lib/side-panel";
import { autoQuality, deviceSettings, useDeviceSettings, withVolume } from "../../data/settings";
import { cn } from "../../lib/utils";
import { Icon } from "../ui/icon";
import { ScrollRegion } from "../ui/scroll-region";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../ui/sheet";
import { DeviceSettingsPanel, QualityChoice, type DeviceSettingsPanelProps } from "./device-settings-panel";
import { SettingsGroup } from "./settings-group";

/**
 * What the board offers on its game, at the top of its settings (#606): Surrender in a Challenge, Restart level in Story
 * mode, Restart in Training. Each asks first (the board's dialogs); the sheet closes on the tap.
 */
export interface GameAction {
  kind: "surrender" | "restart";
  label: string;
  hint: string;
  onSelect: () => void;
  /** A move on its way, or nothing left to restart: the row is shown, disabled. */
  disabled?: boolean;
}

/** The game's row: a whole-width raised press (the drawer's), destructive for Surrender. */
export function GameActionRow({ action }: { action: GameAction }) {
  const destructive = action.kind === "surrender";
  return (
    <button
      type="button"
      onClick={action.onSelect}
      disabled={action.disabled}
      className="drawer-raised state-layer flex min-h-12 cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 text-left outline-none disabled:pointer-events-none disabled:opacity-50"
    >
      <span className="inline-flex h-6 items-center">
        <Icon name={destructive ? "flag" : "arrows-rotate"} className={destructive ? "text-destructive-text" : "text-primary"} fixedWidth />
      </span>
      <span className="flex min-w-0 flex-1 flex-col wrap-anywhere">
        <span className={cn("text-outline font-semibold", destructive && "text-destructive-text")}>{action.label}</span>
        <span className="text-sm text-muted-foreground">{action.hint}</span>
      </span>
    </button>
  );
}

export interface DeviceSettingsSheetProps extends DeviceSettingsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Force a side (the stories show both at one width); by the screen's width otherwise. */
  side?: "bottom" | "right";
  /** The board's game: its Surrender or Restart, above the device settings. */
  game?: GameAction;
}

/**
 * The device settings over the board (#541): a bottom sheet on a phone, a side panel from `tablet` up, the same
 * `DeviceSettingsPanel` as the Settings page, on the HUD drawer's charcoal (SETTINGS-PAGE). The board stays alive behind it; a change
 * applies at once. The quality's pill opens its choice in the sheet's place, with Back to the settings, as the Settings drawer does.
 */
export function DeviceSettingsSheet({ open, onOpenChange, side, game, ...panel }: DeviceSettingsSheetProps) {
  const wide = useSidePanel();
  const where = side ?? (wide ? "right" : "bottom");
  const [quality, setQuality] = useState(false);
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) setQuality(false);
        onOpenChange(next);
      }}
    >
      <SheetContent side={where} className={cn("bg-secondary", where === "bottom" ? "max-h-[85dvh] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]" : "w-full max-w-sm p-4")} aria-describedby={undefined}>
        <SheetHeader className="pr-10">
          {quality ? (
            <div className="-ml-3 flex items-center gap-1">
              <button type="button" onClick={() => setQuality(false)} className="state-layer grid size-11 shrink-0 cursor-pointer place-items-center rounded-full outline-none">
                <Icon name="chevron-left" className="drawer-icon" />
                <span className="sr-only">Back</span>
              </button>
              <SheetTitle className="text-outline font-display text-lg">Graphics quality</SheetTitle>
            </div>
          ) : (
            <>
              <SheetTitle className="text-outline font-display text-lg">Settings</SheetTitle>
              <SheetDescription>On this device. A change applies at once.</SheetDescription>
            </>
          )}
        </SheetHeader>
        {/* The header stays; the settings scroll under it with the edge hint (NO-SCROLLBARS, #609). */}
        <ScrollRegion className="-mx-4 min-h-0 px-4">
          {quality ? (
            <QualityChoice quality={panel.preferences.quality} autoQuality={panel.autoQuality} onChange={(q) => panel.onChange?.("quality", q)} />
          ) : (
            <div className="flex flex-col gap-4">
              {game && (
                <SettingsGroup title="This game" surface="links">
                  <GameActionRow action={game} />
                </SettingsGroup>
              )}
              <DeviceSettingsPanel {...panel} onOpenQuality={() => setQuality(true)} />
            </div>
          )}
        </ScrollRegion>
      </SheetContent>
    </Sheet>
  );
}

/** The sheet on the app's stores: what the board opens from its gear. Its own chunk (`BoardScene` imports it on demand). */
export default function BoardSettingsSheet({ open, onOpenChange, game }: { open: boolean; onOpenChange: (open: boolean) => void; game?: GameAction }) {
  const [settings, set] = useDeviceSettings();
  return (
    <DeviceSettingsSheet
      open={open}
      onOpenChange={onOpenChange}
      game={game}
      preferences={settings}
      autoQuality={autoQuality()}
      onChange={set}
      onVolumeChange={(channel, volume) => deviceSettings.set(withVolume(deviceSettings.get(), channel, volume))}
    />
  );
}
