import { useId } from "react";
import { cn } from "../../lib/utils";
import { Switch } from "../ui/switch";
import type { UiIconName } from "./ui-art";
import { UiIcon } from "./ui-icon";

/**
 * A setting's row (SETTINGS-PAGE, the Paved UX Book's Settings): its painted icon, its name in the drawer's outlined words, and what
 * sits at its end (a switch, the quality's pill), one line, 48 px tall at least, on the group's carved surface.
 */
export const SETTING_ROW = "flex min-h-12 items-center gap-3 px-3 py-1.5";
/** The row's name: the drawer's light words, outlined, wrapping at 320 px rather than pushing its control off (WRAP360). */
export const SETTING_LABEL = "text-outline min-w-0 flex-1 font-semibold wrap-anywhere";

export interface SettingSwitchProps {
  label: string;
  /** What it does, read out with the switch: the book's rows show their name alone. */
  hint?: string;
  /** Its painted icon (`UI_ICONS`). */
  art?: UiIconName;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  className?: string;
}

/** One on/off setting (the book's rows): the icon, the name, the book's green switch at its end. */
export function SettingSwitch({ label, hint, art, checked, disabled, onCheckedChange, className }: SettingSwitchProps) {
  const id = useId();
  return (
    <div data-slot="setting-row" className={cn(SETTING_ROW, className)}>
      {art && <UiIcon name={art} px={32} className="drawer-icon size-8" />}
      <label htmlFor={id} className={cn(SETTING_LABEL, "cursor-pointer")}>
        {label}
      </label>
      {/* Hidden, read as the switch's description: a description may point at a hidden element. */}
      {hint && (
        <span id={`${id}-hint`} hidden>
          {hint}
        </span>
      )}
      <Switch id={id} tone="success" aria-describedby={hint ? `${id}-hint` : undefined} checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
    </div>
  );
}

/** The viewer's switch in Settings. On: other players' boards show their skins; off: their base models, and no skin model of theirs is downloaded. The viewer's own tiles always wear their skins. */
export function ShowSkinsSwitch({ checked, onCheckedChange, className }: { checked: boolean; onCheckedChange?: (checked: boolean) => void; className?: string }) {
  return (
    <SettingSwitch
      label="Show other players' skins"
      hint="Off saves data and graphics work: other players' boards use the base tiles. Your own tiles keep your skins."
      art="skins"
      checked={checked}
      onCheckedChange={onCheckedChange}
      className={className}
    />
  );
}
