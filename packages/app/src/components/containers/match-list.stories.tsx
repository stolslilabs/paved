import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { MOCK_NOW } from "../../mocks/clock";
import { MATCH_CARDS, PVP_MATCHES } from "../../mocks/pvp";
import { PHONE_320, PHONE_375, WIDE_1440 } from "../scenes/viewports";
import { MatchCard, MatchList, type MatchCardData } from "./match-list";

/**
 * The League page's battle logs (#786, in place of the defence log; #834): the shield, then the matches as cards one under the
 * other, newest first. Each card has its side's illustration behind (one for every attack, one for every defence, made for Paved
 * from the game's own voxel renders), in colour when crowns were won and in grayscale when they were lost. The other player's
 * avatar and name top left, the crowns top right, an attack's XP bottom left and its chest bottom right, the stars, the score
 * and how long ago in the middle; a tap opens the match. 20 at first, then "Show more".
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
/** v1: no snapshot kept (the match page has no village), and no rewards known: no XP, no chest. */
export const NoSnapshot: Story = { args: PVP_MATCHES.noSnapshot };
export const Empty: Story = { args: PVP_MATCHES.empty };
export const Loading: Story = { args: PVP_MATCHES.loading };
export const Failed: Story = { args: PVP_MATCHES.error };
export const ShieldedPhone: Story = { ...PHONE_375 };
export const ShieldedWide: Story = { ...WIDE_1440 };

/** One card, alone. */
const card = (match: MatchCardData): Story => ({ render: () => <MatchCard match={match} now={MOCK_NOW} onOpen={fn()} /> });

/** Two stars: crowns won, the attack's illustration in colour, XP and a silver chest. */
export const AttackWon: Story = card(MATCH_CARDS.attackWon);
/** No star: crowns lost, the illustration in grayscale, no chest. */
export const AttackLost: Story = card(MATCH_CARDS.attackLost);
/** The village held: a few crowns won, the defence's illustration in colour. */
export const DefenceWon: Story = card(MATCH_CARDS.defenceWon);
/** The attacker took stars: crowns lost, in grayscale. */
export const DefenceLost: Story = card(MATCH_CARDS.defenceLost);
export const Surrender: Story = card(MATCH_CARDS.surrender);
/** Three stars: a gold chest at the bottom right. */
export const Chest: Story = card(MATCH_CARDS.chest);
/** A star, no chest. */
export const NoChest: Story = card(MATCH_CARDS.noChest);

/** Every card state, one under the other. */
const cards: Story = {
  render: () => (
    <div className="flex flex-col gap-2">
      {Object.values(MATCH_CARDS).map((m) => (
        <MatchCard key={m.id} match={m} now={MOCK_NOW} onOpen={fn()} />
      ))}
    </div>
  ),
};
export const Cards: Story = cards;
export const CardsPhone: Story = { ...cards, ...PHONE_375 };
export const CardsSmall: Story = { ...cards, ...PHONE_320 };
export const CardsWide: Story = { ...cards, ...WIDE_1440 };
