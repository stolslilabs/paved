import type { Meta, StoryObj } from "@storybook/react-vite";
import { MOCK_NOW } from "../../mocks/clock";
import { Presence } from "./presence";

/** Whether another player is online (#952): seen within the last 5 minutes, else when they were last seen. */
const meta = { title: "Elements/Presence", component: Presence, parameters: { layout: "padded" }, args: { lastSeen: MOCK_NOW - 60, now: MOCK_NOW } } satisfies Meta<typeof Presence>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Seen a minute ago: the green dot and "Online". */
export const Online: Story = {};
/** Seen 4 min 59 s ago: still online. */
export const OnlineEdge: Story = { args: { lastSeen: MOCK_NOW - 299 } };
/** Seen 5 minutes ago: the grey dot and when. */
export const LastSeenMinutes: Story = { args: { lastSeen: MOCK_NOW - 300 } };
export const LastSeenHours: Story = { args: { lastSeen: MOCK_NOW - 3 * 3_600 } };
/** Over a year: the largest unit only. */
export const LastSeenLongAgo: Story = { args: { lastSeen: MOCK_NOW - 400 * 86_400 } };
