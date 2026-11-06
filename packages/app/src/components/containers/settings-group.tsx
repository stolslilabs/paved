import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { Icon } from "../ui/icon";
import { SectionTitle } from "../elements/section-title";
import { SETTING_LABEL, SETTING_ROW } from "../elements/setting-switch";
import type { UiIconName } from "../elements/ui-art";
import { UiIcon } from "../elements/ui-icon";

export interface SettingsGroupProps {
  title: string;
  children: ReactNode;
  /**
   * The rows' surface: carved (`list`, the default: settings, information and their controls, one under the other between near-black
   * rules), or none (`links`: raised rows of their own, each a press, the owner's rule of 2026-11-04).
   */
  surface?: "list" | "links";
  className?: string;
}

/**
 * A titled group of setting rows (SETTINGS-PAGE, the Paved UX Book's Visuals, Sound, Gameplay, Account, More): the drawer's section
 * title (`SectionTitle`, the Profile's and the Missions'), then its rows on one carved surface between near-black rules, or the links'
 * raised rows.
 */
export function SettingsGroup({ title, children, surface = "list", className }: SettingsGroupProps) {
  const id = `settings-${title.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <section aria-labelledby={id} data-slot="settings-group" className={cn("flex flex-col gap-2", className)}>
      <SectionTitle id={id}>{title}</SectionTitle>
      <div className={surface === "list" ? "drawer-carved drawer-rows flex flex-col rounded-xl" : "flex flex-col gap-2"}>{children}</div>
    </section>
  );
}

export interface SettingsLinkProps {
  label: string;
  /** Its painted icon (`UI_ICONS`). */
  art: UiIconName;
  onClick?: () => void;
}

/** A row that opens a view (the book's More › Credits): raised, as every press of the drawer, its painted icon, the chevron at its end. */
export function SettingsLink({ label, art, onClick }: SettingsLinkProps) {
  return (
    <button type="button" onClick={onClick} className={cn(SETTING_ROW, "drawer-raised state-layer cursor-pointer rounded-xl text-left outline-none")}>
      <UiIcon name={art} px={32} className="drawer-icon size-8" />
      <span className={SETTING_LABEL}>{label}</span>
      <Icon name="chevron-right" className="drawer-icon" />
    </button>
  );
}
