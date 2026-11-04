import type { Meta, StoryObj } from "@storybook/react-vite";
import { SectionTitle } from "./section-title";

/**
 * A section's title in the HUD's drawer (PROFILE-PAGE, MISSIONS-PAGE): the display font, the engraved rule after it across the row,
 * and what the row holds at its end. Drawn on the drawer's face.
 */
const meta = {
  title: "Elements/SectionTitle",
  component: SectionTitle,
  args: { children: "Hall of Fame" },
  decorators: [(Story) => <div className="max-w-md bg-secondary p-4"><Story /></div>],
} satisfies Meta<typeof SectionTitle>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The title alone, the rule to the row's end (the profile's Level, League, Hall of Fame). */
export const Plain: Story = {};

/** A count beside the title (the Missions' sections: "Tutorial 3/8"). */
export const WithCount: Story = {
  args: {
    children: (
      <>
        Tutorial
        <span className="numeric font-sans text-base font-bold text-muted-foreground">3/8</span>
      </>
    ),
  },
};

/** What the row holds at its end (the Missions' reset countdown, the Stats' badge), a gap either side of the rule. */
export const WithEnd: Story = {
  args: {
    children: "Daily",
    end: <span className="drawer-carved rounded-full px-2.5 py-1 text-xs font-bold">6h 12m</span>,
  },
};
