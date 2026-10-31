import { useMemo, type ComponentProps } from "react";
import { Slider as SliderPrimitive } from "radix-ui";
import { cn } from "../../lib/utils";

/** `aria-label` names the thumbs and `aria-valuetext` is read out for the value ("Muted"), which are the focusable `slider` elements (a range's two thumbs get "min" and "max"). */
export function Slider({ className, defaultValue, value, min = 0, max = 100, "aria-label": label, "aria-valuetext": valueText, ...props }: ComponentProps<typeof SliderPrimitive.Root>) {
  const thumbs = useMemo(() => (Array.isArray(value) ? value : Array.isArray(defaultValue) ? defaultValue : [min]), [value, defaultValue, min]);
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      className={cn("relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50 data-[orientation=vertical]:h-44 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col", className)}
      {...props}
    >
      <SliderPrimitive.Track data-slot="slider-track" className="relative grow overflow-hidden rounded-full bg-input data-[orientation=horizontal]:h-2 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-2">
        <SliderPrimitive.Range data-slot="slider-range" className="absolute bg-primary data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full" />
      </SliderPrimitive.Track>
      {thumbs.map((_, i) => (
        <SliderPrimitive.Thumb
          key={i}
          aria-label={label && thumbs.length > 1 ? `${label} ${i === 0 ? "min" : "max"}` : label}
          aria-valuetext={valueText}
          data-slot="slider-thumb"
          className="block size-5 shrink-0 rounded-full border-2 border-primary bg-background shadow-sm transition-[box-shadow] outline-none hover:ring-4 hover:ring-ring/30 focus-visible:ring-4 focus-visible:ring-ring/60 disabled:pointer-events-none motion-reduce:transition-none"
        />
      ))}
    </SliderPrimitive.Root>
  );
}
