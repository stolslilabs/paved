// Cartridge's VRF per draw (#638, docs/architecture/vrf-draws.md): the call a drawing write puts first in its multicall,
// the draw's salt (the mirror of `draw_salt` in contracts/src/vrf.cairo), and the provider of each network.
import { hash, num, shortString } from "starknet";
import type { ControllerPolicy } from "./auth/controller";
import type { DeploymentFile } from "./deployment";
import type { Call } from "./writer";

/** Cartridge's VRF provider, the same address on mainnet and on Sepolia (cartridge-gg/vrf, README). */
export const CARTRIDGE_VRF_PROVIDER = "0x051fea4450da9d6aee758bdeba88b2f665bcbf549d2c61421aa724e9ac0ced8f";

/** The networks that draw through Cartridge's provider. The devnet draws through the mock (`contracts.MockVrfProvider`). */
export const CARTRIDGE_VRF_NETWORKS: readonly string[] = ["sepolia", "mainnet"];

/** The provider's entry point that the client calls first; it does nothing on chain (Cartridge's server reads it). */
export const VRF_REQUEST_ENTRY_POINT = "request_random";

/** `Source`'s variants as Cairo serializes them: a draw always uses `Salt`, never `Nonce` (a nonce can be advanced by anyone). */
export const VRF_SOURCE = { nonce: 0, salt: 1 } as const;

/** The domain of every draw salt (`DRAW_DOMAIN`). */
export const VRF_DRAW_DOMAIN = "PAVED_DRAW";

type Felt = string | number | bigint;

function felt(value: Felt): string {
  return typeof value === "string" && !/^(0x[0-9a-f]+|\d+)$/i.test(value) ? shortString.encodeShortString(value) : num.toHex(value);
}

/**
 * The salt of the draw `drawIndex` of `gameId` in `kind`: Poseidon of the domain, the kind, the game and the index, as
 * `draw_salt` computes it. A `kind` that is not a number is a Cairo short string (`'HARNESS'`).
 */
export function vrfSalt(kind: Felt, gameId: Felt, drawIndex: number): string {
  if (!Number.isInteger(drawIndex) || drawIndex < 0 || drawIndex > 0xffffffff) throw new Error(`Not a draw index: ${drawIndex}`);
  return hash.computePoseidonHashOnElements([felt(VRF_DRAW_DOMAIN), felt(kind), felt(gameId), num.toHex(drawIndex)]);
}

export interface VrfRequest {
  /** The provider: Cartridge's, or the devnet mock. */
  provider: string;
  /** The system that draws (the provider's caller, which enters the seed). */
  consumer: string;
  /** The draw's salt (`vrfSalt`). */
  salt: string;
}

/** `request_random(consumer, Source::Salt(salt))` on the provider. */
export function vrfRequestCall(request: VrfRequest): Call {
  return {
    contractAddress: request.provider,
    entrypoint: VRF_REQUEST_ENTRY_POINT,
    calldata: [num.toHex(request.consumer), num.toHex(VRF_SOURCE.salt), num.toHex(request.salt)],
  };
}

/** The write's calls with the provider's request first, as Cartridge's server requires. One draw per transaction. */
export function withVrfRequest(calls: Call[], request: VrfRequest): Call[] {
  return [vrfRequestCall(request), ...calls];
}

/**
 * The provider of a network: Cartridge's on Sepolia and mainnet; on the devnet the mock the deployment file records
 * (`contracts.MockVrfProvider`); an empty string where there is none.
 */
export function vrfProvider(network: string, file?: DeploymentFile | null): string {
  if (CARTRIDGE_VRF_NETWORKS.includes(network)) return CARTRIDGE_VRF_PROVIDER;
  if (network !== "devnet") return "";
  const address = file?.contracts?.MockVrfProvider?.address;
  try {
    return address && BigInt(address) !== 0n ? address : "";
  } catch {
    return "";
  }
}

/** The session policy of the request: it moves no token (P-65). None without a provider. */
export function vrfPolicies(provider: string): ControllerPolicy[] {
  return provider ? [{ target: provider, method: VRF_REQUEST_ENTRY_POINT }] : [];
}
