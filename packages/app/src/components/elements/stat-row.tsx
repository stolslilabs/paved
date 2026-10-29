import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { Icon } from "../ui/icon";

export interface StatRowProps {
  label: string;
  value: ReactNode;
  /** A Font Awesome name (gold), or an element of its own (a category's game icon, issue 870). */
  icon?: string | ReactNode;
  /** A second line under the label (a unit, a rule): it wraps, it is never cut. */
  hint?: ReactNode;
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
    // The icon, the label and the value share the first row, on the label's first line (`items-start`, every cell one 20 px
    // line high): a label that wraps grows downwards and the icon stays with its first line. The hint hangs under the label.
    // Label and hint wrap (WRAP360); the value keeps one line while it fits. The label keeps 2.5rem at least: a very long value (an `Amount`)
    // puts its symbol under its figure rather than crush the label to a letter a line.
    <div className={cn("grid grid-cols-[auto_minmax(2.5rem,1fr)_auto] items-start gap-x-3 py-2", !icon && "grid-cols-[minmax(2.5rem,1fr)_auto]", className)}>
      {icon && (
        <span className="inline-flex h-5 items-center">
          {typeof icon === "string" ? <Icon name={icon} className="text-primary" size="sm" /> : icon}
        </span>
      )}
      <span className="text-sm leading-5 wrap-anywhere text-foreground">{label}</span>
      <span className={cn("numeric text-sm leading-5 font-semibold whitespace-nowrap", TONE[tone])}>{value}</span>
      {/* Under the label and the value both: the value's column is free under its one line. */}
      {hint && <span className={cn("col-span-2 text-xs wrap-anywhere text-muted-foreground", icon ? "col-start-2" : "col-start-1")}>{hint}</span>}
    </div>
  );
}
