import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { MOCK_NOW } from "../../mocks/clock";
import { PUBLIC_PROFILES } from "../../mocks/social";
import { Button } from "../ui/button";
import { PublicProfileSheet } from "./public-profile-sheet";

/**
 * Another player's public profile (#952): a bottom sheet on a phone, a panel from the right from `desktop` (the Viewport
 * control). The avatar, the name, online or last seen, the league, the level, the crowns and the village score, Copy player ID;
 * the guild line and the actions come with their issues (#953 to #955).
 */
const meta = {
  title: "Containers/PublicProfileSheet",
  component: PublicProfileSheet,
  args: { open: true, state: PUBLIC_PROFILES.online, now: MOCK_NOW, onOpenChange: fn(), onCopy: fn(async () => {}), onRetry: fn() },
} satisfies Meta<typeof PublicProfileSheet>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A seeded player seen a minute ago: online. */
export const Online: Story = {};
/** A rival village's owner, last seen two days ago. */
export const Offline: Story = { args: { state: PUBLIC_PROFILES.offline } };
/** No name: their short address. */
export const NoName: Story = { args: { state: PUBLIC_PROFILES.noName } };
/** Where #953 to #955 put theirs: the guild line, and actions above Copy player ID (stand-ins here). */
export const WithActions: Story = {
  args: {
    guild: <p className="text-center text-sm text-muted-foreground">Guild line</p>,
    actions: <Button variant="outline">Action</Button>,
  },
};
export const Loading: Story = { args: { state: PUBLIC_PROFILES.loading } };
/** An ID no player has (a typed `/player/:id`). */
export const NotFound: Story = { args: { state: PUBLIC_PROFILES.missing } };
export const Failed: Story = { args: { state: PUBLIC_PROFILES.error } };
/** No social source on the network (the chain, until a service serves it). */
export const Unavailable: Story = { args: { state: PUBLIC_PROFILES.unavailable } };
/** With reduced motion: the sheet opens without its slide. */
export const ReducedMotion: Story = { parameters: { reducedMotion: "always" } };
/** WRAP360: the longest name and address, the top league, the largest figures. */
export const Stress: Story = { args: { state: PUBLIC_PROFILES.stress } };
