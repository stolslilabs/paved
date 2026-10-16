import type { ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";
import { Icon } from "../ui/icon";

const noticeVariants = cva("flex items-start gap-3 rounded-lg border px-3 py-2.5 text-sm", {
  variants: {
    tone: {
      info: "border-info/40 bg-info/10 text-foreground [&>svg]:text-info",
      warning: "border-warning/40 bg-warning/10 text-foreground [&>svg]:text-warning",
      danger: "border-destructive bg-destructive/20 text-foreground [&>svg]:text-destructive-text",
    },
  },
  defaultVariants: { tone: "info" },
});

const ICON: Record<NonNullable<VariantProps<typeof noticeVariants>["tone"]>, string> = {
  info: "info",
  warning: "warning",
  danger: "warning",
};

export interface NoticeProps extends VariantProps<typeof noticeVariants> {
  title?: string;
  children: ReactNode;
  icon?: string;
  action?: ReactNode;
  className?: string;
}

/** A line the player must read: storage off, a paused purchase, a refused move. `status` for info, `alert` otherwise. */
export function Notice({ tone = "info", title, children, icon, action, className }: NoticeProps) {
  return (
    <div role={tone === "info" ? "status" : "alert"} className={cn(noticeVariants({ tone }), className)}>
      <Icon name={icon ?? ICON[tone ?? "info"]} className="mt-0.5" size="sm" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 wrap-anywhere">
        {title && <span className="font-semibold">{title}</span>}
        <span className={cn("opacity-90", tone === "danger" && "select-text")}>{children}</span>
      </div>
      {action}
    </div>
  );
}
