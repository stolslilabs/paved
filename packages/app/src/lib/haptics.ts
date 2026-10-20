// The board's haptics (BUBBLE-DISCARD, issue 606): a light tick when a hold starts and on Cancel and Rotate, a firmer one when
// a hold completes, through the Vibration API (`navigator.vibrate`: Android's browsers). iOS Safari has none. The iOS 18
// workaround (toggling a hidden `<input type="checkbox" switch>`, which plays the system haptic) was looked at and is not
// used: the issue asks for it only once proven reliable on a device, it plays only inside a user gesture (never at a hold's
// completion, which ends on a timer), and no iPhone was available to prove it. iPhones get no tick until it is.

export type Haptic = "light" | "firm";

/** The buzz per kind, ms. */
export const HAPTIC_MS: Readonly<Record<Haptic, number>> = { light: 10, firm: 30 };

/** One tick of `kind` where the device has the Vibration API; nothing elsewhere, and never an error. */
export function haptic(kind: Haptic): void {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(HAPTIC_MS[kind]);
  } catch {
    // A browser that refuses it (no user gesture, a policy): no tick.
  }
}
