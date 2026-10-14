import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Class names merged the shadcn way: `clsx` joins them, `tailwind-merge` lets the last conflicting utility win. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
