import { Suspense, useLayoutEffect, useRef, type ReactNode } from "react";
import { DOCK_ART } from "../elements/ui-art";

/**
 * The home's dock (#763; HOME-DOCK, the owner's asks of 2026-11-03: at every width, centred from `tablet`), fixed at the viewport's
 * bottom, its height on the scene (`--app-nav-h`) for the bottom overlays. While the dock's chunk loads, a stand-in of its box
 * (`AppNav`'s sizes) holds its place, so nothing above it moves when it comes. The band across the screen takes no tap: only the dock.
 * DOCK-UNDER-PAGES (the owner's ask of 2026-11-04): it stays under a page opened on the home, veiled and blurred with the village
 * beside a side panel or a HUD drawer, covered by a phone's page.
 */
export function HomeBar({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current!;
    const measure = () => el.parentElement!.style.setProperty("--app-nav-h", `${el.offsetHeight}px`);
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(el);
    return () => resize.disconnect();
  }, []);
  // The dock's box: the band's top to the foot, and its foot (the safe area, or its lift); empty, so nothing for assistive technology.
  const standIn = <div className="box-content" style={{ height: DOCK_ART.height * DOCK_ART.scale, paddingBottom: "calc(var(--dock-foot) + var(--dock-lift))" }} />;
  return (
    <div ref={ref} data-out="d0" data-bubble-avoid className="pointer-events-none fixed inset-x-0 bottom-0 z-20 [&>*]:pointer-events-auto">
      <Suspense fallback={standIn}>{children}</Suspense>
    </div>
  );
}
