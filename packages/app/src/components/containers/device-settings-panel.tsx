import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { Icon } from "../ui/icon";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import { SettingSwitch } from "../elements/setting-switch";
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
  className?: string;
}

const QUALITY: { value: GraphicsQuality; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

/**
 * The device settings, once (#541): Visuals (quality, the day and night cycle, the ambient effects), Sound (the music and sound effects sliders, the
 * music player of #569) and Gameplay (tile preview, placement highlight). The Settings page and the sheet over the board both
 * draw this; the account, the theme and the referral stay on the page.
 */
export function DeviceSettingsPanel({ preferences: p, autoQuality, visualsExtra, onChange, onVolumeChange, className }: DeviceSettingsPanelProps) {
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <SettingsGroup title="Visuals">
        <div className="flex flex-col gap-2 py-2.5">
          <span id="quality-label" className="flex items-center gap-3 text-sm">
            <Icon name="display" className="text-muted-foreground" size="sm" fixedWidth />
            Graphics quality
          </span>
          <ToggleGroup type="single" variant="outline" aria-labelledby="quality-label" value={p.quality} onValueChange={(v) => v && onChange?.("quality", v as GraphicsQuality)} className="w-full gap-1">
            {QUALITY.map((q) => (
              // "Auto (Medium)" is the one long label: Auto gets double width so it fits at 320 px (WRAP360).
              <ToggleGroupItem key={q.value} value={q.value} className={`h-auto min-h-9 min-w-0 ${q.value === "auto" ? "flex-[2]" : "flex-1"} px-1 py-1 text-center text-xs leading-tight whitespace-normal`}>
                {q.value === "auto" && autoQuality ? (
                  <>
                    Auto <span className="inline-block">({QUALITY.find((o) => o.value === autoQuality)?.label})</span>
                  </>
                ) : (
                  q.label
                )}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {p.quality === "high" && <p className="text-xs text-muted-foreground">High is heavier: it can slow the board and drain a battery faster.</p>}
        </div>
        <SettingSwitch
          label="Day/night cycle"
          hint="The sky changes with the seasons, the shadows turn, the cities light up at night"
          icon="sun"
          checked={p.dayNight}
          onCheckedChange={(v) => onChange?.("dayNight", v)}
        />
        <SettingSwitch
          label="Ambient effects"
          hint="Gentle motion on the board. Off on Low quality and with reduced motion"
          icon="sparkles"
          checked={p.ambient}
          onCheckedChange={(v) => onChange?.("ambient", v)}
        />
        {visualsExtra}
      </SettingsGroup>

      <SettingsGroup title="Sound">
        <VolumeSlider label="Music" value={p.musicVolume} before={p.musicBefore} onChange={(v) => onVolumeChange?.("music", v)} />
        <VolumeSlider label="Sound effects" value={p.sfxVolume} before={p.sfxBefore} onChange={(v) => onVolumeChange?.("sfx", v)} />
        {/* The music playing (#569), on the app's audio: its volume is the Music slider above. */}
        {/* A row of the card: the player's own card frame goes. */}
        <LiveMusicPlayer enabled={p.musicVolume > 0} className="rounded-none border-0 bg-transparent px-0 py-3" />
      </SettingsGroup>

      <SettingsGroup title="Gameplay">
        <SettingSwitch label="Tile preview" hint="Show the tile on a slot before you place it" icon="eye" checked={p.tilePreview} onCheckedChange={(v) => onChange?.("tilePreview", v)} />
        <SettingSwitch label="Placement highlight" hint="Outline the slots where your tile fits" icon="highlighter" checked={p.placementHighlight} onCheckedChange={(v) => onChange?.("placementHighlight", v)} />
        <SettingSwitch label="Square grid" hint="A voxel void around the board, and the cells your tile can take lit up" icon="table-cells-large" checked={p.squareGrid} onCheckedChange={(v) => onChange?.("squareGrid", v)} />
      </SettingsGroup>
    </div>
  );
}
