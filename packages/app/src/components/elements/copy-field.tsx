import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";

export interface CopyFieldProps {
  /** What is copied: a link, an address. */
  value: string;
  label: string;
  /** Just copied: the button says so until the page clears it. */
  copied?: boolean;
  onCopy?: (value: string) => void;
  className?: string;
}

/** A value to copy in the mono font, cut to its width, and its Copy button (the referral link). The page does the copying. */
export function CopyField({ value, label, copied, onCopy, className }: CopyFieldProps) {
  return (
    <div className={cn("flex items-center gap-2 rounded-lg border border-border bg-secondary/60 p-1.5 pl-3", className)}>
      <span className="min-w-0 flex-1 truncate select-text font-mono text-xs" title={value} aria-label={label}>
        {value}
      </span>
      <Button size="sm" variant={copied ? "secondary" : "default"} onClick={() => onCopy?.(value)} aria-live="polite">
        <Icon name={copied ? "check" : "copy"} size="xs" />
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}
