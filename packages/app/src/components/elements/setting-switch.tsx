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
    <div className={cn("flex items-center gap-3 py-2.5", className)}>
      {icon && <Icon name={icon} className="text-muted-foreground" size="sm" fixedWidth />}
      <label htmlFor={id} className="flex min-w-0 flex-1 cursor-pointer flex-col">
        <span className="text-sm">{label}</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </label>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
    </div>
  );
}
