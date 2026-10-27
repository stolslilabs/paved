import type { ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor } from "storybook/test";
import { ScrollRegion } from "./scroll-region";
import { Separator } from "./separator";

const meta = { title: "UI/Scroll Region", component: ScrollRegion, parameters: { layout: "padded" } } satisfies Meta<typeof ScrollRegion>;
export default meta;
type Story = StoryObj<typeof meta>;

const PLAYERS = Array.from({ length: 30 }, (_, i) => `Player ${i + 1}`);

const Rows = ({ count = PLAYERS.length }: { count?: number }) => (
  <ol className="text-sm">
    {PLAYERS.slice(0, count).map((p) => (
      <li key={p}>
        <div className="flex h-11 items-center px-3">{p}</div>
        <Separator />
      </li>
    ))}
  </ol>
);

/** The box's frame sits outside the scroller: the fade masks the scroller, and would fade a border of its own too. */
const Frame = ({ children }: { children: ReactNode }) => <div className="w-64 overflow-hidden rounded-md border border-input">{children}</div>;

/*
 * NO-SCROLLBARS (#609): no scrollbar on desktop, so a region that scrolls has to say so by itself. Two hints were proposed:
 * - Cut: the box's height leaves the last row half visible. It needs every box sized against its rows, and a list whose
 *   rows change height loses it; it says nothing about content above once scrolled.
 * - Fade (the rule, `scroll-hint` in theme.css): the content fades out over 2rem on each side where more waits, and only
 *   there. It works at any height and on both sides, and goes when the end is reached.
 * The fade is applied everywhere: `ScrollRegion` and `ScrollArea` carry it, and the document has its own at the viewport's foot.
 */

/** Proposal B, the fade (kept): the bottom fades while more waits below; scrolled, the top fades too. */
export const ProposalFade: Story = {
  name: "Proposal: fade (the rule)",
  render: () => (
    <Frame>
      <ScrollRegion className="h-64">
        <Rows />
      </ScrollRegion>
    </Frame>
  ),
};

/** Scrolled to the middle: both sides fade. */
export const Middle: Story = {
  render: () => (
    <Frame>
      <ScrollRegion className="h-64" data-testid="region">
        <Rows />
      </ScrollRegion>
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    const region = canvasElement.querySelector<HTMLElement>("[data-testid=region]")!;
    region.scrollTop = 300;
    await waitFor(() => expect(region).toHaveAttribute("data-scroll-start"));
    await expect(region).toHaveAttribute("data-scroll-end");
  },
};

/** At the end: only the top fades. */
export const End: Story = {
  render: Middle.render,
  play: async ({ canvasElement }) => {
    const region = canvasElement.querySelector<HTMLElement>("[data-testid=region]")!;
    region.scrollTop = region.scrollHeight;
    await waitFor(() => expect(region).not.toHaveAttribute("data-scroll-end"));
    await expect(region).toHaveAttribute("data-scroll-start");
  },
};

/** Content that fits: no fade at all. */
export const Fits: Story = {
  render: () => (
    <Frame>
      <ScrollRegion className="h-64" data-testid="region">
        <Rows count={4} />
      </ScrollRegion>
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    const region = canvasElement.querySelector<HTMLElement>("[data-testid=region]")!;
    await expect(region).not.toHaveAttribute("data-scroll-axis");
    await expect(region).not.toHaveAttribute("data-scroll-end");
  },
};

/** Sideways: the fade follows the axis that scrolls. */
export const Horizontal: Story = {
  render: () => (
    <ScrollRegion orientation="horizontal" className="w-72">
      <div className="flex w-fit gap-3 p-3">
        {PLAYERS.slice(0, 12).map((p) => (
          <div key={p} className="grid size-20 shrink-0 place-items-center rounded-md bg-secondary text-xs">
            {p}
          </div>
        ))}
      </div>
    </ScrollRegion>
  ),
};

/** A keyboard user tabs to the region and scrolls it with the arrows: the ring shows whole, the fade steps aside meanwhile. */
export const Focus: Story = {
  render: () => (
    <ScrollRegion tabIndex={0} aria-label="Players" className="h-64 w-64 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Rows />
    </ScrollRegion>
  ),
};
