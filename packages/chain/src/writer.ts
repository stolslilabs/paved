import { shortString } from "starknet";
import { FAUCET_USDC_AMOUNT, FAUCET_ABI, type Codecs, type ContractName } from "./abis";
import { AbiCodec as Codec, sameAddress, type AbiCodec, type DecodedEvent, type Encodable, type RawEvent } from "./codec";
import type { CobbleClaim } from "./cobbles";
import type { Deployment } from "./deployment";
import { receiptEvents } from "./events";
import { SKIN_PLANS, isSkinPlan, type SkinChange, type SkinViews } from "./skins";
import { AVATAR_LISTED, AVATAR_MAX_ID, AVATAR_MAX_PARTS, type AvatarViews } from "./avatar";
import { gameContract, type DrawView, type DrawViews, type GameKey } from "./views";
import { withVrfRequest } from "./vrf";
import { buyParcelCall, foundVillageCall, type VillageCell, type VillageViews } from "./village";
import { claimRewardCall, openRewardCalls, type RewardClaim } from "./rewards";
import { nextCalls, searchCalls, type PvpViews } from "./matchmaker";
import { playCall, playCalls, startAttackCalls, surrenderCall, type AttackPlay } from "./arena";

export interface Call {
  contractAddress: string;
  entrypoint: string;
  calldata: string[];
}

/** What the writer needs from a starknet.js `Account` (or a session wallet with the same shape). */
export interface WriteAccount {
  address: string;
  execute(calls: Call[], details?: { tip?: bigint }): Promise<{ transaction_hash: string }>;
}

export interface ReceiptProvider {
  waitForTransaction(hash: string, options?: { retryInterval?: number }): Promise<unknown>;
}

/** How often the writer asks the node for a receipt it waits for (starknet.js's default is 5 s). */
export const RECEIPT_POLL_MS = 250;

export interface WriteResult {
  transactionHash: string;
  /** Events of the receipt from the contract written to, decoded. */
  events: DecodedEvent[];
}

export interface BuildMove {
  orientation: number;
  x: number;
  y: number;
}

/**
 * A write that the chain refused; the message is the revert reason. With a `transactionHash` the write was sent:
 * `reverted` says the receipt is a known revert; otherwise its receipt could not be read (timeout, RPC drop).
 */
export class WriteError extends Error {
  constructor(message: string, readonly transactionHash?: string, readonly reverted = false) {
    super(message);
    this.name = "WriteError";
  }
}

/** What the player reads when they decline a write in their wallet's prompt. */
export const WALLET_REJECTED_TEXT = "You declined in your wallet: nothing was sent.";

/**
 * The player declined the wallet's prompt (or closed it): nothing was sent, so there is no hash and no outcome to wait for.
 * A refusal, never an unknown outcome. Since P-65 every paid write prompts (a paid entry, a pack, a Vault deposit).
 */
export class WalletRejectedError extends WriteError {
  constructor(readonly detail: string) {
    super(WALLET_REJECTED_TEXT);
    this.name = "WalletRejectedError";
  }
}

/**
 * Whether `account.execute`'s error is the player's refusal, by the documented cancel shapes only:
 * `@cartridge/controller` 0.13.16 rejects a cancelled prompt with its reply's `error`, which is `undefined` when absent, or
 * carries the code `CANCELED`; a wallet's `USER_REFUSED_OP` (code 113); a "User rejected" message. Anything else, `null` or a
 * node's message such as "Transaction rejected" included, is not a decline: a plain `WriteError`. Either way nothing was sent.
 */
export function isWalletRejection(error: unknown): boolean {
  if (error === undefined) return true;
  if (error === null || typeof error !== "object") return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (code === "CANCELED" || code === 113 || code === "USER_REFUSED_OP") return true;
  return typeof message === "string" && /USER_REFUSED_OP|\bUser rejected\b/i.test(message);
}

/**
 * `account.execute` failed in a way that does not show the transaction was refused before sending: a timeout, a lost
 * connection to the wallet or the node, an answer that could not be read. The node may have received it with its hash
 * never returned, so the outcome is unknown, without a hash to read a receipt by. A paid write keeps its hold until the
 * player checks (the purchase page's `heldSend`). The message is the wallet's or the node's.
 */
export class SendUnconfirmedError extends WriteError {
  constructor(readonly detail: string) {
    super(detail);
    this.name = "SendUnconfirmedError";
  }
}

/**
 * The JSON-RPC codes a node answers when it refuses a transaction before accepting it (Starknet RPC 0.8): a contract or
 * class not found (20, 28), a contract or execution error at estimation or simulation (40, 41), an invalid nonce (52),
 * insufficient resources or balance (53, 54), a failed validation (55), and the declare and version refusals (56 to 58,
 * 60 to 62). Not 59 (`DUPLICATE_TX`: an earlier copy was accepted) nor 63 (`UNEXPECTED_ERROR`).
 */
const REFUSED_CODES = new Set([20, 28, 40, 41, 52, 53, 54, 55, 56, 57, 58, 60, 61, 62]);

/** The messages of a refusal before sending: a revert found by simulation, a failed fee estimation or validation. */
const REFUSED_TEXT = /revert|execution (error|failed)|validation fail|validate|estimat|insufficient|invalid transaction nonce|failure reason/i;

/**
 * Whether `account.execute`'s error shows that nothing was sent: the node's refusal (`REFUSED_CODES`, in `code` or in the
 * starknet.js message "RPC: <method> ... <code>: <text>"), or a refusal's text (`REFUSED_TEXT`). A wallet's decline is told
 * apart before (`isWalletRejection`). Anything else (a timeout, a lost connection, `null`) may have been sent.
 */
export function refusedBeforeSending(error: unknown): boolean {
  if (error === null || typeof error !== "object") return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (typeof code === "number" && REFUSED_CODES.has(code)) return true;
  if (typeof message !== "string") return false;
  const rpc = /\b(\d{2}): /.exec(message);
  if (rpc && REFUSED_CODES.has(Number(rpc[1]))) return true;
  return REFUSED_TEXT.test(message);
}

/** True when a revert reason names `reason`: as text, or as the hex of the short string the node may return. */
export function revertNames(revert: string, reason: string): boolean {
  return revert.includes(reason) || revert.toLowerCase().includes(shortString.encodeShortString(reason).toLowerCase());
}

// The Faucet's reasons, and the old MockUSDC's, which stays deployed on Sepolia until the fresh deployment (P-53).
const OVER_CALL_CAPS = ["Faucet: over the call cap", "MockUSDC: over the call cap"];
const OVER_ADDRESS_CAPS = ["Faucet: over the address cap", "MockUSDC: over the address cap"];

/**
 * The faucet's contract refused a mint (the Faucet's caps, D-16): `call` is the cap of one call, `address` the total an
 * address may receive from the faucet. Nothing moved; the message is for the player.
 */
export class FaucetCapError extends WriteError {
  constructor(readonly cap: "call" | "address", transactionHash?: string) {
    super(
      cap === "address"
        ? "The test USDC faucet is empty for this account: it has received everything the faucet gives to one address."
        : "The test USDC faucet refused this amount: it is over what one request may mint.",
      transactionHash,
      transactionHash !== undefined,
    );
    this.name = "FaucetCapError";
  }
}

const GAME_EXPIRED = "Game: expired";
/** What the player reads when a game's 24 hours are over (the card and the typed error). */
export const GAME_EXPIRED_TEXT = "This game has expired: its 24 hours are over. Surrender to close it: its score is recorded, but an expired game earns no reward.";

/**
 * The game's 24 hours are over (S1): `build` and `discard` are refused, `surrender` is not. Raised before any call is
 * sent when the game view says so, and when a `'Game: expired'` revert comes back after a race. A move that reverts
 * moved nothing.
 */
export class GameExpiredError extends WriteError {
  constructor(transactionHash?: string) {
    super(GAME_EXPIRED_TEXT, transactionHash, transactionHash !== undefined);
    this.name = "GameExpiredError";
  }
}

const INVALID_POSITION = "Challenge: invalid position";
/** What the player reads when a build names a square that cannot be on the board (CORE #391). */
export const INVALID_POSITION_TEXT = "This square is outside the board: choose a lit slot next to your tiles.";

/**
 * `Challenge.build` refused the position before any read (CORE #391): `x` or `y` is 0 or `u32::MAX`, a square no board
 * reaches. The client sends only slots next to its tiles, so this means a client bug; nothing moved.
 */
export class InvalidPositionError extends WriteError {
  constructor(transactionHash?: string) {
    super(INVALID_POSITION_TEXT, transactionHash, transactionHash !== undefined);
    this.name = "InvalidPositionError";
  }
}

/** `'Game: expired'` and `'Challenge: invalid position'` as their typed errors, from the fee estimation or the receipt; any other error unchanged. */
function expiredRevert(error: unknown): never {
  if (error instanceof WriteError && revertNames(error.message, GAME_EXPIRED)) throw new GameExpiredError(error.transactionHash);
  if (error instanceof WriteError && revertNames(error.message, INVALID_POSITION)) throw new InvalidPositionError(error.transactionHash);
  throw error;
}

/** A known revert of `Faucet.mint` as its clear state; any other error unchanged. */
function faucetRevert(error: unknown): unknown {
  if (!(error instanceof WriteError)) return error;
  if (OVER_ADDRESS_CAPS.some((reason) => revertNames(error.message, reason))) return new FaucetCapError("address", error.transactionHash);
  if (OVER_CALL_CAPS.some((reason) => revertNames(error.message, reason))) return new FaucetCapError("call", error.transactionHash);
  return error;
}

/** Why `Setup` refused a Cobbles claim, by its revert (`setup.cairo`, `errors`). */
export type ClaimRefusal = "no-cobbles" | "not-live" | "not-completed" | "claimed" | "no-live-quest" | "credit-claimed";

/** Each refusal's revert reason; `credit claimed` first, so it is never read as `claimed`. */
const CLAIM_REVERTS: Array<[string, ClaimRefusal]> = [
  ["Setup: credit claimed", "credit-claimed"],
  ["Setup: no live quest", "no-live-quest"],
  ["Setup: no cobbles", "no-cobbles"],
  ["Setup: not live", "not-live"],
  ["Setup: not completed", "not-completed"],
  ["Setup: claimed", "claimed"],
];

/** What the player reads for each refusal. */
export const CLAIM_REFUSAL_TEXT: Record<ClaimRefusal, string> = {
  "no-cobbles": "This quest or achievement gives no Cobbles.",
  "not-live": "This quest was not live in that period: there is nothing to claim for it.",
  "not-completed": "Not completed yet: the chain has not counted every game it needs.",
  claimed: "Already claimed.",
  "no-live-quest": "No quest with Cobbles was live in that period: there is no free game to claim.",
  "credit-claimed": "This free game is already claimed.",
};

/**
 * `Setup` refused a claim (`claim_quest`, `claim_achievement`, `claim_daily_credit`, `claim_weekly_credit`): nothing was
 * credited. In a multicall (`PavedWriter.claim`) one refusal reverts every claim of the transaction. `claimed` and
 * `credit-claimed` mean an earlier claim landed: the page reads the ledger again.
 */
export class ClaimRefusedError extends WriteError {
  constructor(readonly reason: ClaimRefusal, transactionHash?: string) {
    super(CLAIM_REFUSAL_TEXT[reason], transactionHash, transactionHash !== undefined);
    this.name = "ClaimRefusedError";
  }
}

/** A known revert of a claim as its `ClaimRefusedError`; any other error unchanged. */
function claimRevert(error: unknown): never {
  if (error instanceof WriteError) {
    const known = CLAIM_REVERTS.find(([reason]) => revertNames(error.message, reason));
    if (known) throw new ClaimRefusedError(known[1], error.transactionHash);
  }
  throw error;
}

/** Why `Setup` refused a skin's purchase or a `set_skins` batch, by its revert (`setup.cairo`, `errors`). */
export type SkinRefusal = "owned" | "not-for-sale" | "not-enough-cobbles" | "not-owned" | "invalid-skin" | "tier-too-low";

/** Each refusal's revert reason; `skin not owned` before `skin owned`, so the one is never read as the other. */
const SKIN_REVERTS: Array<[string, SkinRefusal]> = [
  ["Setup: skin not owned", "not-owned"],
  ["Setup: skin owned", "owned"],
  ["Setup: skin not for sale", "not-for-sale"],
  ["Setup: not enough cobbles", "not-enough-cobbles"],
  ["Setup: invalid skin", "invalid-skin"],
  ["Setup: tier too low", "tier-too-low"],
];

/** What the player reads for each refusal. */
export const SKIN_REFUSAL_TEXT: Record<SkinRefusal, string> = {
  owned: "You already own this skin.",
  "not-for-sale": "This skin is not for sale.",
  "not-enough-cobbles": "Not enough Cobbles for this skin: earn them from quests and achievements, or buy a pack.",
  "not-owned": "A skin in this change is not yours: buy it before switching it on. Nothing was saved.",
  "invalid-skin": "This tile has no skin.",
  "tier-too-low": "This skin is reserved to a higher tier of its tile: take more copies of it from village rewards.",
};

/**
 * `Setup` refused `buy_skin` or `set_skins`: no Cobbles were spent and nothing changed (`set_skins` reverts the whole
 * batch). `owned` means an earlier purchase landed: the page reads the skins again.
 */
export class SkinRefusedError extends WriteError {
  constructor(readonly reason: SkinRefusal, transactionHash?: string) {
    super(SKIN_REFUSAL_TEXT[reason], transactionHash, transactionHash !== undefined);
    this.name = "SkinRefusedError";
  }
}

/** A skin's purchase as the player confirmed it: the plan, the theme, and the price in Cobbles the card showed. */
export interface BuySkinRequest {
  theme: number;
  plan: number;
  /** The price the card showed, in Cobbles (`skin_price`). Another price at send sends nothing. */
  confirmedPrice: number;
}

/** The skin's price at send is not the one the card showed (the owner changed it, or took it off sale): nothing was sent. */
export class SkinPriceChangedError extends WriteError {
  constructor(readonly confirmed: number, readonly current: number) {
    super(current === 0 ? "This skin is not for sale any more. Nothing was sent." : "This skin's price changed: check the new price and buy again. Nothing was sent.");
    this.name = "SkinPriceChangedError";
  }
}

/** A known revert of a skin write as its `SkinRefusedError`; any other error unchanged. */
function skinRevert(error: unknown): never {
  if (error instanceof WriteError) {
    const known = SKIN_REVERTS.find(([reason]) => revertNames(error.message, reason));
    if (known) throw new SkinRefusedError(known[1], error.transactionHash);
  }
  throw error;
}

/** Why `Avatar` refused an item's purchase or a `set_avatar`, by its revert (`avatar.cairo`, `errors`; `setup.cairo` for the Cobbles). */
export type AvatarRefusal = "owned" | "not-for-sale" | "sold-out" | "sale-ended" | "price-changed" | "not-enough-cobbles" | "not-owned" | "invalid-look";

/** Each refusal's revert reason; `item not owned` before `item owned`, so the one is never read as the other. */
const AVATAR_REVERTS: Array<[string, AvatarRefusal]> = [
  ["Avatar: item not owned", "not-owned"],
  ["Avatar: item owned", "owned"],
  ["Avatar: item not for sale", "not-for-sale"],
  ["Avatar: item sold out", "sold-out"],
  ["Avatar: sale ended", "sale-ended"],
  ["Avatar: price above max", "price-changed"],
  ["Setup: not enough cobbles", "not-enough-cobbles"],
  ["Avatar: invalid look", "invalid-look"],
];

/** What the player reads for each refusal. */
export const AVATAR_REFUSAL_TEXT: Record<AvatarRefusal, string> = {
  owned: "You already own this item.",
  "not-for-sale": "This item is not for sale.",
  "sold-out": "This item is sold out.",
  "sale-ended": "This item's sale has ended.",
  "price-changed": "This item's price went up before your purchase landed: no Cobbles were spent. Check the new price and buy again.",
  "not-enough-cobbles": "Not enough Cobbles for this item: earn them from quests and achievements, or buy a pack.",
  "not-owned": "A part of this avatar is not yours: buy it first. Nothing was saved.",
  "invalid-look": "This avatar is not in the format the chain reads. Nothing was saved.",
};

/** `Avatar` refused `buy_avatar_item` or `set_avatar`: no Cobbles were spent and nothing changed. */
export class AvatarRefusedError extends WriteError {
  constructor(readonly reason: AvatarRefusal, transactionHash?: string) {
    super(AVATAR_REFUSAL_TEXT[reason], transactionHash, transactionHash !== undefined);
    this.name = "AvatarRefusedError";
  }
}

/** The item's price at send is not the one the creator showed (the owner changed it, or took it off sale): nothing was sent. */
export class AvatarPriceChangedError extends WriteError {
  constructor(readonly confirmed: number, readonly current: number) {
    super(current === 0 ? "This item is not for sale any more. Nothing was sent." : "This item's price changed: check the new price and buy again. Nothing was sent.");
    this.name = "AvatarPriceChangedError";
  }
}

/** A known revert of an avatar write as its `AvatarRefusedError`; any other error unchanged. */
function avatarRevert(error: unknown): never {
  if (error instanceof WriteError) {
    const known = AVATAR_REVERTS.find(([reason]) => revertNames(error.message, reason));
    if (known) throw new AvatarRefusedError(known[1], error.transactionHash);
  }
  throw error;
}

/** An avatar item's purchase as the player confirmed it: the part, the item id, and the price in Cobbles the creator showed. */
export interface BuyAvatarItemRequest {
  part: number;
  id: number;
  confirmedPrice: number;
}

/** Why `Village` or `Rewards` refused a village write, by its revert (`village.cairo`, `rewards.cairo`, `errors`; `setup.cairo` for the Cobbles). */
export type VillageRefusal =
  | "founded"
  | "no-village"
  | "cell-owned"
  | "not-adjacent"
  | "territory-full"
  | "level-too-low"
  | "not-enough-cobbles"
  | "cell-not-owned"
  | "tile-exists"
  | "no-neighbors"
  | "cannot-place"
  | "no-reward"
  | "offer-open"
  | "no-offer"
  | "price-changed";

/** Each refusal's revert reason; `cell not owned` before `cell owned`, so the one is never read as the other. */
const VILLAGE_REVERTS: Array<[string, VillageRefusal]> = [
  ["Village: already founded", "founded"],
  ["Village: no village", "no-village"],
  ["Village: cell not owned", "cell-not-owned"],
  ["Village: cell owned", "cell-owned"],
  ["Village: not adjacent", "not-adjacent"],
  ["Village: territory full", "territory-full"],
  ["Village: level too low", "level-too-low"],
  ["Setup: not enough cobbles", "not-enough-cobbles"],
  ["Tile: already exists", "tile-exists"],
  ["Tile: no neighbors", "no-neighbors"],
  ["Tile: cannot place", "cannot-place"],
  ["Rewards: no reward", "no-reward"],
  ["Rewards: offer open", "offer-open"],
  ["Rewards: no offer", "no-offer"],
];

/** What the player reads for each refusal. */
export const VILLAGE_REFUSAL_TEXT: Record<VillageRefusal, string> = {
  founded: "Your village is already founded.",
  "no-village": "Found your village first.",
  "cell-owned": "This parcel is already yours.",
  "not-adjacent": "A parcel must touch your village.",
  "territory-full": "Your village holds the most cells it can.",
  "level-too-low": "Your level is too low for this parcel: play games to level up. No Cobbles were spent.",
  "not-enough-cobbles": "Not enough Cobbles for this parcel: earn them from quests and achievements, or buy a pack.",
  "cell-not-owned": "This cell is not in your village: buy its parcel first.",
  "tile-exists": "A tile is already on this cell.",
  "no-neighbors": "A tile must touch another tile of your village.",
  "cannot-place": "This tile does not fit there: its sides must match the tiles around it.",
  "no-reward": "No reward is waiting: play a game to earn one.",
  "offer-open": "A reward is already open: choose from its tiles first.",
  "no-offer": "This reward was already taken.",
  "price-changed": "This parcel's price changed: check the new price and buy again. Nothing was sent.",
};

/**
 * `Village` or `Rewards` refused a write (`found`, `buy_parcel`, `open_reward`, `claim_reward`): nothing changed and no
 * Cobbles moved. `no-offer` and `founded` mean an earlier write landed: the page reads the village again.
 */
export class VillageRefusedError extends WriteError {
  constructor(readonly reason: VillageRefusal, transactionHash?: string) {
    super(VILLAGE_REFUSAL_TEXT[reason], transactionHash, transactionHash !== undefined);
    this.name = "VillageRefusedError";
  }
}

/** A known revert of a village write as its `VillageRefusedError`; any other error unchanged. */
function villageRevert(error: unknown): never {
  if (error instanceof WriteError && !(error instanceof VillageRefusedError)) {
    const known = VILLAGE_REVERTS.find(([reason]) => revertNames(error.message, reason));
    if (known) throw new VillageRefusedError(known[1], error.transactionHash);
  }
  throw error;
}

/** Why `Matchmaker` or `Arena` refused a PvP write, by its revert (`matchmaker.cairo`, `arena.cairo`, `errors`; `setup.cairo` for the Cobbles). */
export type PvpRefusal =
  | "not-joined"
  | "no-opponent"
  | "opponent-drawn"
  | "opponent-shielded"
  | "nothing-drawn"
  | "attack-started"
  | "not-enough-cobbles"
  | "attack-open"
  | "no-attack"
  | "outside-territory"
  | "tile-exists"
  | "no-neighbors"
  | "cannot-place"
  | "invalid-move";

const PVP_REVERTS: Array<[string, PvpRefusal]> = [
  ["Matchmaker: not joined", "not-joined"],
  ["Matchmaker: npc cannot play", "not-joined"],
  ["Matchmaker: no opponent", "no-opponent"],
  ["Matchmaker: opponent drawn", "opponent-drawn"],
  ["Matchmaker: opponent shielded", "opponent-shielded"],
  ["Matchmaker: nothing drawn", "nothing-drawn"],
  ["Matchmaker: attack started", "attack-started"],
  ["Setup: not enough cobbles", "not-enough-cobbles"],
  ["Arena: attack open", "attack-open"],
  ["Arena: no attack", "no-attack"],
  ["Arena: outside territory", "outside-territory"],
  ["Arena: invalid orientation", "invalid-move"],
  ["Arena: invalid position", "invalid-move"],
  ["Tile: already exists", "tile-exists"],
  ["Tile: no neighbors", "no-neighbors"],
  ["Tile: cannot place", "cannot-place"],
];

/** What the player reads for each refusal. */
export const PVP_REFUSAL_TEXT: Record<PvpRefusal, string> = {
  "not-joined": "Your village is not in the matchmaker yet: found your village first.",
  "no-opponent": "No village is in range of your crowns right now: try again in a while.",
  "opponent-drawn": "A village is already drawn for you: attack it, or take the next one.",
  "opponent-shielded": "This village was attacked a moment ago and is now shielded: search again, it is free.",
  "nothing-drawn": "No village is drawn yet: search first.",
  "attack-started": "Your attack has started: play it to its end, or surrender.",
  "not-enough-cobbles": "Not enough Cobbles for another village: earn them from quests and achievements, or buy a pack.",
  "attack-open": "An attack of yours is still open: play it to its end, or surrender.",
  "no-attack": "This attack is over.",
  "outside-territory": "This cell is outside the defender's territory: play on their cells only.",
  "tile-exists": "A tile is already on this cell.",
  "no-neighbors": "A tile must touch another tile.",
  "cannot-place": "This tile does not fit there: its sides must match the tiles around it.",
  "invalid-move": "This move is not one the arena takes.",
};

/** `Matchmaker` or `Arena` refused a write: nothing changed and no Cobbles or crowns moved. */
export class PvpRefusedError extends WriteError {
  constructor(readonly reason: PvpRefusal, transactionHash?: string) {
    super(PVP_REFUSAL_TEXT[reason], transactionHash, transactionHash !== undefined);
    this.name = "PvpRefusedError";
  }
}

/** A known revert of a PvP write as its `PvpRefusedError`; any other error unchanged. */
function pvpRevert(error: unknown): never {
  if (error instanceof WriteError && !(error instanceof PvpRefusedError)) {
    const known = PVP_REVERTS.find(([reason]) => revertNames(error.message, reason));
    if (known) throw new PvpRefusedError(known[1], error.transactionHash);
  }
  throw error;
}

/** A parcel's purchase as the player confirmed it: the cell next to the village and the price in Cobbles the sheet showed. */
export interface BuyParcelRequest {
  cell: VillageCell;
  confirmedPrice: number;
}

/**
 * A pack's purchase as `Setup.buy_pack` takes it (cobbles v1, part 2, CORE #453). `price` is not an argument of the entry
 * point: it is what the approve allows `Setup` to take, exactly the pack's price.
 */
export interface BuyPackRequest {
  packId: number;
  /** The referrer to send, "0x0" for none (`referrerOf` of the economy's writer checks it first). */
  referrer: string;
  /** The least PAVED the pack's one swap must buy (the pool quote less the slippage), above 0. */
  minOut: bigint;
  /** The pack's price in USDC base units, as the player confirmed it: the approve's amount. */
  price: bigint;
}

/**
 * `Setup.buy_pack`'s arguments, in ABI order: the one place they are listed (main's ABI, db6c6bc4: `pack_id`, `referrer`,
 * `min_out`). A new argument of the entry point (a `max_price`) is one line here and one field of `BuyPackRequest`.
 */
export const buyPackArgs = (request: BuyPackRequest): Encodable[] => [request.packId, request.referrer, request.minOut];

/** Why a pack's purchase was refused, by its revert (`setup.cairo`'s and `economy.cairo`'s `errors`, OpenZeppelin's ERC20). */
export type PackRefusal = "not-on-sale" | "no-economy" | "payment-failed" | "price-moved" | "no-allowance" | "no-balance";

/** Each refusal's revert reason. */
const PACK_REVERTS: Array<[string, PackRefusal]> = [
  ["Setup: pack not on sale", "not-on-sale"],
  ["Setup: economy not set", "no-economy"],
  ["Setup: payment failed", "payment-failed"],
  ["Economy: swap below min_out", "price-moved"],
  ["ERC20: insufficient allowance", "no-allowance"],
  ["ERC20: insufficient balance", "no-balance"],
];

/** What the player reads for each refusal. A revert moves nothing (the approve, the payment and the swap are one transaction); its network fee is paid. */
export const PACK_REFUSAL_TEXT: Record<PackRefusal, string> = {
  "not-on-sale": "This pack is not on sale any more. Your USDC was not spent.",
  "no-economy": "Packs are not on sale on this deployment yet. Your USDC was not spent.",
  "payment-failed": "The payment did not go through. Your USDC was not spent.",
  "price-moved": "The pool's quote moved before your purchase went through: your USDC was not spent. Confirm again.",
  "no-allowance": "The pack's price changed since you confirmed it: your USDC was not spent. Confirm again.",
  "no-balance": "Not enough USDC for this pack. Your USDC was not spent.",
};

/** `Setup` refused a pack's purchase (`buy_pack`): nothing moved. */
export class PackRefusedError extends WriteError {
  constructor(readonly reason: PackRefusal, transactionHash?: string) {
    super(PACK_REFUSAL_TEXT[reason], transactionHash, transactionHash !== undefined);
    this.name = "PackRefusedError";
  }
}

/**
 * The pack's purchase was sent, but its receipt could not be read, or carries no `PackBought`: the outcome is unknown, not
 * a failure. The hash is kept; the page reads the balance again and never invites a second purchase on its own.
 */
export class PackOutcomeUnknownError extends WriteError {
  constructor(transactionHash: string) {
    super(`Purchase sent (${transactionHash}), outcome unknown: check your Cobbles before buying again`, transactionHash);
    this.name = "PackOutcomeUnknownError";
  }
}

/** `Setup`'s `PackBought`: the pack, its price, the referrer that counted ("0x0" for none) and the player's Cobbles after it. */
export interface PackBought {
  playerId: string;
  packId: number;
  cobbles: number;
  price: bigint;
  referrer: string;
  balance: number;
}

/** The `PackBought` of a receipt's decoded events, or null. */
export function packBoughtOf(events: readonly DecodedEvent[]): PackBought | null {
  const event = events.find((e) => e.name === "PackBought");
  if (!event) return null;
  const f = event.fields;
  return {
    playerId: `0x${BigInt(f.playerId as bigint | string).toString(16)}`,
    packId: Number(f.packId),
    cobbles: Number(f.cobbles),
    price: BigInt(f.price as bigint | string),
    referrer: `0x${BigInt(f.referrer as bigint | string).toString(16)}`,
    balance: Number(f.balance),
  };
}

/** A pack's revert as its typed error; a send whose receipt was not read as an unknown outcome; any other error unchanged. */
function packRevert(error: unknown): never {
  if (error instanceof WriteError) {
    const known = PACK_REVERTS.find(([reason]) => revertNames(error.message, reason));
    if (known) throw new PackRefusedError(known[1], error.transactionHash);
    if (error.transactionHash && !error.reverted) throw new PackOutcomeUnknownError(error.transactionHash);
  }
  throw error;
}

const NO_CREDIT = "Setup: no credit";
const SPAWN_PAUSED = "Challenge: spawn paused";
/** What the player reads when Play free is refused for want of a credit. */
export const NO_CREDIT_TEXT = "You have no free game left: earn one on the quests page.";
/** What the player reads when new games are paused (the pause stops free games too, G4). */
export const FREE_SPAWN_PAUSED_TEXT = "New Challenge games are paused for now. Games already started can still be played.";

/** `Challenge.spawn_free` found no credit to spend (`'Setup: no credit'`). Nothing moved. */
export class NoCreditError extends WriteError {
  constructor(transactionHash?: string) {
    super(NO_CREDIT_TEXT, transactionHash, transactionHash !== undefined);
    this.name = "NoCreditError";
  }
}

/** `Challenge.spawn_free` refused because spawn is paused (`'Challenge: spawn paused'`, G4). Nothing moved. */
export class FreeSpawnPausedError extends WriteError {
  constructor(transactionHash?: string) {
    super(FREE_SPAWN_PAUSED_TEXT, transactionHash, transactionHash !== undefined);
    this.name = "FreeSpawnPausedError";
  }
}

/** The known reverts of `spawn_free` as their typed errors; any other error unchanged. */
function spawnFreeRevert(error: unknown): never {
  if (error instanceof WriteError) {
    if (revertNames(error.message, NO_CREDIT)) throw new NoCreditError(error.transactionHash);
    if (revertNames(error.message, SPAWN_PAUSED)) throw new FreeSpawnPausedError(error.transactionHash);
  }
  throw error;
}

interface Receipt {
  execution_status?: string;
  revert_reason?: string;
  events?: RawEvent[];
}

/**
 * The writes of the game's contracts. Each one waits for its receipt and returns its decoded events.
 * Writes are serialised: while one is pending, another is refused (`WriteError`), so a double click
 * never sends two transactions from the account.
 */
export class PavedWriter {
  private pending = false;

  constructor(
    private readonly options: {
      account: WriteAccount;
      provider: ReceiptProvider;
      deployment: Deployment;
      codecs: Codecs;
      /** Tip per transaction; 0 on devnet, where starknet.js's tip estimate stalls. Unset elsewhere (Sepolia included): the account's own estimate. */
      tip?: bigint;
      /** Interval between two receipt requests while a write is pending. */
      receiptPollMs?: number;
      /** Called with the decoded events of every successful write (the event reader keeps them). */
      onEvents?: (contract: ContractName, events: DecodedEvent[]) => void;
      /**
       * The VRF reads of `Challenge` (#645): with them and the deployment's `vrfProvider`, a write that draws (a free
       * spawn always, a build or discard when `draw(game_id).draws`) requests its draw first (`withVrfRequest`).
       */
      draws?: DrawViews;
    },
  ) {
    if (!options.deployment.configured) {
      throw new WriteError(`Not connected: ${options.deployment.missing.join(", ")} missing`);
    }
  }

  get address(): string {
    return this.options.account.address;
  }

  /**
   * The tutorial claim (D-21, P-49): one call to `Setup.claim_tutorial()`, which credits First Stone (task 10) to the
   * caller. It is idempotent and unchecked on chain: a second call has no effect, no revert and no event, so the receipt
   * cannot tell "claimed" from "already claimed". Without a Setup address (a deployment from before step D) nothing is sent.
   */
  claimTutorial(): Promise<WriteResult> {
    if (!this.options.deployment.addresses.Setup) {
      return Promise.reject(new WriteError("No Setup contract in this deployment: the tutorial cannot be claimed"));
    }
    return this.send("Setup", [this.call("Setup", "claim_tutorial", [])]);
  }

  /** `Setup.claim_quest(quest_id, period)`: a quest's Cobbles for its day (daily) or week (weekly) number. */
  claimQuest(questId: number, period: number): Promise<WriteResult> {
    return this.claim([{ kind: "quest", questId, period }]);
  }

  /** `Setup.claim_achievement(achievement_id)`. */
  claimAchievement(achievementId: number): Promise<WriteResult> {
    return this.claim([{ kind: "achievement", achievementId }]);
  }

  /** `Setup.claim_daily_credit(day)`: the day's free game, once every daily with Cobbles live that day is done. */
  claimDailyCredit(day: number): Promise<WriteResult> {
    return this.claim([{ kind: "credit", credit: "daily", period: day }]);
  }

  /** `Setup.claim_weekly_credit(week)`: the same for the weeklies and a week number (`weekOfDay`). */
  claimWeeklyCredit(week: number): Promise<WriteResult> {
    return this.claim([{ kind: "credit", credit: "weekly", period: week }]);
  }

  /**
   * Several claims in one transaction (Claim all): one call each to `Setup`, in the order given, so one signature and one
   * receipt. The multicall is atomic: one refusal (`ClaimRefusedError`) reverts all of them. Its receipt holds one
   * `CobblesClaimed` or `CreditClaimed` per claim. Without a Setup address, or with no claim, nothing is sent.
   */
  claim(claims: readonly CobbleClaim[]): Promise<WriteResult> {
    if (!this.options.deployment.addresses.Setup) {
      return Promise.reject(new WriteError("No Setup contract in this deployment: nothing can be claimed"));
    }
    if (claims.length === 0) return Promise.reject(new WriteError("Nothing to claim"));
    const calls = claims.map((c) =>
      c.kind === "quest"
        ? this.call("Setup", "claim_quest", [c.questId, c.period])
        : c.kind === "achievement"
          ? this.call("Setup", "claim_achievement", [c.achievementId])
          : this.call("Setup", c.credit === "daily" ? "claim_daily_credit" : "claim_weekly_credit", [c.period]),
    );
    return this.send("Setup", calls).catch(claimRevert);
  }

  /**
   * Buys a pack of Cobbles for the account (cobbles v1, part 2): approves `Setup` on `usdc` for exactly `price`, then
   * `Setup.buy_pack(pack_id, referrer, min_out)` (`buyPackArgs`), in one multicall. `Setup` moves the price to `Economy`,
   * which runs the game's split (`Economy.sell`) with the referrer and `min_out`. `usdc` is the economy's USDC
   * (`EconomyDeployment.addresses.USDC`), the token `Setup` pulls. Sends what it is given: `PackBuyer` (`packs.ts`) reads
   * the pack, the router and the pool again first and refuses an amount the player did not confirm. Its receipt holds the
   * `PackBought` (`bought`). Without a Setup address nothing is sent.
   */
  async buyPack(request: BuyPackRequest, usdc: string): Promise<WriteResult & { bought: PackBought }> {
    const setup = this.options.deployment.addresses.Setup;
    if (!setup) throw new WriteError("No Setup contract in this deployment: no pack can be bought");
    if (!Number.isInteger(request.packId) || request.packId < 1 || request.packId > 255) throw new WriteError(`Not a pack id: ${String(request.packId)}`);
    if (request.price <= 0n) throw new WriteError("A pack's price must be above 0");
    if (request.minOut <= 0n) throw new WriteError("No minimum PAVED: confirm again");
    if (!usdc) throw new WriteError("No USDC in this deployment: no pack can be bought");
    const approve: Call = { contractAddress: usdc, entrypoint: "approve", calldata: new Codec(FAUCET_ABI).encodeCall("approve", [setup, request.price]) };
    let result: WriteResult;
    try {
      result = await this.send("Setup", [approve, this.call("Setup", "buy_pack", buyPackArgs(request))]);
    } catch (error) {
      packRevert(error);
    }
    const bought = packBoughtOf(result.events);
    if (!bought) throw new PackOutcomeUnknownError(result.transactionHash);
    return { ...result, bought };
  }

  /**
   * "Play free": `Challenge.spawn_free()`, which spends one free-game credit of the caller and spawns a Challenge game with
   * `GameSpawned.price` 0 (a free game), minted to the caller. Returns the new game's id from the receipt. A refusal is a
   * `NoCreditError` or a `FreeSpawnPausedError`: nothing moved. A receipt without `GameSpawned` is a `WriteError` that names the
   * transaction (sent, outcome unknown): the credit may be spent, the player's games list shows the game if it exists.
   */
  async spawnFree(): Promise<WriteResult & { gameId: number }> {
    const result = await this.serialised(async () =>
      this.sendNow("Challenge", await this.withSpawnDraw([this.call("Challenge", "spawn_free", [])], this.address)),
    ).catch(spawnFreeRevert);
    const spawned = result.events.find((e) => e.name === "GameSpawned");
    if (!spawned) throw new WriteError("The free game was sent but its receipt shows no game: check your games list.", result.transactionHash);
    return { ...result, gameId: Number(spawned.fields.gameId) };
  }

  /**
   * `Setup.buy_skin(theme, plan)`: the caller buys the skin of `plan` (1 to 19) in `theme` (1 to 255) for its price in
   * Cobbles, once; buying does not activate it. The receipt's `SkinBought` carries the price and the balance after. A
   * refusal is a `SkinRefusedError` (owned, not for sale, not enough Cobbles): nothing moved. Theme 0 (the default, free)
   * and a plan outside 1 to 19 are refused before anything is sent, as is a deployment without Setup. `skin_price` is read
   * again inside the serialised send (`views.skinPrice`): a price other than `confirmedPrice`, the one the card showed, is a
   * `SkinPriceChangedError` and nothing is sent, as for a pack (`PackPriceChangedError`); a failed read sends nothing.
   */
  buySkin(request: BuySkinRequest, views: Pick<SkinViews, "skinPrice">): Promise<WriteResult> {
    const { theme, plan, confirmedPrice } = request;
    if (!this.options.deployment.addresses.Setup) return Promise.reject(new WriteError("No Setup contract in this deployment: no skin is for sale"));
    if (!Number.isInteger(theme) || theme < 1 || theme > 255 || !isSkinPlan(plan)) return Promise.reject(new SkinRefusedError("invalid-skin"));
    if (!Number.isInteger(confirmedPrice) || confirmedPrice <= 0) return Promise.reject(new WriteError("No confirmed price for this skin: nothing was sent"));
    return this.serialised(async () => {
      let current: number;
      try {
        current = await views.skinPrice(theme, plan);
      } catch (error) {
        throw new WriteError(`Cannot read the skin's price: ${error instanceof Error ? error.message : String(error)}. Nothing was sent.`);
      }
      if (current !== confirmedPrice) throw new SkinPriceChangedError(confirmedPrice, current);
      return this.sendNow("Setup", [this.call("Setup", "buy_skin", [theme, plan])]);
    }).catch(skinRevert);
  }

  /**
   * `Setup.set_skins(changes)`: the active theme of each plan named, one write for the batch (about 0.12M gas per changed
   * plan, so the page sends only the plans that changed). Theme 0 always passes; any other only if the caller owns that
   * skin, else the whole batch reverts (`SkinRefusedError`, `not-owned`). The receipt's `SkinsActivated` carries the whole
   * active set (`activeThemes`). An empty batch, a plan outside 1 to 19, a theme outside 0 to 255 or a plan named twice is
   * refused before anything is sent.
   */
  setSkins(changes: readonly SkinChange[]): Promise<WriteResult> {
    if (!this.options.deployment.addresses.Setup) return Promise.reject(new WriteError("No Setup contract in this deployment: no skin can be set"));
    if (changes.length === 0) return Promise.reject(new WriteError("No skin changed"));
    const plans = new Set(changes.map((c) => c.plan));
    if (plans.size !== changes.length || changes.length > SKIN_PLANS) return Promise.reject(new WriteError("A plan is named twice"));
    if (changes.some((c) => !isSkinPlan(c.plan) || !Number.isInteger(c.theme) || c.theme < 0 || c.theme > 255)) return Promise.reject(new SkinRefusedError("invalid-skin"));
    // `Span<(u8, u8)>` by hand: its length, then each tuple's members in order. The codec encodes neither arrays nor
    // tuples; a test checks the input's type against `contracts/abis/Setup.json`.
    const calldata = [changes.length, ...changes.flatMap((c) => [c.plan, c.theme])].map((n) => `0x${n.toString(16)}`);
    const call: Call = { contractAddress: this.options.deployment.addresses.Setup, entrypoint: "set_skins", calldata };
    return this.send("Setup", [call]).catch(skinRevert);
  }

  /**
   * `Avatar.buy_avatar_item(part, id, confirmedPrice)`: the caller buys a paid avatar item for itself, once, for its price
   * in Cobbles (debited on `Setup`'s ledger), never above `confirmedPrice`: the contract refuses a higher price, so an owner's
   * change after the read below never charges more (`AvatarRefusedError` `price-changed`). Buying does not set the avatar.
   * The receipt's `AvatarItemBought` carries the price and the balance after. A refusal is an `AvatarRefusedError` (owned,
   * not for sale, sold out, sale ended, price changed, not enough Cobbles): nothing moved. The item is read again inside the
   * serialised send (`views.avatarItem`): a price other than `confirmedPrice` is an `AvatarPriceChangedError` and nothing is
   * sent; a failed read sends nothing.
   */
  buyAvatarItem(request: BuyAvatarItemRequest, views: Pick<AvatarViews, "avatarItem">): Promise<WriteResult> {
    const { part, id, confirmedPrice } = request;
    if (!this.options.deployment.addresses.Avatar) return Promise.reject(new WriteError("No Avatar contract in this deployment: no item is for sale"));
    if (!Number.isInteger(part) || part < 0 || part >= AVATAR_MAX_PARTS || !Number.isInteger(id) || id < 0 || id > AVATAR_MAX_ID) {
      return Promise.reject(new AvatarRefusedError("not-for-sale"));
    }
    if (!Number.isInteger(confirmedPrice) || confirmedPrice <= 0) return Promise.reject(new WriteError("No confirmed price for this item: nothing was sent"));
    return this.serialised(async () => {
      let current: number;
      try {
        const item = await views.avatarItem(part, id);
        current = item.state === AVATAR_LISTED ? item.cobbles : 0;
      } catch (error) {
        throw new WriteError(`Cannot read the item's price: ${error instanceof Error ? error.message : String(error)}. Nothing was sent.`);
      }
      if (current !== confirmedPrice) throw new AvatarPriceChangedError(confirmedPrice, current);
      return this.sendNow("Avatar", [this.call("Avatar", "buy_avatar_item", [part, id, confirmedPrice])]);
    }).catch(avatarRevert);
  }

  /**
   * `Avatar.set_avatar(look)`: stores the caller's avatar, one u128 in the client's format (`lookOf`, or the renderer's
   * `encodeTraits`); 0n clears it. Every part must be listed and free, or owned, else an `AvatarRefusedError` (`not-owned`)
   * and nothing is saved. The receipt's `AvatarSet` carries the look. A look outside a u128 is refused before anything is sent.
   */
  setAvatar(look: bigint): Promise<WriteResult> {
    if (!this.options.deployment.addresses.Avatar) return Promise.reject(new WriteError("No Avatar contract in this deployment: no avatar can be saved"));
    if (look < 0n || look >= 2n ** 128n) return Promise.reject(new AvatarRefusedError("invalid-look"));
    return this.send("Avatar", [this.call("Avatar", "set_avatar", [look])]).catch(avatarRevert);
  }

  /** `Village.found()`: the caller's village, once (the 3 x 3 of the start and the starter). */
  foundVillage(): Promise<WriteResult> {
    const village = this.options.deployment.addresses.Village;
    if (!village) return Promise.reject(new WriteError("No Village contract in this deployment: no village can be founded"));
    return this.send("Village", [foundVillageCall(village)]).catch(villageRevert);
  }

  /**
   * `Village.buy_parcel(x, y)`: the parcel at `cell`, paid in Cobbles on `Setup`'s ledger, gated by the caller's level. The
   * village's next price is read again inside the serialised send (`views.village`): another price than `confirmedPrice`, the
   * one the sheet showed, is a `VillageRefusedError` (`price-changed`) and nothing is sent; a failed read sends nothing. A
   * refusal on chain (level, Cobbles, a cell not next to the village) is a `VillageRefusedError`: nothing moved.
   */
  buyParcel(request: BuyParcelRequest, views: Pick<VillageViews, "village">): Promise<WriteResult> {
    const village = this.options.deployment.addresses.Village;
    if (!village) return Promise.reject(new WriteError("No Village contract in this deployment: no parcel is for sale"));
    if (!Number.isInteger(request.confirmedPrice) || request.confirmedPrice <= 0) return Promise.reject(new WriteError("No confirmed price for this parcel: nothing was sent"));
    let call: Call;
    try {
      call = buyParcelCall(village, request.cell);
    } catch (error) {
      return Promise.reject(new WriteError(error instanceof Error ? error.message : String(error)));
    }
    return this.serialised(async () => {
      let current: number;
      try {
        current = (await views.village(this.address)).nextPrice;
      } catch (error) {
        throw new WriteError(`Cannot read the parcel's price: ${error instanceof Error ? error.message : String(error)}. Nothing was sent.`);
      }
      if (current !== request.confirmedPrice) throw new VillageRefusedError("price-changed");
      return this.sendNow("Village", [call]);
    }).catch(villageRevert);
  }

  /**
   * `Rewards.open_reward()`: draws the 3 tiles of the caller's next pending reward on the VRF (#642). The reward's index
   * (`grants(player).opened`, its salt) is read inside the serialised send, after any earlier write has landed; with the
   * deployment's provider the request goes first (`openRewardCalls`), without one (the devnet's mock) the call goes alone.
   * The receipt's `RewardOpened` carries the plans.
   */
  openReward(views: Pick<VillageViews, "rewardGrants">): Promise<WriteResult> {
    const rewards = this.options.deployment.addresses.Rewards;
    if (!rewards) return Promise.reject(new WriteError("No Rewards contract in this deployment: no reward can be opened"));
    return this.serialised(async () => {
      const provider = this.options.deployment.vrfProvider;
      if (!provider) return this.sendNow("Rewards", [{ contractAddress: rewards, entrypoint: "open_reward", calldata: [] }]);
      let opened: number;
      try {
        opened = (await views.rewardGrants(this.address)).opened;
      } catch (error) {
        throw new WriteError(`Cannot read the reward's draw: ${error instanceof Error ? error.message : String(error)}. Nothing was sent.`);
      }
      return this.sendNow("Rewards", openRewardCalls(rewards, provider, this.address, opened));
    }).catch(villageRevert);
  }

  /**
   * `Rewards.claim_reward(...)`: the open offer claimed in one gesture (#642): a tile placed on a cell of the village (every
   * rule of `Village.place`), added as a copy of its plan, or the Cobbles. The receipt's `RewardClaimed` carries the plan's
   * copies and tier after it. A refusal (the cell, the fit, no offer) is a `VillageRefusedError`: the offer stays open.
   */
  claimReward(claim: RewardClaim): Promise<WriteResult> {
    const rewards = this.options.deployment.addresses.Rewards;
    if (!rewards) return Promise.reject(new WriteError("No Rewards contract in this deployment: no reward can be claimed"));
    let call: Call;
    try {
      call = claimRewardCall(rewards, claim);
    } catch (error) {
      return Promise.reject(new WriteError(error instanceof Error ? error.message : String(error)));
    }
    return this.send("Rewards", [call]).catch(villageRevert);
  }

  /**
   * `Matchmaker.search()` (free) or `next()` (`NEXT_PRICE` Cobbles): an opponent drawn on the VRF (#639). The draw's index (the
   * attacker's `village(attacker).draws`) is read inside the serialised send, after any earlier write has landed; with the
   * deployment's provider the request goes first, without one (the devnet's mock) the call goes alone. The receipt's
   * `OpponentDrawn` names the opponent, its offer and its cost.
   */
  drawOpponent(kind: "search" | "next", views: Pick<PvpViews, "pvpVillage">): Promise<WriteResult> {
    const matchmaker = this.options.deployment.addresses.Matchmaker;
    if (!matchmaker) return Promise.reject(new WriteError("No Matchmaker contract in this deployment: no village can be drawn"));
    return this.serialised(async () => {
      const provider = this.options.deployment.vrfProvider;
      if (!provider) return this.sendNow("Matchmaker", [{ contractAddress: matchmaker, entrypoint: kind, calldata: [] }]);
      let draws: number;
      try {
        draws = (await views.pvpVillage(this.address)).draws;
      } catch (error) {
        throw new WriteError(`Cannot read the draw: ${error instanceof Error ? error.message : String(error)}. Nothing was sent.`);
      }
      return this.sendNow("Matchmaker", (kind === "search" ? searchCalls : nextCalls)(matchmaker, provider, this.address, draws));
    }).catch(pvpRevert);
  }

  /**
   * `Arena.start()`: the attack on the opponent drawn (#643), its first tile drawn on the VRF. The attacker's last attack id
   * (`attack(attacker).id`, the salt's) is read inside the serialised send. The receipt's `AttackOpened` (or `AttackSkipped`:
   * an opponent that could not be attacked, the next search free) and `TileDrawn` carry the attack and the tile in hand.
   */
  startAttack(views: Pick<PvpViews, "pvpAttack">): Promise<WriteResult> {
    const arena = this.options.deployment.addresses.Arena;
    if (!arena) return Promise.reject(new WriteError("No Arena contract in this deployment: no attack can start"));
    return this.serialised(async () => {
      const provider = this.options.deployment.vrfProvider;
      if (!provider) return this.sendNow("Arena", [{ contractAddress: arena, entrypoint: "start", calldata: [] }]);
      let last: number;
      try {
        last = (await views.pvpAttack(this.address)).id;
      } catch (error) {
        throw new WriteError(`Cannot read your last attack: ${error instanceof Error ? error.message : String(error)}. Nothing was sent.`);
      }
      return this.sendNow("Arena", startAttackCalls(arena, provider, this.address, last));
    }).catch(pvpRevert);
  }

  /**
   * `Arena.play(...)`: the tile in hand built at a cell or discarded. The open attack and its deck are read inside the
   * serialised send: while a tile is left to draw the request goes first (the salt of draw `deck.drawn`); the last move
   * draws nothing and its receipt's `AttackFinished` carries the score, the stars and the crowns.
   */
  playAttack(play: AttackPlay, views: Pick<PvpViews, "pvpAttack" | "pvpDeck">): Promise<WriteResult> {
    const arena = this.options.deployment.addresses.Arena;
    if (!arena) return Promise.reject(new WriteError("No Arena contract in this deployment: no attack can be played"));
    try {
      playCall(arena, play);
    } catch (error) {
      return Promise.reject(new WriteError(error instanceof Error ? error.message : String(error)));
    }
    return this.serialised(async () => {
      const provider = this.options.deployment.vrfProvider;
      if (!provider) return this.sendNow("Arena", [playCall(arena, play)]);
      let calls: Call[];
      try {
        const { id } = await views.pvpAttack(this.address);
        calls = playCalls(arena, provider, this.address, id, await views.pvpDeck(this.address, id), play);
      } catch (error) {
        throw new WriteError(`Cannot read your attack's next draw: ${error instanceof Error ? error.message : String(error)}. Nothing was sent.`);
      }
      return this.sendNow("Arena", calls);
    }).catch(pvpRevert);
  }

  /** `Arena.surrender()`: the open attack ended at 0 stars, its 0-star cost to the defender. */
  surrenderAttack(): Promise<WriteResult> {
    const arena = this.options.deployment.addresses.Arena;
    if (!arena) return Promise.reject(new WriteError("No Arena contract in this deployment: no attack to surrender"));
    return this.send("Arena", [surrenderCall(arena)]).catch(pvpRevert);
  }

  /** Places the tile in hand. A Challenge game is bought, not spawned here: `EconomyWriter.purchase` sends `Challenge.spawn`. */
  build(key: GameKey, move: BuildMove): Promise<WriteResult> {
    const contract = gameContract(key.mode);
    return this.sendMove(key, [this.call(contract, "build", [key.gameId, move.orientation, move.x, move.y])]).catch(expiredRevert);
  }

  discard(key: GameKey): Promise<WriteResult> {
    const contract = gameContract(key.mode);
    return this.sendMove(key, [this.call(contract, "discard", [key.gameId])]).catch(expiredRevert);
  }

  /**
   * The deployed `Challenge` has no VRF reads (`not-available`: a class from before #645, which draws from its seed and
   * takes no request): from then on this writer sends every write as before #645, with no read and no request.
   */
  private drawsUnavailable = false;

  /** Whether a failed VRF read says the deployed class predates #645 (the view's `not-available`, as `toViewError` names it). */
  private beforeVrf(error: unknown): boolean {
    if ((error as { kind?: unknown } | null)?.kind !== "not-available") return false;
    this.drawsUnavailable = true;
    return true;
  }

  /**
   * A build or discard (#645): `draw(game_id)` is read inside the serialised send, after any earlier move has landed, and
   * a move that draws requests its draw first. Without the VRF reads or a provider the move goes alone (a deployment
   * from before #645, or the devnet mock, which needs no request); so it does when the deployed class has no `draw`.
   */
  private sendMove(key: GameKey, calls: Call[]): Promise<WriteResult> {
    const contract = gameContract(key.mode);
    return this.serialised(async () => {
      const { draws, deployment } = this.options;
      if (!draws || !deployment.vrfProvider || this.drawsUnavailable) return this.sendNow(contract, calls);
      let draw: DrawView;
      try {
        draw = await draws.draw(key);
      } catch (error) {
        if (this.beforeVrf(error)) return this.sendNow(contract, calls);
        throw new WriteError(`Cannot read the game's next draw: ${error instanceof Error ? error.message : String(error)}. Nothing was sent.`);
      }
      const sent = draw.draws ? withVrfRequest(calls, { provider: deployment.vrfProvider, consumer: deployment.addresses[contract], salt: draw.salt }) : calls;
      return this.sendNow(contract, sent);
    });
  }

  /**
   * A spawn's calls with its draw requested first (#645): the salt of `player`'s next spawn (`spawn_salt`). Without the
   * VRF reads or a provider, or on a deployed class that has no `spawn_salt` (before #645), the calls as they are.
   */
  async withSpawnDraw(calls: Call[], player: string): Promise<Call[]> {
    const { draws, deployment } = this.options;
    if (!draws || !deployment.vrfProvider || this.drawsUnavailable) return calls;
    let salt: string;
    try {
      salt = await draws.spawnSalt(player);
    } catch (error) {
      if (this.beforeVrf(error)) return calls;
      throw new WriteError(`Cannot read the spawn's draw: ${error instanceof Error ? error.message : String(error)}. Nothing was sent.`);
    }
    return withVrfRequest(calls, { provider: deployment.vrfProvider, consumer: deployment.addresses.Challenge, salt });
  }

  surrender(key: GameKey): Promise<WriteResult> {
    const contract = gameContract(key.mode);
    return this.send(contract, [this.call(contract, "surrender", [key.gameId])]);
  }

  /**
   * The faucet: `Faucet.mint(self, FAUCET_USDC_AMOUNT)` at `deployment.faucet` (devnet and Sepolia; the mock is never
   * resolved on mainnet). Without that address nothing is sent. On devnet the burner signs it; on Sepolia the controller
   * does, with `mint` in its session policies. A cap the contract enforces is a `FaucetCapError`.
   */
  mint(): Promise<WriteResult> {
    return this.serialised(async () => {
      const call = this.faucetCall();
      try {
        return await this.sendNow({ codec: new Codec(FAUCET_ABI), address: call.contractAddress }, [call]);
      } catch (error) {
        throw faucetRevert(error);
      }
    });
  }

  private faucetCall(): Call {
    const { faucet } = this.options.deployment;
    if (!faucet) throw new WriteError("No faucet: this deployment has no Faucet");
    return {
      contractAddress: faucet,
      entrypoint: "mint",
      calldata: new Codec(FAUCET_ABI).encodeCall("mint", [this.address, FAUCET_USDC_AMOUNT]),
    };
  }

  private call(contract: ContractName, entrypoint: string, args: Encodable[]): Call {
    return {
      contractAddress: this.options.deployment.addresses[contract],
      entrypoint,
      calldata: this.options.codecs[contract].encodeCall(entrypoint, args),
    };
  }

  private send(contract: ContractName, calls: Call[]): Promise<WriteResult> {
    return this.serialised(() => this.sendNow(contract, calls));
  }

  /**
   * Sends calls built by another client of this account (the economy's, `economy/writer.ts`) in the same
   * serialisation as this writer's own: one write at a time across both. `prepare` runs inside it, so the reads
   * that check an amount happen after any earlier write has landed; it returns the calls and where the receipt's
   * events come from: one of the contracts of `ContractName`, or another contract's codec and address.
   */
  sendCalls(prepare: () => Promise<{ calls: Call[]; events: ContractName | { codec: AbiCodec; address: string } }>): Promise<WriteResult> {
    return this.serialised(async () => {
      const { calls, events } = await prepare();
      return this.sendNow(events, calls);
    });
  }

  private async serialised<T>(run: () => Promise<T>): Promise<T> {
    if (this.pending) throw new WriteError("Another write is pending");
    this.pending = true;
    try {
      return await run();
    } finally {
      this.pending = false;
    }
  }

  private async sendNow(contract: ContractName | { codec: AbiCodec; address: string }, calls: Call[]): Promise<WriteResult> {
    const { account, provider, codecs, deployment, tip, receiptPollMs = RECEIPT_POLL_MS, onEvents } = this.options;
    let transaction_hash: string;
    try {
      // Rejected before sending (fee estimation, a contract assert found by the simulation, the player's refusal), or a
      // failure that may come after sending (`SendUnconfirmedError`).
      ({ transaction_hash } = await account.execute(calls, tip === undefined ? undefined : { tip }));
    } catch (error) {
      const detail = error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String(error.message) : String(error);
      if (isWalletRejection(error)) throw new WalletRejectedError(detail);
      if (refusedBeforeSending(error)) throw new WriteError(detail);
      throw new SendUnconfirmedError(detail);
    }
    let receipt: Receipt;
    try {
      receipt = (await provider.waitForTransaction(transaction_hash, { retryInterval: receiptPollMs })) as Receipt;
    } catch (error) {
      throw new WriteError(error instanceof Error ? error.message : String(error), transaction_hash);
    }
    if (receipt.execution_status === "REVERTED") {
      throw new WriteError(receipt.revert_reason ?? "Transaction reverted", transaction_hash, true);
    }
    if (typeof contract !== "string") {
      const events = (receipt.events ?? []).flatMap((raw) =>
        raw.from_address && sameAddress(raw.from_address, contract.address) ? (contract.codec.decodeEvent(raw) ?? []) : [],
      );
      return { transactionHash: transaction_hash, events };
    }
    const events = receiptEvents(receipt, codecs, contract, deployment.addresses[contract]);
    onEvents?.(contract, events);
    return { transactionHash: transaction_hash, events };
  }

}
