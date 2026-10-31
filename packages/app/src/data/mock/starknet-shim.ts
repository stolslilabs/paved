import * as starkCurve from "@scure/starknet";

// What `starknet` resolves to in a mock build (#927, `vite.config.ts`): starknet.js is not in the bundle, so no chunk of a mock
// build can fetch it, and nothing can reach a node. It keeps the few pure helpers `@paved/chain` calls on the way of the mock
// (the device key's address, the codecs' selectors, a revert's short string), as starknet.js 8.9.2 computes them on the same
// `@scure/starknet` (`mock-no-fetch.test.ts` checks them against starknet.js), and refuses the rest: a node's provider, an
// account, the UDC's constants. Only the names `@paved/chain` and `wallet/connector.ts` import are here; a new one fails the
// mock build (a missing export), never the page.

/** Why a part of starknet.js is refused: the mock build does not carry it. */
export const NOT_IN_A_MOCK_BUILD = "starknet.js is not in a mock build: the client runs on the device's data alone";

const refuse = (name: string): never => {
  throw new Error(`${name}: ${NOT_IN_A_MOCK_BUILD}`);
};

type Felt = string | number | bigint;

const removeHexPrefix = (hex: string): string => (hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex);
const addHexPrefix = (hex: string): string => `0x${removeHexPrefix(hex)}`;
const toHex = (value: Felt): string => addHexPrefix(BigInt(value).toString(16));

/** `2^251 - 256`: the bound of a contract's address. */
const ADDR_BOUND = 2n ** 251n - 256n;
/** "STARKNET_CONTRACT_ADDRESS" as a felt. */
const CONTRACT_ADDRESS_PREFIX = 0x535441524b4e45545f434f4e54524143545f41444452455353n;

/** Pedersen over the elements and their count, as starknet.js's `computeHashOnElements`. */
const pedersenOnElements = (data: readonly Felt[]): bigint => BigInt([...data, data.length].reduce<string | number>((x, y) => starkCurve.pedersen(BigInt(x), BigInt(y)), 0));

export const encode = {
  addHexPrefix,
  removeHexPrefix,
  buf2hex: (buffer: Uint8Array): string => buffer.reduce((r, x) => r + x.toString(16).padStart(2, "0"), ""),
};

export const num = {
  toHex,
  toBigInt: (value: Felt): bigint => BigInt(value),
};

export const ec = { starkCurve };

export const hash = {
  /** The address of a contract deployed with `salt`, `classHash` and a flat calldata of felts, from `deployerAddress`. */
  calculateContractAddressFromHash: (salt: Felt, classHash: Felt, constructorCalldata: readonly Felt[], deployerAddress: Felt): string =>
    toHex(pedersenOnElements([CONTRACT_ADDRESS_PREFIX, deployerAddress, salt, classHash, pedersenOnElements(constructorCalldata)]) % ADDR_BOUND),
  /** The selector of an entry point or an event: starknet's keccak of its name. */
  getSelectorFromName: (name: string): string => toHex(starkCurve.keccak(new TextEncoder().encode(name))),
  computePoseidonHashOnElements: (data: readonly Felt[]): string => toHex(starkCurve.poseidonHashMany(data.map((x) => BigInt(x)))),
};

export const shortString = {
  encodeShortString: (text: string): string => {
    if (!/^[\x00-\x7F]*$/.test(text)) throw new Error(`${text} is not an ASCII string`);
    if (text.length > 31) throw new Error(`${text} is too long`);
    return addHexPrefix(text.replace(/./g, (char) => char.charCodeAt(0).toString(16)));
  },
};

export const getChecksumAddress = (): string => refuse("getChecksumAddress");

/** The UDC's address and entry point: only a devnet deployment reads them. */
export const constants = new Proxy({} as Record<string, unknown>, { get: (_target, key) => (key === "then" ? undefined : refuse(`constants.${String(key)}`)) });

/** A node's provider: none in a mock build. */
export class RpcProvider {
  constructor() {
    refuse("RpcProvider");
  }
}

/** An account on a node: none in a mock build. */
export class Account {
  constructor() {
    refuse("Account");
  }
}
