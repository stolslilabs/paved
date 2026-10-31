import { seededRandom } from "@paved/renderer";
import type { ProfileState } from "../components/containers/profile-sheet";
import { drawNewPlayer } from "../data/mock/new-player";
import { AVATAR_ITEMS, AVATAR_PARTS_IN_USE } from "./avatar";
import { PLAYER } from "./players";

// A new player in the stories (#926): the name and the look the mock draws at a first connection, from a seeded random so
// every load shows the same. The stories' module alone: the word lists stay out of the app's chunks.

/** The draw's seed in the stories. */
export const NEW_PLAYER_SEED = 926;

/** The name and look a new player of the stories was given: free items only (they own nothing). */
export const NEW_PLAYER = drawNewPlayer({ parts: AVATAR_PARTS_IN_USE, items: AVATAR_ITEMS, owned: AVATAR_ITEMS.map(() => 0n) }, seededRandom(NEW_PLAYER_SEED));

/** The profile of that new player: their drawn name, no games yet. */
export const NEW_PLAYER_PROFILE = {
  status: "connected",
  data: { player: { ...PLAYER, name: NEW_PLAYER.name, created: null }, stats: { challengeGames: 0, challengeFinished: 0, bestScore: 0, paidGames: 0, settledGames: 0, rewards: "0" } },
} satisfies ProfileState;
