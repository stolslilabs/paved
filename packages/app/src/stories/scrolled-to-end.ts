/**
 * PAGES-SCROLL (#782): a story's `play` that scrolls the page's region (`page-scroll`: a tab page's `TabFrame`, the side panel's
 * body) to its end, as the player's thumb would, so the story shows the page's last element under its sticky header. The panel
 * is in a portal, out of the canvas: the region is looked for in the document.
 */
export async function scrolledToEnd({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> {
  const doc = canvasElement.ownerDocument;
  let region: HTMLElement | null = null;
  for (let i = 0; i < 50 && !region; i++) {
    region = doc.querySelector<HTMLElement>("[data-slot=page-scroll]");
    if (!region) await new Promise((r) => setTimeout(r, 20));
  }
  if (!region) throw new Error("no page-scroll region");
  // The panel slides in, and the page's fonts and art settle: the end is taken once its height holds.
  await new Promise((r) => setTimeout(r, 400));
  region.scrollTop = region.scrollHeight;
}
