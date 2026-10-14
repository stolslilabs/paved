import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { Icon } from "../ui/icon";

export interface SettingsGroupProps {
  title: string;
  children: ReactNode;
  className?: string;
}

/** A titled card of setting rows, as the mockups group them: Visuals, Gameplay, Account. */
export function SettingsGroup({ title, children, className }: SettingsGroupProps) {
  const id = `settings-${title.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <section aria-labelledby={id} data-slot="card" className={cn("flex flex-col rounded-xl border border-border bg-card px-4 py-2", className)}>
      <h2 id={id} className="pt-1.5 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h2>
      <div className="flex flex-col divide-y divide-border">{children}</div>
    </section>
  );
}

export interface SettingsLinkProps {
  label: string;
  hint?: string;
  icon: string;
  /** What the row shows on its right before the chevron: the theme's name. */
  value?: string;
  onClick?: () => void;
}

/** A row that opens another page (theme, referral): the mockups' "Connected >" row. */
export function SettingsLink({ label, hint, icon, value, onClick }: SettingsLinkProps) {
  return (
    <button type="button" onClick={onClick} className="-mx-2 flex cursor-pointer items-center gap-3 rounded-md px-2 py-2.5 text-left transition-colors outline-none hover:bg-secondary/60 focus-visible:ring-2 focus-visible:ring-ring">
      <Icon name={icon} className="text-muted-foreground" size="sm" fixedWidth />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm">{label}</span>
        {hint && <span className="truncate text-xs text-muted-foreground">{hint}</span>}
      </span>
      {value && <span className="text-sm text-muted-foreground">{value}</span>}
      <Icon name="chevron-right" className="text-muted-foreground" size="sm" />
    </button>
  );
}
