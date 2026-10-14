import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./card";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "./carousel";

const meta = { title: "UI/Carousel", component: Carousel, parameters: { layout: "padded" } } satisfies Meta<typeof Carousel>;
export default meta;
type Story = StoryObj<typeof meta>;

const MODES = [
  ["Daily", "One deck for everyone, once a day."],
  ["Training", "Play freely, no stake."],
  ["Tutorial", "Learn the rules, one stage at a time."],
  ["Weekly", "Comes later."],
] as const;

/** Play's mode cards (section 6): drag, the arrow buttons, or the arrow keys once a card has focus. */
const Modes = () => (
  <div className="px-12">
    <Carousel aria-label="Game modes" opts={{ align: "start" }} className="mx-auto max-w-xs tablet:max-w-lg">
      <CarouselContent>
        {MODES.map(([title, text], i) => (
          <CarouselItem key={title} aria-label={`${i + 1} of ${MODES.length}`} className="tablet:basis-1/2">
            <Card>
              <CardHeader>
                <CardTitle>{title}</CardTitle>
                <CardDescription>{text}</CardDescription>
              </CardHeader>
              <CardContent>
                <button type="button" className="text-sm text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring">
                  Choose {title}
                </button>
              </CardContent>
            </Card>
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious />
      <CarouselNext />
    </Carousel>
  </div>
);

/** Reduced motion off: Embla scrolls to the next snap. */
export const MotionOff: Story = { name: "Mode cards, reduced motion off", parameters: { reducedMotion: "never" }, render: () => <Modes /> };

/** Reduced motion on: the buttons and the arrow keys jump to the snap, with no scroll animation; a drag still follows the finger. */
export const MotionOn: Story = { name: "Mode cards, reduced motion on", parameters: { reducedMotion: "always" }, render: () => <Modes /> };

/** The keyboard: Tab reaches a card's button, then the arrow keys move the carousel. */
export const Keyboard: Story = {
  render: () => <Modes />,
  play: async ({ canvasElement }) => {
    await userEvent.tab();
    await expect(within(canvasElement).getByRole("button", { name: "Choose Daily" })).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
  },
};
