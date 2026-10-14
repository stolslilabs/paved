import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { Slider } from "../ui/slider";

export interface StakePickerProps {
  value: number;
  /** The highest stake (`MAX_STAKE`, 10). */
  max?: number;
  /** The price of this stake, shown beside the stake and moving with it. */
  price?: ReactNode;
  disabled?: boolean;
  onChange?: (stake: number) => void;
  className?: string;
}

/** The stake, 1 to 10, step 1: the slider of the UI kit with the stake and its price read out as it moves; the arrow keys, Home and End work. */
export function StakePicker({ value, max = 10, price, disabled, onChange, className }: StakePickerProps) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-baseline justify-between gap-3" aria-live="polite">
        <span className="flex items-baseline gap-2">
          <span className="numeric text-3xl leading-none font-semibold text-primary" data-testid="stake-value">{value}</span>
          <span className="text-xs text-muted-foreground">{value === 1 ? "stake" : "stakes"}</span>
        </span>
        {price != null && <span className="text-sm" data-testid="stake-price">{price}</span>}
      </div>
      <Slider
        aria-label="Stake"
        min={1}
        max={max}
        step={1}
        value={[value]}
        disabled={disabled}
        onValueChange={([v]) => v != null && onChange?.(v)}
      />
      <div aria-hidden className="numeric flex justify-between text-xs text-muted-foreground">
        <span>1</span>
        <span>{max}</span>
      </div>
    </div>
  );
}
