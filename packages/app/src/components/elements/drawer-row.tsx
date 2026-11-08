import type { ComponentProps, ReactElement } from "react";
import { cn } from "../../lib/utils";
import { Icon } from "../ui/icon";
import type { UiIconName } from "./ui-art";
import { UiIcon } from "./ui-icon";

export interface DrawerRowProps extends Omit<ComponentProps<"button">, "children"> {
  /** The painted icon at its start: a HUD icon's name, or (ALLIANCES) an image drawn at 40 px with `drawer-icon size-10`, art kept out of the first load. */
  art: UiIconName | ReactElement;
  /** Its words: its accessible name. */
  label: string;
  /** Leave, Disband, Kick: its words in the destructive colour. */
  tone?: "default" | "danger";
  /** It opens a view in the drawer: the chevron at its end. */
  next?: boolean;
}

/**
 * A row of a menu in the HUD's drawer (GUILD-PAGE, the owner's ask of 2026-11-05: the menu's buttons in the drawer's style): a raised
 * tile, as the profile's actions (raised presses), its painted icon, its words outlined and the chevron of what opens a view in the
 * drawer. Disabled, it is dimmed (its reason is the caller's line under it).
 */
export function DrawerRow({ art, label, tone = "default", next = false, className, type = "button", ...props }: DrawerRowProps) {
  return (
    <button
      type={type}
      data-slot="drawer-row"
      className={cn(
        "state-layer drawer-tile flex w-full min-w-0 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-left outline-none disabled:cursor-default disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {typeof art === "string" ? <UiIcon name={art} px={40} className="drawer-icon size-10" /> : art}
      <span className={cn("text-outline min-w-0 flex-1 text-base leading-tight font-bold wrap-anywhere", tone === "danger" && "text-destructive-text")}>{label}</span>
      {next && <Icon name="chevron-right" size="sm" className="drawer-icon shrink-0 text-muted-foreground" />}
    </button>
  );
}
