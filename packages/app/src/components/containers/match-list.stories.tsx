import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { appRenders } from "../../mocks/assets";
import { MOCK_NOW } from "../../mocks/clock";
import { MATCH_CARDS, PVP_MATCHES } from "../../mocks/pvp";
import { PHONE_320, PHONE_375, WIDE_1440 } from "../scenes/viewports";
import { MatchCard, MatchList, type MatchCardData } from "./match-list";

/**
 * The League page's battle logs (#786, in place of the defence log; #834; no shield since #859): the matches as cards one under the
 * other, newest first, 112 px each (#857). Each card has its side's background behind (#857: renders of the game's own boards,
 * made as the Story campaigns' are; an attack's village in an autumn light, a defence's walled one in a winter light), in
 * colour when crowns were won and in grayscale when they were lost. The other player's
 * avatar and name top left, the crowns top right, an attack's XP bottom left and its chest bottom right, the stars, the score
 * and how long ago in the middle; a tap opens the match. 20 at first, then "Show more".
 */
const meta = {
  title: "Containers/MatchList",
  component: MatchList,
  parameters: { layout: "padded" },
  args: { ...PVP_MATCHES.latest, now: MOCK_NOW, onOpen: fn(), onRetry: fn() },
  // The League page's card width (`max-w-5xl` less its gutters, 992 px) where a story asks for it (`page`), else a column.
  decorators: [(Story, { parameters }) => <div className={parameters.page ? "mx-auto max-w-5xl px-4" : "mx-auto max-w-xl"}>{Story()}</div>],
} satisfies Meta<typeof MatchList>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Attacks and defences mixed, newest first; no shield's card (#859). */
export const Latest: Story = {};
/** 26 matches: the first 20, then "Show more". */
export const Many: Story = { args: PVP_MATCHES.many };
/** v1: no snapshot kept (the match page has no village), and no rewards known: no XP, no chest. */
export const NoSnapshot: Story = { args: PVP_MATCHES.noSnapshot };
export const Empty: Story = { args: PVP_MATCHES.empty };
export const Loading: Story = { args: PVP_MATCHES.loading };
export const Failed: Story = { args: PVP_MATCHES.error };
export const LatestPhone: Story = { ...PHONE_375 };
export const LatestWide: Story = { ...WIDE_1440 };

/** No build renders (no manifest, an older build): the cards keep their own colour behind, nothing else changes. */
export const NoRenders: Story = { args: { renders: undefined } };

/** One card, alone. */
const card = (match: MatchCardData): Story => ({ render: () => <MatchCard match={match} now={MOCK_NOW} onOpen={fn()} renders={appRenders} /> });

/** Two stars: crowns won, the attack's background in colour, XP and a rare chest. */
export const AttackWon: Story = card(MATCH_CARDS.attackWon);
/** No star: crowns lost, the background in grayscale, no chest. */
export const AttackLost: Story = card(MATCH_CARDS.attackLost);
/** The village held: a few crowns won, the defence's background in colour. */
export const DefenceWon: Story = card(MATCH_CARDS.defenceWon);
/** The attacker took stars: crowns lost, in grayscale. */
export const DefenceLost: Story = card(MATCH_CARDS.defenceLost);
export const Surrender: Story = card(MATCH_CARDS.surrender);
/** Three stars: an epic chest at the bottom right. */
export const Chest: Story = card(MATCH_CARDS.chest);
/** A star, no chest. */
export const NoChest: Story = card(MATCH_CARDS.noChest);

/** Every card state, one under the other. */
const cards: Story = {
  render: () => (
    <div className="flex flex-col gap-2">
      {Object.values(MATCH_CARDS).map((m) => (
        <MatchCard key={m.id} match={m} now={MOCK_NOW} onOpen={fn()} renders={appRenders} />
      ))}
    </div>
  ),
};
export const Cards: Story = cards;
export const CardsPhone: Story = { ...cards, ...PHONE_375 };
export const CardsSmall: Story = { ...cards, ...PHONE_320 };
export const CardsWide: Story = { ...cards, ...WIDE_1440 };

/**
 * The battle backgrounds (#857): an attack won and lost, a defence won and lost, the lost ones in grayscale. At 1440 the card
 * spans the League page's width (992 px), so the background's middle rows show.
 */
const backgrounds: Story = {
  render: () => (
    <div className="flex flex-col gap-2">
      {[MATCH_CARDS.attackWon, MATCH_CARDS.attackLost, MATCH_CARDS.defenceWon, MATCH_CARDS.defenceLost].map((m) => (
        <MatchCard key={m.id} match={m} now={MOCK_NOW} onOpen={fn()} renders={appRenders} />
      ))}
    </div>
  ),
};
export const BackgroundsSmall: Story = { ...backgrounds, ...PHONE_320, parameters: { ...PHONE_320.parameters, page: true } };
export const BackgroundsPhone: Story = { ...backgrounds, ...PHONE_375, parameters: { ...PHONE_375.parameters, page: true } };
export const BackgroundsWide: Story = { ...backgrounds, ...WIDE_1440, parameters: { page: true } };
