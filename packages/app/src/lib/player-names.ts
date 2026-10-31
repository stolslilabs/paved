// A new player's name (#926): an adjective and a noun of Paved's world (its builders, roads, villages and seasons), in
// CamelCase, then two digits: "MossyMason27", "SwiftCarter04", "AmberReeve61". Letters and digits only, 3 to 19 characters (`PLAYER_NAME_MAX`),
// so it fits the plates and a short string on chain. The lists are written here, each word reviewed: nothing is fetched.
// A module of the connection's chunk (`data/mock/new-player.ts`), never of the menus' first load.

import { PLAYER_NAME_MAX } from "./name-limit";

/** The adjectives: at most 9 letters each; a draw past 19 characters (two 9-letter words) is drawn again. */
export const NAME_ADJECTIVES: readonly string[] = [
  "Agile", "Airy", "Amber", "Ancient", "Ardent", "Ashen", "Autumn", "Azure", "Balmy", "Bonny",
  "Blithe", "Bold", "Brave", "Breezy", "Bright", "Brisk", "Bronze", "Bubbly", "Burly", "Busy",
  "Calm", "Candid", "Canny", "Careful", "Chalky", "Charming", "Cheery", "Chilly", "Civil", "Clever",
  "Cloudy", "Coastal", "Cobalt", "Comely", "Copper", "Cordial", "Cosy", "Crafty", "Crimson", "Crisp",
  "Curious", "Dainty", "Dandy", "Dapper", "Daring", "Dawnlit", "Deft", "Devoted", "Dewy", "Diligent",
  "Distant", "Dreamy", "Dusky", "Dusty", "Eager", "Earnest", "Early", "Earthy", "Elated", "Emerald",
  "Endless", "Even", "Fabled", "Fair", "Faithful", "Fallow", "Fancy", "Fearless", "Feisty", "Fervent",
  "Fiery", "Fine", "Firm", "Fleet", "Floral", "Foggy", "Fond", "Frank", "Free", "Fresh",
  "Friendly", "Frosty", "Frugal", "Gallant", "Gentle", "Giddy", "Gilded", "Glad", "Gleaming", "Glowing",
  "Golden", "Graceful", "Grand", "Gusty", "Hale", "Handy", "Happy", "Hardy", "Hazel", "Hearty",
  "Helpful", "Heroic", "Hidden", "Highland", "Hilly", "Homely", "Honest", "Honeyed", "Hopeful", "Humble",
  "Hushed", "Icy", "Cerulean", "Inky", "Iron", "Ivory", "Jade", "Jasper", "Jaunty", "Jolly",
  "Jovial", "Joyful", "Keen", "Kind", "Kindly", "Leafy", "Lilac", "Limber", "Lively", "Lofty",
  "Loyal", "Lucky", "Lunar", "Lush", "Marble", "Mellow", "Merry", "Mighty", "Mild", "Minty",
  "Misty", "Modest", "Mossy", "Musical", "Nimble", "Noble", "Northern", "Oaken", "Olive", "Opal",
  "Patient", "Peaceful", "Pearly", "Pebbly", "Placid", "Plucky", "Polished", "Polite", "Proud", "Prudent",
  "Quaint", "Quick", "Quiet", "Radiant", "Rainy", "Rapid", "Ready", "Regal", "Restful", "Robust",
  "Rocky", "Rosy", "Royal", "Ruby", "Rugged", "Rustic", "Russet", "Saffron", "Sandy", "Sapphire",
  "Scarlet", "Serene", "Shady", "Sharp", "Shiny", "Silent", "Silken", "Silver", "Simple", "Sincere",
  "Sleepy", "Smart", "Snowy", "Snug", "Solar", "Solid", "Southern", "Sparkly", "Spring", "Spry",
  "Stalwart", "Starry", "Steady", "Stony", "Stout", "Sturdy", "Summer", "Sunlit", "Sunny", "Swift",
  "Tall", "Tawny", "Thrifty", "Tidy", "Timber", "Topaz", "Tranquil", "True", "Trusty", "Twilight",
  "Umber", "Upland", "Valiant", "Velvet", "Verdant", "Vernal", "Vivid", "Wakeful", "Warm", "Wary",
  "Watchful", "Western", "Wheaten", "Whimsical", "Wild", "Windy", "Winter", "Wise", "Witty", "Wooden",
  "Woolly", "Worthy", "Young", "Zealous", "Zesty", "Eastern", "Brindle", "Dappled", "Gleeful", "Mindful",
];

/** The nouns: at most 9 letters each. */
export const NAME_NOUNS: readonly string[] = [
  "Mason", "Carter", "Thatcher", "Reeve", "Smith", "Cooper", "Miller", "Tiler", "Paver", "Builder",
  "Joiner", "Carver", "Wright", "Weaver", "Potter", "Baker", "Brewer", "Tanner", "Chandler", "Fletcher",
  "Farrier", "Glazier", "Roofer", "Sawyer", "Turner", "Warden", "Ranger", "Shepherd", "Drover", "Herder",
  "Farmer", "Gardener", "Forager", "Fisher", "Trader", "Merchant", "Peddler", "Pilgrim", "Rover", "Wanderer",
  "Traveler", "Voyager", "Scout", "Surveyor", "Steward", "Warder", "Squire", "Knight", "Herald", "Bard",
  "Minstrel", "Scribe", "Hermit", "Abbot", "Friar", "Mayor", "Founder", "Settler", "Pioneer", "Nomad",
  "Courier", "Runner", "Rider", "Ferryman", "Boatman", "Miner", "Digger", "Cobbler", "Lamplight", "Tinker",
  "Road", "Lane", "Path", "Trail", "Track", "Bridge", "Arch", "Gate", "Wall", "Tower",
  "Bastion", "Spire", "Steeple", "Chapel", "Abbey", "Castle", "Manor", "Cottage", "Hamlet", "Village",
  "Borough", "Shire", "Market", "Square", "Fountain", "Well", "Mill", "Forge", "Kiln", "Barn",
  "Granary", "Orchard", "Meadow", "Field", "Pasture", "Hedge", "Grove", "Copse", "Thicket", "Glade",
  "Dell", "Vale", "Valley", "Hollow", "Ridge", "Hill", "Knoll", "Moor", "Heath", "Fen",
  "Brook", "Creek", "River", "Stream", "Ford", "Harbor", "Haven", "Wharf", "Pier", "Quay",
  "Lantern", "Beacon", "Hearth", "Chimney", "Rafter", "Beam", "Plank", "Shingle", "Cobble", "Pebble",
  "Stone", "Boulder", "Flint", "Slate", "Granite", "Quarry", "Tile", "Brick", "Mortar", "Trowel",
  "Chisel", "Hammer", "Anvil", "Plough", "Wagon", "Cart", "Wheel", "Saddle", "Solstice", "Equinox",
  "Harvest", "Frost", "Thaw", "Bloom", "Blossom", "Sprout", "Acorn", "Oak", "Birch", "Rowan",
  "Willow", "Maple", "Cedar", "Pine", "Fern", "Thistle", "Heather", "Bramble", "Briar", "Ivy",
  "Moss", "Lichen", "Reed", "Barley", "Wheat", "Rye", "Sheaf", "Clover", "Fox", "Badger",
  "Otter", "Hare", "Hedgehog", "Owl", "Wren", "Robin", "Finch", "Lark", "Sparrow", "Heron",
  "Merlin", "Falcon", "Hawk", "Raven", "Magpie", "Stag", "Hart", "Boar", "Lamb", "Goat",
  "Pony", "Hound", "Vole", "Stoat", "Ferret", "Squirrel", "Trout", "Salmon", "Pike", "Newt",
  "Toad", "Beetle", "Bee", "Moth", "Cricket", "Compass", "Banner", "Crest", "Crown", "Candle",
  "Ladle", "Bucket", "Barrel", "Basket", "Ladder", "Anchor", "Bell", "Drum", "Fiddle", "Flute",
  "Whistle", "Mapmaker", "Belfry", "Lyre", "Quill", "Sundial", "Vane", "Windmill", "Waymark", "Milestone",
];

/**
 * The pairs that read badly once joined: never drawn. The lists were chosen so that no join spells a rude word across the
 * two (the test checks every pair against its list); these are the phrases best left out.
 */
export const BLOCKED_NAME_PAIRS: ReadonlySet<string> = new Set([
  // Idioms that mock the player
  "ShadyTrader", "ShadyMerchant", "ShadyPeddler", "FreeRider", "IvoryTower",
]);

/** A name's shape: an adjective and a noun, each a capital and lower-case letters, then two digits; 3 to 19 characters. */
export const PLAYER_NAME = /^(?=.{3,19}$)[A-Z][a-z]+[A-Z][a-z]+\d{2}$/;

/** A number in [0, 1) from the device's cryptographic random (`crypto.getRandomValues`), as `Math.random` returns. */
export function cryptoRandom(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]! / 2 ** 32;
}

const pick = <T>(list: readonly T[], random: () => number): T => list[Math.floor(random() * list.length)]!;

/**
 * A plausible random name (#926): an adjective, a noun and two digits, a blocked pair or one past `PLAYER_NAME_MAX` drawn again. `random` returns [0, 1),
 * the device's cryptographic random by default; the tests seed it.
 */
export function playerName(random: () => number = cryptoRandom): string {
  for (;;) {
    const pair = pick(NAME_ADJECTIVES, random) + pick(NAME_NOUNS, random);
    if (!BLOCKED_NAME_PAIRS.has(pair) && pair.length + 2 <= PLAYER_NAME_MAX) return pair + String(Math.floor(random() * 100)).padStart(2, "0");
  }
}
