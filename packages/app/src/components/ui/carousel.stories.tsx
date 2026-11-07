import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { CAMPAIGNS } from "@paved/game-core";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "./carousel";

const meta = { title: "UI/Carousel", component: Carousel, parameters: { layout: "padded" } } satisfies Meta<typeof Carousel>;
export default meta;
type Story = StoryObj<typeof meta>;

/**
 * One slide per view, as the app's carousels (Story's campaigns, the League's leagues): drag, the arrow buttons, or the arrow keys
 * once focus is in the carousel. Here each slide is a campaign's name and summary on a plain carved box.
 */
const Slides = () => (
  <div className="px-12">
    <Carousel aria-label="Campaigns" className="mx-auto max-w-sm">
      <CarouselContent>
        {CAMPAIGNS.map((campaign, i) => (
          <CarouselItem key={campaign.id} aria-label={`${i + 1} of ${CAMPAIGNS.length}`}>
            <div className="flex flex-col gap-1 rounded-xl bg-card p-4">
              <h3 className="font-display text-xl">{campaign.name}</h3>
              <p className="text-sm text-muted-foreground">{campaign.summary}</p>
            </div>
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious />
      <CarouselNext />
    </Carousel>
  </div>
);

/** Reduced motion off: Embla scrolls to the next snap. */
export const MotionOff: Story = { name: "Reduced motion off", parameters: { reducedMotion: "never" }, render: () => <Slides /> };

/** Reduced motion on: the buttons and the arrow keys jump to the snap, with no scroll animation; a drag still follows the finger. */
export const MotionOn: Story = { name: "Reduced motion on", parameters: { reducedMotion: "always" }, render: () => <Slides /> };

/** The keyboard: Tab reaches Next (Previous is disabled on the first slide, out of the Tab order), then the arrow keys move it. */
export const Keyboard: Story = {
  render: () => <Slides />,
  play: async ({ canvasElement }) => {
    await userEvent.tab();
    await expect(within(canvasElement).getByRole("button", { name: "Next slide" })).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
  },
};
