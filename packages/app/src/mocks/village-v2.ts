import type { BoardTile } from "@paved/chain";
import type { Chest, VillageChestsSceneProps } from "../components/scenes/village-chests-scene";
import type { ShopOffer, VillageShopSceneProps } from "../components/scenes/village-shop-scene";
import type { VillageLayoutSceneProps } from "../components/scenes/village-layout-scene";
import type { HomeVillageSceneProps } from "../components/scenes/home-village-scene";
import { deckCount, rarityOf, type Rarity } from "../components/elements/rarity-badge";
import { STARTER, canLift, countPlans, fittingAt, frontier, isStarter, layoutScore, legalSpots, type Inventory, type VillageLayout } from "../components/containers/layout-rules";
import { DAY, MOCK_NOW } from "./clock";
import { GAME_PLAYING } from "./games";
import { PLAYER } from "./players";
import { PLAN } from "./village";

/**
 * The v2 village's fakes (#739, part of #732): free layouts built by the rules of `layout-rules.ts` (every tile joined to the
 * starter, every facing edge matched), the inventories, the chests by rank and the daily shop. The score of a layout is the
 * off-chain engine's (`EngineGame.villageOf`), as the contracts will compute it (#733); the shop's prices are a proposal (#737
 * decides them): 20, 40 and 80 Cobbles by rarity.
 */

const ME = PLAYER.name ?? "bal7hazar";

/** A valid layout: the starter, then `plans` one by one on the first cell next to the layout where an orientation fits. */
export function lay(plans: readonly number[]): BoardTile[] {
  const tiles: BoardTile[] = [{ ...STARTER }];
  for (const plan of plans) {
    for (const cell of frontier(tiles)) {
      const o = fittingAt(tiles, plan, cell)[0];
      if (o !== undefined) {
        tiles.push({ id: tiles.length + 1, plan, orientation: o, x: cell.x, y: cell.y });
        break;
      }
    }
  }
  return tiles;
}

/** A layout's score by the off-chain engine (`layoutScore`), as the contracts will compute it. */
export const fakeScore = layoutScore;

const P = PLAN;
/** Plans of the base deck, common ones first: what a village is built of. */
const MIXED = [P.road, P.forestCity, P.roadCross, P.cityEdge, P.road, P.roadBend, P.wonder, P.roadCross, P.cityForest, P.road, P.roadCity, P.cityEdge, P.stopRoads, P.road, P.forestCity, P.roadCross, P.city, P.roadBend, P.road, P.cityEdge, P.roadCross, P.road, P.forestCity, P.roadBend, P.cityEdge, P.road, P.roadCross];

function layout(owner: string, level: number, plans: readonly number[]): VillageLayout {
  const tiles = lay(plans);
  return { owner, level, tiles, score: fakeScore(tiles) };
}

/** A new village (level 1, 9 slots): the starter and 8 tiles, a layout that closes a structure (#732's start). */
export const LAYOUT_START = layout(ME, 1, [P.road, P.cityEdge, P.roadCross, P.forestCity, P.road, P.roadBend, P.cityForest, P.road]);
/** Halfway (level 20, 28 slots): 21 tiles placed, "21 / 28". */
export const LAYOUT_GROWING = layout(ME, 20, MIXED.slice(0, 21));
/** Every slot used (level 12, 20 slots): Save needs a tile taken off before another goes on. */
export const LAYOUT_FULL = layout(ME, 12, MIXED.slice(0, 20));
/** Someone else's village, for a visit. */
export const LAYOUT_RIVAL = layout("Rook of Ashford", 16, [...MIXED].reverse().slice(0, 23));

/** The tiles off the layout, as chests and the shop gave them. */
export const INVENTORY: Inventory = { [P.road]: 4, [P.roadCross]: 2, [P.wonder]: 1, [P.cityEdge]: 3, [P.city]: 1, [P.stopRoads]: 1, [P.roadBend]: 2, [P.forestCity]: 2 };
/** A new account: no tile off the layout. */
export const INVENTORY_EMPTY: Inventory = {};
/** A long-standing player (#757): one to four copies of every plan of the base deck, more cards than the editor's column holds. */
export const INVENTORY_LONG: Inventory = Object.fromEntries(
  Array.from({ length: 32 }, (_, plan) => plan)
    .filter((plan) => deckCount(plan) > 0)
    .map((plan) => [plan, 1 + (plan % 4)]),
);

/** How many of each plan a player holds: the layout's and the inventory's. */
export function ownedOf(village: VillageLayout, inventory: Inventory): Record<number, number> {
  const out = countPlans(village.tiles.filter((t) => !isStarter(t)));
  for (const [plan, n] of Object.entries(inventory)) out[Number(plan)] = (out[Number(plan)] ?? 0) + n;
  return out;
}

/** A draft three tiles richer than the saved layout (a road, a forest city, a bend from the inventory): valid, changed, Save enabled, a structure closed. */
export const DRAFT_VALID: BoardTile[] = lay(MIXED.slice(0, 24));

/** An outer tile of the growing village: lifting it leaves the rest joined to the starter. */
export const OUTER_TILE = [...LAYOUT_GROWING.tiles].reverse().find((t) => canLift(LAYOUT_GROWING.tiles, t.id))!;
/** A tile that holds the growing village together: lifting it would split it. */
export const KEY_TILE = LAYOUT_GROWING.tiles.find((t) => !isStarter(t) && !canLift(LAYOUT_GROWING.tiles, t.id))!;

/** A scene's data without its callbacks. */
type Data<P> = { [K in keyof P as K extends `on${string}` ? never : K]: P[K] };

/** One fixture per state of the v2 village (`Scenes/Village v2/Layout`). */
export const VILLAGE_LAYOUT = {
  start: { village: LAYOUT_START, inventory: INVENTORY_EMPTY, cobbles: 120, chests: 1 },
  growing: { village: LAYOUT_GROWING, inventory: INVENTORY, cobbles: 640, chests: 2 },
  editing: { village: LAYOUT_GROWING, inventory: INVENTORY, cobbles: 640, chests: 2, initialEditing: true },
  holding: { village: LAYOUT_GROWING, inventory: INVENTORY, cobbles: 640, initialEditing: true, initialHand: { plan: P.road } },
  placing: { village: LAYOUT_GROWING, inventory: INVENTORY, cobbles: 640, initialEditing: true, initialHand: { plan: P.road }, initialPending: legalSpots(LAYOUT_GROWING.tiles, P.road)[0]! },
  lifted: { village: LAYOUT_GROWING, inventory: INVENTORY, cobbles: 640, initialEditing: true, initialHand: { lift: OUTER_TILE.id } },
  changed: { village: LAYOUT_GROWING, inventory: INVENTORY, cobbles: 640, initialEditing: true, initialDraft: DRAFT_VALID },
  reset: { village: LAYOUT_GROWING, inventory: INVENTORY, cobbles: 640, initialEditing: true, initialDraft: [{ ...STARTER }] },
  full: { village: LAYOUT_FULL, inventory: INVENTORY, cobbles: 640, initialEditing: true },
  leaving: { village: LAYOUT_GROWING, inventory: INVENTORY, cobbles: 640, initialEditing: true, initialDraft: DRAFT_VALID, initialLeaving: true },
  saving: { village: LAYOUT_GROWING, inventory: INVENTORY, cobbles: 640, initialEditing: true, initialDraft: DRAFT_VALID, saving: true },
  saved: { village: { ...LAYOUT_GROWING, tiles: DRAFT_VALID, score: fakeScore(DRAFT_VALID) }, inventory: { ...INVENTORY, [P.road]: 3, [P.forestCity]: 1, [P.roadBend]: 1 }, cobbles: 640, chests: 2, saved: { score: fakeScore(DRAFT_VALID), previous: LAYOUT_GROWING.score } },
  refused: { village: LAYOUT_GROWING, inventory: INVENTORY, cobbles: 640, initialEditing: true, initialDraft: DRAFT_VALID, refusal: "The layout changed on another device: read it again. Nothing was saved." },
  emptyInventory: { village: LAYOUT_START, inventory: INVENTORY_EMPTY, cobbles: 120, initialEditing: true },
  loading: { status: { kind: "loading" } },
  guest: { status: { kind: "guest" } },
  error: { status: { kind: "error", message: "Village: the node did not answer" } },
  visit: { village: LAYOUT_RIVAL, mode: "visit" },
} satisfies Record<string, Data<VillageLayoutSceneProps>>;

/** The next UTC day after the mocks' clock: the day's chests and the shop reset then. */
export const TOMORROW = (Math.floor(MOCK_NOW / DAY) + 1) * DAY;

export const CHESTS: readonly Chest[] = [
  { id: 41, rank: "gold", source: "pvp", label: "3 stars against Rook of Ashford" },
  { id: 40, rank: "silver", source: "pvp", label: "2 stars against Mira" },
  { id: 39, rank: "bronze", source: "story", label: "The Old Road, level 2" },
];

/** One fixture per state of the chests (`Scenes/Village v2/Chests`). */
export const VILLAGE_CHESTS = {
  waiting: { chests: CHESTS, pvpToday: 2, resetsAt: TOMORROW, now: MOCK_NOW },
  opening: { chests: CHESTS, pvpToday: 2, resetsAt: TOMORROW, now: MOCK_NOW, opening: 41 },
  gold: { chests: CHESTS, pvpToday: 2, resetsAt: TOMORROW, now: MOCK_NOW, opened: { chestId: 41, draw: { rank: "gold", plans: [P.road, P.wonder, P.cityEdge], cobbles: null } }, owned: ownedOf(LAYOUT_GROWING, INVENTORY) },
  goldChosen: {
    chests: CHESTS,
    pvpToday: 2,
    resetsAt: TOMORROW,
    now: MOCK_NOW,
    opened: { chestId: 41, draw: { rank: "gold", plans: [P.road, P.wonder, P.cityEdge], cobbles: null } },
    owned: ownedOf(LAYOUT_GROWING, INVENTORY),
    initialChoice: 1,
  },
  silver: { chests: CHESTS, pvpToday: 2, resetsAt: TOMORROW, now: MOCK_NOW, opened: { chestId: 40, draw: { rank: "silver", plans: [P.roadCross, P.stopRoads], cobbles: null } }, owned: ownedOf(LAYOUT_GROWING, INVENTORY) },
  bronze: { chests: CHESTS, pvpToday: 2, resetsAt: TOMORROW, now: MOCK_NOW, opened: { chestId: 39, draw: { rank: "bronze", plans: [P.forestCity], cobbles: null } }, owned: ownedOf(LAYOUT_GROWING, INVENTORY) },
  cobbles: { chests: CHESTS, pvpToday: 2, resetsAt: TOMORROW, now: MOCK_NOW, opened: { chestId: 41, draw: { rank: "gold", plans: [P.road, P.wonder, P.cityEdge], cobbles: 50 } }, owned: ownedOf(LAYOUT_GROWING, INVENTORY) },
  taking: { chests: CHESTS, pvpToday: 2, resetsAt: TOMORROW, now: MOCK_NOW, opened: { chestId: 40, draw: { rank: "silver", plans: [P.roadCross, P.stopRoads], cobbles: null } }, initialChoice: 1, busy: true },
  taken: { chests: CHESTS.slice(1), pvpToday: 2, resetsAt: TOMORROW, now: MOCK_NOW, taken: { plan: P.wonder, cobbles: 50 } },
  capped: { chests: CHESTS.slice(2), pvpToday: 3, resetsAt: TOMORROW, now: MOCK_NOW },
  empty: { chests: [], pvpToday: 0, resetsAt: TOMORROW, now: MOCK_NOW },
  refused: { chests: CHESTS, pvpToday: 2, resetsAt: TOMORROW, now: MOCK_NOW, refusal: "This chest was opened already. Nothing was taken." },
  loading: { status: { kind: "loading" } },
  guest: { status: { kind: "guest" } },
} satisfies Record<string, Data<VillageChestsSceneProps>>;

/** The shop's prices by rarity (a proposal, #737 decides): round values, the rare four times the common. */
export const SHOP_PRICE: Readonly<Record<Rarity, number>> = { common: 20, uncommon: 40, rare: 80 };

const offer = (plan: number, bought = false): ShopOffer => ({ plan, rarity: rarityOf(plan), price: SHOP_PRICE[rarityOf(plan)], bought });

/** Today's offers: one common, one uncommon, one rare. */
export const SHOP_TODAY: readonly ShopOffer[] = [offer(P.road), offer(P.wonder), offer(P.stopRoads)];

/** One fixture per state of the shop (`Scenes/Village v2/Shop`). */
export const VILLAGE_SHOP = {
  today: { offers: SHOP_TODAY, cobbles: 240, owned: ownedOf(LAYOUT_GROWING, INVENTORY), resetsAt: TOMORROW, now: MOCK_NOW },
  buying: { offers: SHOP_TODAY, cobbles: 240, owned: ownedOf(LAYOUT_GROWING, INVENTORY), resetsAt: TOMORROW, now: MOCK_NOW, buying: 2 },
  oneBought: { offers: [offer(P.road, true), SHOP_TODAY[1]!, SHOP_TODAY[2]!], cobbles: 220, owned: ownedOf(LAYOUT_GROWING, INVENTORY), resetsAt: TOMORROW, now: MOCK_NOW },
  allBought: { offers: SHOP_TODAY.map((o) => ({ ...o, bought: true })), cobbles: 100, owned: ownedOf(LAYOUT_GROWING, INVENTORY), resetsAt: TOMORROW, now: MOCK_NOW },
  short: { offers: SHOP_TODAY, cobbles: 30, owned: ownedOf(LAYOUT_GROWING, INVENTORY), resetsAt: TOMORROW, now: MOCK_NOW },
  refused: { offers: SHOP_TODAY, cobbles: 240, owned: ownedOf(LAYOUT_GROWING, INVENTORY), resetsAt: TOMORROW, now: MOCK_NOW, refusal: "This tile was bought today already. No Cobbles were spent." },
  loading: { status: { kind: "loading" } },
  guest: { status: { kind: "guest" } },
} satisfies Record<string, Data<VillageShopSceneProps>>;

/** The home's base (#753): the growing village, its inventory, 2 chests and 3 missions waiting, 1,240 crowns, at the mocks' clock. */
const home = { village: LAYOUT_GROWING, inventory: INVENTORY, chests: 2, missions: 3, league: { crowns: 1_240 }, now: MOCK_NOW } as const;

/** One fixture per state of the home (`Scenes/Home`): the village in view, its chips, and edit mode. */
export const HOME_VILLAGE = {
  view: home,
  /** A Challenge game running: the Resume chip. */
  resume: { ...home, activeGame: GAME_PLAYING },
  /** `spawn_paused`: the notice beside the Resume chip. */
  paused: { ...home, activeGame: GAME_PLAYING, spawnPaused: true },
  /** A new player: the starter village (level 1), no PvP played: the badge Unranked with 0 crowns (#755). */
  start: { village: LAYOUT_START, inventory: INVENTORY_EMPTY, league: null, now: MOCK_NOW },
  /** Not founded yet: the starter alone, Found in Edit's place. */
  unfounded: { village: { ...LAYOUT_START, tiles: [{ ...STARTER }], score: 0 }, founded: false, league: null, now: MOCK_NOW },
  /** No wallet: a starter village to look at, nothing to edit (Connect is the header's). */
  guest: { village: LAYOUT_START, guest: true, league: null, now: MOCK_NOW },
  /** The village on its way: the overlays over the sky. */
  loading: { now: MOCK_NOW },
  /** The village's read failed: Retry. */
  error: { now: MOCK_NOW, error: { message: "Village: the node did not answer" } },
  /** The save landed: the new score over the village. */
  saved: { ...home, village: { ...LAYOUT_GROWING, tiles: DRAFT_VALID, score: fakeScore(DRAFT_VALID) }, saved: { score: fakeScore(DRAFT_VALID), previous: LAYOUT_GROWING.score } },
  /** Edit mode: the editor's bar, the inventory, Reset all, Discard and Save, in the same scene. */
  editing: { ...home, editing: true },
  /** A road in hand: its legal cells lit. */
  holding: { ...home, editing: true, initialHand: { plan: P.road } },
  /** The road set on a lit cell: the bubble. */
  placing: { ...home, editing: true, initialHand: { plan: P.road }, initialPending: legalSpots(LAYOUT_GROWING.tiles, P.road)[0]! },
  /** Three tiles more than saved: the live score against the saved one. */
  changed: { ...home, editing: true, initialDraft: DRAFT_VALID },
  /** Back with unsaved changes: asked first. */
  leaving: { ...home, editing: true, initialDraft: DRAFT_VALID, initialLeaving: true },
  /** The chain refused the save: what happened, the draft kept. */
  refused: { ...home, editing: true, initialDraft: DRAFT_VALID, refusal: "The layout changed on another device: read it again. Nothing was saved." },
} satisfies Record<string, Data<HomeVillageSceneProps>>;
