// The board's haptics (BUBBLE-DISCARD, issue 606): a light tick when a hold starts and on Cancel and Rotate, a firmer one when
// a hold completes, through the Vibration API (`navigator.vibrate`: Android's browsers). iOS Safari has none. The iOS 18
// workaround (toggling a hidden `<input type="checkbox" switch>`, which plays the system haptic) was looked at and is not
// used: the issue asks for it only once proven reliable on a device, it plays only inside a user gesture (never at a hold's
// completion, which ends on a timer), and no iPhone was available to prove it. iPhones get no tick until it is.

export type Haptic = "light" | "firm" | "reward" | "charge" | "power";

/**
 * The buzz per kind, ms; `reward` a pattern (buzz, pause, buzz: CHESTS-PAGE, the owner's ask of 2026-11-06, the tile kept from a
 * chest). TILE-ACTIONS (the owner's ask of 2026-11-07, a feeling of power on the tile's holds): `charge`, the short ticks of a hold
 * filling, faster and faster (`useHold`'s `charge`); `power`, its completion: a strong buzz, a beat, a longer one.
 */
export const HAPTIC_MS = { light: 10, firm: 30, reward: [24, 70, 40], charge: 8, power: [45, 35, 70] } as const satisfies Record<Haptic, number | readonly number[]>;

/** One tick of `kind` where the device has the Vibration API; nothing elsewhere, and never an error. */
export function haptic(kind: Haptic): void {
  try {
    const ms: number | readonly number[] = HAPTIC_MS[kind];
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(typeof ms === "number" ? ms : [...ms]);
  } catch {
    // A browser that refuses it (no user gesture, a policy): no tick.
  }
}
