import { getChecksumAddress } from "starknet";
import type { Deployment } from "../deployment";

// Cartridge's controller left the client (#918, phase A): the local key (`./local-key`) signs every write itself, with no
// session. What stays here is the session's record, kept with its P-65 guard: the calls a session key would sign without a
// prompt, which the writers' tests still check against what they send. Nothing signs a session today.

/** One session policy: a call the controller signs without a prompt. Never an `approve` (P-65). */
export interface ControllerPolicy {
  target: string;
  method: string;
  description?: string;
}

/**
 * The client's writes signed in the session, by contract. No token `approve` is a policy, on any token (P-65): the
 * controller matches a session call on (target, method) alone, never on its spender or amount, so every approve prompts, in
 * the multicall of the write that needs it. Nor is a call that pulls a token (`Challenge.spawn`, `Setup.buy_pack`, the
 * Vault's `deposit`): each is sent with its approve, which prompts anyway, and in the session a bare one could spend a
 * standing allowance left by a connect from before P-65. `Faucet.mint` (the faucet, `PavedWriter.mint`) is left out here
 * too: it is a policy only where the deployment has a Faucet (Sepolia; `controllerPolicies`), never on mainnet.
 */
export const CONTROLLER_ENTRY_POINTS = {
  // `spawn_free` is Play free (a free-game credit spent): no token moves, so it is a session policy like the moves. The paid
  // `spawn` pulls USDC: not a policy (P-65), it prompts with its approve.
  Challenge: ["spawn_free", "build", "discard", "surrender"],
  // The tutorial claim (D-21) and the Cobbles claims (cobbles v1, part 1: a quest's, an achievement's, a day's and a week's
  // free game; Claim all is a multicall of them): policies only where the deployment has a Setup (`controllerPolicies`). A
  // pack's purchase (`buy_pack`, cobbles v1, part 2) pulls USDC: not a policy (P-65), it prompts with its approve. The skins
  // (cobbles v1, part 3): `buy_skin` spends Cobbles, which no token carries, and `set_skins` spends nothing.
  Setup: ["claim_tutorial", "claim_quest", "claim_achievement", "claim_daily_credit", "claim_weekly_credit", "buy_skin", "set_skins"],
  // The avatar (#627): `buy_avatar_item` spends Cobbles, which no token carries, and `set_avatar` spends nothing. Policies only
  // where the deployment has an Avatar.
  Avatar: ["buy_avatar_item", "set_avatar"],
  // The village (#640): `found` spends nothing, `buy_parcel` spends Cobbles, which no token carries. Policies only where the
  // deployment has a Village. `demolish` is not offered by the client yet.
  Village: ["found", "buy_parcel"],
  // The village's rewards (#642): `open_reward` follows its VRF request (a policy too), `claim_reward` places a tile, adds a
  // copy or credits Cobbles. No token moves. Policies only where the deployment has Rewards.
  Rewards: ["open_reward", "claim_reward"],
  // The PvP (#647): `search` and `next` draw an opponent after their VRF request (`next` spends a Cobble, which no token
  // carries); `start`, `play` and `surrender` the attack, `start` and each `play` but the last after their request. No token
  // moves. Policies only where the deployment has them.
  Matchmaker: ["search", "next"],
  Arena: ["start", "play", "surrender"],
} as const;

/** The VRF provider's entry point in the session (#645): `request_random`, which does nothing on chain. */
export const VRF_REQUEST_METHOD = "request_random";

/** The Economy's only entry point in the session (P7a): anyone may settle, and it pays the game's player. */
export const ECONOMY_ENTRY_POINT = "settle";

/**
 * Session policies for the game's writes, on the deployment's addresses. No token `approve` and no call that pulls a token
 * (P-65, superseding P-56): a paid entry sends its approve and `spawn` in one multicall, which prompts once; a pack's approve
 * and `buy_pack`, and the Vault's approve and deposit, prompt the same way. `Setup.claim_tutorial`, the four Cobbles claims
 * and the two skin writes are policies when the deployment has a Setup. `Faucet.mint` is a policy when, and only when, the deployment
 * resolves a Faucet (`deployment.faucet`: Sepolia, where the player signs with the controller; never mainnet).
 *
 * `economy` is the Economy's address (the economy deployment's, not the game's): with it, `Economy.settle` is a policy, the
 * one entry point of the Economy in the session (P7a). It moves no token from the player and takes no approve; it mints the
 * reward to the game's player whoever sends it. The Vault, the purchase and every other Economy write still prompt.
 *
 * `approve` is ignored (P-65): a caller may still pass the entry's cap, and no approve is built from it.
 */
export function controllerPolicies(
  deployment: Deployment,
  options: { /** @deprecated Ignored (P-65): no token approve in the session. */ approve?: unknown; economy?: string | null } = {},
): ControllerPolicy[] {
  // No policy on an empty target: the deployment must be complete.
  if (!deployment.configured) throw new Error(`Not connected: ${deployment.missing.join(", ")} missing`);
  const policies: ControllerPolicy[] = (Object.keys(CONTROLLER_ENTRY_POINTS) as Array<keyof typeof CONTROLLER_ENTRY_POINTS>)
    .filter((contract) => isAddress(deployment.addresses[contract]))
    .flatMap((contract) => CONTROLLER_ENTRY_POINTS[contract].map((method) => ({ target: deployment.addresses[contract], method })));
  if (isAddress(deployment.faucet)) policies.push(faucetPolicy(deployment.faucet));
  // The VRF provider's `request_random` (#638, #645): the first call of every drawing write; it moves no token (P-65)
  if (isAddress(deployment.vrfProvider)) policies.push({ target: deployment.vrfProvider, method: VRF_REQUEST_METHOD });
  if (options.economy && isAddress(options.economy)) policies.push({ target: options.economy, method: ECONOMY_ENTRY_POINT });
  return policies;
}

function isAddress(value: string): boolean {
  try {
    return BigInt(value) !== 0n;
  } catch {
    return false;
  }
}

/**
 * The words of a method name that move a token or pull one from the player (P-65): an approve, an allowance or an
 * approval (`set_approval_for_all`), a transfer, and the calls that pay with one: a deposit, a pay, a mint. A name is cut
 * into words (`isTokenMethod`: `transfer_from`, `setApprovalForAll`, `SET_APPROVAL_FOR_ALL`), and a word refused when it
 * starts with one of these, in any case (`payment`, `minted`, `DEPOSIT`).
 */
const TOKEN_WORD = /^(approv|allowance|transfer|deposit|pay|mint)/i;

/** The paid entry points that pull USDC with their approve (`Challenge.spawn`, `Setup.buy_pack`), by their exact names. */
const TOKEN_PULLS: readonly string[] = ["spawn", "buy_pack"];

/** The guard before VALUE-POLISH, kept as a floor: any name holding these, in any case or position, is refused. */
const TOKEN_TEXT = /approv|allowance|transfer/i;

/**
 * Whether `method` moves or pulls a token, so is never a session policy (P-65). Words are cut at `_` and where a capital
 * follows a lower-case letter or a digit, so an all-capitals name (`APPROVE`, `SET_APPROVAL_FOR_ALL`) keeps its words.
 */
export function isTokenMethod(method: string): boolean {
  const words = method.split(/_|(?<=[a-z0-9])(?=[A-Z])/).filter(Boolean);
  return TOKEN_PULLS.includes(method.toLowerCase()) || TOKEN_TEXT.test(method) || words.some((word) => TOKEN_WORD.test(word));
}

/** The faucet's policies built here (`faucetPolicy`): the one `mint` the guard lets through. */
const faucetPolicies = new WeakSet<ControllerPolicy>();

/**
 * `Faucet.mint` on the deployment's Faucet (Sepolia): it mints test USDC to the caller and pulls nothing, so it is the one
 * `mint` in the session. Only a policy built by this function passes the guard; a `mint` written by hand is refused.
 */
function faucetPolicy(target: string): ControllerPolicy {
  const policy = { target, method: "mint", description: "Test USDC faucet" };
  faucetPolicies.add(policy);
  return policy;
}

/**
 * The controller's `SessionPolicies` (`{ contracts: { [address]: { methods } } }`). A token method is refused (P-65,
 * `isTokenMethod`): an approve, an allowance or an approval (`increase_allowance`, `set_approval_for_all`...), a transfer,
 * and a call that pays with a token (`deposit`, `pay`, `mint`, the paid `spawn` and `buy_pack`); the faucet's `mint` alone
 * passes. The controller would execute an approve policy once at connect, leaving a standing allowance of its cap, and its
 * session key is a wildcard that the keychain filters by (target, method) alone, so such a policy would sign that call to
 * any spender or recipient, and a pulling call would spend that allowance without a prompt.
 */
export function toControllerSessionPolicies(policies: ControllerPolicy[]) {
  const contracts: Record<string, { methods: Array<{ entrypoint: string; description?: string }> }> = {};
  for (const p of policies) {
    if (isTokenMethod(p.method) && !faucetPolicies.has(p)) throw new Error(`No token approve in the session (P-65): ${p.method} prompts with its write`);
    const target = getChecksumAddress(p.target);
    const method = { entrypoint: p.method, ...(p.description ? { description: p.description } : {}) };
    (contracts[target] ??= { methods: [] }).methods.push(method);
  }
  return { contracts };
}
