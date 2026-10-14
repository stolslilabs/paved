import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { Icon } from "../ui/icon";

export interface StatRowProps {
  label: string;
  value: ReactNode;
  icon?: string;
  /** A second line under the label (a unit, a rule). */
  hint?: string;
  tone?: "default" | "gold" | "success" | "danger" | "muted";
  className?: string;
}

const TONE = {
  default: "text-foreground",
  gold: "text-primary",
  success: "text-success",
  danger: "text-destructive-text",
  muted: "text-muted-foreground",
} as const;

/** A label and its figure on one line, the figure in the mono font: the mockups' metric lists. The icon is on that line too (`ValueRow`'s rule). */
export function StatRow({ label, value, icon, hint, tone = "default", className }: StatRowProps) {
  return (
    // The icon, the label and the value share the first row (one centre line); the hint hangs under the label alone.
    <div className={cn("grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 py-2", !icon && "grid-cols-[minmax(0,1fr)_auto]", className)}>
      {icon && <Icon name={icon} className="text-muted-foreground" size="sm" />}
      <span className="truncate text-sm leading-5 text-foreground">{label}</span>
      <span className={cn("numeric text-sm leading-5 font-semibold", TONE[tone])}>{value}</span>
      {hint && <span className={cn("truncate text-xs text-muted-foreground", icon ? "col-start-2" : "col-start-1")}>{hint}</span>}
    </div>
  );
}
