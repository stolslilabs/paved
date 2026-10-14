import { cn } from "../../lib/utils";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";

export interface StakePickerProps {
  value: number;
  /** The highest stake (`MAX_STAKE`, 10). */
  max?: number;
  disabled?: boolean;
  onChange?: (stake: number) => void;
  className?: string;
}

/** The stake, 1 to 10: one choice of ten, with the arrow keys (two rows of five on a phone). */
export function StakePicker({ value, max = 10, disabled, onChange, className }: StakePickerProps) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      aria-label="Stake"
      value={String(value)}
      disabled={disabled}
      onValueChange={(v) => v && onChange?.(Number(v))}
      className={cn("grid w-full grid-cols-5 gap-2 tablet:grid-cols-10", className)}
    >
      {Array.from({ length: max }, (_, i) => i + 1).map((k) => (
        <ToggleGroupItem
          key={k}
          value={String(k)}
          aria-label={`Stake ${k}`}
          className="h-11 rounded-md font-mono text-base tabular-nums data-[state=on]:border-primary data-[state=on]:bg-accent data-[state=on]:text-primary"
        >
          {k}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
