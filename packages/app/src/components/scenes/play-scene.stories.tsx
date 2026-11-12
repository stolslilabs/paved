import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { CAMPAIGNS } from "@paved/game-core";
import { appRenders } from "../../mocks/assets";
import { PLAY, PURCHASE } from "../../mocks/scenes";
import { JOUST, JOUST_CARD } from "../../mocks/joust";
import { PUZZLE, PUZZLE_CARD } from "../../mocks/puzzle";
import { STORY } from "../../mocks/story";
import { PlayScene } from "./play-scene";
import { PurchaseScene } from "./purchase-scene";
import { JoustScene } from "./joust-scene";
import { PuzzleScene } from "./puzzle-scene";
import { StoryScene } from "./story-scene";
import { PHONE_320, PHONE_375 } from "./viewports";

/**
 * Play (`/play`, PLAY-PAGE, the Paved UX Book's "modes", the owner's asks of 2026-11-06, then PLAY-MODES, the owner's direction C of
 * 2026-11-08): the HUD's drawer, a full page on a phone, a side panel docked at the right from `tablet`. Attack the hero, the Challenge
 * wide, Training and Story square tiles, the Puzzle wide (coming soon where the network has none), each a stone slab on its mode's
 * scene, its icon breaking out of its top edge, its rewards static. One story per state; the Viewport control reframes it.
 */
const meta = {
  title: "Scenes/Play",
  component: PlayScene,
  args: { onBack: fn(), onChallenge: fn(), onChallengeBack: fn(), onStoryBack: fn(), onPuzzleBack: fn(), onResume: fn(), onTraining: fn(), onStory: fn(), onAttack: fn(), onPuzzle: fn(), onJoust: fn(), onJoustBack: fn() },
} satisfies Meta<typeof PlayScene>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Connected: Story = { args: PLAY.connected };
/** No Attack on this network (no `onAttack`): the Challenge leads, its war horn breaking out at the top. */
export const NoAttack: Story = { args: { ...PLAY.connected, onAttack: undefined } };

/** New Challenge games paused: the Challenge is off and says why; Training and Story stay open. */
export const PurchasesPaused: Story = { args: PLAY.paused };
/** The book's "modes-resume": a Challenge game still open, its time left and score, Resume. */
export const Running: Story = { args: PLAY.running };
/** The book's "challenge": the stake, a panel of its own in the modes' place (no sheet from the bottom), Back to the modes. */
export const Stake: Story = { args: { ...PLAY.connected, challenge: <PurchaseScene {...PURCHASE.stake3Referred} /> } };

/** Story's campaigns (STORY-PAGE) in the drawer: a view of its own in the modes' place, "Story" on the header, Back to the modes. */
const story = (state: keyof typeof STORY): Story => ({
  args: { ...PLAY.connected, story: <StoryScene campaigns={CAMPAIGNS} renders={appRenders} onCampaign={fn()} onLevel={fn()} {...STORY[state]} /> },
});
/** Story, the Tutorial under way: level 7, the last unlocked, on the gold wash and in the footer's Play; the levels after it locked. */
export const StoryOpen: Story = story("inProgress");
/** Story, a first visit: level 1 to play, every other level and campaign locked. */
export const StoryFirstVisit: Story = story("firstVisit");
/** Story, Open Country in view and locked: the Tutorial to finish first, on its card, in the carved box and the footer. */
export const StoryLocked: Story = story("locked");
/** Story, the Tutorial just finished: Open Country's card's lock opens and the blur lifts, once. */
export const StoryUnlocking: Story = story("unlocking");
/** Story, the Tutorial complete at 3 stars. */
export const StoryComplete: Story = story("complete");
/** Story with the browser's storage refused: the stars last for this visit. */
export const StoryStorageOff: Story = story("storageOff");

/** The Puzzle's card (PUZZLE-MODE, Limited): not played today, "One deck for all"; the day's time left in its carved corner. */
export const PuzzleNotPlayed: Story = { args: { ...PLAY.connected, ...PUZZLE_CARD.notPlayed } };
/** Played: the place of the day beside the title ("#28", no total), the best of the day as its line (its star and score). */
export const PuzzlePlayed: Story = { args: { ...PLAY.connected, ...PUZZLE_CARD.played } };
/** First of the day: "#1", carved the same as every place. */
export const PuzzleFirst: Story = { args: { ...PLAY.connected, ...PUZZLE_CARD.first } };
/** A game still open: its score "in play" (a tap opens the game). */
export const PuzzlePlaying: Story = { args: { ...PLAY.connected, ...PUZZLE_CARD.playing } };
/** The day's last hour: the time left in amber. */
export const PuzzleLastHour: Story = { args: { ...PLAY.connected, ...PUZZLE_CARD.lastHour } };

/** The Puzzle's view (PUZZLE-MODE) in the drawer: a view of its own in the modes' place, "Puzzle" and the Cobbles on the header. */
const puzzle = (state: keyof typeof PUZZLE): Story => ({ args: { ...PLAY.connected, puzzle: <PuzzleScene onPlay={fn()} onDeck={fn()} onOpenPlayer={fn()} onRetry={fn()} {...PUZZLE[state]} /> } });
/** Today's Puzzle, the viewer fourth: the day's figures, the prize, today's deck, the leaderboard, their best and Play in the footer. */
export const PuzzleToday: Story = puzzle("today");
/** A first visit today: no best yet, Play. */
export const PuzzleFirstVisit: Story = puzzle("firstVisit");
/** The viewer first. */
export const PuzzleLeading: Story = puzzle("leading");
/** The viewer past the list (57th): their row after it. */
export const PuzzlePastList: Story = puzzle("pastList");
/** A game still open: Resume in Play's place. */
export const PuzzleResume: Story = puzzle("playing");
/** Play pressed: the game being started. */
export const PuzzleStarting: Story = puzzle("starting");
/** No one has played today yet. */
export const PuzzleEmpty: Story = puzzle("empty");
/** The day's last hour: the time left in amber. */
export const PuzzleViewLastHour: Story = puzzle("lastHour");
export const PuzzleLoading: Story = puzzle("loading");
export const PuzzleFailed: Story = puzzle("failed");
/** WRAP360: the longest name and address, the largest figures. */
export const PuzzleStress: Story = puzzle("stress");

/** The Joust's card (Limited, over the Puzzle's): the registration open, the player's allegiance's emblem breaking out of its edge. */
export const JoustOpen: Story = { args: { ...PLAY.connected, ...PUZZLE_CARD.notPlayed, ...JOUST_CARD.open } };
/** Registered: the draw on Friday. */
export const JoustRegistered: Story = { args: { ...PLAY.connected, ...PUZZLE_CARD.notPlayed, ...JOUST_CARD.registered } };
/** The live match: "Live" in red, both emblems, both totals, the joust's time left. */
export const JoustLive: Story = { args: { ...PLAY.connected, ...PUZZLE_CARD.notPlayed, ...JOUST_CARD.live } };
/** A joust game still open: its score, a tap resumes it. */
export const JoustPlaying: Story = { args: { ...PLAY.connected, ...PUZZLE_CARD.notPlayed, ...JOUST_CARD.playing } };
export const JoustBye: Story = { args: { ...PLAY.connected, ...PUZZLE_CARD.notPlayed, ...JOUST_CARD.bye } };
/** The allegiance was not registered: it sits the week out. */
export const JoustSatOut: Story = { args: { ...PLAY.connected, ...PUZZLE_CARD.notPlayed, ...JOUST_CARD.satOut } };
/** No allegiance: the card says to join one. */
export const JoustGuildless: Story = { args: { ...PLAY.connected, ...PUZZLE_CARD.notPlayed, ...JOUST_CARD.guildless } };

/** The Joust's view in the drawer: a view of its own in the modes' place, "Joust" and the Cobbles on the header. */
const joust = (state: keyof typeof JOUST, joustTitle?: string): Story => ({
  args: { ...PLAY.connected, joustTitle, joust: <JoustScene onRegister={fn()} onPlay={fn()} onClaim={fn()} onTop={fn()} onRanking={fn()} onDeck={fn()} onAllegiance={fn()} onOpenPlayer={fn()} onRetry={fn()} {...JOUST[state]} /> },
});
/** Monday to Thursday, an Officer's: how the weekend goes, the boost, Register. */
export const JoustViewOfficer: Story = joust("officer");
export const JoustViewRegistering: Story = joust("registering");
/** A member's: an Officer or the Leader registers. */
export const JoustViewMember: Story = joust("member");
export const JoustViewRegistered: Story = joust("registered");
/** A legal name of the most and widest letters: Register cuts it at the drawer's edge, the other footers wrap it; at 320, 360 and 375. */
const MOBILE_360 = { globals: { viewport: { value: "mobile", isRotated: false } } };
export const JoustViewLongName320: Story = { ...joust("officerLongName"), ...PHONE_320 };
export const JoustViewLongName360: Story = { ...joust("officerLongName"), ...MOBILE_360 };
export const JoustViewLongName375: Story = { ...joust("officerLongName"), ...PHONE_375 };
export const JoustViewMemberLongName320: Story = { ...joust("memberLongName"), ...PHONE_320 };
export const JoustViewRegisteredLongName320: Story = { ...joust("registeredLongName"), ...PHONE_320 };
/** Monday: last week's victory, the rating's move, Claim. */
export const JoustViewResult: Story = joust("result");
/** A defeat, its Cobbles claimed. */
export const JoustViewDefeat: Story = joust("defeat");
export const JoustViewGuildless: Story = joust("guildless");
/** Friday to Sunday: both totals, the expected result, the viewer's games, the deck, what a better game would change. */
export const JoustViewLive: Story = joust("live");
/** A game still open: Resume. */
export const JoustViewPlaying: Story = joust("playing");
export const JoustViewNoGameLeft: Story = joust("noGameLeft");
/** Joined after Friday 00:00: no game this weekend. */
export const JoustViewNewcomer: Story = joust("newcomer");
export const JoustViewBye: Story = joust("bye");
export const JoustViewSatOut: Story = joust("satOut");
/** Both top 10 side by side, the viewer's row lit. */
export const JoustViewTop: Story = joust("top", "Both top 10");
/** The allegiances by rating. */
export const JoustViewRanking: Story = joust("ranking", "Ranking");
export const JoustViewRankingLoading: Story = joust("rankingLoading", "Ranking");
export const JoustViewLoading: Story = joust("loading");
export const JoustViewFailed: Story = joust("failed");
