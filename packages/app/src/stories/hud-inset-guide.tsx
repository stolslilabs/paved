import type { CSSProperties, ReactNode } from "react";
import { expect, waitFor } from "storybook/test";

/** The edge bands: each as wide as the HUD's inset on its edge (`--hud-inset-*` of theme.css, the notch's safe area included). */
const BANDS: CSSProperties[] = [
  { top: 0, left: 0, right: 0, height: "var(--hud-inset-top)" },
  { top: 0, bottom: 0, left: 0, width: "var(--hud-inset-left)" },
  { top: 0, bottom: 0, right: 0, width: "var(--hud-inset-right)" },
];

/**
 * HOME-HUD-PADDING: the HUD's inset drawn over the screen's top and sides, a translucent band each, so a capture shows the profile,
 * the balances and the capsules standing on one line off each edge. Stories only; it takes no tap.
 */
export function HudInsetGuide({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      {BANDS.map((style, i) => (
        <span key={i} aria-hidden data-slot="hud-inset-guide" className="pointer-events-none fixed z-50 bg-destructive" style={{ ...style, opacity: 0.3 }} />
      ))}
    </>
  );
}

/**
 * A notched phone (`top`, `side`: its safe areas in px; an iPhone's portrait top by default): the safe area simulated on the
 * tokens, added to the inset as theme.css does with `env(safe-area-inset-*)`, which a desktop browser gives as 0.
 */
export const NOTCH = { top: 47, side: 0 } as const;
export function SimulatedNotch({ top = NOTCH.top, side = NOTCH.side, children }: { top?: number; side?: number; children: ReactNode }) {
  const style = {
    "--hud-inset-top": `calc(var(--hud-inset) + ${top}px)`,
    "--hud-inset-left": `calc(var(--hud-inset) + ${side}px)`,
    "--hud-inset-right": `calc(var(--hud-inset) + ${side}px)`,
  } as CSSProperties;
  return (
    <div data-slot="simulated-notch" className="contents" style={style}>
      {children}
    </div>
  );
}

/** The opaque part of an image (alpha over half), as shares of its width and height; one read per source. */
type Ink = { left: number; top: number; right: number; bottom: number };
const inks = new Map<string, Promise<Ink>>();
function inkOf(src: string): Promise<Ink> {
  let ink = inks.get(src);
  if (!ink) {
    ink = (async () => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const g = canvas.getContext("2d")!;
      g.drawImage(img, 0, 0);
      const { data, width, height } = g.getImageData(0, 0, canvas.width, canvas.height);
      let [l, t, r, b] = [width, height, -1, -1];
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++)
          if (data[(y * width + x) * 4 + 3]! > 127) [l, t, r, b] = [Math.min(l, x), Math.min(t, y), Math.max(r, x + 1), Math.max(b, y + 1)];
      return { left: l / width, top: t / height, right: r / width, bottom: b / height };
    })();
    inks.set(src, ink);
  }
  return ink;
}

/** Where an image element paints, in the viewport: its box shrunk to its art's opaque part (the HUD's icons are square art in square boxes). */
async function paintedImage(el: HTMLImageElement): Promise<{ top: number; left: number; right: number }> {
  const box = el.getBoundingClientRect();
  const ink = await inkOf(el.currentSrc || el.src);
  return { top: box.top + ink.top * box.height, left: box.left + ink.left * box.width, right: box.left + ink.right * box.width };
}

/**
 * Where a HUD frame (`hud-frame`, theme.css) paints: its box grown by its near-black outline, the spread of its first shadow
 * (`0 0 0 1.5px`), read from the computed style.
 */
async function paintedFrame(el: HTMLElement): Promise<{ top: number; left: number; right: number }> {
  const box = el.getBoundingClientRect();
  const [, spread = "0"] = /-?[\d.]+px -?[\d.]+px -?[\d.]+px (-?[\d.]+)px/.exec(getComputedStyle(el).boxShadow) ?? [];
  const outline = Number.parseFloat(spread);
  return { top: box.top - outline, left: box.left - outline, right: box.right + outline };
}

const drawn = <T extends Element>(root: ParentNode, selector: string) => [...root.querySelectorAll<T>(selector)].filter((el) => el.getBoundingClientRect().width > 0);

/** The outermost painted edges of a group: its HUD frames and its images. */
async function paintedGroup(root: ParentNode): Promise<{ top: number; left: number; right: number }> {
  await waitFor(() => {
    const pending = drawn<HTMLImageElement>(root, "img").filter((img) => !img.complete || img.naturalWidth === 0);
    if (pending.length > 0) throw new Error("images still loading");
  }, { timeout: 5000 });
  const parts = await Promise.all([
    ...drawn<HTMLElement>(root, "[data-slot=hud-frame]").map(paintedFrame),
    ...drawn<HTMLImageElement>(root, "img").map(paintedImage),
  ]);
  return { top: Math.min(...parts.map((p) => p.top)), left: Math.min(...parts.map((p) => p.left)), right: Math.max(...parts.map((p) => p.right)) };
}

/** How far two painted edges may differ: the art's copies are resampled (1x and 2x), so their opaque edge moves by about a pixel. */
const PAINT_TOLERANCE_PX = 1;

/**
 * The check, on what is painted (`HudInsetGuide` draws the bands it reads):
 * - the player card's box on the inset's top and left lines;
 * - with `align` (below `desktop`): the balances' painted top and right, and the left capsules' painted left, within a pixel of
 *   the card's painted outline (its top for the top, its left for both sides), the art's opaque pixels read from its images;
 * - without plates (a guest's Connect): its box on the inset's top and right lines;
 * - without `align` (from `desktop`, whose layout is kept): the balances' column box on the inset's top and right lines;
 * - no page wider than the viewport.
 */
export async function expectHudInset(canvasElement: HTMLElement, { align = true }: { align?: boolean } = {}): Promise<void> {
  const doc = canvasElement.ownerDocument;
  const view = doc.defaultView!;
  const [top, left, right] = [...doc.querySelectorAll<HTMLElement>("[data-slot=hud-inset-guide]")].map((el) => el.getBoundingClientRect()) as [DOMRect, DOMRect, DOMRect];
  const insetRight = view.innerWidth - right.width;
  const card = await waitFor(() => {
    const found = drawn<HTMLElement>(doc, "[data-slot=player-card]")[0];
    if (!found) throw new Error("no player card drawn yet");
    return found;
  });
  const cardBox = card.getBoundingClientRect();
  await expect(Math.abs(cardBox.top - top.height)).toBeLessThanOrEqual(0.5);
  await expect(Math.abs(cardBox.left - left.width)).toBeLessThanOrEqual(0.5);
  // The balances' column (the phone's plates and the rail), in its own chunk after the card.
  const column = await waitFor(() => {
    const found = doc.querySelector<HTMLElement>("[data-slot=home-phone-balances]")?.parentElement;
    // Settled: plates drawn, or a button with none (a guest's Connect); the loading stand-in is not the final state.
    const settled = found && (drawn(found, "[data-slot=hud-frame]").length > 0 || drawn(found, "button").some((el) => !el.querySelector("[data-slot=hud-frame]")));
    if (!settled) throw new Error("no balances drawn yet");
    return found;
  }, { timeout: 10000 });
  const plates = drawn(column, "[data-slot=hud-frame]").length > 0;
  if (!plates || !align) {
    const box = (plates ? column : drawn<HTMLElement>(column, "button")[0]!).getBoundingClientRect();
    await expect(Math.abs(box.top - top.height)).toBeLessThanOrEqual(0.5);
    await expect(Math.abs(box.right - insetRight)).toBeLessThanOrEqual(0.5);
  } else {
    const profile = await paintedFrame(card.querySelector<HTMLElement>("[data-slot=hud-frame]")!);
    const balances = await paintedGroup(column);
    const capsules = doc.querySelector<HTMLElement>("[data-slot=home-capsules]");
    const capsulesLeft = capsules ? (await paintedGroup(capsules)).left : null;
    // The measures, for whoever reads the story's console: the painted insets in CSS px.
    console.info("hud-inset painted", JSON.stringify({ profile: { top: profile.top, left: profile.left }, balances: { top: balances.top, right: view.innerWidth - balances.right }, capsulesLeft }));
    await expect(Math.abs(balances.top - profile.top)).toBeLessThanOrEqual(PAINT_TOLERANCE_PX);
    await expect(Math.abs(view.innerWidth - balances.right - profile.left)).toBeLessThanOrEqual(PAINT_TOLERANCE_PX);
    if (capsulesLeft !== null) await expect(Math.abs(capsulesLeft - profile.left)).toBeLessThanOrEqual(PAINT_TOLERANCE_PX);
  }
  await expect(doc.documentElement.scrollWidth).toBeLessThanOrEqual(view.innerWidth);
}
