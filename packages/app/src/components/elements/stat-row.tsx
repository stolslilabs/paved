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

/** A label and its figure on one line, the figure in the mono font: the mockups' metric lists. */
export function StatRow({ label, value, icon, hint, tone = "default", className }: StatRowProps) {
  return (
    <div className={cn("flex items-center gap-3 py-2", className)}>
      {icon && <Icon name={icon} className="text-muted-foreground" size="sm" />}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm text-foreground">{label}</span>
        {hint && <span className="truncate text-xs text-muted-foreground">{hint}</span>}
      </span>
      <span className={cn("numeric text-sm font-semibold", TONE[tone])}>{value}</span>
    </div>
  );
}
