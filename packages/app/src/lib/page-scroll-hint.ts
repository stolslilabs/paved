import { useEffect } from "react";

/** Less than this many pixels left to scroll counts as none (as `SLACK` in `scroll-hint.ts`, kept apart from it). */
const SLACK = 1;

/**
 * The document's hint (NO-SCROLLBARS, #609; a tab page scrolls as one document, `routes/Shell.tsx`): `data-scroll-end` on `<html>` while the
 * page has more below, which the `page-more` variant (theme.css) reads to show the fade at the bottom of the viewport.
 */
export function usePageScrollHint() {
  useEffect(() => {
    const root = document.documentElement;
    let frame = 0;
    const update = () => {
      frame = 0;
      const end = window.scrollY + window.innerHeight < root.scrollHeight - SLACK;
      if (end) root.setAttribute("data-scroll-end", "");
      else root.removeAttribute("data-scroll-end");
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const resize = typeof ResizeObserver === "function" ? new ResizeObserver(schedule) : null;
    resize?.observe(document.body);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      resize?.disconnect();
      root.removeAttribute("data-scroll-end");
    };
  }, []);
}
