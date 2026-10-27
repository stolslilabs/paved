import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { MOCK_NOW } from "../../mocks/clock";
import { MATCHES, PVP_MATCHES } from "../../mocks/pvp";
import { PHONE_375, WIDE_1440 } from "../scenes/viewports";
import { MatchCard, MatchList } from "./match-list";

/**
 * The League page's latest attacks and defences (#786, in place of the defence log): the shield, then the matches as cards one
 * under the other, newest first. Each card has the attacked village's plan view behind (the snapshot, no WebGL per card), the
 * other player, Attack or Defence and when, the stars, the crowns won or lost, and an attack's XP and chest; a tap opens the
 * match. 20 at first, then "Show more".
 */
const meta = {
  title: "Containers/MatchList",
  component: MatchList,
  parameters: { layout: "padded" },
  args: { ...PVP_MATCHES.shielded, now: MOCK_NOW, onOpen: fn(), onRetry: fn() },
  decorators: [(Story) => <div className="mx-auto max-w-xl">{Story()}</div>],
} satisfies Meta<typeof MatchList>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Attacks and defences mixed, the shield up after the latest defence. */
export const Shielded: Story = {};
export const Open: Story = { args: PVP_MATCHES.open };
/** 26 matches: the first 20, then "Show more". */
export const Many: Story = { args: PVP_MATCHES.many };
/** v1: no snapshot kept, so no village behind; no rewards known. */
export const NoSnapshot: Story = { args: PVP_MATCHES.noSnapshot };
export const Empty: Story = { args: PVP_MATCHES.empty };
export const Loading: Story = { args: PVP_MATCHES.loading };
export const Failed: Story = { args: PVP_MATCHES.error };
export const ShieldedPhone: Story = { ...PHONE_375 };
export const ShieldedWide: Story = { ...WIDE_1440 };

/** Single cards: attacks with their rewards, a defence, a surrender. */
export const Cards: Story = {
  render: () => (
    <div className="flex flex-col gap-2">
      {[MATCHES[0]!, MATCHES[1]!, MATCHES[3]!, MATCHES[8]!].map((m) => (
        <MatchCard key={m.id} match={m} now={MOCK_NOW} onOpen={fn()} />
      ))}
    </div>
  ),
};
