import type { Meta, StoryObj } from "@storybook/react-vite";
import { MOCK_NOW } from "../../mocks/clock";
import { Countdown } from "./countdown";


const meta = { title: "Elements/Countdown", component: Countdown, parameters: { layout: "padded" }, args: { now: MOCK_NOW, expiresAt: MOCK_NOW + 19 * 3600 + 12 * 60 + 5 } } satisfies Meta<typeof Countdown>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Running: Story = {};
/** Under an hour left: amber. */
export const Warning: Story = { args: { expiresAt: MOCK_NOW + 42 * 60 } };
/** Past `expires_at`: red, no figure. */
export const Expired: Story = { args: { expiresAt: MOCK_NOW - 60 } };
export const DayEnds: Story = { args: { label: "Ends in", expiresAt: MOCK_NOW + 9 * 3600 } };
/** WRAP360: the widest figure (999 hours) and a long label keep one line. */
export const Stress: Story = { args: { label: "The day's Challenge closes in", expiresAt: MOCK_NOW + 999 * 3600 + 59 * 60 } };
/** `lg`: the label over a large figure, a page's hero (the Chests page's reset, #759). */
export const Large: Story = { args: { size: "lg", label: "Slots reset in", expiresAt: MOCK_NOW + 7 * 3600 + 12 * 60 + 5 } };
