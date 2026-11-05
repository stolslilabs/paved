import type { ShopSceneProps } from "../components/scenes/shop-scene";
import { appRenders } from "./assets";
import { activeOn, ownedPlans } from "./cobbles";
import { COBBLES, THEME_SHOP } from "./scenes";
import { VILLAGE_SHOP } from "./village-v2";

/** A scene's props without its callbacks: the stories give those (`fn()`). */
type Data<P> = { [K in keyof P as K extends `on${string}` ? never : K]: P[K] };

/** The Shop's tabs as the book draws them (SHOP-PAGE): the day's three, the packs, Forest's tiles; Forest is theme 1. */
const tiles = { ...VILLAGE_SHOP.today, cobbles: 640, renders: appRenders };
const packs = { ...COBBLES.packs, cobbles: { ...COBBLES.packs.cobbles, balance: 640 } };
const forest = { ...THEME_SHOP.forest, skins: { ...THEME_SHOP.forest.skins, balance: 640 } };
const base = { tab: "tiles", tiles, packs, themes: forest } as const;

/** One fixture per state of the Shop (`Scenes/Shop`), the book's balance of 640 Cobbles. */
export const SHOP = {
  /** The Tiles tab: today's three, their rarity, the tiles held, their prices; the time until tomorrow's. */
  tiles: base,
  /** A tile on its way: the others wait. */
  buying: { ...base, tiles: { ...tiles, buying: 1 } },
  /** The book's "Bought; it is in your inventory": the first tile bought, Bought in its price's place, held once more. */
  bought: { ...base, tiles: { ...VILLAGE_SHOP.oneBought, cobbles: 620, renders: appRenders } },
  /** Short of Cobbles: what each tile needs more, and Get Cobbles (to the Cobbles tab). */
  short: { ...base, tiles: { ...VILLAGE_SHOP.short, renders: appRenders } },
  /** The Cobbles tab: the four packs, none picked; Pay waits for one. */
  cobbles: { ...base, tab: "cobbles" },
  /** A pack picked (100 for $9): its price pressed, Pay confirms. */
  picked: { ...base, tab: "cobbles", packs: { ...packs, cobbles: { ...packs.cobbles, selected: 2 } } },
  /** The Themes tab: Forest's first tiles not owned yet, then the themes to come. */
  themes: { ...base, tab: "themes" },
  /** Forest's own view (All tiles): its 19 tiles, four owned, two in use. */
  forest: { ...base, tab: "themes", theme: "forest" },
  /** Forest's view with no Cobbles and nothing owned: every price off, Get Cobbles. */
  forestNoCobbles: { ...base, tab: "themes", theme: "forest", themes: { ...forest, skins: { ...forest.skins, balance: 0, owned: ownedPlans(), active: activeOn(1) } } },
  /** A guest: Connect, on each tab. */
  guest: { ...base, tiles: { status: { kind: "guest" } }, packs: { ...packs, connected: false, balance: null }, themes: { ...forest, skins: undefined, skinsStatus: { kind: "guest" } } },
  /** The reads on their way. */
  loading: { ...base, tiles: { status: { kind: "loading" } }, themes: { ...forest, skins: undefined, skinsStatus: { kind: "loading" } } },
} satisfies Record<string, Data<ShopSceneProps>>;
