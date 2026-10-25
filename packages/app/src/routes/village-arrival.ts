import type { VillageArrival } from "../components/elements/village-fog";

/** The 3D village was drawn once on this page: its chunk, the renderer's and the assets are in (the HTTP cache keeps them). */
let drawn = false;

/**
 * How the home's 3D village arrives (#761): the first time on this page, a cold load measured over the 1 s threshold on a
 * phone (the PR's figures), under the fog; later (Back from a page), the scene loads warm, with a short fade only.
 */
export function villageArrival(): VillageArrival {
  return drawn ? "fade" : "fog";
}

/** The village's first frame is drawn: later arrivals fade in. */
export function markVillageDrawn(): void {
  drawn = true;
}

/** For the tests: a first arrival again. */
export function resetVillageArrivalForTests(): void {
  drawn = false;
}
