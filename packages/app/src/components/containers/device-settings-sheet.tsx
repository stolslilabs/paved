import { useState } from "react";
import { autoQuality, deviceSettings, useDeviceSettings, withVolume } from "../../data/settings";
import { UiIcon } from "../elements/ui-icon";
import { DeviceSettingsPanel, QualityChoice, type DeviceSettingsPanelProps } from "./device-settings-panel";
import { HudDrawer } from "./hud-drawer";
import { SettingsGroup } from "./settings-group";

/**
 * What the board offers on its game, at the top of its settings (#606): Surrender in a Challenge (Story's and Training's Restart is held
 * on the board, GAME-OVERLAY, TRAINING-END). It asks first (the board's dialog); the drawer closes on the tap.
 */
export interface GameAction {
  kind: "surrender";
  label: string;
  hint: string;
  onSelect: () => void;
  /** A move on its way, or the game over: the row is shown, disabled. */
  disabled?: boolean;
}

/** The game's row: a whole-width raised press (the drawer's), its painted white flag, Surrender's word in red. */
export function GameActionRow({ action }: { action: GameAction }) {
  return (
    <button
      type="button"
      onClick={action.onSelect}
      disabled={action.disabled}
      className="drawer-raised state-layer flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left outline-none disabled:pointer-events-none disabled:opacity-50"
    >
      <UiIcon name="surrender" px={32} className="drawer-icon size-8 shrink-0" />
      <span className="flex min-w-0 flex-1 flex-col wrap-anywhere">
        <span className="text-outline font-semibold text-destructive-text">{action.label}</span>
        <span className="text-sm text-muted-foreground">{action.hint}</span>
      </span>
    </button>
  );
}

export interface DeviceSettingsSheetProps extends DeviceSettingsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The board's game: its Surrender, above the device settings. */
  game?: GameAction;
}

/**
 * The device settings over the board (#541), in the HUD's drawer (GAME-OVERLAY, lessons: never a bottom drawer): a full page with Back
 * on a phone, a side panel docked at the right from `tablet` (the gear's side), the Settings drawer's `DeviceSettingsPanel` in it. The
 * board stays alive behind it; a change applies at once. The quality's pill opens its choice as a view in the drawer's place, with Back
 * to the settings, as the Settings drawer does.
 */
export function DeviceSettingsSheet({ open, onOpenChange, game, ...panel }: DeviceSettingsSheetProps) {
  const [quality, setQuality] = useState(false);
  return (
    <HudDrawer
      open={open}
      onOpenChange={(next) => {
        if (!next) setQuality(false);
        onOpenChange(next);
      }}
      title={quality ? "Graphics quality" : "Settings"}
      side="right"
      slot="board-settings"
      onBack={quality ? () => setQuality(false) : undefined}
    >
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
    </HudDrawer>
  );
}

/** The drawer on the app's stores: what the board opens from its gear. Its own chunk (`BoardScene` imports it on demand). */
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
