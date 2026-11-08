import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { SEARCH } from "../../mocks/social";
import { PlayerSearch } from "./player-search";

/** The player search (#952): by name, from the start of a word and whatever the case, or by player ID; a result opens the profile. */
const meta = {
  title: "Containers/PlayerSearch",
  component: PlayerSearch,
  parameters: { layout: "padded" },
  args: { ...SEARCH.idle, onQueryChange: fn(), onOpen: fn(), onRetry: fn() },
  decorators: [(Story) => <div className="mx-auto max-w-xl">{Story()}</div>],
} satisfies Meta<typeof PlayerSearch>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Nothing typed: the hint. */
export const Idle: Story = {};
export const Loading: Story = { args: SEARCH.loading };
/** By name: seeded players and rivals whose name has a word starting with "c". */
export const Results: Story = { args: SEARCH.results };
/** By player ID: the one player of that ID. */
export const ById: Story = { args: SEARCH.byId };
export const NoResult: Story = { args: SEARCH.none };
export const Failed: Story = { args: SEARCH.error };
/** No social source on the network: the field disabled. */
export const Unavailable: Story = { args: SEARCH.unavailable };
/** WRAP360: the longest name, the top league, a player without a name. */
export const Stress: Story = { args: SEARCH.stress };
