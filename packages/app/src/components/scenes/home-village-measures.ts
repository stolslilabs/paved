import { useLayoutEffect, useRef } from "react";

/** The gap of both columns' buttons and of the bands' edges (#856), 12 px. */
const GAP_PX = 12;

/**
 * An element's layout box in the overlays' box (HOME-COLUMNS-AFTER-EDIT, #1068): its offsets summed up to the box, which transforms
 * (`translate`, `transform`) do not move, unlike `getBoundingClientRect`. Each offset parent's border is added on the way.
 */
function layoutBox(el: HTMLElement, box: HTMLElement) {
  let top = 0;
  let left = 0;
  for (let at: HTMLElement | null = el; at && at !== box; ) {
    top += at.offsetTop;
    left += at.offsetLeft;
    const parent = at.offsetParent as HTMLElement | null;
    if (parent) {
      top += parent.clientTop;
      left += parent.clientLeft;
    }
    at = parent;
  }
  return { top, left, height: el.offsetHeight, bottom: top + el.offsetHeight };
}


/**
 * The overlays' measures, on their box. The profile beside the balances' first plate: `--profile-room`, the width the badge may
 * take (its name plate grows with the name), so it stops a gap short of the plate whatever the amounts (a 999,999 Cobbles plate
 * at 320 px, #828).
 * HOME-OVERLAYS (#856, the owner's decisions of 2026-10-28): the bands of the two columns, a gap off their neighbours as they are drawn: the right one from under the
 * balances to above the bottom row, the left one (the issue's second open point) from under the profile to
 * above the bottom left's Chat tab and mission. HOME-STACK (#929, open point 1): the left band starts
 * twice the gap, 24 px, under the profile, and a gap under its avatar's rim and crest where they run further (the larger circle of
 * 2026-11-03 hangs past the card's foot).
 */
export function useOverlayMeasures() {
  const refs = {
    box: useRef<HTMLDivElement>(null),
    balances: useRef<HTMLDivElement>(null),
    profile: useRef<HTMLDivElement>(null),
    actions: useRef<HTMLDivElement>(null),
    bottomLeft: useRef<HTMLDivElement>(null),
  };
  useLayoutEffect(() => {
    const els = [refs.box, refs.balances, refs.profile, refs.actions, refs.bottomLeft].map((ref) => ref.current);
    const [box] = els as HTMLElement[];
    // Its first notice comes before the first paint: the bands are in place when the overlays show. HOME-COLUMNS-AFTER-EDIT (#1068):
    // it reads the layout's boxes (`layoutBox`), which no transform moves, so the Camera mode's slides (`translate`, CAMERA-EXPLORE)
    // do not shift it, and it runs at each mount, a transition running in the overlays or not. In the Camera mode
    // the corner's row goes down (`bottom`): nothing is measured until the mode is left (its slide's `transitionend` measures again).
    const measure = () => {
      if (box.hasAttribute("data-camera")) return;
      const [, balances, profile, foot, bottomLeft] = els.map((el) => (el ? layoutBox(el, box) : undefined));
      const height = box.offsetHeight;
      // The badge's foot as drawn: its rim runs past the card's (the player card's negative margins) and its crest a tenth of the rim
      // further (`PlayerRim`, -bottom-[10%]; the rim's box is there before the league's chunk, its stand-in the same size).
      const rimEl = refs.profile.current?.querySelector<HTMLElement>("[data-slot=avatar-rim]");
      const rim = rimEl ? layoutBox(rimEl, box) : undefined;
      const drawnFoot = Math.max(profile!.bottom + GAP_PX, rim ? rim.bottom + rim.height * 0.1 : 0);
      const edges = {
        "--right-top": balances!.bottom,
        "--right-bottom": height - foot!.top,
        "--left-top": drawnFoot,
        "--left-bottom": height - (bottomLeft?.top ?? foot!.bottom),
      };
      for (const [name, px] of Object.entries(edges)) box.style.setProperty(name, `${px + GAP_PX}px`);
      // The profile's room, from its left to a gap short of the balances: the badge's name plate ends there.
      box.style.setProperty("--profile-room", `${balances!.left - profile!.left - GAP_PX}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    // The box and what the bands stand off (not the columns, which the bands size).
    for (const el of els) if (el) observer.observe(el);
    box.addEventListener("transitionend", measure);
    return () => {
      observer.disconnect();
      box.removeEventListener("transitionend", measure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the refs are stable
  }, []);
  return refs;
}
