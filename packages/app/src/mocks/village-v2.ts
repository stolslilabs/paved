import type { BoardTile } from "@paved/chain";
import { CategoryType } from "@paved/game-core";
import type { Chest, VillageChestsSceneProps } from "../components/scenes/village-chests-scene";
import type { ShopOffer, VillageShopSceneProps } from "../components/scenes/village-shop-scene";
import type { VillageLayoutSceneProps } from "../components/scenes/village-layout-scene";
import type { HomeVillageSceneProps } from "../components/scenes/home-village-scene";
import type { LayoutSlot, LayoutSlotsProps } from "../components/containers/layout-slots-strip";
import { deckCount, rarityOf, type Rarity } from "../components/elements/rarity-badge";
import { STARTER, canLift, countPlans, draftOf, fittingAt, frontier, isStarter, layoutPoints, layoutScore, legalSpots, slotsFor, stockOf, type Inventory, type VillageLayout } from "../components/containers/layout-rules";
import { DAY, HOUR, MOCK_NOW } from "./clock";
import { randomLayout } from "@paved/game-core";
import { FAILING_RANDOMIZER, PENDING_RANDOMIZER, STILL, mainThreadRandomizer, seedsOf } from "./random-layout";
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
/**
 * A village around a closed Wonder (#792): the wonder laid first, the next 23 tiles of the mix (its own wonder left out) around it
 * and on. Its points' lines include the Wonder's, which lights the wonder's tile alone.
 */
export const LAYOUT_WONDER = layout(ME, 20, [P.wonder, ...MIXED.filter((plan) => plan !== P.wonder).slice(0, 23)]);
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

/** The die's villages (#803) on the home's stock (level 20, 28 slots), seeds 1, 2 and 3: three versions of one stock. */
export const DIE_VILLAGES = [1, 2, 3].map((seed) => draftOf(randomLayout(stockOf(INVENTORY, LAYOUT_GROWING.tiles), slotsFor(LAYOUT_GROWING.level), seed, STILL).tiles));

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
/** Where the outer tile may move: a legal cell of its plan in the village without it, not its own. */
export const MOVED_SPOT = legalSpots(
  LAYOUT_GROWING.tiles.filter((t) => t.id !== OUTER_TILE.id),
  OUTER_TILE.plan,
).find((s) => s.x !== OUTER_TILE.x || s.y !== OUTER_TILE.y)!;
/** A tile that holds the growing village together: lifting it would split it. */
export const KEY_TILE = LAYOUT_GROWING.tiles.find((t) => !isStarter(t) && !canLift(LAYOUT_GROWING.tiles, t.id))!;

/** A scene's data without its callbacks. */
type Data<P> = { [K in keyof P as K extends `on${string}` ? never : K]: P[K] };

/** One fixture per state of the v2 village (`Scenes/Village v2/Layout`). */
export const VILLAGE_LAYOUT = {
  start: { village: LAYOUT_START, inventory: INVENTORY_EMPTY, chests: 1 },
  growing: { village: LAYOUT_GROWING, inventory: INVENTORY, chests: 2 },
  editing: { village: LAYOUT_GROWING, inventory: INVENTORY, chests: 2, initialEditing: true },
  holding: { village: LAYOUT_GROWING, inventory: INVENTORY, initialEditing: true, initialHand: { plan: P.road } },
  placing: { village: LAYOUT_GROWING, inventory: INVENTORY, initialEditing: true, initialHand: { plan: P.road }, initialPending: legalSpots(LAYOUT_GROWING.tiles, P.road)[0]! },
  lifted: { village: LAYOUT_GROWING, inventory: INVENTORY, initialEditing: true, initialHand: { lift: OUTER_TILE.id } },
  moved: { village: LAYOUT_GROWING, inventory: INVENTORY, initialEditing: true, initialHand: { lift: OUTER_TILE.id }, initialPending: MOVED_SPOT },
  changed: { village: LAYOUT_GROWING, inventory: INVENTORY, initialEditing: true, initialDraft: DRAFT_VALID },
  reset: { village: LAYOUT_GROWING, inventory: INVENTORY, initialEditing: true, initialDraft: [{ ...STARTER }] },
  full: { village: LAYOUT_FULL, inventory: INVENTORY, initialEditing: true },
  leaving: { village: LAYOUT_GROWING, inventory: INVENTORY, initialEditing: true, initialDraft: DRAFT_VALID, initialLeaving: true },
  saving: { village: LAYOUT_GROWING, inventory: INVENTORY, initialEditing: true, initialDraft: DRAFT_VALID, saving: true },
  saved: { village: { ...LAYOUT_GROWING, tiles: DRAFT_VALID, score: fakeScore(DRAFT_VALID) }, inventory: { ...INVENTORY, [P.road]: 3, [P.forestCity]: 1, [P.roadBend]: 1 }, chests: 2, saved: { score: fakeScore(DRAFT_VALID), previous: LAYOUT_GROWING.score } },
  /** A save that lowered the score (#802): it counts down to it, a "−N" drops. */
  savedLower: { village: LAYOUT_GROWING, inventory: INVENTORY, chests: 2, saved: { score: LAYOUT_GROWING.score, previous: fakeScore(DRAFT_VALID) } },
  /** A save that left the score as it was (#802): nothing plays. */
  savedSame: { village: LAYOUT_GROWING, inventory: INVENTORY, chests: 2, saved: { score: LAYOUT_GROWING.score, previous: LAYOUT_GROWING.score } },
  refused: { village: LAYOUT_GROWING, inventory: INVENTORY, initialEditing: true, initialDraft: DRAFT_VALID, refusal: "The layout changed on another device: read it again. Nothing was saved." },
  emptyInventory: { village: LAYOUT_START, inventory: INVENTORY_EMPTY, initialEditing: true },
  loading: { status: { kind: "loading" } },
  guest: { status: { kind: "guest" } },
  error: { status: { kind: "error", message: "Village: the node did not answer" } },
  visit: { village: LAYOUT_RIVAL, mode: "visit" },
} satisfies Record<string, Data<VillageLayoutSceneProps>>;

/** The next UTC day after the mocks' clock: the day's chests and the shop reset then. */
export const TOMORROW = (Math.floor(MOCK_NOW / DAY) + 1) * DAY;

/** Today's two PvP chests (slots 1 and 2) and a Story chest, which takes no slot. */
export const CHESTS: readonly Chest[] = [
  { id: 41, rank: "epic", source: "pvp", label: "3 stars against Rook of Ashford", slot: 0 },
  { id: 40, rank: "rare", source: "pvp", label: "2 stars against Mira", slot: 1 },
  { id: 39, rank: "basic", source: "story", label: "The Old Road, level 2" },
];

const EPIC_DRAW = { rank: "epic", plans: [P.road, P.wonder, P.cityEdge], cobbles: null } as const;
const day = { resetsAt: TOMORROW, now: MOCK_NOW } as const;
/** The page alone, the modal closed (#784): what the slots say. */
const page = { initialModalOpen: false } as const;

/**
 * One fixture per state of the chests (`Scenes/Village v2/Chests`). With a chest ready the modal opens on arrival (#784): the
 * chest shaking (`waiting`), its draw on its way, its tiles (`epic`, `rare`, `basic`), the tile kept with Next chest or Done.
 * The states of the page alone (`initialModalOpen: false`) say the slots: free, won in the rank's colour, opened and grey.
 */
export const VILLAGE_CHESTS = {
  /** Arrival with 3 chests ready: the epic one shakes at the centre of the modal, "Tap to open". */
  waiting: { chests: CHESTS, pvpToday: 2, ...day },
  /** Its draw on its way (the VRF): it shakes on, "Opening…". */
  opening: { chests: CHESTS, pvpToday: 2, ...day, opening: 41 },
  /** The lid burst: keep one of 3 tiles, each with its rarity and how many are held. */
  epic: { chests: CHESTS, pvpToday: 2, ...day, opened: { chestId: 41, draw: EPIC_DRAW }, owned: ownedOf(LAYOUT_GROWING, INVENTORY) },
  epicChosen: { chests: CHESTS, pvpToday: 2, ...day, opened: { chestId: 41, draw: EPIC_DRAW }, owned: ownedOf(LAYOUT_GROWING, INVENTORY), initialChoice: 1 },
  rare: { chests: CHESTS.slice(1), pvpToday: 2, pvpOpened: [0], ...day, opened: { chestId: 40, draw: { rank: "rare", plans: [P.roadCross, P.stopRoads], cobbles: null } }, owned: ownedOf(LAYOUT_GROWING, INVENTORY) },
  basic: { chests: CHESTS.slice(2), pvpToday: 2, pvpOpened: [0, 1], ...day, opened: { chestId: 39, draw: { rank: "basic", plans: [P.forestCity], cobbles: null } }, owned: ownedOf(LAYOUT_GROWING, INVENTORY) },
  cobbles: { chests: CHESTS, pvpToday: 2, ...day, opened: { chestId: 41, draw: { ...EPIC_DRAW, cobbles: 50 } }, owned: ownedOf(LAYOUT_GROWING, INVENTORY) },
  taking: { chests: CHESTS.slice(1), pvpToday: 2, pvpOpened: [0], ...day, opened: { chestId: 40, draw: { rank: "rare", plans: [P.roadCross, P.stopRoads], cobbles: null } }, initialChoice: 1, busy: true },
  /** The tile kept, two chests still waiting: Next chest, or Later. */
  taken: { chests: CHESTS.slice(1), pvpToday: 2, pvpOpened: [0], ...day, taken: { plan: P.wonder, cobbles: 50 } },
  /** The last chest's tile kept: Done, Edit layout. */
  takenLast: { chests: [], pvpToday: 2, pvpOpened: [0, 1], ...day, taken: { plan: P.forestCity, cobbles: null } },
  /** A Story chest, which takes no slot, through the same modal after the PvP ones. */
  story: { chests: CHESTS.slice(2), pvpToday: 2, pvpOpened: [0, 1], ...day },
  /** The chain refused: what happened, in the modal, until dismissed. */
  refused: { chests: CHESTS, pvpToday: 2, ...day, refusal: "This chest was opened already. Nothing was taken." },
  /** The page, the modal closed: slot 1 opened (grey), slot 2 won (rare, a tap opens it), slot 3 free; "Open your chests". */
  slots: { ...page, chests: CHESTS.slice(1), pvpToday: 2, pvpOpened: [0], ...day },
  /** The rare chest drawn and the modal closed before its choice: no other slot opens until a tile is kept, as the page says. */
  openPending: { ...page, chests: CHESTS, pvpToday: 2, ...day, opened: { chestId: 40, draw: { rank: "rare", plans: [P.roadCross, P.stopRoads], cobbles: null } } },
  /** The modal closed with 3 chests ready: the two won slots in their ranks' colours. */
  closed: { ...page, chests: CHESTS, pvpToday: 2, ...day },
  /** The page after the last choice: the tile kept said, Edit layout. */
  kept: { ...page, chests: [], pvpToday: 2, pvpOpened: [0, 1], ...day, taken: { plan: P.wonder, cobbles: 50 } },
  /** The day's 3 slots free: their outlines alone; a Story chest waits. */
  free: { ...page, chests: CHESTS.slice(2), pvpToday: 0, ...day },
  /** Two slots won, the read giving no ranks: each won slot shows a chest of no rank. */
  noRanks: { ...page, chests: CHESTS.map(({ slot: _, ...c }) => c), pvpToday: 2, ...day },
  /** Today's 3 slots are won and opened: the countdown takes the hero's centre, the slots under it. */
  capped: { ...page, chests: CHESTS.slice(2), pvpToday: 3, pvpOpened: [0, 1, 2], ...day },
  lastMinute: { ...page, chests: CHESTS.slice(2), pvpToday: 3, pvpOpened: [0, 1, 2], resetsAt: TOMORROW, now: TOMORROW - 42 },
  ready: { ...page, chests: CHESTS.slice(2), pvpToday: 0, ready: true, resetsAt: TOMORROW + DAY, now: TOMORROW + 3 },
  empty: { chests: [], pvpToday: 0, ...day },
  loading: { status: { kind: "loading" } },
  guest: { status: { kind: "guest" } },
} satisfies Record<string, Data<VillageChestsSceneProps>>;

/** The shop's prices by rarity (a proposal, #737 decides): round values, the mythic four times the common. */
export const SHOP_PRICE: Readonly<Record<Rarity, number>> = { common: 20, uncommon: 40, mythic: 80 };

const offer = (plan: number, bought = false): ShopOffer => ({ plan, rarity: rarityOf(plan), price: SHOP_PRICE[rarityOf(plan)], bought });

/** Today's offers: one common, one uncommon, one mythic. */
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
/** The home village's points (#758): its line of the most points, lit in the stories. */
export const HOME_POINTS = layoutPoints(LAYOUT_GROWING.tiles);
/** A tile of the second line's structure that can be lifted: under the bubble, the structure stays lit whole. */
const LIT_TILE = LAYOUT_GROWING.tiles.find((t) => HOME_POINTS.lines[1]!.areas.some((a) => a.x === t.x && a.y === t.y) && canLift(LAYOUT_GROWING.tiles, t.id))!;

/** The Wonder village's points (#792): its Wonder's line, lit in the stories. */
export const WONDER_POINTS = layoutPoints(LAYOUT_WONDER.tiles);
const WONDER_LINE = WONDER_POINTS.lines.find((l) => l.category === CategoryType.Wonder)!;

/** A slot of the saved layouts (#804): open with `tiles` (null: empty), or locked (`open` false). */
const slot = (index: number, tiles: readonly BoardTile[] | null, open = true, fits = true): LayoutSlot => ({
  slot: index,
  open,
  price: [0, 100, 250][index]!,
  tiles,
  score: tiles ? fakeScore(tiles) : 0,
  fits,
});
/** The die's first village (#803): kept in slot 2, a project beside the village. */
const DIE_SLOT = DIE_VILLAGES[0]!;
/** One slot (the free one, the village's), the next two locked: 640 Cobbles held. */
const SLOTS_ONE = { active: 0, slots: [slot(0, LAYOUT_GROWING.tiles), slot(1, null, false), slot(2, null, false)], cobbles: 640 } satisfies LayoutSlotsProps;
/** Three slots: the village in slot 1, the die's village in slot 2, a Wonder village in slot 3. */
const SLOTS_THREE = { active: 0, slots: [slot(0, LAYOUT_GROWING.tiles), slot(1, DIE_SLOT), slot(2, LAYOUT_WONDER.tiles)], cobbles: 290 } satisfies LayoutSlotsProps;

/** One fixture per state of the saved layouts' strip (#804), in the home's edit mode. */
export const LAYOUT_SLOTS = {
  one: SLOTS_ONE,
  three: SLOTS_THREE,
  /** A locked slot picked: its price, Buy. */
  locked: { ...SLOTS_ONE, initialSelected: 1 },
  /** Buy asked first: the price and the Cobbles held. */
  buy: { ...SLOTS_ONE, initialSelected: 1, initialAsk: "buy" },
  /** The purchase on its way. */
  buying: { ...SLOTS_ONE, initialSelected: 1, busy: { kind: "buy", slot: 1 } },
  /** Bought: slot 2 open and empty, the draft can be saved there. */
  bought: { ...SLOTS_ONE, slots: [slot(0, LAYOUT_GROWING.tiles), slot(1, null), slot(2, null, false)], cobbles: 540, initialSelected: 1 },
  /** Not enough Cobbles for slot 3. */
  short: { ...SLOTS_ONE, cobbles: 40, initialSelected: 2 },
  /** A saved slot picked: Load, Save here, Make active. */
  saved: { ...SLOTS_THREE, initialSelected: 1 },
  /** Load over changes kept nowhere: asked first. */
  load: { ...SLOTS_THREE, initialSelected: 1, initialAsk: "load" },
  /** Make active: asked first (attackers face it). */
  activate: { ...SLOTS_THREE, initialSelected: 1, initialAsk: "activate" },
  /** Slot 2 made active: the village is the die's. */
  activated: { ...SLOTS_THREE, active: 1, initialSelected: 1 },
  /** A saved layout that no longer fits (open point 4): it needs tiles first, never made active. */
  needsTiles: { ...SLOTS_THREE, slots: [slot(0, LAYOUT_GROWING.tiles), slot(1, DIE_SLOT), slot(2, LAYOUT_WONDER.tiles, true, false)], initialSelected: 2 },
  /** A slot write refused: what happened, above the slots. */
  refused: { ...SLOTS_THREE, initialSelected: 1, error: "The price changed: check it and buy again." },
} satisfies Record<string, LayoutSlotsProps>;

/** One fixture per state of the home (`Scenes/Home`): the village in view, its chips, and edit mode. */
export const HOME_VILLAGE = {
  view: home,
  /** A Challenge game running: the Resume chip. */
  resume: { ...home, activeGame: GAME_PLAYING },
  /** `spawn_paused`: the notice beside the Resume chip. */
  paused: { ...home, activeGame: GAME_PLAYING, spawnPaused: true },
  /** A new player: the starter village (level 1), no PvP played: the League control unranked, Wood with 0 crowns (#755, #829). */
  start: { village: LAYOUT_START, inventory: INVENTORY_EMPTY, league: null, now: MOCK_NOW },
  /** The village shielded after a defence (#806): the shield's mirrored plate under the League control (#829), 07h42m left. */
  shielded: { ...home, shieldEndsAt: MOCK_NOW + 7 * HOUR + 42 * 60 },
  /** Under an hour left: 00h42m. */
  shieldUnderAnHour: { ...home, shieldEndsAt: MOCK_NOW + 42 * 60 - 20 },
  /** The shield's last minute: 00h01m, never 00h00m while it is up. */
  shieldLastMinute: { ...home, shieldEndsAt: MOCK_NOW + 25 },
  /** The widest left column (#829): a five-digit crown count, shielded for 8 hours. */
  leagueStress: { ...home, league: { crowns: 12_345 }, shieldEndsAt: MOCK_NOW + 8 * HOUR },
  /** A new player read by the chain: no crown and no attack yet, the League control's Unranked crest (#917). */
  unranked: { village: LAYOUT_START, inventory: INVENTORY_EMPTY, league: { crowns: 0, attacks: 0 }, now: MOCK_NOW },
  /** Not founded yet: the starter alone, Found in Edit's place. */
  unfounded: { village: { ...LAYOUT_START, tiles: [{ ...STARTER }], score: 0 }, founded: false, league: null, now: MOCK_NOW },
  /** No wallet: a starter village to look at, nothing to edit (Connect is the header's). */
  guest: { village: LAYOUT_START, guest: true, league: null, now: MOCK_NOW },
  /** The village on its way: the overlays over the sky. */
  loading: { now: MOCK_NOW },
  /** The village's read failed: Retry. */
  error: { now: MOCK_NOW, error: { message: "Village: the node did not answer" } },
  /** The save landed, back in view (#802): the village score's total counts up to the new score, green, a "+N" rising, the house popping. */
  saved: { ...home, village: { ...LAYOUT_GROWING, tiles: DRAFT_VALID, score: fakeScore(DRAFT_VALID) }, saved: { score: fakeScore(DRAFT_VALID), previous: LAYOUT_GROWING.score } },
  /** A save that lowered the score: the total counts down, a "−N" dropping. */
  savedLower: { ...home, saved: { score: LAYOUT_GROWING.score, previous: fakeScore(DRAFT_VALID) } },
  /** A save that left the score as it was: nothing plays. */
  savedSame: { ...home, saved: { score: LAYOUT_GROWING.score, previous: LAYOUT_GROWING.score } },
  /** The save landed with the village score unfolded (#831): the total counts up, the kinds' sums under it are the new layout's. */
  scoreOpenSaved: { ...home, village: { ...LAYOUT_GROWING, tiles: DRAFT_VALID, score: fakeScore(DRAFT_VALID) }, saved: { score: fakeScore(DRAFT_VALID), previous: LAYOUT_GROWING.score }, initialScoreOpen: true },
  /** The village score unfolded (#831): the total, and under it the four kinds' sums, the most points first. */
  scoreOpen: { ...home, initialScoreOpen: true },
  /** Unfolded on the starter village: a kind with no structure shows 0. */
  scoreKindZero: { village: LAYOUT_START, inventory: INVENTORY_EMPTY, league: null, now: MOCK_NOW, initialScoreOpen: true },
  /** Unfolded on a village with a closed Wonder (#792): every kind scores. */
  scoreWonder: { ...home, village: LAYOUT_WONDER, initialScoreOpen: true },
  /** Edit mode: the editor's bar (Reset all beside the slots), the inventory and Save, in the same scene. */
  editing: { ...home, editing: true },
  /** Edit mode's points on a village with a closed Wonder (#792), its line lit: the wonder's tile alone, not the 8 around it. */
  editingPointsWonder: { ...home, village: LAYOUT_WONDER, editing: true, initialPointsOpen: true, initialLit: WONDER_LINE.key },
  /** Edit mode's points unfolded above the inventory (#758), a line lit; they follow the draft live. */
  editingPoints: { ...home, editing: true, initialPointsOpen: true, initialLit: HOME_POINTS.lines[1]!.key },
  /** A tile of the lit structure lifted: under the bubble, it stays lit with the rest of its structure. */
  editingPointsLifted: { ...home, editing: true, initialPointsOpen: true, initialLit: HOME_POINTS.lines[1]!.key, initialHand: { lift: LIT_TILE.id } },
  /** A road in hand: its legal cells lit. */
  holding: { ...home, editing: true, initialHand: { plan: P.road } },
  /** The road placed on a lit cell: the bubble by it (Rotate, Back to the inventory), the score with it. */
  placing: { ...home, editing: true, initialHand: { plan: P.road }, initialPending: legalSpots(LAYOUT_GROWING.tiles, P.road)[0]! },
  /** An outer tile lifted: the bubble by it with Cancel, its legal cells lit. */
  lifted: { ...home, editing: true, initialHand: { lift: OUTER_TILE.id } },
  /** The lifted tile moved to another lit cell: Cancel puts it back. */
  moved: { ...home, editing: true, initialHand: { lift: OUTER_TILE.id }, initialPending: MOVED_SPOT },
  /** Three tiles more than saved: the live score against the saved one. */
  changed: { ...home, editing: true, initialDraft: DRAFT_VALID },
  /** Back with unsaved changes: asked first. */
  leaving: { ...home, editing: true, initialDraft: DRAFT_VALID, initialLeaving: true },
  /** The chain refused the save: what happened, the draft kept. */
  refused: { ...home, editing: true, initialDraft: DRAFT_VALID, refusal: "The layout changed on another device: read it again. Nothing was saved." },
  /** The die pressed (#803): busy, its spin, the hint saying it builds; the draft as it was. */
  dieBusy: { ...home, editing: true, randomizer: PENDING_RANDOMIZER, initialRolling: true },
  /** The die past a second: "Still building…" with a cancel under it. */
  dieSlow: { ...home, editing: true, randomizer: PENDING_RANDOMIZER, initialRolling: true, slowRollMs: 0 },
  /** The die's worker failed: its message above the hint, the draft kept, never a build on the main thread. */
  dieFailed: { ...home, editing: true, randomizer: FAILING_RANDOMIZER, initialRolling: true },
  /** The die on a new player's small stock (level 1, 9 slots, 8 tiles): every tile in a 3 x 3. */
  dieSmall: { ...home, village: LAYOUT_START, inventory: INVENTORY_EMPTY, editing: true, randomizer: mainThreadRandomizer(), randomSeed: seedsOf(1, 2, 3), initialRolling: true },
  /** The die on a large stock (level 20, 28 slots, 36 tiles): every slot used, near a 6 x 5. */
  dieLarge: { ...home, editing: true, randomizer: mainThreadRandomizer(), randomSeed: seedsOf(7, 8, 9), initialRolling: true },
  /** The saved layouts (#804): one slot, the next two locked with their prices. */
  slotsOne: { ...home, editing: true, layoutSlots: LAYOUT_SLOTS.one },
  /** Three slots, the die's village in slot 2 picked: Load, Save here, Make active. */
  slotsThree: { ...home, editing: true, layoutSlots: LAYOUT_SLOTS.saved },
  /** A locked slot picked: Buy at its price. */
  slotsLocked: { ...home, editing: true, layoutSlots: LAYOUT_SLOTS.locked },
  /** Buy asked first. */
  slotsBuy: { ...home, editing: true, layoutSlots: LAYOUT_SLOTS.buy },
  /** The purchase on its way. */
  slotsBuying: { ...home, editing: true, layoutSlots: LAYOUT_SLOTS.buying },
  /** Slot 2 bought: open and empty. */
  slotsBought: { ...home, editing: true, layoutSlots: LAYOUT_SLOTS.bought },
  /** Too few Cobbles for slot 3. */
  slotsShort: { ...home, editing: true, layoutSlots: LAYOUT_SLOTS.short },
  /** Load over changes kept nowhere: asked first. */
  slotsLoad: { ...home, editing: true, initialDraft: DRAFT_VALID, layoutSlots: LAYOUT_SLOTS.load },
  /** Make active: asked first. */
  slotsActivate: { ...home, editing: true, layoutSlots: LAYOUT_SLOTS.activate },
  /** Slot 2 active: the village is its layout. */
  slotsActivated: { ...home, village: { ...LAYOUT_GROWING, tiles: DIE_SLOT, score: fakeScore(DIE_SLOT) }, editing: true, layoutSlots: LAYOUT_SLOTS.activated },
  /** A saved layout that needs tiles first. */
  slotsNeedsTiles: { ...home, editing: true, layoutSlots: LAYOUT_SLOTS.needsTiles },
  /** A slot write refused. */
  slotsRefused: { ...home, editing: true, layoutSlots: LAYOUT_SLOTS.refused },
} satisfies Record<string, Data<HomeVillageSceneProps & { layoutSlots?: LayoutSlotsProps }>>;
