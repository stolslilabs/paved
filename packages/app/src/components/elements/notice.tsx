import type { ReactElement, ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";
import { Icon } from "../ui/icon";

const noticeVariants = cva("flex items-start gap-3 rounded-lg border px-3 py-2.5 text-sm", {
  variants: {
    tone: {
      info: "border-info/40 bg-info/10 text-foreground [&>svg]:text-info",
      warning: "border-warning/40 bg-warning/10 text-foreground [&>svg]:text-warning",
    },
  },
  defaultVariants: { tone: "info" },
});

const ICON: Record<NonNullable<VariantProps<typeof noticeVariants>["tone"]>, string> = {
  info: "info",
  warning: "warning",
};

export interface NoticeProps extends VariantProps<typeof noticeVariants> {
  title?: string;
  children: ReactNode;
  /** A Font Awesome name, or an element of its own (a game icon, #870); default the tone's. */
  icon?: string | ReactElement;
  action?: ReactNode;
  className?: string;
}

/**
 * A state the player must read: storage off, purchases paused, a guest, the economy not deployed. Never an error: every
 * error is `InlineError`'s (P-67), so there is no danger tone. It is a `status` region.
 */
export function Notice({ tone = "info", title, children, icon, action, className }: NoticeProps) {
  return (
    <div role="status" className={cn(noticeVariants({ tone }), className)}>
      {icon == null || typeof icon === "string" ? (
        <Icon name={icon ?? ICON[tone ?? "info"]} className="mt-0.5" size="sm" />
      ) : (
        <span className="mt-0.5 inline-flex">{icon}</span>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 wrap-anywhere">
        {title && <span className="font-semibold">{title}</span>}
        <span className="opacity-90">{children}</span>
      </div>
      {action}
    </div>
  );
}
