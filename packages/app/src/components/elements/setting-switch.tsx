import { useId } from "react";
import { cn } from "../../lib/utils";
import { Icon } from "../ui/icon";
import { Switch } from "../ui/switch";

export interface SettingSwitchProps {
  label: string;
  /** A second line under the label. */
  hint?: string;
  icon?: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  className?: string;
}

/** One on/off setting of the settings page (the mockups' rows): its label, a hint, the switch on the right. */
export function SettingSwitch({ label, hint, icon, checked, disabled, onCheckedChange, className }: SettingSwitchProps) {
  const id = useId();
  return (
    // The icon and the switch sit on the label's first line (20 px boxes, `items-start`): a label or hint that wraps grows
    // downwards, nothing centres on the block (WRAP360).
    <div className={cn("flex items-start gap-3 py-2.5", className)}>
      {icon && (
        <span className="inline-flex h-5 items-center">
          <Icon name={icon} className="text-muted-foreground" size="sm" fixedWidth />
        </span>
      )}
      <label htmlFor={id} className="flex min-w-0 flex-1 cursor-pointer flex-col wrap-anywhere">
        <span className="text-sm leading-5">{label}</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </label>
      <span className="inline-flex h-5 items-center">
        <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
      </span>
    </div>
  );
}
