import { cn } from "../../lib/utils";

/**
 * A carved list's row shape (the owner's rule of 2026-11-07: a highlight takes the shape of the frame it highlights): rounded as the
 * list at its top (the first row) and its foot (the last), square between two rows, so a row's wash and its hover and press layers
 * never show corners its neighbours do not have. For a row that touches the list's edges; an inset row keeps its own shape.
 */
export function listRowShape(index: number, count: number): string {
  return cn("rounded-none", index === 0 && "rounded-t-xl", index === count - 1 && "rounded-b-xl");
}
