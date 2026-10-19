/** The drag of the bottom sheets' stories (#581). */
export const pause = (ms: number) => new Promise((done) => setTimeout(done, ms));

/**
 * A mouse drag from the middle of `from`, `dy` px down in 10 px steps; released after a still pause (so that only the
 * distance counts) unless `hold`. The gesture is the same as a finger's (the touch path is checked on a phone).
 */
export async function dragDown(from: Element, dy: number, { hold = false } = {}) {
  const box = from.getBoundingClientRect();
  const x = box.left + box.width / 2;
  const y = box.top + box.height / 2;
  const at = (type: string, dyNow: number) => new PointerEvent(type, { bubbles: true, pointerType: "mouse", button: 0, clientX: x, clientY: y + dyNow });
  from.dispatchEvent(at("pointerdown", 0));
  for (let step = 10; step <= dy; step += 10) {
    window.dispatchEvent(at("pointermove", step));
    await pause(16);
  }
  if (hold) return;
  await pause(150);
  window.dispatchEvent(at("pointerup", dy));
}
