import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { MockMarkProvider } from "./mock-mark";
import { TopBar } from "./top-bar";
import { LONG_LABEL, LONG_WORD } from "../../mocks/stress";

const meta = { title: "Containers/TopBar", component: TopBar, args: { title: "Choose a mode", onBack: fn() } } satisfies Meta<typeof TopBar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const WithBack: Story = {};
export const NoBack: Story = { args: { onBack: undefined, title: "Final score" } };
export const WithAction: Story = {
  args: {
    end: (
      <Button variant="ghost" size="icon" aria-label="Settings">
        <Icon name="gear" />
      </Button>
    ),
  },
};
/** WRAP360: a long title wraps, two lines at most, then an ellipsis (the whole title in `title`); the bar keeps its height (HEADER-HEIGHT). */
export const Stress: Story = { args: { title: `${LONG_LABEL} ${LONG_WORD}` } };
/** MOCK-MARK (#622): "Mock" on the title's line, the title and the mark centred together. */
export const WithMark: Story = {
  args: { title: "Challenge" },
  decorators: [(Story) => <MockMarkProvider value><Story /></MockMarkProvider>],
};
/** A long title wraps; the mark stays on its last line. */
export const WithMarkLongTitle: Story = {
  args: { title: "Challenge of the long winter day" },
  decorators: WithMark.decorators,
};
/** The stress title with the mark: a compound breaks and the mark follows its last piece. */
export const WithMarkStress: Story = { args: Stress.args, decorators: WithMark.decorators };
