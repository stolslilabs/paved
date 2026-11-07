import { render } from "@testing-library/react";
import { MotionConfig } from "motion/react";
import { describe, expect, it } from "vitest";
import { VaultPosition } from "../src/components/containers/vault-position";
import { GUARD_RATE } from "../src/mocks/economy";
import { VAULT_HELD, VAULT_NONE } from "../src/mocks/vault";

// #1053: the vPAVED coin's light (its two layers and its pulse) runs only while the player holds a position; at zero shares the
// coin stands alone, in the same 80 px box.
function coin(position: typeof VAULT_HELD, reducedMotion: "never" | "always" = "never") {
  const { container } = render(
    <MotionConfig reducedMotion={reducedMotion}>
      <VaultPosition position={position} guardRate={GUARD_RATE} />
    </MotionConfig>,
  );
  const slot = container.querySelector<HTMLElement>('[data-slot="vault-coin"]');
  if (!slot) throw new Error("no coin");
  return slot;
}

describe("VaultPosition's coin", () => {
  it("shines with a position: the two light layers and the pulse behind the coin", () => {
    const slot = coin(VAULT_HELD);
    expect(slot.dataset.lit).toBe("true");
    expect(slot.querySelectorAll("img.absolute")).toHaveLength(2);
    expect(slot.querySelectorAll("span.absolute")).toHaveLength(1);
    expect(slot.className).toContain("size-20");
  });

  it("keeps its two layers still under reduced motion, without the pulse", () => {
    const slot = coin(VAULT_HELD, "always");
    expect(slot.querySelectorAll("img.absolute")).toHaveLength(2);
    expect(slot.querySelectorAll("span.absolute")).toHaveLength(0);
  });

  it("stands alone at zero shares: no light layer, no pulse, the same box", () => {
    expect(VAULT_NONE.shares).toBe(0n);
    const slot = coin(VAULT_NONE);
    expect(slot.dataset.lit).toBeUndefined();
    expect(slot.querySelectorAll(".absolute")).toHaveLength(0);
    expect(slot.children).toHaveLength(1);
    expect(slot.className).toContain("size-20");
  });
});
