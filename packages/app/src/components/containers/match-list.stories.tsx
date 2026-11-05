import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { MOCK_NOW } from "../../mocks/clock";
import { MATCH_CARDS, PVP_MATCHES } from "../../mocks/pvp";
import { PHONE_320, PHONE_375, WIDE_1440 } from "../scenes/viewports";
import { MatchCard, MatchList, type MatchCardData } from "./match-list";

/**
 * The League page's battle logs (#786, in place of the defence log; #834; no shield since #859). LEAGUE-PAGE (the Paved UX Book's
 * League): one carved list in the drawer, a row per match, newest first: its side's badge and name (Attack, Defence), the rival's
 * portrait in their league's rim, their name over the crowns won or lost and the stars, the score and how long ago, and an attack's
 * XP and chest in a gold tile at the end; a tap opens the match. 20 at first, then "Show more". In the drawer's column (28 rem).
 */
const meta = {
  title: "Containers/MatchList",
  component: MatchList,
  parameters: { layout: "padded" },
  args: { ...PVP_MATCHES.latest, now: MOCK_NOW, onOpen: fn(), onRetry: fn() },
  // The drawer's column: its 28 rem at most, its charcoal, the story's own 16 px padding as the drawer body's.
  decorators: [(Story) => <div className="mx-auto max-w-md bg-secondary">{Story()}</div>],
} satisfies Meta<typeof MatchList>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Attacks and defences mixed, newest first; no shield's row (#859). */
export const Latest: Story = {};
/** 26 matches: the first 20, then "Show more". */
export const Many: Story = { args: PVP_MATCHES.many };
/** v1: no snapshot kept (the match page has no village), and no rewards nor league known: no XP, no chest, a plain ring. */
export const NoSnapshot: Story = { args: PVP_MATCHES.noSnapshot };
export const Empty: Story = { args: PVP_MATCHES.empty };
export const Loading: Story = { args: PVP_MATCHES.loading };
export const Failed: Story = { args: PVP_MATCHES.error };
export const LatestPhone: Story = { ...PHONE_375 };
export const LatestSmall: Story = { ...PHONE_320 };
export const LatestWide: Story = { ...WIDE_1440 };

/** One row, alone, in the list's carved surface. */
const card = (match: MatchCardData): Story => ({ render: () => <div className="drawer-carved flex rounded-xl"><MatchCard match={match} now={MOCK_NOW} onOpen={fn()} /></div> });

/** Two stars: crowns won, XP and a rare chest. */
export const AttackWon: Story = card(MATCH_CARDS.attackWon);
/** No star: crowns lost, no chest. */
export const AttackLost: Story = card(MATCH_CARDS.attackLost);
/** The village held: a few crowns won. */
export const DefenceWon: Story = card(MATCH_CARDS.defenceWon);
/** The attacker took stars: crowns lost. */
export const DefenceLost: Story = card(MATCH_CARDS.defenceLost);
export const Surrender: Story = card(MATCH_CARDS.surrender);
/** Three stars: an epic chest at the end. */
export const Chest: Story = card(MATCH_CARDS.chest);
/** A star, no chest. */
export const NoChest: Story = card(MATCH_CARDS.noChest);

/** Every row state, one under the other. */
const cards: Story = {
  render: () => (
    <div className="drawer-carved flex flex-col rounded-xl">
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

/** The rival's portrait and name open their public profile (#952): a control of their own, the row's under it. */
export const RivalProfile: Story = { render: () => <div className="drawer-carved flex rounded-xl"><MatchCard match={MATCH_CARDS.attackWon} now={MOCK_NOW} onOpen={fn()} onOpenPlayer={fn()} /></div> };
/** The same in the list, as the League page gives it. */
export const LatestWithProfiles: Story = { args: { onOpenPlayer: fn() } };
