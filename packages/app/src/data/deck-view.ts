import { createDeviceStore, useDeviceStore } from "./device-store";

// The deck sheet's view (#606), kept on this device: the real tiles seen from above (the build-time top-down renders), or
// the simplified one (each plan's nine areas). Its own key, as the theme switch's: one value, no settings shape to migrate.

export type DeckView = "real" | "simple";

export const DECK_VIEW_KEY = "paved.deck-view.v1";

const isView = (raw: string): raw is DeckView => raw === "real" || raw === "simple";

/** The app's store, on `localStorage`; "real" until the player picks the other. */
export const deckView = createDeviceStore<DeckView>(DECK_VIEW_KEY, "real", (raw) => (isView(raw) ? raw : null), (v) => v);

/** The deck sheet's view in a component, with its setter. */
export function useDeckView(): [DeckView, (view: DeckView) => void] {
  return useDeviceStore(deckView);
}
