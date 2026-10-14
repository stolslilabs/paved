import type { ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";
import { Glyph, type GlyphName } from "./glyph";

const noticeVariants = cva("flex items-start gap-3 rounded-lg border px-3 py-2.5 text-sm", {
  variants: {
    tone: {
      info: "border-river-800 bg-river-950/80 text-river-100",
      warning: "border-amber-800 bg-amber-950/80 text-amber-100",
      danger: "border-ember-800 bg-ember-950/80 text-ember-100",
    },
  },
  defaultVariants: { tone: "info" },
});

const ICON: Record<NonNullable<VariantProps<typeof noticeVariants>["tone"]>, GlyphName> = {
  info: "info",
  warning: "warning",
  danger: "warning",
};

export interface NoticeProps extends VariantProps<typeof noticeVariants> {
  title?: string;
  children: ReactNode;
  icon?: GlyphName;
  action?: ReactNode;
  className?: string;
}

/** A line the player must read: storage off, a paused purchase, a refused move. `status` for info, `alert` otherwise. */
export function Notice({ tone = "info", title, children, icon, action, className }: NoticeProps) {
  return (
    <div role={tone === "info" ? "status" : "alert"} className={cn(noticeVariants({ tone }), className)}>
      <Glyph name={icon ?? ICON[tone ?? "info"]} className="mt-0.5 size-4" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {title && <span className="font-semibold">{title}</span>}
        <span className="opacity-90">{children}</span>
      </div>
      {action}
    </div>
  );
}
