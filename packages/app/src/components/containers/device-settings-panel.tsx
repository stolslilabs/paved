import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { Icon } from "../ui/icon";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import { SETTING_LABEL, SETTING_ROW, SettingSwitch } from "../elements/setting-switch";
import { UiIcon } from "../elements/ui-icon";
import { VolumeSlider } from "../elements/volume-slider";
import { LiveMusicPlayer } from "./music-player";
import { SettingsGroup } from "./settings-group";

/** "auto" picks by device: Medium on every device, Low on a low-power one; High only by hand. */
export type GraphicsQuality = "auto" | "low" | "medium" | "high";

/** The device settings the panel shows (`DeviceSettings`, `data/settings.ts`, without the chain). */
export interface DevicePreferences {
  quality: GraphicsQuality;
  /** The board's day and night cycle: a moving sky, the sun's shadows, the city lights at night. */
  dayNight: boolean;
  /** The ambient effects (#572 to #574): what moves on the board on its own. Off on the Low tier and under reduced motion. */
  ambient: boolean;
  /** The music volume, 0 to 1; 0 is muted, and `musicBefore` the level an unmute returns to. */
  musicVolume: number;
  musicBefore: number;
  sfxVolume: number;
  sfxBefore: number;
  /** Show the tile on a slot before it is placed. */
  tilePreview: boolean;
  /** Outline the slots where the tile in hand fits. */
  placementHighlight: boolean;
  /** The square grid on the board: a voxel void in the season's colours in the landscape's place, the slots lit as allowed moves. */
  squareGrid: boolean;
}

export type VolumeChannel = "music" | "sfx";

export interface DeviceSettingsPanelProps {
  preferences: DevicePreferences;
  /** The tier "auto" resolves to on this device: "Auto (Medium)". */
  autoQuality?: Exclude<GraphicsQuality, "auto">;
  /** Rows added to the Visuals group (the Settings page adds the skins switch). */
  visualsExtra?: ReactNode;
  onChange?: <K extends keyof DevicePreferences>(key: K, value: DevicePreferences[K]) => void;
  /** A slider moved or its icon clicked: the channel's new volume (0 mutes). The parent keeps the level before the mute. */
  onVolumeChange?: (channel: VolumeChannel, volume: number) => void;
  /** The quality's pill: its choice, a view of its own (`QualityChoice`) in the drawer or the sheet that holds the panel. */
  onOpenQuality?: () => void;
  className?: string;
}

const QUALITY: { value: GraphicsQuality; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

/** A quality as the pill and the choice name it: "Auto (Medium)" for auto on a device whose tier is known, else its word. */
export function qualityLabel(quality: GraphicsQuality, autoQuality?: Exclude<GraphicsQuality, "auto">): string {
  const label = QUALITY.find((q) => q.value === quality)!.label;
  return quality === "auto" && autoQuality ? `${label} (${QUALITY.find((q) => q.value === autoQuality)!.label})` : label;
}

/**
 * The device settings, once (#541), in the Paved UX Book's rows (SETTINGS-PAGE): Visuals (the quality's pill, the day and night
 * cycle, the ambient effects), Sound (the music and sound effects sliders, the music player of #569) and Gameplay (tile preview,
 * placement highlight, the square grid). The Settings page and the sheet over the board both draw this; the account and the links
 * stay on the page.
 */
export function DeviceSettingsPanel({ preferences: p, autoQuality, visualsExtra, onChange, onVolumeChange, onOpenQuality, className }: DeviceSettingsPanelProps) {
  const quality = qualityLabel(p.quality, autoQuality);
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <SettingsGroup title="Visuals">
        <div data-slot="setting-row" className={SETTING_ROW}>
          <UiIcon name="graphics" px={32} className="drawer-icon size-8" />
          <span className={SETTING_LABEL}>Graphics quality</span>
          {/* The book's pill: the quality in use, its words a size under the row's (the book's), its choice a view of its own. */}
          <button
            type="button"
            aria-label={`Graphics quality: ${quality}`}
            onClick={onOpenQuality}
            className="drawer-raised state-layer text-outline flex min-h-11 shrink-0 cursor-pointer items-center gap-1 rounded-full py-1 pr-2.5 pl-3 text-xs font-bold outline-none"
          >
            {quality}
            <Icon name="chevron-right" size="xs" />
          </button>
        </div>
        <SettingSwitch
          label="Day/night cycle"
          hint="The sky changes with the seasons, the shadows turn, the cities light up at night"
          art="sun"
          checked={p.dayNight}
          onCheckedChange={(v) => onChange?.("dayNight", v)}
        />
        <SettingSwitch
          label="Ambient effects"
          hint="Gentle motion on the board. Off on Low quality and with reduced motion"
          art="ambient"
          checked={p.ambient}
          onCheckedChange={(v) => onChange?.("ambient", v)}
        />
        {visualsExtra}
      </SettingsGroup>

      <SettingsGroup title="Sound">
        <VolumeSlider label="Music" art="music" value={p.musicVolume} before={p.musicBefore} onChange={(v) => onVolumeChange?.("music", v)} />
        <VolumeSlider label="Sound effects" art="sound" value={p.sfxVolume} before={p.sfxBefore} onChange={(v) => onVolumeChange?.("sfx", v)} />
        {/* The music playing (#569), on the app's audio: its volume is the Music slider above. A row of the group: its own frame goes. */}
        <LiveMusicPlayer enabled={p.musicVolume > 0} className="rounded-none border-0 bg-transparent px-3 py-3" />
      </SettingsGroup>

      <SettingsGroup title="Gameplay">
        <SettingSwitch label="Tile preview" hint="Show the tile on a slot before you place it" art="tile-preview" checked={p.tilePreview} onCheckedChange={(v) => onChange?.("tilePreview", v)} />
        <SettingSwitch label="Placement highlight" hint="Outline the slots where your tile fits" art="highlight" checked={p.placementHighlight} onCheckedChange={(v) => onChange?.("placementHighlight", v)} />
        <SettingSwitch label="Square grid" hint="A voxel void around the board, and the cells your tile can take lit up" art="grid" checked={p.squareGrid} onCheckedChange={(v) => onChange?.("squareGrid", v)} />
      </SettingsGroup>
    </div>
  );
}

export interface QualityChoiceProps {
  quality: GraphicsQuality;
  autoQuality?: Exclude<GraphicsQuality, "auto">;
  onChange?: (quality: GraphicsQuality) => void;
  className?: string;
}

/**
 * The quality's choice (SETTINGS-PAGE: the view the Visuals' pill opens): the four, one row each on the carved surface, the one in use
 * in gold with the check; High's cost said under them while it is chosen. The arrow keys move between them (a radio group).
 */
export function QualityChoice({ quality, autoQuality, onChange, className }: QualityChoiceProps) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <ToggleGroup
        type="single"
        orientation="vertical"
        aria-label="Graphics quality"
        value={quality}
        onValueChange={(v) => v && onChange?.(v as GraphicsQuality)}
        className="drawer-carved drawer-rows w-full flex-col items-stretch gap-0 overflow-hidden rounded-xl"
      >
        {QUALITY.map((q) => (
          <ToggleGroupItem key={q.value} value={q.value} className={cn(SETTING_ROW, "h-auto justify-start rounded-none bg-transparent text-left text-base whitespace-normal")}>
            <span className={SETTING_LABEL}>{qualityLabel(q.value, autoQuality)}</span>
            {quality === q.value && <UiIcon name="check" px={24} className="drawer-icon size-6" />}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {quality === "high" && <p className="px-1 text-sm text-muted-foreground">High is heavier: it can slow the board and drain a battery faster.</p>}
    </div>
  );
}
