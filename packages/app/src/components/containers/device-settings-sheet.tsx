import { useSidePanel } from "../../lib/side-panel";
import { autoQuality, deviceSettings, useDeviceSettings, withVolume } from "../../data/settings";
import { cn } from "../../lib/utils";
import { Icon } from "../ui/icon";
import { ScrollRegion } from "../ui/scroll-region";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../ui/sheet";
import { DeviceSettingsPanel, type DeviceSettingsPanelProps } from "./device-settings-panel";
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

/** The game's row: a whole-width button, destructive for Surrender. */
export function GameActionRow({ action }: { action: GameAction }) {
  const destructive = action.kind === "surrender";
  return (
    <button
      type="button"
      onClick={action.onSelect}
      disabled={action.disabled}
      className="state-layer -mx-2 flex min-h-11 cursor-pointer items-start gap-3 rounded-lg px-2 py-2.5 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
    >
      <span className="inline-flex h-5 items-center">
        <Icon name={destructive ? "flag" : "arrows-rotate"} className={destructive ? "text-destructive-text" : "text-primary"} size="sm" fixedWidth />
      </span>
      <span className="flex min-w-0 flex-1 flex-col wrap-anywhere">
        <span className={cn("text-sm leading-5", destructive && "text-destructive-text")}>{action.label}</span>
        <span className="text-xs text-muted-foreground">{action.hint}</span>
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
 * `DeviceSettingsPanel` as the Settings page. The board stays alive behind it; a change applies at once.
 */
export function DeviceSettingsSheet({ open, onOpenChange, side, game, ...panel }: DeviceSettingsSheetProps) {
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
          {game && (
            <SettingsGroup title="This game">
              <GameActionRow action={game} />
            </SettingsGroup>
          )}
          <DeviceSettingsPanel {...panel} />
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
