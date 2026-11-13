import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { PUZZLE_CARD } from "../../mocks/puzzle";
import { PLAY } from "../../mocks/scenes";
import { TOURNAMENT, TOURNAMENT_CARD } from "../../mocks/tournament";
import { PlayScene } from "./play-scene";
import { TournamentScene } from "./tournament-scene";
import { PHONE_320, PHONE_375 } from "./viewports";

/**
 * The Tournament (`/play/tournament`, Play's Limited mode; the weekly individual event of the design proposal of 2026-11-09): its card
 * in Play's modes, and its view in Play's drawer, "Tournament" and the Cobbles on the header. One story per state; the Viewport
 * control reframes it.
 */
const meta = {
  title: "Scenes/Tournament",
  component: PlayScene,
  args: { onBack: fn(), onTournament: fn(), onTournamentBack: fn(), onPuzzle: fn(), onChallenge: fn(), onTraining: fn(), onStory: fn(), onAttack: fn() },
} satisfies Meta<typeof PlayScene>;
export default meta;
type Story = StoryObj<typeof meta>;

const MOBILE_360 = { globals: { viewport: { value: "mobile", isRotated: false } } };

const card = (state: keyof typeof TOURNAMENT_CARD): Story => ({ args: { ...PLAY.connected, ...PUZZLE_CARD.notPlayed, ...TOURNAMENT_CARD[state] } });
/** The card on Monday: the registration open. */
export const CardOpen: Story = card("open");
export const CardRegistered: Story = card("registered");
/** A day's duel to play: "Live" in red, the round and the opponent. */
export const CardDuel: Story = card("duel");
/** A long opponent's name is cut at the rewards' edge; at 320 and 360. */
export const CardLongName320: Story = { ...card("longName"), ...PHONE_320 };
export const CardLongName360: Story = { ...card("longName"), ...MOBILE_360 };
/** A game still open: its score, a tap resumes it. */
export const CardPlaying: Story = card("playing");
export const CardPlayed: Story = card("played");
export const CardBye: Story = card("bye");
export const CardOut: Story = card("out");
export const CardOutClaimed320: Story = { ...card("outClaimed"), ...PHONE_320 };
export const CardNotRegistered: Story = card("notRegistered");

const view = (state: keyof typeof TOURNAMENT, tournamentTitle?: string): Story => ({
  args: { ...PLAY.connected, tournamentTitle, tournament: <TournamentScene onRegister={fn()} onPlay={fn()} onClaim={fn()} onBracket={fn()} onDeck={fn()} onOpenPlayer={fn()} onRetry={fn()} {...TOURNAMENT[state]} /> },
});
/** Monday: the league, the players registered, how the week goes, the Cobbles by round, Register. */
export const Registration: Story = view("registration");
export const Registering: Story = view("registering");
export const Registered: Story = view("registered");
/** Monday after a title: last week's champion, the Claim. */
export const Champion: Story = view("champion");
export const LastClaimed: Story = view("lastClaimed");
/** Saturday's semi-final: the opponent played first, their score is the target. */
export const Duel: Story = view("duel");
export const Duel320: Story = { ...view("duel"), ...PHONE_320 };
export const Duel375: Story = { ...view("duel"), ...PHONE_375 };
/** The opponent has not played yet. */
export const DuelFirst: Story = view("duelFirst");
/** A game still open: Resume. */
export const Playing: Story = view("playing");
/** Played: midnight decides. */
export const Played: Story = view("played");
/** The match opposite was played by nobody: through by playing. */
export const Walkover: Story = view("walkover");
/** A name of the widest letters: cut in the duel's card, whole in its title; at 320 and 360. */
export const LongName320: Story = { ...view("longName"), ...PHONE_320 };
export const LongName360: Story = { ...view("longName"), ...MOBILE_360 };
/** A bye of the draw: no duel today, the first one on Wednesday. */
export const Bye: Story = view("bye");
/** A small league group carried down. */
export const Carried: Story = view("carried");
/** Out: the round reached, its Cobbles to claim. */
export const Out: Story = view("out");
export const OutClaimed: Story = view("outClaimed");
export const NotRegistered: Story = view("notRegistered");
/** The bracket: the viewer's path and the last eight. */
export const Bracket: Story = view("bracket", "Bracket");
export const Bracket320: Story = { ...view("bracket", "Bracket"), ...PHONE_320 };
export const BracketEarly: Story = view("bracketEarly", "Bracket");
export const BracketChampion: Story = view("bracketChampion", "Bracket");
export const BracketLongName320: Story = { ...view("bracketLongName", "Bracket"), ...PHONE_320 };
export const BracketNone: Story = view("bracketNone", "Bracket");
export const Loading: Story = view("loading");
export const Failed: Story = view("failed");
