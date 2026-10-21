/*
 * NO-SCROLLBARS (#609): no scrollbar shows on desktop (`styles/theme.css`), so a region that scrolls says so by a soft fade
 * on the side where more content waits. The fade is the `scroll-hint` utility (theme.css); this module tells it which
 * sides have more, as `data-scroll-start` and `data-scroll-end` on the scroller, and the axis as `data-scroll-axis`.
 * `ScrollRegion` (`components/ui/scroll-region.tsx`) and `ScrollArea` take it; a tab page's region takes `pageScrollHintRef`
 * (`page-scroll-hint.ts`, apart so that the first load, Home's, does not carry this module).
 */

/** Less than this many pixels left to scroll counts as none (sub-pixel layouts never quite reach the end). */
const SLACK = 1;

export interface ScrollEdges {
  /** The axis that scrolls, the vertical one first; null when the content fits. */
  axis: "x" | "y" | null;
  /** More content before the visible part (above, or to the left). */
  start: boolean;
  /** More content after the visible part (below, or to the right). */
  end: boolean;
}

type Box = Pick<HTMLElement, "scrollTop" | "scrollLeft" | "scrollHeight" | "scrollWidth" | "clientHeight" | "clientWidth">;

/** Which sides of a scroller have more content, from its scroll box. */
export function scrollEdges(box: Box): ScrollEdges {
  if (box.scrollHeight - box.clientHeight > SLACK) {
    return { axis: "y", start: box.scrollTop > SLACK, end: box.scrollTop + box.clientHeight < box.scrollHeight - SLACK };
  }
  if (box.scrollWidth - box.clientWidth > SLACK) {
    // `scrollLeft` is negative in a right-to-left scroller: its start is on the right.
    const left = Math.abs(box.scrollLeft);
    return { axis: "x", start: left > SLACK, end: left + box.clientWidth < box.scrollWidth - SLACK };
  }
  return { axis: null, start: false, end: false };
}

function mark(el: HTMLElement, edges: ScrollEdges) {
  const set = (name: string, on: boolean, value = "") => {
    if (on) el.setAttribute(name, value);
    else el.removeAttribute(name);
  };
  set("data-scroll-axis", edges.axis !== null, edges.axis ?? "");
  set("data-scroll-start", edges.start);
  set("data-scroll-end", edges.end);
}

/**
 * Keeps an element's `data-scroll-*` marks in step with its scroll position and its size or its content's: a callback ref
 * (React 19 runs the cleanup it returns). Attributes, not state: a scroll never re-renders the component.
 */
export function scrollHintRef(el: HTMLElement | null): (() => void) | undefined {
  if (!el) return undefined;
  let frame = 0;
  const update = () => {
    frame = 0;
    mark(el, scrollEdges(el));
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  update();
  el.addEventListener("scroll", schedule, { passive: true });
  // The scroller's own size, and its children's: content that grows inside a capped box changes no size of the box.
  const resize = typeof ResizeObserver === "function" ? new ResizeObserver(schedule) : null;
  const observeAll = () => {
    resize?.disconnect();
    resize?.observe(el);
    for (const child of el.children) resize?.observe(child);
  };
  observeAll();
  const mutations = typeof MutationObserver === "function" ? new MutationObserver(() => (observeAll(), schedule())) : null;
  mutations?.observe(el, { childList: true });
  return () => {
    if (frame) cancelAnimationFrame(frame);
    el.removeEventListener("scroll", schedule);
    resize?.disconnect();
    mutations?.disconnect();
  };
}
