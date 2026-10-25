/** Less than this many pixels scrolled counts as none (as `SLACK` in `page-scroll-hint.ts`). */
const SLACK = 1;

/**
 * The tab pages' `data-scroll-start` (`page-scroll-hint.ts`) for a full-screen flow, whose document scrolls (PAGE-HEADER, #760):
 * on `<html>` while the page has more above, so its sticky top bar shows the fade under it (`page-less`). A module apart from
 * the tab pages' hint, so a flow's bar does not carry it. An effect: returns its cleanup.
 */
export function documentScrollStartHint(): () => void {
  const root = document.documentElement;
  let frame = 0;
  const update = () => {
    frame = 0;
    if (window.scrollY > SLACK) root.setAttribute("data-scroll-start", "");
    else root.removeAttribute("data-scroll-start");
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  update();
  window.addEventListener("scroll", schedule, { passive: true });
  return () => {
    if (frame) cancelAnimationFrame(frame);
    window.removeEventListener("scroll", schedule);
    root.removeAttribute("data-scroll-start");
  };
}
