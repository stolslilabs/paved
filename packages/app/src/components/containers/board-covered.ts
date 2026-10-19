import { createContext } from "react";

/**
 * Whether the board is covered: a full-screen sheet over it, or the score panel over the final board. The scene that draws the
 * cover provides it; `BoardViewport` reads it and the renderer's ambient loop stops while it holds (`GameScene.setCovered`,
 * #572). Unprovided: not covered.
 */
export const BoardCovered = createContext(false);
