// The board's haptics (BUBBLE-DISCARD, #606): a light tick when a hold starts and on Cancel and Rotate, a firmer one when a
// hold completes. Android (and any browser with the Vibration API) through `navigator.vibrate`. iOS Safari has no Vibration
// API; from iOS 18 it plays the system's haptic when a switch (`<input type="checkbox" switch>`) is toggled by a user
// gesture, so on a browser that knows the `switch` attribute and has no `vibrate`, a hidden switch is toggled instead. That
// only plays inside a gesture (a tap's handler): a hold's completion, which ends on a timer, gets none there.

export type Haptic = "light" | "firm";

/** The buzz per kind, ms. */
export const HAPTIC_MS: Readonly<Record<Haptic, number>> = { light: 10, firm: 30 };

/** Safari 17.4 and later reflect the `switch` attribute on `HTMLInputElement`; no other engine does yet. */
const hasSwitch = () => typeof HTMLInputElement !== "undefined" && "switch" in HTMLInputElement.prototype;

/** Toggles a hidden switch once: iOS 18's haptic, when called from a gesture. */
function toggleSwitch(): void {
  const label = document.createElement("label");
  label.ariaHidden = "true";
  label.style.display = "none";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("switch", "");
  label.appendChild(input);
  document.head.appendChild(label);
  label.click();
  label.remove();
}

/** One tick of `kind` where the device has haptics; nothing elsewhere, and never an error. */
export function haptic(kind: Haptic): void {
  try {
    if (typeof navigator === "undefined") return;
    if (typeof navigator.vibrate === "function") navigator.vibrate(HAPTIC_MS[kind]);
    else if (hasSwitch()) toggleSwitch();
  } catch {
    // A browser that refuses it (no user gesture, a policy): no tick.
  }
}
