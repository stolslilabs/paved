import { useEffect, useState, type ReactNode } from "react";
import { expect, waitFor } from "storybook/test";

/** The buttons named `label` that are drawn (the home's Play is hidden below `desktop`, the bar's from it). */
function drawn(doc: Document, label: string): HTMLElement[] {
  return [...doc.querySelectorAll<HTMLElement>(`button[aria-label="${label}"]`)].filter((b) => b.getBoundingClientRect().width > 0);
}

/**
 * SWORDS-CENTRE (#827): a centre guide over each drawn button named `label`, two thin lines through the button's centre, so a
 * capture shows whether its icon sits on them. Stories only: it follows the buttons each frame (the bar's disc and the home's
 * button move with the viewport), and draws nothing for a hidden one.
 */
export function CentreGuide({ label, children }: { label: string; children: ReactNode }) {
  const [rects, setRects] = useState<DOMRect[]>([]);
  useEffect(() => {
    let frame = 0;
    let last = "";
    const tick = () => {
      const next = drawn(document, label).map((b) => b.getBoundingClientRect());
      const key = next.map((r) => `${r.x},${r.y},${r.width},${r.height}`).join(";");
      if (key !== last) {
        last = key;
        setRects(next);
      }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [label]);
  return (
    <>
      {children}
      {rects.map((r, i) => (
        <span key={i} aria-hidden className="pointer-events-none fixed z-50" style={{ left: r.x, top: r.y, width: r.width, height: r.height }}>
          <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-destructive" />
          <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-destructive" />
        </span>
      ))}
    </>
  );
}

/**
 * The check of the guide: in each drawn button named `label`, once Font Awesome has drawn the icon, its box's centre is the
 * button's to half a pixel, on both axes. The swords' glyph fills its 512 x 512 viewBox, so its box's centre is the drawing's.
 */
export async function expectIconCentred(canvasElement: HTMLElement, label: string): Promise<void> {
  const buttons = drawn(canvasElement.ownerDocument, label);
  await expect(buttons.length).toBeGreaterThan(0);
  for (const button of buttons) {
    const svg = await waitFor(() => {
      const found = button.querySelector("svg");
      if (!found) throw new Error(`no icon drawn in ${label} yet`);
      return found;
    }, { timeout: 5000 });
    const b = button.getBoundingClientRect();
    const i = svg.getBoundingClientRect();
    await expect(Math.abs(i.x + i.width / 2 - (b.x + b.width / 2))).toBeLessThanOrEqual(0.5);
    await expect(Math.abs(i.y + i.height / 2 - (b.y + b.height / 2))).toBeLessThanOrEqual(0.5);
  }
}
