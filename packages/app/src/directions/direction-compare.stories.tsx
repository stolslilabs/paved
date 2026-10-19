import { useLayoutEffect, useRef, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { DIRECTIONS, DIRECTION_IDS_2 } from "./palettes";
import { SCREENS_2, type ScreenName2 } from "./screens-2";

/*
 * D, E and F side by side (#537, PR 1b), for the owner's pick: one screen of each direction in a frame of a phone (375 x 812) or of
 * a wide screen (1440 x 900, scaled to fit). Each frame is the direction's own story in Storybook's preview page, so what is
 * compared is exactly what `Direction/D`, `E` and `F` show.
 */

const SIZES = { mobile: { width: 375, height: 812 }, desktop: { width: 1440, height: 900 } } as const;
type Size = keyof typeof SIZES;

/** A story in a frame of the given size, scaled down to the width it gets. */
function Frame({ id, screen, size }: { id: string; screen: ScreenName2; size: Size }) {
  const { width, height } = SIZES[size];
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setScale(Math.min(1, el.clientWidth / width));
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [width]);
  return (
    <div ref={box} className="w-full overflow-hidden rounded-lg border border-white/15" style={{ maxWidth: width, height: height * scale }}>
      <iframe
        title={`Direction ${id.toUpperCase()}, ${screen}`}
        src={`iframe.html?id=direction-${id}--${screen}&viewMode=story`}
        width={width}
        height={height}
        loading="lazy"
        className="origin-top-left border-0"
        style={{ transform: `scale(${scale})` }}
      />
    </div>
  );
}

function Compare({ screen, size }: { screen: ScreenName2; size: Size }) {
  return (
    <div className="min-h-dvh bg-black p-4 text-white">
      <div className={size === "mobile" ? "grid justify-items-center gap-6 tablet:grid-cols-[repeat(auto-fit,minmax(0,375px))] tablet:justify-center" : "grid gap-6 desktop:grid-cols-3"}>
        {DIRECTION_IDS_2.map((id) => (
          <section key={id} className="flex w-full min-w-0 flex-col gap-2" style={{ maxWidth: size === "mobile" ? 375 : undefined }}>
            <h2 className="font-display text-xl">
              {id.toUpperCase()}: {DIRECTIONS[id].name}
            </h2>
            <p className="text-xs text-white/75">{DIRECTIONS[id].tagline}</p>
            <Frame id={id} screen={screen} size={size} />
          </section>
        ))}
      </div>
    </div>
  );
}

const meta = {
  title: "Direction/Compare",
  component: Compare,
  parameters: { layout: "fullscreen" },
  argTypes: { screen: { control: "select", options: Object.keys(SCREENS_2) }, size: { control: "inline-radio", options: Object.keys(SIZES) } },
} satisfies Meta<typeof Compare>;
export default meta;
type Story = StoryObj<typeof meta>;

/** D, E and F at 375 x 812. Pick the screen in the controls. */
export const Mobile: Story = { args: { screen: "home", size: "mobile" } };
/** D, E and F at 1440 x 900, each scaled to its column. */
export const Desktop: Story = { args: { screen: "home", size: "desktop" } };
