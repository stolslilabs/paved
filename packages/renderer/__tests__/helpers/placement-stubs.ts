import { vi } from "vitest";

/** The placement methods `GameScene` calls on its tile renderer (SLOTS), for a fake `tiles`: nothing moves. */
export function placementStubs() {
  return {
    setPlacementSettings: vi.fn(),
    setReducedMotion: vi.fn(),
    setPlacementZoom: vi.fn(),
    setConfirmed: vi.fn(),
    update: vi.fn(() => ({ animating: false })),
  };
}
