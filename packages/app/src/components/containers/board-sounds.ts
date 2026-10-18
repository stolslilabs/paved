import { useEffect, useRef } from "react";
import type { ScoredStructure } from "@paved/chain";
import type { SfxName } from "../../lib/audio/sfx";
import { CLOSING_CATEGORIES } from "../elements/category";
import { useSfx } from "./audio-provider";

/** The sound of a structure closed, by `CLOSING_CATEGORIES` order: city, road, forest, wonder. */
const CLOSING_SFX: SfxName[] = ["city", "road", "forest", "wonder"];

export const closingSounds = (closings: readonly ScoredStructure[]): SfxName[] => {
  const names = new Set<SfxName>();
  for (const c of closings) {
    const i = CLOSING_CATEGORIES.indexOf(c.category);
    if (i >= 0) names.add(CLOSING_SFX[i]!);
  }
  return [...names];
};

export interface BoardSoundsInput {
  /** The tile on its slot (`BoardScene`'s `ghost`): a new slot is a selection, a new orientation on the same slot a rotation. */
  ghost?: { x: number; y: number; orientation: number; placed?: boolean } | null;
  /** The hand's refusal text: a new one is an invalid move. */
  error?: string | null;
  /** What the last move closed. */
  lastScored: readonly ScoredStructure[];
}

/**
 * The board's sound effects (#541), read from what the board already shows, so the three boards and the 3D canvas share them:
 * tile selected, rotated, an invalid move, the structures a move closed (one sound per category). Placing and discarding are
 * played by `BoardScene` at the button. Before the first gesture or while muted, `play` does nothing.
 */
export function useBoardSounds({ ghost, error, lastScored }: BoardSoundsInput): void {
  const play = useSfx();
  const prev = useRef<{ key: string; orientation: number } | null>(null);
  const placed = ghost?.placed ? ghost : null;
  const key = placed ? `${placed.x},${placed.y}` : null;
  const orientation = placed?.orientation ?? 0;
  useEffect(() => {
    const before = prev.current;
    prev.current = key === null ? null : { key, orientation };
    if (key === null) return;
    if (!before || before.key !== key) play("select");
    else if (before.orientation !== orientation) play("rotate");
  }, [key, orientation, play]);

  useEffect(() => {
    if (error) play("invalid");
  }, [error, play]);

  const seen = useRef(lastScored);
  useEffect(() => {
    if (seen.current === lastScored) return;
    seen.current = lastScored;
    for (const name of closingSounds(lastScored)) play(name);
  }, [lastScored, play]);
}
