import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { SEARCH } from "../../mocks/social";
import { FollowResultButton } from "./follow-result-button";
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
/** With the follows (#954): Follow beside each result, or Following, Follow back, Blocked. */
export const WithFollow: Story = {
  args: {
    ...SEARCH.results,
    renderAction: (p) => {
      const states = ["follow", "following", "follow-back", "blocking"] as const;
      const state = states[Number(BigInt(p.address) % 4n)]!;
      return <FollowResultButton state={state} name={p.name} onFollow={fn()} />;
    },
  },
};
/** WRAP360 with Follow: the longest name beside the button. */
export const WithFollowStress: Story = { args: { ...SEARCH.stress, renderAction: (p) => <FollowResultButton state="follow-back" name={p.name} onFollow={fn()} /> } };
