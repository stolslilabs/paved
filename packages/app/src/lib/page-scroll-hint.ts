/** Less than this many pixels left to scroll counts as none (as `SLACK` in `scroll-hint.ts`, kept apart from it). */
const SLACK = 1;

/** Sets or clears a mark on `<html>`. */
function mark(name: string, on: boolean) {
  const root = document.documentElement;
  if (on) root.setAttribute(name, "");
  else root.removeAttribute(name);
}

/**
 * The page's hint (NO-SCROLLBARS, #609): `data-scroll-end` on `<html>` while the tab page's scrolling region has more below,
 * which the `page-more` variant (theme.css) reads to show the fades `AppNav` draws; `data-scroll-start` while it has more
 * above (PAGE-HEADER, #760), which the `page-less` variant reads to show the fade under the sticky header. A callback ref on
 * that region (`TabFrame`, #611: the region, not the document, scrolls); React 19 runs the cleanup it returns. Attributes, not
 * state: a scroll never re-renders the page.
 */
export function pageScrollHintRef(el: HTMLElement | null): (() => void) | undefined {
  if (!el) return undefined;
  let frame = 0;
  const update = () => {
    frame = 0;
    mark("data-scroll-end", el.scrollTop + el.clientHeight < el.scrollHeight - SLACK);
    mark("data-scroll-start", el.scrollTop > SLACK);
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  update();
  el.addEventListener("scroll", schedule, { passive: true });
  // The region's own size (the viewport's) and its page's: content that grows inside the region changes no size of it.
  const resize = typeof ResizeObserver === "function" ? new ResizeObserver(schedule) : null;
  resize?.observe(el);
  for (const child of el.children) resize?.observe(child);
  return () => {
    if (frame) cancelAnimationFrame(frame);
    el.removeEventListener("scroll", schedule);
    resize?.disconnect();
    mark("data-scroll-end", false);
    mark("data-scroll-start", false);
  };
}
