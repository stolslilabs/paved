import type { SVGProps } from "react";

/** The few glyphs the primitives draw themselves. Font Awesome (section 8) replaces them when F4 lands. */
const base = { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

export const CheckIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><path d="m3 8.5 3.2 3.2L13 4.5" /></svg>
);
export const CloseIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><path d="m4 4 8 8M12 4l-8 8" /></svg>
);
export const ChevronRightIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><path d="m6 3.5 4.5 4.5L6 12.5" /></svg>
);
export const DotIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} fill="currentColor" stroke="none" {...p}><circle cx="8" cy="8" r="3" /></svg>
);
export const SpinnerIcon = ({ className, ...p }: SVGProps<SVGSVGElement>) => (
  <svg {...base} className={`animate-spin motion-reduce:animate-none ${className ?? ""}`} {...p}><path d="M8 2a6 6 0 1 0 6 6" /></svg>
);
