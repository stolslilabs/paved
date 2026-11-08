import { cn } from "../../lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { Icon } from "../ui/icon";
import { SETTING_LABEL, SETTING_ROW } from "./setting-switch";
import type { UiIconName } from "./ui-art";
import { UiIcon } from "./ui-icon";

/** One of a setting's choices: its value, its word and its painting (`UI_ICONS`). */
export interface SettingOption<T extends string> {
  value: T;
  label: string;
  art: UiIconName;
}

export interface SettingChoiceProps<T extends string> {
  label: string;
  /** The row's painting (`UI_ICONS`). */
  art: UiIconName;
  value: T;
  options: readonly SettingOption<T>[];
  onChange?: (value: T) => void;
  className?: string;
}

/** The menu's surface: the drawer's ground, outlined near-black, lifted off the drawer (an inline value on tokens, no new class). */
const MENU_SHADOW = { boxShadow: "0 0 0 1px var(--hud-outline), 0 2px 0 1px var(--hud-outline), 0 12px 24px rgb(0 0 0 / 0.45)" };

/**
 * One setting of a few choices (SEASONS-SETTINGS, the owner's "a dropdown"): the row's painting and name, and at its end the book's
 * raised pill, as the quality's, with the choice in use; the pill opens the choices under it, a carved list in the Settings' rows
 * (each 44 px, its painting, its word, the painted check on the one in use). Radix's menu: the arrow keys move, Enter
 * or a tap chooses, Escape closes.
 */
export function SettingChoice<T extends string>({ label, art, value, options, onChange, className }: SettingChoiceProps<T>) {
  const shown = options.find((o) => o.value === value) ?? options[0]!;
  return (
    <div data-slot="setting-row" className={cn(SETTING_ROW, className)}>
      <UiIcon name={art} px={32} className="drawer-icon size-8" />
      <span className={SETTING_LABEL}>{label}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`${label}: ${shown.label}`}
            className="drawer-raised state-layer text-outline flex min-h-11 shrink-0 cursor-pointer items-center gap-1 rounded-full py-1 pr-2.5 pl-3 text-xs font-bold outline-none"
          >
            {shown.label}
            <Icon name="chevron-right" size="xs" className="rotate-90" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" data-slot="setting-choices" className="border-0 bg-secondary p-1.5" style={MENU_SHADOW}>
          <DropdownMenuRadioGroup value={value} onValueChange={(v) => onChange?.(v as T)} className="drawer-carved drawer-rows flex flex-col overflow-hidden rounded-xl">
            {options.map((o) => (
              <DropdownMenuRadioItem key={o.value} value={o.value} indicator="none" className={cn(SETTING_ROW, "min-h-11 cursor-pointer rounded-none pr-2 text-base")}>
                <UiIcon name={o.art} px={24} className="drawer-icon size-6" />
                <span className={SETTING_LABEL}>{o.label}</span>
                <UiIcon name="check" px={24} className={cn("drawer-icon size-6", o.value !== value && "invisible")} />
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
