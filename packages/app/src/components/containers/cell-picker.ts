// A board that draws its cells on a canvas (the 3D village) names the cell under a point for a drag that ends on it: the plan's
// cells are elements (`data-cell`), a canvas's are not. The board's element carries `data-cell-picker`, and its picker is kept
// here, keyed by the element.

/** A cell under a point and what a drop does there: "legal" places the tile, "copy" adds a copy to the tile of its plan. */
export interface PickedCell {
  x: number;
  y: number;
  kind: string;
}

/** The cell under a point of the viewport (client px), or null. */
export type CellPicker = (clientX: number, clientY: number) => PickedCell | null;

const pickers = new WeakMap<Element, CellPicker>();

/** Registers `picker` for `element` (marked `data-cell-picker`); the returned function removes it. */
export function registerCellPicker(element: Element, picker: CellPicker): () => void {
  pickers.set(element, picker);
  element.setAttribute("data-cell-picker", "");
  return () => {
    pickers.delete(element);
    element.removeAttribute("data-cell-picker");
  };
}

/** The cell a picker names under the point, for the board element found there (`elementFromPoint`). */
export function pickCellAt(element: Element | null | undefined, clientX: number, clientY: number): PickedCell | null {
  const board = element?.closest("[data-cell-picker]");
  const picker = board && pickers.get(board);
  return picker ? picker(clientX, clientY) : null;
}
